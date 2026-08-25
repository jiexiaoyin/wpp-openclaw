// src/core/lru.ts - 通用 LRU cache (with TTL)
// v1.0.4 FIX-B1 (P2-1 sync I/O 优化)
// 用途: 缓存 config 读盘, 避免每次 startAccountById 重读 disk
// 范式: Map (insertion order) + entry {value, expiresAt}, get() 清理过期 + 删头部

export interface LruOptions {
  /** 最大 entry 数 (LRU 触发淘汰) */
  maxSize: number;
  /** TTL 毫秒, 0 = 永不过期 */
  ttlMs: number;
}

interface Entry<V> {
  value: V;
  expiresAt: number; // 0 = 永不过期
}

export class LruCache<V> {
  private readonly store = new Map<string, Entry<V>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(opts: LruOptions) {
    this.maxSize = opts.maxSize;
    this.ttlMs = opts.ttlMs;
  }

  /** 取 (过期返 undefined) + LRU update (移到末尾) */
  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    // LRU: 删后重插 (移到末尾 = 最新)
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  /** 设 (LRU 淘汰 if 满) */
  set(key: string, value: V): void {
    if (this.store.has(key)) this.store.delete(key);
    if (this.store.size >= this.maxSize) {
      // 淘汰最旧 (Map 第一个 key)
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, {
      value,
      expiresAt: this.ttlMs > 0 ? Date.now() + this.ttlMs : 0,
    });
  }

  /** 删 (no-op if 不存在) */
  delete(key: string): void {
    this.store.delete(key);
  }

  /** 清空 (测试用) */
  clear(): void {
    this.store.clear();
  }

  /** 当前 entry 数 (测试/监控) */
  size(): number {
    return this.store.size;
  }
}
