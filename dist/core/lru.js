export class LruCache {
    store = new Map();
    maxSize;
    ttlMs;
    constructor(opts) {
        this.maxSize = opts.maxSize;
        this.ttlMs = opts.ttlMs;
    }
    get(key) {
        const entry = this.store.get(key);
        if (!entry)
            return undefined;
        if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return undefined;
        }
        this.store.delete(key);
        this.store.set(key, entry);
        return entry.value;
    }
    set(key, value) {
        if (this.store.has(key))
            this.store.delete(key);
        if (this.store.size >= this.maxSize) {
            const oldest = this.store.keys().next().value;
            if (oldest !== undefined)
                this.store.delete(oldest);
        }
        this.store.set(key, {
            value,
            expiresAt: this.ttlMs > 0 ? Date.now() + this.ttlMs : 0,
        });
    }
    delete(key) {
        this.store.delete(key);
    }
    clear() {
        this.store.clear();
    }
    size() {
        return this.store.size;
    }
}
