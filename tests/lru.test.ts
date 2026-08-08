// tests/lru.test.ts - v1.0.4 FIX-B1 (P2-1 LRU cache 单元测试)

import { test } from "node:test";
import assert from "node:assert/strict";

import { LruCache } from "../src/core/lru.js";

test("LruCache — basic get/set", () => {
  const c = new LruCache<string>({ maxSize: 3, ttlMs: 0 });
  assert.equal(c.get("a"), undefined);
  c.set("a", "1");
  c.set("b", "2");
  assert.equal(c.get("a"), "1");
  assert.equal(c.get("b"), "2");
  assert.equal(c.size(), 2);
});

test("LruCache — LRU 淘汰 (maxSize=2, 设 3 个, 最早被淘汰)", () => {
  const c = new LruCache<number>({ maxSize: 2, ttlMs: 0 });
  c.set("a", 1);
  c.set("b", 2);
  c.set("c", 3); // a 应被淘汰
  assert.equal(c.get("a"), undefined, "a 应被淘汰");
  assert.equal(c.get("b"), 2);
  assert.equal(c.get("c"), 3);
  assert.equal(c.size(), 2);
});

test("LruCache — get() 把 key 移到末尾 (LRU 更新)", () => {
  const c = new LruCache<number>({ maxSize: 2, ttlMs: 0 });
  c.set("a", 1);
  c.set("b", 2);
  c.get("a"); // a 移到末尾, b 现在最旧
  c.set("c", 3); // b 应被淘汰
  assert.equal(c.get("b"), undefined, "b 应被淘汰 (a 刚被访问)");
  assert.equal(c.get("a"), 1);
  assert.equal(c.get("c"), 3);
});

test("LruCache — TTL 过期", async () => {
  const c = new LruCache<number>({ maxSize: 10, ttlMs: 50 }); // 50ms TTL
  c.set("x", 1);
  assert.equal(c.get("x"), 1, "立即读应 OK");
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(c.get("x"), undefined, "60ms 后应过期");
});

test("LruCache — TTL=0 永不过期", async () => {
  const c = new LruCache<number>({ maxSize: 10, ttlMs: 0 });
  c.set("x", 1);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(c.get("x"), 1, "TTL=0 永不过期");
});

test("LruCache — delete + clear", () => {
  const c = new LruCache<number>({ maxSize: 5, ttlMs: 0 });
  c.set("a", 1);
  c.set("b", 2);
  c.delete("a");
  assert.equal(c.get("a"), undefined);
  assert.equal(c.get("b"), 2);
  c.clear();
  assert.equal(c.size(), 0);
  assert.equal(c.get("b"), undefined);
});

test("LruCache — 覆盖设 (新 value)", () => {
  const c = new LruCache<number>({ maxSize: 2, ttlMs: 0 });
  c.set("a", 1);
  c.set("a", 99);
  assert.equal(c.get("a"), 99);
  assert.equal(c.size(), 1, "覆盖不增 size");
});
