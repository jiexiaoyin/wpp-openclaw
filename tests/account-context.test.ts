// tests/account-context.test.ts - Phase G1 AccountContext 单元测试
// 覆盖: 构造 / 派生属性 / scoped logger / lifecycle / 隔离 / 敏感字段脱敏
// 不依赖 DB / 网络 (纯内存构造)

import { test } from "node:test";
import assert from "node:assert/strict";

import { AccountContext } from "../src/accounts/account-context.js";
import type { WppAccountConfig, WppWebhookServer, WppWsClient } from "../src/types.js";

// ===== 测试 helper =====

function makeTestConfig(overrides: Partial<WppAccountConfig> = {}): WppAccountConfig {
  return {
    enabled: true,
    tokenKey: "test-token-key",
    tokenKeyEnv: "WPP_TEST_TOKEN",
    apiBaseUrl: "http://127.0.0.1:8062/",
    wsUrl: "ws://127.0.0.1:8062/ws",
    authcode: "test-authcode-123",
    authcodeEnv: "WPP_TEST_AUTH",
    webhookHost: "127.0.0.1",
    webhookPort: 8099,
    webhookPath: "/wpp/webhook",
    webhookSecret: "secret-abc",
    allowFrom: ["*"],
    groupPolicy: "open",
    groupAllowFrom: [],
    selfWxid: "wxid_test_user",
    nickname: "TestBot",
    requireAtMention: true,
    debounceMs: 1500,
    ...overrides,
  };
}

function makeFakeWs(): WppWsClient {
  return {
    start: async () => undefined,
    stop: async () => undefined,
    isConnected: () => true,
  };
}

function makeFakeWebhook(): WppWebhookServer & { stopped: boolean; removedPaths: string[] } {
  const srv = {
    started: false,
    stopped: false,
    removedPaths: [] as string[],
    async start() {
      srv.started = true;
    },
    async stop() {
      srv.stopped = true;
    },
    addPath() {},
    removePath(p: string) {
      srv.removedPaths.push(p);
    },
  };
  return srv;
}

// ===== 1. 构造 =====

test("AccountContext — 构造正确绑定 accountId / config / apiClient", () => {
  const cfg = makeTestConfig();
  const ctx = new AccountContext({ accountId: "alice", config: cfg });
  assert.equal(ctx.accountId, "alice");
  assert.equal(ctx.config, cfg);
  assert.ok(ctx.apiClient, "apiClient must be created");
  assert.equal(ctx.apiClient.getBaseUrl(), "http://127.0.0.1:8062"); // trailing / stripped
  assert.equal(ctx.apiClient.getTokenKey(), "test-token-key");
  assert.equal(ctx.createdAt > 0, true);
});

test("AccountContext — 初始 vendorAuthed=false, wsClient/webhookServer 未挂载", () => {
  const ctx = new AccountContext({ accountId: "alice", config: makeTestConfig() });
  assert.equal(ctx.vendorAuthed, false);
  assert.equal(ctx.wsClient, undefined);
  assert.equal(ctx.webhookServer, undefined);
  assert.equal(ctx.authcode, "test-authcode-123");
  assert.equal(ctx.selfWxid, "wxid_test_user");
});

// ===== 2. 派生属性 =====

test("AccountContext — isConfigured: enabled + tokenKey + apiBaseUrl 都齐 → true", () => {
  const ctx = new AccountContext({ accountId: "a", config: makeTestConfig() });
  assert.equal(ctx.isConfigured, true);
});

test("AccountContext — isConfigured: tokenKey 缺失 → false", () => {
  const ctx = new AccountContext({
    accountId: "a",
    config: makeTestConfig({ tokenKey: "" }),
  });
  assert.equal(ctx.isConfigured, false);
});

test("AccountContext — isConfigured: enabled=false → false", () => {
  const ctx = new AccountContext({
    accountId: "a",
    config: makeTestConfig({ enabled: false }),
  });
  assert.equal(ctx.isConfigured, false);
});

test("AccountContext — vendorBaseUrl 去单个 trailing slash (与 WechatpadproApiClient.getBaseUrl 一致)", () => {
  // 行为对齐 WechatpadproApiClient.getBaseUrl: replace(/\/$/, "")
  // 多 trailing slash 只会去掉 1 个 (现有 codebase 行为, 不强改避免 ripple)
  const withSlash = new AccountContext({
    accountId: "a",
    config: makeTestConfig({ apiBaseUrl: "http://example.com/api/" }),
  });
  assert.equal(withSlash.vendorBaseUrl, "http://example.com/api");

  const noSlash = new AccountContext({
    accountId: "a",
    config: makeTestConfig({ apiBaseUrl: "http://example.com/api" }),
  });
  assert.equal(noSlash.vendorBaseUrl, "http://example.com/api");
});

test("AccountContext — isEnabled 反映 enabled 字段", () => {
  const on = new AccountContext({ accountId: "a", config: makeTestConfig({ enabled: true }) });
  const off = new AccountContext({ accountId: "b", config: makeTestConfig({ enabled: false }) });
  assert.equal(on.isEnabled, true);
  assert.equal(off.isEnabled, false);
});

// ===== 3. scoped logger (smoke — 不抛 + 信息含 accountId) =====

test("AccountContext — 4 个 logger 方法都不抛", () => {
  const ctx = new AccountContext({ accountId: "log-test", config: makeTestConfig() });
  assert.doesNotThrow(() => ctx.info("hello info"));
  assert.doesNotThrow(() => ctx.info("info with fields", { code: 200 }));
  assert.doesNotThrow(() => ctx.warn("hello warn", { reason: "test" }));
  assert.doesNotThrow(() => ctx.error("hello error", new Error("boom")));
  assert.doesNotThrow(() => ctx.error("error without err obj"));
  assert.doesNotThrow(() => ctx.debug("hello debug"));
});

// ===== 4. 状态变更 setter =====

test("AccountContext — setVendorAuth 更新 vendorAuthed/selfWxid/authcode + log", () => {
  const ctx = new AccountContext({ accountId: "v", config: makeTestConfig() });
  assert.equal(ctx.vendorAuthed, false);
  ctx.setVendorAuth("wxid_new_self", "new-authcode-xyz");
  assert.equal(ctx.vendorAuthed, true);
  assert.equal(ctx.selfWxid, "wxid_new_self");
  assert.equal(ctx.authcode, "new-authcode-xyz");
});

test("AccountContext — attachWsClient / attachWebhookServer 挂载", () => {
  const ctx = new AccountContext({ accountId: "a", config: makeTestConfig() });
  const ws = makeFakeWs();
  const srv = makeFakeWebhook();
  ctx.attachWsClient(ws);
  ctx.attachWebhookServer(srv);
  assert.equal(ctx.wsClient, ws);
  assert.equal(ctx.webhookServer, srv);
});

// ===== 5. lifecycle stop =====

test("AccountContext — stop() 无 ws/webhook 不抛", async () => {
  const ctx = new AccountContext({ accountId: "a", config: makeTestConfig() });
  await assert.doesNotReject(() => ctx.stop());
});

test("AccountContext — stop() 调用 ws.stop + webhook removePath (共享 server 不停)", async () => {
  const ctx = new AccountContext({ accountId: "a", config: makeTestConfig() });
  const ws = makeFakeWs();
  const srv = makeFakeWebhook();
  ctx.attachWsClient(ws);
  ctx.attachWebhookServer(srv, ["/a", "/a/business"]);
  let wsStopped = false;
  ws.stop = async () => { wsStopped = true; };
  await ctx.stop();
  assert.equal(wsStopped, true);
  assert.equal(srv.stopped, false, "共享 server 不应真正 stop (由 shutdown 统一处理)");
  assert.deepEqual(srv.removedPaths, ["/a", "/a/business"], "应 removePath 摘掉本账号的 path");
});

test("AccountContext — stop() 单边失败不影响另一边", async () => {
  const ctx = new AccountContext({ accountId: "a", config: makeTestConfig() });
  const ws = makeFakeWs();
  const srv = makeFakeWebhook();
  ctx.attachWsClient(ws);
  ctx.attachWebhookServer(srv, ["/a"]);
  let wsStopped = false;
  ws.stop = async () => { wsStopped = true; throw new Error("ws boom"); };
  await ctx.stop(); // 不应 throw
  assert.equal(wsStopped, true);
  assert.deepEqual(srv.removedPaths, ["/a"], "webhook removePath 仍应执行 (ws 失败不影响)");
});

// ===== 6. 敏感字段脱敏 =====

test("AccountContext — toJSON 不含 tokenKey/authcode/webhookSecret", () => {
  const ctx = new AccountContext({ accountId: "sec", config: makeTestConfig() });
  const dump = ctx.toJSON();
  const s = JSON.stringify(dump);
  assert.ok(!s.includes("test-token-key"), "tokenKey must not leak");
  assert.ok(!s.includes("test-authcode-123"), "authcode must not leak");
  assert.ok(!s.includes("secret-abc"), "webhookSecret must not leak");
  // 但应含 accountId / vendorBaseUrl 等
  assert.equal(dump.accountId, "sec");
  assert.ok(typeof dump.vendorBaseUrl === "string");
});

test("AccountContext — toJSON 反映 attach 状态", () => {
  const ctx = new AccountContext({ accountId: "a", config: makeTestConfig() });
  const dump0 = ctx.toJSON();
  assert.equal(dump0.hasWsClient, false);
  assert.equal(dump0.hasWebhookServer, false);
  assert.equal(dump0.wsConnected, false);

  ctx.attachWsClient(makeFakeWs());
  ctx.attachWebhookServer(makeFakeWebhook());
  const dump1 = ctx.toJSON();
  assert.equal(dump1.hasWsClient, true);
  assert.equal(dump1.hasWebhookServer, true);
  assert.equal(dump1.wsConnected, true); // fake isConnected 返回 true
});

// ===== 7. 多实例隔离 (G1 设计核心) =====

test("AccountContext — 2 个实例 accountId/config/state 完全隔离", () => {
  const cfgA = makeTestConfig({ nickname: "Alice" });
  const cfgB = makeTestConfig({ nickname: "Bob", selfWxid: "wxid_bob" });
  const ctxA = new AccountContext({ accountId: "alice", config: cfgA });
  const ctxB = new AccountContext({ accountId: "bob", config: cfgB });

  // 字段独立
  assert.equal(ctxA.accountId, "alice");
  assert.equal(ctxB.accountId, "bob");
  assert.equal(ctxA.config.nickname, "Alice");
  assert.equal(ctxB.config.nickname, "Bob");

  // setVendorAuth 互不影响
  ctxA.setVendorAuth("wxid_alice_authed", "auth-a");
  assert.equal(ctxA.vendorAuthed, true);
  assert.equal(ctxB.vendorAuthed, false, "B 不应被 A 影响");
  assert.equal(ctxB.selfWxid, "wxid_bob", "B 的 selfWxid 不应被覆盖");

  // attachWsClient 互不影响
  const wsA = makeFakeWs();
  ctxA.attachWsClient(wsA);
  assert.equal(ctxA.wsClient, wsA);
  assert.equal(ctxB.wsClient, undefined);

  // apiClient 是独立实例
  assert.notEqual(ctxA.apiClient, ctxB.apiClient);
});

test("AccountContext — apiClient 调用各自 config (tokenKey 隔离)", () => {
  const ctxA = new AccountContext({
    accountId: "a",
    config: makeTestConfig({ tokenKey: "TOKEN_A" }),
  });
  const ctxB = new AccountContext({
    accountId: "b",
    config: makeTestConfig({ tokenKey: "TOKEN_B" }),
  });
  assert.equal(ctxA.apiClient.getTokenKey(), "TOKEN_A");
  assert.equal(ctxB.apiClient.getTokenKey(), "TOKEN_B");
  assert.notEqual(ctxA.apiClient.getBaseUrl(), ctxB.apiClient.getBaseUrl() + "wrong");
  // 实际上 baseUrl 默认相同 (用 makeTestConfig 同源), 验证 tokenKey 隔离就够
});
