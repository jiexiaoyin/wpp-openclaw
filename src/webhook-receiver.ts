// webhook-receiver.ts - HTTP webhook 接收 vendor 回调
// 2026-08-04 init
// 2026-08-04 v1.0.1: 加 P1-1 signature verification placeholder
//   - vendor 暂未公开签名算法, 此处提供完整 HMAC-SHA256 实现
//   - secret 配了 → 必需要 X-Signature header (placeholder strict mode)
//   - secret 没配 → 接受任何 (向后兼容, vendor 当前不签)
// 2026-08-04 v1.0.2: 完整审计修复
//   - FIX-1 (P1-1): 加 WEBHOOK_BODY_LIMIT_BYTES=10MB 硬 cap (P1: 内存 DoS 防护)
//   - FIX-2 (P2-1): 加 req.setTimeout(30s) 防 slow client DoS
//   - FIX-3 (P2-2): 集成 WebhookMetrics 9 counters (跟 monitor/webhook.ts 持平)
//   - FIX-7 (P3-3): catch 改用 formatErr(e) 保留 stack

import { createServer, type Server } from "node:http";
import { logObj as log, formatErr } from "./core/logger.js";
import { WEBHOOK_BODY_LIMIT_BYTES, REQUEST_TIMEOUT_MS } from "./core/constants.js";
import {
  verifyHmacSha256,
  signatureRequired,
  extractSignatureHeader,
} from "./core/signature.js";
import { WebhookMetrics } from "./monitor/metrics.js";
import type { WppWebhookPayload, WppWebhookServer } from "./types.js";

export class WechatpadproWebhookServer implements WppWebhookServer {
  private server: Server | null = null;
  /** v1.0.2: 可选 body limit override (测试用, 默认 10MB) */
  private bodyLimitBytes: number;

  constructor(
    private host: string,
    private port: number,
    /**
     * v1.1.15 BUSINESS-CB (2026-08-08 接总立): 支持多路径 + 每路径独立 handler
     * 之前: 单 path + 单 onMessage (sync_message/完整消息混, 难区分)
     * 现在: paths = [{ path, onMessage }] 列表, vendor 推同步消息走 webhook 路径, 业务回调走 business 路径
     */
    private paths: Array<{ path: string; onMessage: (payload: WppWebhookPayload) => void | Promise<void> }>,
    private secret?: string, // v1.0.1: 可选 secret, 配了则启用 signature 验证
    opts?: { bodyLimitBytes?: number; requestTimeoutMs?: number },
  ) {
    this.bodyLimitBytes = opts?.bodyLimitBytes ?? WEBHOOK_BODY_LIMIT_BYTES;
    // 注: timeout 暂用全局 REQUEST_TIMEOUT_MS, 暂不开放 override
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        WebhookMetrics.incReceived();

        // FIX-2 (v1.0.2): 请求级 timeout 防 slow client DoS
        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
          if (!res.headersSent) {
            res.statusCode = 408;
            res.end("request timeout");
            WebhookMetrics.incRejectedTimeout?.();
          }
        });

        if (req.method !== "POST") {
          WebhookMetrics.incRejectedPath();
          res.statusCode = 404;
          res.end("not found");
          return;
        }
        // v1.1.15 BUSINESS-CB: 按 url 查匹配 handler
        const matched = this.paths.find((p) => p.path === req.url);
        if (!matched) {
          WebhookMetrics.incRejectedPath();
          res.statusCode = 404;
          res.end("not found");
          return;
        }
        const onMessage = matched.onMessage;
        const matchPath = matched.path;

        // 收集 body (验签要用 raw body, 不能用 parsed JSON)
        // FIX-1 (v1.0.2): 累计 size 防止 memory DoS (chunk.length 总和 > 10MB → 413)
        const chunks: Buffer[] = [];
        let totalSize = 0;
        let bodyTooLarge = false;
        let bodyAborted = false;
        const bodyLimit = this.bodyLimitBytes;
        req.on("data", (chunk: Buffer) => {
          if (bodyAborted || bodyTooLarge) return;
          totalSize += chunk.length;
          if (totalSize > bodyLimit) {
            bodyTooLarge = true;
            WebhookMetrics.incRejectedBodySize?.();
            if (!res.headersSent) {
              res.statusCode = 413;
              res.end("payload too large");
            }
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        req.on("aborted", () => {
          bodyAborted = true;
        });

        req.on("end", async () => {
          if (bodyAborted) {
            if (!res.headersSent) {
              res.statusCode = 400;
              res.end("request aborted");
            }
            return;
          }
          if (bodyTooLarge) return; // 已在 data handler 返 413
          const rawBody = Buffer.concat(chunks);

          // v1.0.1: P1-1 signature 验证 (placeholder, HMAC-SHA256 已实现等 vendor 公开算法)
          if (signatureRequired(this.secret)) {
            const sig = extractSignatureHeader(req.headers as Record<string, string | string[] | undefined>);
            if (!verifyHmacSha256(rawBody, sig, this.secret!)) {
              log.warn(
                `webhook signature verify failed: account=${matchPath} ` +
                  `(signature=${sig ? "present" : "missing"})`,
              );
              WebhookMetrics.incRejectedSignature?.();
              res.statusCode = 401;
              res.end("unauthorized");
              return;
            }
            log.debug(`webhook signature ok: path=${matchPath}`);
          }
          // secret 没配 → 接受 (vendor 当前不签, 占位 P1-1)

          // Parse + dispatch
          let payload: WppWebhookPayload;
          try {
            payload = JSON.parse(rawBody.toString("utf8")) as WppWebhookPayload;
          } catch (e) {
            // FIX-7 (v1.0.2): formatErr 保留 stack
            log.warn(`webhook parse error: ${formatErr(e)}`);
            WebhookMetrics.incRejectedParse?.();
            res.statusCode = 400;
            res.end("bad request");
            return;
          }
          try {
            await onMessage(payload);
            WebhookMetrics.incProcessed();
            res.statusCode = 200;
            res.end("ok");
          } catch (e) {
            log.warn(`webhook onMessage error: ${formatErr(e)}`);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.end("server error");
            }
          }
        });

        req.on("error", (e) => {
          log.warn(`webhook req error: ${formatErr(e)}`);
        });
      });
      this.server.once("error", reject);
      this.server.listen(this.port, this.host, () => {
        log.info(
          `webhook server listening: ${this.host}:${this.port}${this.paths.map(p=>p.path).join(",")}` +
            (signatureRequired(this.secret) ? " (signature verification: ON)" : " (signature: OFF, no secret)"),
        );
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      const s = this.server;
      // v1.1.10 P0-4 (2026-08-05): server.close() 会等所有活跃连接关闭 (HTTP keep-alive),
      //   如果 vendor 长连接 or half-closed 客户端挂住 → close() 永不 resolve → 进程退出卡死 →
      //   systemd 重启时新进程 EADDRINUSE 老进程的 port.
      //   fix:
      //     1. closeAllConnections() 强制断活跃连接 (Node 18.2+)
      //     2. 3s safety timer 兜底, 防止 close() callback 也不触发
      const safetyTimer = setTimeout(() => {
        log.warn("webhook server stop timeout (3s) - force resolved");
        this.server = null;
        resolve();
      }, 3000);
      safetyTimer.unref?.();
      if (typeof s.closeAllConnections === "function") {
        try { s.closeAllConnections(); } catch { /* ignore */ }
      }
      s.close(() => {
        clearTimeout(safetyTimer);
        log.info("webhook server stopped");
        this.server = null;
        resolve();
      });
    });
  }
}

// ============ v1.1.11 P1-N3: dedupe 工具从 monitor/webhook.ts 迁过来 ============
// 之前在 monitor/webhook.ts (260 LOC) 是 dead code (plugin 启动链路用 webhook-receiver.ts),
//   但 buildDedupeKey + SeenTracker 这 2 export 被 tests/monitor.test.ts 引用.
// 迁到这里后, monitor/webhook.ts 可删, 测试只需改 1 行 import 路径.

/** 30 分钟 in-memory dedupe. Export for test introspection. */
export class SeenTracker {
  private readonly map = new Map<string, number>();
  private readonly ttlMs: number;

  constructor(ttlMs: number = 30 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  check(key: string, ttlOverride?: number): boolean {
    const ttl = ttlOverride ?? this.ttlMs;
    const now = Date.now();
    const seen = this.map.get(key);
    if (seen !== undefined && now - seen < ttl) return false;
    this.map.set(key, now);
    if (this.map.size > 1000) {
      for (const [k, v] of this.map) {
        if (now - v > ttl) this.map.delete(k);
      }
    }
    return true;
  }
  size(): number {
    return this.map.size;
  }
}

/** Build dedupe key. 优先级: newMsgId > msgId, appId 隔离 */
export function buildDedupeKey(
  appId: string | undefined,
  newMsgId: string | undefined,
  msgId: string | undefined,
): string {
  return `${appId ?? "noapp"}:${newMsgId ?? msgId ?? "noid"}`;
}
