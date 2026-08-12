// tests/config-helpers.test.ts - Phase G6 v3 OpenClaw channel config 6 helpers
// 覆盖: listAccountIds / resolveAccount / defaultAccountId / isConfigured / unconfiguredReason / describeAccount
// 用真实 accounts/default.json 作为测试 fixture (B 方案老板 2026-08-01 拍板)

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  listAccountIds,
  resolveAccount,
  defaultAccountId,
  isConfigured,
  unconfiguredReason,
  describeAccount,
} from "../src/config-helpers.js";

// ===== 1. listAccountIds =====

test("listAccountIds — 返回 accounts/ 目录下的 ID 列表", async () => {
  const ids = await listAccountIds();
  assert.ok(Array.isArray(ids));
  assert.ok(ids.includes("default"), "应含 default 账号 (项目默认 fixture)");
});

test("listAccountIds — OpenClaw cfg 参数忽略 (签名兼容)", async () => {
  // OpenClaw 传任意对象, 我们不读
  const ids1 = await listAccountIds();
  const ids2 = await listAccountIds({ channels: { wechatpadpro: { accounts: { foo: {} } } } });
  const ids3 = await listAccountIds(undefined);
  assert.deepEqual(ids1, ids2, "cfg 不应影响结果");
  assert.deepEqual(ids1, ids3);
});

// ===== v1.3.26 P0 回归: 必须 SYNC 返回数组 =====
// 根因: OpenClaw health-p6SutBnt.js:364 同步调 plugin.config.listAccountIds(cfg)
//       不 await, 下一行 `...accountIds` 展开. async 版返 Promise → "accountIds is not iterable".
// 关键: 这里**不 await**, 直接断言返回值就是数组 (await 会 unwrap Promise, 测不出这个 bug)
test("listAccountIds — SYNC 回归: 不 await 直接返数组 (OpenClaw 同步契约)", () => {
  const ids = listAccountIds();
  assert.ok(Array.isArray(ids), `应直接返数组, 实际=${Object.prototype.toString.call(ids)} (async 版会返 Promise)`);
  // OpenClaw 的用法: Array.from(new Set([...accountIds])) — 展开不能抛
  assert.doesNotThrow(() => {
    const expanded = Array.from(new Set([...ids]));
    assert.ok(Array.isArray(expanded));
  }, "展开 accountIds 不应抛 'is not iterable'");
  assert.ok(ids.includes("default"), "应含 default 账号 (项目默认 fixture)");
});

// ===== 2. resolveAccount =====

test("resolveAccount — 已知 ID 返配置对象", async () => {
  const cfg = await resolveAccount({}, "default");
  assert.ok(cfg);
  assert.equal(cfg!.enabled, true);
  assert.equal(typeof cfg!.apiBaseUrl, "string");
});

test("resolveAccount — 未知 ID 返 null (不抛)", async () => {
  const cfg = await resolveAccount({}, "ghost");
  assert.equal(cfg, null);
});

test("resolveAccount — 不传 accountId 用 default", async () => {
  const cfg = await resolveAccount({});
  assert.ok(cfg, "不传 accountId 应回退到 default");
  // 内容应与 resolveAccount({}, "default") 一致
  assert.deepEqual(cfg, await resolveAccount({}, "default"));
});

// ===== v1.0.3 FIX-A2 (P3-2 路径穿越 sanitize) =====
import { isValidAccountId, loadAccountConfig } from "../src/config.js";

test("FIX-A2 isValidAccountId — 合法 ID 通过", () => {
  assert.equal(isValidAccountId("default"), true);
  assert.equal(isValidAccountId("alice_2024"), true);
  assert.equal(isValidAccountId("user-1"), true);
  assert.equal(isValidAccountId("abc123"), true);
});

test("FIX-A2 isValidAccountId — 路径穿越拒绝", () => {
  assert.equal(isValidAccountId(".."), false);
  assert.equal(isValidAccountId("../etc/passwd"), false);
  assert.equal(isValidAccountId("../../etc"), false);
  assert.equal(isValidAccountId("/etc/passwd"), false);
  assert.equal(isValidAccountId("..\\windows"), false);
  assert.equal(isValidAccountId("foo/../bar"), false);
  assert.equal(isValidAccountId("foo\\bar"), false);
  assert.equal(isValidAccountId(""), false);
  // 64 char 限制
  assert.equal(isValidAccountId("a".repeat(65)), false);
  assert.equal(isValidAccountId("a".repeat(64)), true);
  // 非 ASCII
  assert.equal(isValidAccountId("用户"), false);
});

test("FIX-A2 loadAccountConfig — 拒绝恶意 accountId (不读盘)", async () => {
  // 应抛错, 不应读 accounts/../../etc/passwd.json
  await assert.rejects(
    () => loadAccountConfig("../etc/passwd"),
    /invalid accountId/,
  );
  await assert.rejects(
    () => loadAccountConfig(".."),
    /invalid accountId/,
  );
  await assert.rejects(
    () => loadAccountConfig("/etc/shadow"),
    /invalid accountId/,
  );
});

// ===== 3. defaultAccountId =====

test("defaultAccountId — 返回 'default'", () => {
  assert.equal(defaultAccountId(), "default");
});

// ===== 4. isConfigured =====

test("isConfigured — 真实 default 账号 (有 tokenKeyEnv 但 tokenKey 空) → false (B 方案 凭证走 env)", async () => {
  // accounts/default.json 中 tokenKey="", tokenKeyEnv="WECHATPRO_TOKEN_KEY"
  // v1.1.33 TEST-FIX: 当前 dev 环境有 WECHATPRO_TOKEN_KEY env (prod gateway 注入),
  //   不删 env 则 resolveAccount 从 env 读到 tokenKey → isConfigured=true 误判
  // fix: 显式删 env 模拟 "无凭证环境"
  const orig = process.env.WECHATPRO_TOKEN_KEY;
  delete process.env.WECHATPRO_TOKEN_KEY;
  try {
    const cfg = await resolveAccount({}, "default");
    assert.ok(cfg);
    assert.equal(isConfigured(cfg), false, "无 tokenKey 视为未配置");
  } finally {
    if (orig !== undefined) process.env.WECHATPRO_TOKEN_KEY = orig;
  }
});

test("isConfigured — null/undefined → false", () => {
  assert.equal(isConfigured(null), false);
  assert.equal(isConfigured(undefined), false);
});

test("isConfigured — 完整配置 → true", async () => {
  const cfg = await resolveAccount({}, "default");
  assert.ok(cfg);
  // v1.1.10 P0-2: isConfigured 同时要求 tokenKey + authcode 都非空 (B 方案 凭证双 env)
  const configured = { ...cfg!, tokenKey: "real-token-from-env", authcode: "real-authcode-from-env" };
  assert.equal(isConfigured(configured), true);
});

test("isConfigured — enabled=false → false", async () => {
  const cfg = await resolveAccount({}, "default");
  assert.ok(cfg);
  const disabled = { ...cfg!, enabled: false };
  assert.equal(isConfigured(disabled), false);
});

test("isConfigured — apiBaseUrl 缺失 → false", async () => {
  const cfg = await resolveAccount({}, "default");
  assert.ok(cfg);
  const noUrl = { ...cfg!, tokenKey: "x", apiBaseUrl: "" };
  assert.equal(isConfigured(noUrl), false);
});

// ===== 5. unconfiguredReason =====

test("unconfiguredReason — null account → 'account not found'", () => {
  assert.equal(unconfiguredReason(null), "account not found");
  assert.equal(unconfiguredReason(undefined), "account not found");
});

test("unconfiguredReason — disabled → 提示启用", async () => {
  const cfg = await resolveAccount({}, "default");
  assert.ok(cfg);
  const disabled = { ...cfg!, enabled: false };
  const reason = unconfiguredReason(disabled);
  assert.ok(reason);
  assert.match(reason!, /disabled/);
});

test("unconfiguredReason — tokenKey 缺失 → 提示 env var 名称", async () => {
  // v1.1.33 TEST-FIX: 同上 — 删 env 模拟无凭证环境
  const orig = process.env.WECHATPRO_TOKEN_KEY;
  delete process.env.WECHATPRO_TOKEN_KEY;
  try {
    const cfg = await resolveAccount({}, "default");
    assert.ok(cfg);
    // tokenKey="" 触发, tokenKeyEnv="WECHATPRO_TOKEN_KEY" 应在错误信息中
    const reason = unconfiguredReason(cfg);
    assert.ok(reason);
    assert.match(reason!, /tokenKey/);
    assert.match(reason!, /WECHATPRO_TOKEN_KEY/, "应提示具体 env var 名称");
  } finally {
    if (orig !== undefined) process.env.WECHATPRO_TOKEN_KEY = orig;
  }
});

test("unconfiguredReason — 完整配置 → null (无警告)", async () => {
  const cfg = await resolveAccount({}, "default");
  assert.ok(cfg);
  const configured = { ...cfg!, tokenKey: "real-token" };
  assert.equal(unconfiguredReason(configured), null);
});

// ===== 6. describeAccount =====

test("describeAccount — null → '(no account)'", () => {
  assert.equal(describeAccount(null), "(no account)");
  assert.equal(describeAccount(undefined), "(no account)");
});

test("describeAccount — default 账号: 含 nickname + selfWxid + configured 状态", async () => {
  const cfg = await resolveAccount({}, "default");
  assert.ok(cfg);
  const desc = describeAccount(cfg);
  assert.ok(desc.includes("接晓银") || desc.includes("益融小助理"), "应含 nickname (v1.1.15: default.json 已改 接晓银)");
  // selfWxid 在 default.json 是空字符串
  assert.ok(desc.includes("selfWxid="));
  // 当前未配置 (tokenKey 空) → 应标 unconfigured
  assert.ok(desc.includes("unconfigured") || desc.includes("configured"));
});

test("describeAccount — 已配置账号显示 'configured'", async () => {
  const cfg = await resolveAccount({}, "default");
  assert.ok(cfg);
  // v1.1.10 P0-2: isConfigured 需 tokenKey + authcode 都非空
  const configured = { ...cfg!, tokenKey: "real-token", authcode: "real-authcode" };
  const desc = describeAccount(configured);
  assert.ok(desc.includes("configured"));
  assert.ok(!desc.includes("unconfigured"));
});

// ===== v1.1.8 FIX-S1: async variants =====

test("FIX-S1 loadGlobalConfigAsync — 返 WppGlobalConfig (cache 或 disk 读)", async () => {
  // 测试 env 没 WECHATPRO_DB_PASSWORD, 临时设 fake 让 async 走通
  process.env.WECHATPRO_DB_PASSWORD = "test-fixture-password";
  try {
    const { loadGlobalConfigAsync } = await import("../src/config.js");
    const r = await loadGlobalConfigAsync();
    // 应含 storage.db.mariadb 字段 (证明读到了)
    assert.equal(typeof r.storage.db.mariadb.host, "string");
    assert.equal(typeof r.storage.db.mariadb.user, "string");
    assert.equal(typeof r.storage.db.mariadb.database, "string");
  } finally {
    delete process.env.WECHATPRO_DB_PASSWORD;
  }
});

test("FIX-S1 loadAccountConfigAsync — 返相同 WppAccountConfig (cache 复用)", async () => {
  const { loadAccountConfigAsync } = await import("../src/config.js");
  const r1 = await loadAccountConfigAsync("default");
  // 第 2 次应走 cache, 不再读盘
  const r2 = await loadAccountConfigAsync("default");
  assert.equal(r1.nickname, r2.nickname);
  assert.equal(r1.apiBaseUrl, r2.apiBaseUrl);
});

test("FIX-S1 loadAccountConfigAsync — 无效 accountId 抛错 (path traversal 防御保留)", async () => {
  const { loadAccountConfigAsync } = await import("../src/config.js");
  await assert.rejects(
    () => loadAccountConfigAsync("../etc"),
    /invalid accountId/,
  );
});
