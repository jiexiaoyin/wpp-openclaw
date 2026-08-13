// webhook-receiver.ts - HTTP webhook 接收 vendor 回调
// 安全: 10MB body 硬 cap (防内存 DoS) + 30s 超时 (防 slow client) + 可选 HMAC-SHA256 签名验证

import { createServer, type Server } from "node:http";
import { logObj as log, formatErr } from "./core/logger.js";
import { WEBHOOK_BODY_LIMIT_BYTES, REQUEST_TIMEOUT_MS } from "./core/constants.js";
import {
  verifyHmacSha256,
  signatureRequired,
  extractSignatureHeader,
} from "./core/signature.js";
import { WebhookMetrics } from "./monitor/metrics.js";
import { parseJsonText } from "./api/client.js";
import type { WppWebhookPayload, WppWebhookServer } from "./types.js";

export class WechatpadproWebhookServer implements WppWebhookServer {
  private server: Server | null = null;
  /** 可选 body limit override (测试用, 默认 10MB) */
  private bodyLimitBytes: number;

  constructor(
    private host: string,
    private port: number,
    /**
     * 多路径 + 每路径独立 handler (同步消息走 webhook 路径, 完整业务回调走 business 路径)
     */
    private paths: Array<{ path: string; onMessage: (payload: WppWebhookPayload) => void | Promise<void> }>,
    private secret?: string, // 可选 secret, 配了则启用 signature 验证
    opts?: { bodyLimitBytes?: number; requestTimeoutMs?: number },
  ) {
    this.bodyLimitBytes = opts?.bodyLimitBytes ?? WEBHOOK_BODY_LIMIT_BYTES;
    // 注: timeout 暂用全局 REQUEST_TIMEOUT_MS, 暂不开放 override
  }

  /**
   * v1.3.61 WEBHOOK-SHARED-PORT: 动态注册 path (多账号共享端口, 单 server 实例多 path)。
   * 幂等: 同 path 已存在则跳过。start 前后均可调用 (start 后注册的 path 立即生效, 因 handler 实时查 this.paths)。
   */
  addPath(path: string, onMessage: (payload: WppWebhookPayload) => void | Promise<void>): void {
    if (this.paths.some((p) => p.path === path)) return;
    this.paths.push({ path, onMessage });
    log.info(`[WPP v1.3.61] webhook addPath: ${path} (total ${this.paths.length})`);
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        WebhookMetrics.incReceived();

        // 请求级 timeout 防 slow client DoS
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
        // 按 url 查匹配 handler
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
        // 累计 size 防 memory DoS (chunk 总和 > 10MB → 413)
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

          // signature 验证: HMAC-SHA256 (等 vendor 公开算法)
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
          // secret 没配 → 接受 (vendor 当前不签)

          // Parse + dispatch
          // v1.3.18 F6 fix: 用 parseJsonText 预引号化 16+ 位大整数 (msg_id/new_msg_id 防丢精度)
          let payload: WppWebhookPayload;
          try {
            payload = parseJsonText(rawBody.toString("utf8")) as WppWebhookPayload;
            if (!payload) throw new Error("parseJsonText returned null");
          } catch (e) {
            // formatErr 保留 stack
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
      // server.close() 会等所有活跃连接关闭 (HTTP keep-alive),
      //   如果 vendor 长连接 or half-closed 客户端挂住 → close() 永不 resolve → 进程退出卡死 →
      //   systemd 重启时新进程 EADDRINUSE 老进程的 port.
      //   fix:
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

// ============ dedupe 工具 ============

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

/** Build dedupe key. 优先级: newMsgId > msgId > content-hash, appId 隔离
 * 陷阱 1: 用 `??` 处理空字符串会得到空 key → 所有消息 dedup key 相同 → 消息被静默丢弃, 必须用显式空字符串判断
 * 陷阱 2 (v1.2.1 P1-fix): 两个 id 都缺时塌缩到 "noid" → 不同消息共用同 key → 第二条被误丢。
 *        改为用 content hash 参与, 同一内容在同一账号/会话内收敛到同 key, 不同内容不误丢。
 */
export function buildDedupeKey(
  appId: string | undefined,
  newMsgId: string | undefined,
  msgId: string | undefined,
  content?: string,
): string {
  let idPart =
    newMsgId && newMsgId !== "" ? newMsgId :
    msgId && msgId !== "" ? msgId :
    "";
  if (!idPart) {
    // 两个 id 都缺 → content hash (稳定, 同内容同 key, 不同内容不误丢)
    idPart = content ? `c:${simpleHash(content)}` : "noid";
  }
  return `${appId ?? "noapp"}:${idPart}`;
}

/** 简单字符串哈希 (dedupe content hash 用, 非安全场景) */
function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}
