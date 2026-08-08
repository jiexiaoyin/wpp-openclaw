// src/monitor/ws-client.ts - vendor WS 客户端 (备路径, 仿 525 LOC)
// 范式仿 本项目/src/multi-agent/registry.ts (本项目扩展)

import WebSocket from "ws";
import { logObj as log, formatErr } from "../core/logger.js";
import type { WppInboundMessage, WppWebhookPayload } from "../types.js";
import { payloadToInboundMessage } from "../inbound/parser.js";
import { createWppInboundHandler, type WppInboundHandlerOpts } from "../inbound/handler.js";
import { WebhookMetrics } from "./metrics.js";

export interface WppWsClientOpts extends WppInboundHandlerOpts {
  /** e.g. "wss://wx.juhe.chat/ws/sync" */
  wsUrl: string;
  /** WeChatPadPro vendor authcode (扫码登录后回填 accounts/<id>.json) */
  authcode: string;
  /** 重连初值 / cap (ms) */
  retryMinMs?: number;
  retryMaxMs?: number;
}

/**
 * 长连接 vendor WS, vendor push msg to plugin.
 * 与 webhook 主路径并行: 任意一路收到都走 dedupe, 避免重复 persist (后续可加 cross-channel dedupe).
 */
export class WppWsClient {
  private ws: WebSocket | null = null;
  private connected = false;
  private stopped = false;
  private retry = 1000;
  private readonly retryMin: number;
  private readonly retryMax: number;
  private readonly handler: ReturnType<typeof createWppInboundHandler>;

  constructor(private opts: WppWsClientOpts) {
    this.retryMin = opts.retryMinMs ?? 1000;
    this.retryMax = opts.retryMaxMs ?? 30_000;
    this.handler = createWppInboundHandler({
      accountId: opts.accountId,
      triggerConfig: opts.triggerConfig,
      triggerCtx: opts.triggerCtx,
      enableDispatch: opts.enableDispatch,
      onDispatch: opts.onDispatch,
      parseRelay: opts.parseRelay,
    });
  }

  /** 更新 authcode (登录成功后由 webhook handler 调) */
  updateAuthcode(newCode: string): void {
    if (this.opts.authcode === newCode) return;
    (this.opts as { authcode: string }).authcode = newCode;
    if (this.connected && this.ws) {
      log.info(`ws: authcode updated, reconnecting`);
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
    }
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.connected = false;
    await this.handler.flushAll();
    log.info("ws client stopped");
  }

  isConnected(): boolean {
    return this.connected;
  }

  private connect(): void {
    if (this.stopped) return;
    const url = `${this.opts.wsUrl}?authcode=${encodeURIComponent(this.opts.authcode)}`;
    log.info(`ws connecting: ${this.opts.wsUrl} (authcode set)`);
    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      log.error(`ws construction error: ${formatErr(e)}`);
      this.scheduleRetry();
      return;
    }
    this.ws.on("open", () => {
      this.connected = true;
      this.retry = this.retryMin;
      log.info("ws connected");
    });
    this.ws.on("message", async (data) => {
      try {
        const text = data.toString();
        const json = JSON.parse(text) as WppWebhookPayload;
        const msg: WppInboundMessage | null = payloadToInboundMessage(
          this.opts.accountId,
          json,
        );
        if (msg) {
          WebhookMetrics.incReceived();
          await this.handler.handle(json);
        }
      } catch (e) {
        log.warn(`ws message parse error: ${formatErr(e)}`);
      }
    });
    this.ws.on("close", (code, reason) => {
      this.connected = false;
      log.warn(`ws closed: code=${code} reason=${reason?.toString() || "<none>"}`);
      if (!this.stopped) this.scheduleRetry();
    });
    this.ws.on("error", (err) => {
      log.error(`ws error: ${err.message}`);
    });
  }

  private scheduleRetry(): void {
    if (this.stopped) return;
    const delay = Math.min(this.retry, this.retryMax);
    log.info(`ws reconnect in ${delay}ms`);
    const t = setTimeout(() => this.connect(), delay);
    t.unref?.();
    this.retry = Math.min(this.retry * 2, this.retryMax);
  }
}
