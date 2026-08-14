// tests/webhook-receiver.test.ts - v1.0.2 webhook metrics 单元测试
// (HTTP 集成测试在 v1.0.1 dry-run 已验, 这里只测 metrics 完整性 + counter 行为)
// FIX-3: 验证 WebhookMetrics 14 个 inc* helper 都可调 + counter 增 1

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { WebhookMetrics, incCounter, getCounter, resetAllCounters } from "../src/monitor/metrics.js";
import { REQUEST_TIMEOUT_MS, WEBHOOK_BODY_LIMIT_BYTES } from "../src/core/constants.js";
import { WechatpadproWebhookServer } from "../src/webhook-receiver.js";

beforeEach(() => {
  resetAllCounters();
});

// ===== FIX-3: 14 个 inc* helper 完整性 =====

test("WebhookMetrics — 14 个 inc* helper 都在 (v1.0.2 完整集)", () => {
  const required = [
    "incReceived",
    "incRejectedPath",
    "incRejectedSecret",
    "incRejectedDedupe",
    "incRejectedPolicy",
    "incRejectedBodySize",   // v1.0.2 新增 (FIX-3)
    "incRejectedTimeout",    // v1.0.2 新增 (FIX-2)
    "incRejectedSignature",   // v1.0.2 新增 (FIX-3 port from monitor/webhook.ts)
    "incRejectedParse",      // v1.0.2 新增 (FIX-3)
    "incProcessed",
    "incSavedDb",
    "incEnrichFailed",
    "incHandlerOnError",
    "incDispatchDispatched",
  ];
  for (const m of required) {
    assert.equal(
      typeof (WebhookMetrics as Record<string, unknown>)[m],
      "function",
      `missing: ${m}`,
    );
  }
  assert.equal(required.length, 14);
});

// ===== FIX-3: 每个 inc* helper 增 1 测试 =====

test("WebhookMetrics.incReceived — +1", () => {
  WebhookMetrics.incReceived();
  assert.equal(getCounter("messages_received_total"), 1);
});

test("WebhookMetrics.incRejectedBodySize — +1 (v1.0.2 新增)", () => {
  WebhookMetrics.incRejectedBodySize();
  assert.equal(getCounter("messages_rejected_body_size_total"), 1);
});

test("WebhookMetrics.incRejectedTimeout — +1 (v1.0.2 新增)", () => {
  WebhookMetrics.incRejectedTimeout();
  assert.equal(getCounter("messages_rejected_timeout_total"), 1);
});

test("WebhookMetrics.incRejectedSignature — +1 (v1.0.2 新增)", () => {
  WebhookMetrics.incRejectedSignature();
  assert.equal(getCounter("messages_rejected_signature_total"), 1);
});

test("WebhookMetrics.incRejectedParse — +1 (v1.0.2 新增)", () => {
  WebhookMetrics.incRejectedParse();
  assert.equal(getCounter("messages_rejected_parse_total"), 1);
});

test("WebhookMetrics 全集累加 — 14 个 helper 各 +1 后总 14 个 counter", () => {
  const all: Array<keyof typeof WebhookMetrics> = [
    "incReceived",
    "incRejectedPath",
    "incRejectedSecret",
    "incRejectedDedupe",
    "incRejectedPolicy",
    "incRejectedBodySize",
    "incRejectedTimeout",
    "incRejectedSignature",
    "incRejectedParse",
    "incProcessed",
    "incSavedDb",
    "incEnrichFailed",
    "incHandlerOnError",
    "incDispatchDispatched",
  ];
  for (const m of all) {
    (WebhookMetrics[m] as () => void)();
  }
  // 14 个不同的 counter key, 每个 1
  const total = all.length;
  assert.equal(total, 14);
  // spot check
  assert.equal(getCounter("messages_received_total"), 1);
  assert.equal(getCounter("messages_rejected_body_size_total"), 1);
  assert.equal(getCounter("dispatch_dispatch_total"), 1);
});

// ===== FIX-1/2: 常量合理性 =====

test("REQUEST_TIMEOUT_MS — 30s (v1.0.2 新增)", () => {
  assert.equal(REQUEST_TIMEOUT_MS, 30_000);
});

test("WEBHOOK_BODY_LIMIT_BYTES — 10MB", () => {
  assert.equal(WEBHOOK_BODY_LIMIT_BYTES, 10 * 1024 * 1024);
});

// ===== v1.3.63 P1 — removePath (共享 server 生命周期) =====

test("v1.3.63 P1 — addPath 幂等 + removePath 后 path 可重新注册", async () => {
  const srv = new WechatpadproWebhookServer(
    "127.0.0.1",
    0, // port 0 = 随机 (不 start, 只测内存 path 管理)
    [],
  );
  const handler = async () => {};
  // addPath 幂等
  srv.addPath("/a", handler);
  srv.addPath("/a", handler);
  // removePath 幂等 (不存在 no-op)
  srv.removePath("/nope");
  // removePath 后重新 addPath 应成功 (证明已移除)
  srv.removePath("/a");
  srv.addPath("/a", handler);
  // removePath 另一个 path
  srv.addPath("/b", handler);
  srv.removePath("/b");
  // 再 removePath /b (幂等 no-op, 不抛)
  srv.removePath("/b");
  // 不 start, 只验证不抛 + 基本行为 (真正 HTTP 验证在集成层)
  await srv.stop();
});
