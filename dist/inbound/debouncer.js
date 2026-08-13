import { info, warn, formatErr } from "../core/logger.js";
import { DEFAULT_DEBOUNCE_MS } from "../core/constants.js";
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
    enqueue(msg) {
        if (msg.msgType === 10000 ||
            msg.msgType === 34 ||
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
    async flushAll() {
        const keys = Array.from(this.buffers.keys());
        for (const k of keys) {
            await this.flushKey(k);
        }
        info(`debouncer flushAll: ${keys.length} keys`);
    }
    clear() {
        for (const t of this.timers.values())
            clearTimeout(t);
        this.timers.clear();
        this.buffers.clear();
    }
    size() {
        let n = 0;
        for (const list of this.buffers.values())
            n += list.length;
        return n;
    }
}
