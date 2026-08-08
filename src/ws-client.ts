// ws-client.ts - WebSocket 客户端 (接 wechatpadpro /ws/sync)
// vendor 推送实时消息 (替代 webhook 模式可选)
//
// v1.1.11 P0-N1 (2026-08-05): ws 收到 type=100/类通知时, 主动 POST /Msg/Sync 拉消息列表,
//   然后 payloadToInboundMessage → caller 提供的 onInboundMessage handler.
//   修复 PoC stub: 原实现只 log debug (vendor 推真消息完全不处理).
//
// 关键设计:
//   1. ws-client 持有 1 个 WppApiClient 引用 (用于 SyncMessage), 不再依赖 caller
//   2. accountId 注入构造 (用于 payloadToInboundMessage 必备字段)
//   3. SyncMessage 在 ws on("message") handler 内 fire-and-forget; 错错用 log + 不 break ws
//   4. 显式跳过 connection_ready (vendor 握手) 跟 init 类 frame (避免 noise)
//   5. 不发任何消息发送 API (vendor 鉴权方已就绪, ops 单独验证)

import WebSocket from "ws";
import { logObj as log, formatErr } from "./core/logger.js";
import { payloadToInboundMessage } from "./inbound/parser.js";
import { getSynckey, saveSynckey } from "./db.js";
import type {
  WppWsClient,
  WppApiClient,
  WppInboundMessage,
} from "./types.js";

export interface WechatpadproWsClientOpts {
  /** vendor HTTP API 客户端 (用于 SyncMessage) — 必须提供, 否则收到推送后不拉消息 */
  apiClient: WppApiClient;
  /** 当前账号 ID (用于 payloadToInboundMessage) */
  accountId: string;
  /** 同步间隔兜底 (vendor WS 没推时也定时 SyncMessage 拉取, 防 vendor 推送漏通知) */
  fallbackSyncMs?: number;
  /** 主入口: 收到 SyncMessage 拉到的消息后, 调 caller. caller 负责 debouncer/triggers/dispatch */
  onInboundMessage: (msg: WppInboundMessage) => void | Promise<void>;
}

export class WechatpadproWsClient implements WppWsClient {
  private ws: WebSocket | null = null;
  private connected = false;
  private retryDelay = 1000;
  private maxRetryDelay = 30_000;
  private stopped = false;
  /** v1.1.11: pending SyncMessage 锁, 防 ws 推送风暴时多次并发拉消息 */
  private syncInFlight = false;
  /** v1.1.11: 兜底定时 SyncMessage (vendor WS 漏推/重启场景). 默认 60s */
  private fallbackTimer: NodeJS.Timeout | null = null;
  private readonly fallbackSyncMs: number;

  constructor(
    private wsUrl: string,
    private authcode: string,
    private opts: WechatpadproWsClientOpts,
  ) {
    this.fallbackSyncMs = opts.fallbackSyncMs ?? 60_000;
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.connect();
    // v1.1.11: 兜底定时 SyncMessage (vendor WS 推送失败也能拉)
    this.fallbackTimer = setInterval(() => {
      void this.triggerSync("fallback-timer");
    }, this.fallbackSyncMs);
    this.fallbackTimer.unref?.();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        log.warn(`ws close error: ${formatErr(e)}`);
      }
      this.ws = null;
    }
    this.connected = false;
    log.info("ws client stopped");
  }

  isConnected(): boolean {
    return this.connected;
  }

  private connect(): void {
    if (this.stopped) return;
    const url = `${this.wsUrl}?authcode=${encodeURIComponent(this.authcode)}`;
    log.info(`ws connecting: ${this.wsUrl} (authcode set)`);
    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      log.error(`ws construction error: ${formatErr(e)}`);
      this.scheduleRetry();
      return;
    }
    this.ws.on("open", () => {
      this.connected = true;
      this.retryDelay = 1000;
      log.info("ws connected");
      // v1.1.11: ws 连接成功立刻触发一次 sync, 拉可能积压消息
      void this.triggerSync("ws-open");
    });
    this.ws.on("message", async (data) => {
      try {
        const text = data.toString();
        const json = JSON.parse(text) as Record<string, unknown>;
        const dataField = json["Data"] as Record<string, unknown> | undefined;
        const type = dataField?.["type"];

        // 握手帧: {"Code":0,"Success":true,"Message":"实时消息通道已就绪","Data":{"timestamp":...,"type":"connection_ready"}}
        //         跳过 — 不是真消息推送
        if (type === "connection_ready") {
          log.info("ws recv: connection_ready (handshake ack)");
          return;
        }

        // 其他帧 (有 newMsgId / Wxid / MessageType 等) → 触发 SyncMessage 拉取
        // 即使 type 未知也走 (vendor 推送类型可能在加新事件)
        log.debug(`ws recv: trigger sync (kind=${String(type ?? "unknown")})`);
        void this.triggerSync("ws-push");
      } catch (e) {
        log.warn(`ws message parse error: ${formatErr(e)}`);
      }
    });
    this.ws.on("close", (code, reason) => {
      this.connected = false;
      log.warn(`ws closed: code=${code} reason=${reason.toString() || "<none>"}`);
      if (!this.stopped) this.scheduleRetry();
    });
    this.ws.on("error", (err) => {
      log.error(`ws error: ${err.message}`);
      // close handler will be called next
    });
  }

  /**
   * v1.1.11 P0-N1: SyncMessage 拉真实消息, 喂给 caller 提供的 onInboundMessage.
   * 并发安全: syncInFlight 锁, 防 ws 推送风暴/兜底定时器/connection-open 三种 trigger 同时拉.
   */
  private async triggerSync(reason: string): Promise<void> {
    if (this.stopped) return;
    if (this.syncInFlight) {
      log.debug(`ws sync skipped (in-flight): reason=${reason}`);
      return;
    }
    this.syncInFlight = true;
    try {
      // v1.1.25 SYNC-STATE (2026-08-08 接总立): Synckey 增量游标持久化
      //   根因: Synckey:"" 每次全量拉取 → 重启后重放风暴 (19:56 一次 1458 条) →
      //     dedup 每条独立 DB 查询 → 事件循环阻塞 → 网关卡顿
      //   修复: 读上次保存的 KeyBuf.buffer 增量拉取; Sync 后保存新 KeyBuf
      const prevSynckey = await getSynckey(this.opts.accountId);
      const sync = await this.opts.apiClient.call<{
        CmdList?: { Count?: number; List?: unknown[] };
        ContinueFlag?: number;
        KeyBuf?: { buffer?: string; iLen?: number };
      }>("/Msg/Sync", { Scene: 0, Synckey: prevSynckey ?? "" });
      // 保存新 Synckey (增量游标) — 即使 0 条也要存 (游标前进)
      const newKey = sync?.Data?.KeyBuf?.buffer;
      if (newKey) {
        await saveSynckey(this.opts.accountId, newKey);
      } else {
        log.debug(`ws sync: no KeyBuf returned (reason=${reason})`);
      }
      const list = sync?.Data?.CmdList?.List ?? [];
      const count = list.length;
      if (count > 0) {
        log.info(`ws sync pulled ${count} message(s): reason=${reason} synckey=${prevSynckey ? "incremental" : "full"}`);
      } else {
        log.debug(`ws sync pulled 0 messages: reason=${reason} synckey=${prevSynckey ? "incremental" : "full"}`);
      }
      for (const raw of list) {
        try {
          const obj = raw as Record<string, unknown>;
          const msg = payloadToInboundMessage(this.opts.accountId, obj);
          if (msg) {
            await this.opts.onInboundMessage(msg);
          }
        } catch (e) {
          log.warn(`ws sync inbound dispatch failed: ${formatErr(e)}`);
        }
      }
    } catch (e) {
      log.warn(`ws sync /Msg/Sync failed: ${formatErr(e)}`);
    } finally {
      this.syncInFlight = false;
    }
  }

  private scheduleRetry(): void {
    if (this.stopped) return;
    const delay = Math.min(this.retryDelay, this.maxRetryDelay);
    log.info(`ws reconnect in ${delay}ms`);
    setTimeout(() => this.connect(), delay);
    this.retryDelay = Math.min(this.retryDelay * 2, this.maxRetryDelay);
  }
}
