// src/inbound/debouncer.ts - 1.5s timer-based batch flush
// 范式仿 本项目/src/inbound/debouncer.ts
// 关键: VOICE 消息和系统消息 bypass; key = `${acc}:${fromId}:${toId}`; .unref() 防保活

import { info, warn, formatErr } from "../core/logger.js";
import { DEFAULT_DEBOUNCE_MS } from "../core/constants.js";
import type { WppInboundMessage } from "../types.js";

export interface DebouncerCallbacks {
  /** Flush 时被回调 (1 批 N 条) */
  onFlush: (batch: WppInboundMessage[]) => void | Promise<void>;
  /** Flush 失败 (handler 内部错误) */
  onError?: (err: unknown, batch: WppInboundMessage[]) => void;
  /** 是否 control command (绕过 debouncer) */
  isControlCommand?: (msg: WppInboundMessage) => boolean;
}

export interface DebouncerOpts extends DebouncerCallbacks {
  /** 默认 1.5s (标准值) */
  intervalMs?: number;
}

/**
 * Per-key inbox. Same sender-target within intervalMs gets merged; on flush, batch emitted.
 * 触发顺序: 入队 → 如果已有 timer 则 reset → 设新 timer;
 *           timer fires → 取 batch → reset key;
 *           VOICE / SYSTEM / control → 直接 flush
 */
export class WppInboundDebouncer {
  private readonly intervalMs: number;
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly buffers = new Map<string, WppInboundMessage[]>();
  private readonly onFlush: DebouncerCallbacks["onFlush"];
  private readonly onError?: DebouncerCallbacks["onError"];
  private readonly isControlCommand?: DebouncerCallbacks["isControlCommand"];

  constructor(opts: DebouncerOpts) {
    this.intervalMs = opts.intervalMs ?? DEFAULT_DEBOUNCE_MS;
    this.onFlush = opts.onFlush;
    this.onError = opts.onError;
    this.isControlCommand = opts.isControlCommand;
  }

  private key(msg: WppInboundMessage): string {
    return `${msg.accountId}:${msg.peerKind}:${msg.peerId}:${msg.fromWxid}`;
  }

  /** 入队 (分组到 batch, 起 timer) */
  enqueue(msg: WppInboundMessage): void {
    // 系统消息 / VOICE / control 直接 flush
    if (
      msg.msgType === 10000 ||
      msg.msgType === 34 /* VOICE (silk) */ ||
      msg.msgType === 10002 ||
      (this.isControlCommand && this.isControlCommand(msg))
    ) {
      void this.flushBatch([msg]);
      return;
    }

    const k = this.key(msg);
    const list = this.buffers.get(k) ?? [];
    list.push(msg);
    this.buffers.set(k, list);

    const existing = this.timers.get(k);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      void this.flushKey(k);
    }, this.intervalMs);
    // 不保活
    timer.unref?.();
    this.timers.set(k, timer);
  }

  private async flushKey(k: string): Promise<void> {
    const batch = this.buffers.get(k) ?? [];
    this.buffers.delete(k);
    const t = this.timers.get(k);
    if (t) {
      clearTimeout(t);
      this.timers.delete(k);
    }
    if (batch.length === 0) return;
    await this.flushBatch(batch);
  }

  private async flushBatch(batch: WppInboundMessage[]): Promise<void> {
    try {
      await this.onFlush(batch);
    } catch (e) {
      warn(`debouncer flush batch failed: ${formatErr(e)}`, { size: batch.length });
      if (this.onError) this.onError(e, batch);
    }
  }

  /** 强制 flush (例如 shutdown) */
  async flushAll(): Promise<void> {
    const keys = Array.from(this.buffers.keys());
    for (const k of keys) {
      await this.flushKey(k);
    }
    info(`debouncer flushAll: ${keys.length} keys`);
  }

  /** 清掉全部 pending (测试用) */
  clear(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.buffers.clear();
  }

  /** 当前 buffered 条数 (测试 + 监控) */
  size(): number {
    let n = 0;
    for (const list of this.buffers.values()) n += list.length;
    return n;
  }
}
