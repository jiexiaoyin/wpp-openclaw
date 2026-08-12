// tests/monitor.test.ts - Phase E monitor (smoke tests only, 防 Node test runner orphan detection)
// 大流程测试 (full HTTP round-trip + dedupe + body size) 留 Phase H 补

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  incCounter,
  getCounter,
  resetAllCounters,
  renderPrometheus,
  WebhookMetrics,
} from "../src/monitor/metrics.js";
import {
  buildDedupeKey,
  SeenTracker,
} from "../src/webhook-receiver.js";

// ===== metrics =====

test("incCounter/getCounter — 增 1 累加", () => {
  resetAllCounters();
  incCounter("foo_total");
  incCounter("foo_total");
  incCounter("foo_total", 3);
  assert.equal(getCounter("foo_total"), 5);
});

test("resetAllCounters — 全清", () => {
  incCounter("dummy");
  assert.ok(getCounter("dummy") > 0);
  resetAllCounters();
  assert.equal(getCounter("dummy"), 0);
});

test("WebhookMetrics — 9 计数器可访问", () => {
  resetAllCounters();
  WebhookMetrics.incReceived();
  WebhookMetrics.incProcessed();
  WebhookMetrics.incRejectedDedupe();
  assert.equal(getCounter("messages_received_total"), 1);
  assert.equal(getCounter("messages_processed_total"), 1);
  assert.equal(getCounter("messages_rejected_dedupe_total"), 1);
});

test("renderPrometheus — 输出含计数", () => {
  resetAllCounters();
  incCounter("messages_received_total");
  const text = renderPrometheus();
  assert.ok(text.includes("wpp_messages_received_total"));
});

// ===== webhook helpers =====

test("buildDedupeKey — 优先级: newMsgId > msgId > noid", () => {
  assert.equal(buildDedupeKey("app", "n1", "m1"), "app:n1");
  assert.equal(buildDedupeKey("app", undefined, "m1"), "app:m1");
  assert.equal(buildDedupeKey("app"), "app:noid");
  assert.equal(buildDedupeKey(undefined, "n1"), "noapp:n1");
});

// v1.1.48 P0-FIX (2026-08-09): 修复 ?? 误判空字符串 — parseV1Message 默认 newMsgId=""
//   之前: buildDedupeKey(undef, "", "msg-X") === buildDedupeKey(undef, "", "msg-Y") === "noapp:"
//   现在: 应回退到 msgId, 每条消息 dedup key 唯一
test("buildDedupeKey — 空字符串 newMsgId 回退 msgId (P0-fix 2026-08-09)", () => {
  assert.equal(buildDedupeKey(undefined, "", "msg-X"), "noapp:msg-X");
  assert.equal(buildDedupeKey(undefined, "", "msg-Y"), "noapp:msg-Y");
  assert.notEqual(
    buildDedupeKey(undefined, "", "msg-X"),
    buildDedupeKey(undefined, "", "msg-Y"),
    "不同 msgId 必须 dedup key 不同 (?? 空字符串 bug 回归拦截)",
  );
  // 三种 falsy 形式都应回退
  assert.equal(buildDedupeKey(undefined, undefined, "msg-Z"), "noapp:msg-Z");
  assert.equal(buildDedupeKey(undefined, "", ""), "noapp:noid");
  assert.equal(buildDedupeKey(undefined, undefined, undefined), "noapp:noid");
});

test("SeenTracker — 重复 key 30min 内拒绝", async () => {
  const s = new SeenTracker();
  assert.ok(s.check("a"));
  assert.ok(!s.check("a"), "duplicate rejected");
  assert.equal(s.size(), 1);
});

test("SeenTracker — 1000+ 触发 lazy eviction (短 TTL)", async () => {
  const s = new SeenTracker(50); // 50ms TTL
  for (let i = 0; i < 1500; i++) s.check(`k${i}`);
  // 超过 size 1000 阈值后, check 会触发 lazy evict (但 entries 都在 50ms 内, 不被删)
  await new Promise((r) => setTimeout(r, 80));
  s.check("trigger-evict"); // 这一步 触发 evict 扫描
  // 现在 entries 大都超过 50ms TTL, 应该被 evict
  assert.ok(s.size() < 100, "short-TTL entries should be evicted");
});

test("SeenTracker — TTL 后允许重新检查", async () => {
  const s = new SeenTracker(50); // 50ms TTL
  assert.ok(s.check("a"));
  assert.ok(!s.check("a"));
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(s.check("a"), "after TTL, allowed again");
});
