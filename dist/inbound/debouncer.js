// src/inbound/debouncer.ts - 1.5s timer-based batch flush
// 关键: VOICE/系统消息 bypass; key = accountId:peerKind:peerId:fromWxid; .unref() 防保活
import { info, warn, formatErr } from "../core/logger.js";
import { DEFAULT_DEBOUNCE_MS } from "../core/constants.js";
/**
 * Per-key inbox. Same sender-target within intervalMs gets merged; on flush, batch emitted.
 * 触发顺序: 入队 → 如果已有 timer 则 reset → 设新 timer;
 *           timer fires → 取 batch → reset key;
 *           VOICE / SYSTEM / control → 直接 flush
 */
export class WppInboundDebouncer {
    intervalMs;
    timers = new Map();
    buffers = new Map();
    onFlush;
    onError;
    isControlCommand;
    constructor(opts) {
        this.intervalMs = opts.intervalMs ?? DEFAULT_DEBOUNCE_MS;
        this.onFlush = opts.onFlush;
        this.onError = opts.onError;
        this.isControlCommand = opts.isControlCommand;
    }
    key(msg) {
        return `${msg.accountId}:${msg.peerKind}:${msg.peerId}:${msg.fromWxid}`;
    }
    /** 入队 (分组到 batch, 起 timer) */
    enqueue(msg) {
        // 系统消息 / VOICE / control 直接 flush
        if (msg.msgType === 10000 ||
            msg.msgType === 34 /* VOICE (silk) */ ||
            msg.msgType === 10002 ||
            (this.isControlCommand && this.isControlCommand(msg))) {
            void this.flushBatch([msg]);
            return;
        }
        const k = this.key(msg);
        const list = this.buffers.get(k) ?? [];
        list.push(msg);
        this.buffers.set(k, list);
        const existing = this.timers.get(k);
        if (existing)
            clearTimeout(existing);
        const timer = setTimeout(() => {
            void this.flushKey(k);
        }, this.intervalMs);
        // 不保活
        timer.unref?.();
        this.timers.set(k, timer);
    }
    async flushKey(k) {
        const batch = this.buffers.get(k) ?? [];
        this.buffers.delete(k);
        const t = this.timers.get(k);
        if (t) {
            clearTimeout(t);
            this.timers.delete(k);
        }
        if (batch.length === 0)
            return;
        await this.flushBatch(batch);
    }
    async flushBatch(batch) {
        try {
            await this.onFlush(batch);
        }
        catch (e) {
            warn(`debouncer flush batch failed: ${formatErr(e)}`, { size: batch.length });
            if (this.onError)
                this.onError(e, batch);
        }
    }
    /** 强制 flush (例如 shutdown) */
    async flushAll() {
        const keys = Array.from(this.buffers.keys());
        for (const k of keys) {
            await this.flushKey(k);
        }
        info(`debouncer flushAll: ${keys.length} keys`);
    }
    /** 清掉全部 pending (测试用) */
    clear() {
        for (const t of this.timers.values())
            clearTimeout(t);
        this.timers.clear();
        this.buffers.clear();
    }
    /** 当前 buffered 条数 (测试 + 监控) */
    size() {
        let n = 0;
        for (const list of this.buffers.values())
            n += list.length;
        return n;
    }
}
//# sourceMappingURL=debouncer.js.map