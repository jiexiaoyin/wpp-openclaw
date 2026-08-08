// tests/account-registry.test.ts - Phase G2 AccountRegistry 单元测试
// 覆盖: 构造 / start 校验 / 幂等 / get / list / stop / 多实例隔离 / toJSON 脱敏 / persist / loadFromDb
// 不依赖真实 DB (AccountRegistry 是 pure in-memory, DB init 由 caller 负责; persist 测试用 setAdapterForTest 注入 FakeAdapter)

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { AccountRegistry } from "../src/accounts/account-registry.js";
import { AccountContext } from "../src/accounts/account-context.js";
import { resetAdapter, setAdapterForTest } from "../src/storage/db/index.js";
import { DbAdapter } from "../src/storage/db/types.js";
import type { WppAccountConfig, WppWsClient } from "../src/types.js";

// ===== test helpers =====

function makeCfg(overrides: Partial<WppAccountConfig> = {}): WppAccountConfig {
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

// ===== 1. 构造 =====

test("AccountRegistry — 空构造 size=0, list 空", () => {
  const reg = new AccountRegistry();
  assert.equal(reg.size(), 0);
  assert.deepEqual(reg.list(), []);
  assert.deepEqual(reg.listIds(), []);
});

// ===== 2. start 添加 =====

test("AccountRegistry — start 添加 AccountContext", async () => {
  const reg = new AccountRegistry();
  const ctx = await reg.start("alice", makeCfg());
  assert.ok(ctx instanceof AccountContext);
  assert.equal(ctx.accountId, "alice");
  assert.equal(reg.size(), 1);
  assert.equal(reg.has("alice"), true);
  assert.equal(reg.listIds().length, 1);
});

test("AccountRegistry — start 多账号 size 累加", async () => {
  const reg = new AccountRegistry();
  await reg.start("alice", makeCfg());
  await reg.start("bob", makeCfg());
  await reg.start("charlie", makeCfg());
  assert.equal(reg.size(), 3);
  assert.deepEqual(reg.listIds().sort(), ["alice", "bob", "charlie"]);
});

// ===== 3. start 校验 =====

test("AccountRegistry — start 拒绝 disabled config", async () => {
  const reg = new AccountRegistry();
  await assert.rejects(
    () => reg.start("alice", makeCfg({ enabled: false })),
    /account disabled: alice/,
  );
  assert.equal(reg.size(), 0, "失败不应留 context");
});

test("AccountRegistry — start 拒绝 tokenKey 空", async () => {
  const reg = new AccountRegistry();
  await assert.rejects(
    () => reg.start("alice", makeCfg({ tokenKey: "" })),
    /tokenKey missing/,
  );
  assert.equal(reg.size(), 0, "失败不应留 context");
});

test("AccountRegistry — start 失败 (disabled) 不影响后续 start", async () => {
  const reg = new AccountRegistry();
  await assert.rejects(() => reg.start("bad", makeCfg({ enabled: false })));
  // 后续 start 仍能成功
  const ctx = await reg.start("good", makeCfg());
  assert.equal(ctx.accountId, "good");
  assert.equal(reg.size(), 1);
});

// ===== 4. 幂等 (重复 ID 返回 existing) =====

test("AccountRegistry — start 重复 ID 返回 existing, 不覆盖 config", async () => {
  const reg = new AccountRegistry();
  const a = await reg.start("alice", makeCfg({ nickname: "Original" }));
  const b = await reg.start("alice", makeCfg({ nickname: "Ignored" }));
  assert.equal(a, b, "应返回同一实例");
  assert.equal(reg.size(), 1);
  assert.equal(b.config.nickname, "Original", "首次 config 应胜出");
});

// ===== 5. get / has =====

test("AccountRegistry — get 返回 context, 不存在返回 null", async () => {
  const reg = new AccountRegistry();
  await reg.start("alice", makeCfg());
  const a = reg.get("alice");
  assert.ok(a);
  assert.equal(a!.accountId, "alice");
  assert.equal(reg.get("ghost"), null);
});

test("AccountRegistry — has 反映 context 存在", async () => {
  const reg = new AccountRegistry();
  assert.equal(reg.has("alice"), false);
  await reg.start("alice", makeCfg());
  assert.equal(reg.has("alice"), true);
  assert.equal(reg.has("bob"), false);
});

// ===== 6. list =====

test("AccountRegistry — list 返回全部 contexts", async () => {
  const reg = new AccountRegistry();
  await reg.start("alice", makeCfg());
  await reg.start("bob", makeCfg());
  const all = reg.list();
  assert.equal(all.length, 2);
  const ids = all.map((c) => c.accountId).sort();
  assert.deepEqual(ids, ["alice", "bob"]);
});

// ===== 7. stop 单个 =====

test("AccountRegistry — stop 删除 context, ctx.stop 被调", async () => {
  const reg = new AccountRegistry();
  const ctx = await reg.start("alice", makeCfg());
  const ws = makeFakeWs();
  ctx.attachWsClient(ws);
  let wsStopped = false;
  ws.stop = async () => { wsStopped = true; };

  await reg.stop("alice");

  assert.equal(wsStopped, true, "ctx.stop 应被调 → ws.stop 应被调");
  assert.equal(reg.size(), 0);
  assert.equal(reg.has("alice"), false);
});

test("AccountRegistry — stop 不存在账号 no-op + warn", async () => {
  const reg = new AccountRegistry();
  await assert.doesNotReject(() => reg.stop("ghost"));
  assert.equal(reg.size(), 0);
});

// ===== 8. stopAll =====

test("AccountRegistry — stopAll 清空所有", async () => {
  const reg = new AccountRegistry();
  await reg.start("alice", makeCfg());
  await reg.start("bob", makeCfg());
  await reg.start("charlie", makeCfg());
  assert.equal(reg.size(), 3);
  await reg.stopAll();
  assert.equal(reg.size(), 0);
  assert.deepEqual(reg.listIds(), []);
});

test("AccountRegistry — stopAll 空 registry 不抛", async () => {
  const reg = new AccountRegistry();
  await assert.doesNotReject(() => reg.stopAll());
});

// ===== 9. 多实例隔离 (G2 核心 — 替代 module singleton 的关键) =====

test("AccountRegistry — 2 个 registry 完全隔离 (无 module singleton 共享)", async () => {
  const regA = new AccountRegistry();
  const regB = new AccountRegistry();

  await regA.start("alice", makeCfg());
  await regB.start("bob", makeCfg());

  assert.equal(regA.size(), 1);
  assert.equal(regB.size(), 1);
  assert.equal(regA.has("alice"), true);
  assert.equal(regA.has("bob"), false, "A 不应看到 B 的账号");
  assert.equal(regB.has("alice"), false, "B 不应看到 A 的账号");
  assert.equal(regB.has("bob"), true);

  // A stop 不影响 B
  await regA.stop("alice");
  assert.equal(regA.size(), 0);
  assert.equal(regB.size(), 1, "B 的账号不应被 A 影响");
});

test("AccountRegistry — 同 ID 在不同 registry 是不同 context", async () => {
  const regA = new AccountRegistry();
  const regB = new AccountRegistry();

  const ctxA = await regA.start("alice", makeCfg({ nickname: "Alice-A" }));
  const ctxB = await regB.start("alice", makeCfg({ nickname: "Alice-B" }));

  assert.notEqual(ctxA, ctxB);
  assert.equal(ctxA.config.nickname, "Alice-A");
  assert.equal(ctxB.config.nickname, "Alice-B");
});

// ===== 10. toJSON 脱敏 =====

test("AccountRegistry — toJSON 包含 size / accountIds / accounts, 不含敏感字段", async () => {
  const reg = new AccountRegistry();
  await reg.start("alice", makeCfg());
  await reg.start("bob", makeCfg());
  const dump = reg.toJSON();
  assert.equal(dump.size, 2);
  assert.deepEqual((dump.accountIds as string[]).sort(), ["alice", "bob"]);
  assert.ok(Array.isArray(dump.accounts));
  const dumpStr = JSON.stringify(dump);
  // AccountContext.toJSON 已脱敏 tokenKey/authcode/webhookSecret
  assert.ok(!dumpStr.includes("test-token-key"));
  assert.ok(!dumpStr.includes("test-authcode-123"));
  assert.ok(!dumpStr.includes("secret-abc"));
});

// ===== 11. get 后可调 AccountContext 方法 (验证 integration) =====

test("AccountRegistry — get 返回的 AccountContext 可调 mutation 方法", async () => {
  const reg = new AccountRegistry();
  await reg.start("alice", makeCfg());
  const ctx = reg.get("alice");
  assert.ok(ctx);

  const ws = makeFakeWs();
  ctx!.attachWsClient(ws);
  assert.equal(ctx!.wsClient, ws);

  ctx!.setVendorAuth("wxid_new", "new-auth");
  assert.equal(ctx!.vendorAuthed, true);
  assert.equal(ctx!.selfWxid, "wxid_new");
});

// ===== 12. start 后 context 状态正确 =====

test("AccountRegistry — start 后 context 包含 init logger 已 emit", async () => {
  const reg = new AccountRegistry();
  const ctx = await reg.start("logger-test", makeCfg());
  // 创建时间已设置
  assert.ok(ctx.createdAt > 0);
  // 初始未鉴权
  assert.equal(ctx.vendorAuthed, false);
  // authcode/selfWxid 从 config 同步
  assert.equal(ctx.authcode, "test-authcode-123");
  assert.equal(ctx.selfWxid, "wxid_test_user");
});

// ===== 14. P2-1: 并发 start 锁 (race condition 修复) =====

test("AccountRegistry — 并发 5 个 start 同 ID, 只 1 个 ctx 被创建, 5 个 caller 收到同一实例", async () => {
  const reg = new AccountRegistry();
  // 5 个并发 start 同 accountId
  const promises = Array.from({ length: 5 }, () => reg.start("race-test", makeCfg()));
  const contexts = await Promise.all(promises);

  // 所有 caller 收到同一 context 实例
  const first = contexts[0]!;
  for (const c of contexts) {
    assert.equal(c, first, "并发 caller 必收到同一 context 实例");
  }
  // registry 只 1 个 entry
  assert.equal(reg.size(), 1, "并发 start 不应创建多个 context");
});

test("AccountRegistry — 并发 start 不同 ID, 各 ctx 独立", async () => {
  const reg = new AccountRegistry();
  // 5 个并发 start 不同 ID
  const promises = Array.from({ length: 5 }, (_, i) =>
    reg.start(`user-${i}`, makeCfg({ nickname: `User ${i}` })),
  );
  const contexts = await Promise.all(promises);

  assert.equal(reg.size(), 5, "不同 ID 各自 1 个 ctx");
  for (let i = 0; i < 5; i++) {
    assert.equal(contexts[i]!.accountId, `user-${i}`);
    assert.equal(contexts[i]!.config.nickname, `User ${i}`);
  }
});

test("AccountRegistry — 失败 start 释放 inFlight (后续 start 能重试)", async () => {
  const reg = new AccountRegistry();
  // 第 1 次 start: tokenKey 空 → 抛错
  await assert.rejects(
    () => reg.start("flaky", makeCfg({ tokenKey: "" })),
    /tokenKey missing/,
  );
  // 失败后 inFlight 应清, 第 2 次 start 配 tokenKey 应成功
  const ctx = await reg.start("flaky", makeCfg({ tokenKey: "real" }));
  assert.equal(ctx.accountId, "flaky");
  assert.equal(reg.size(), 1);
});

test("AccountRegistry — 并发失败 (5 个全抛错) 不会卡住 inFlight", async () => {
  const reg = new AccountRegistry();
  const promises = Array.from({ length: 5 }, () =>
    reg.start("flaky-2", makeCfg({ tokenKey: "" })),
  );
  const results = await Promise.allSettled(promises);
  // 5 个全 rejected
  for (const r of results) {
    assert.equal(r.status, "rejected");
  }
  // inFlight 已清, 后续正常 start 仍 work
  const ctx = await reg.start("flaky-2", makeCfg({ tokenKey: "real" }));
  assert.equal(ctx.accountId, "flaky-2");
});

// ===== 13. resolve 路由解析 (G2-2) =====

test("AccountRegistry.resolve — 精确匹配返回 context", async () => {
  const reg = new AccountRegistry();
  await reg.start("alice", makeCfg());
  await reg.start("bob", makeCfg());
  const ctx = reg.resolve("alice");
  assert.ok(ctx);
  assert.equal(ctx!.accountId, "alice");
});

test("AccountRegistry.resolve — 大小写不敏感匹配", async () => {
  const reg = new AccountRegistry();
  await reg.start("Alice", makeCfg());
  // 全大写查询
  const ctx = reg.resolve("ALICE");
  assert.ok(ctx, "应能大小写不敏感命中");
  assert.equal(ctx!.accountId, "Alice");
  // 全小写
  assert.equal(reg.resolve("alice")!.accountId, "Alice");
  // 混合
  assert.equal(reg.resolve("AlIcE")!.accountId, "Alice");
});

test("AccountRegistry.resolve — 找不到返回 null (不抛)", () => {
  const reg = new AccountRegistry();
  assert.equal(reg.resolve("ghost"), null);
});

test("AccountRegistry.resolve — 空字符串 / null / undefined 返 null", () => {
  const reg = new AccountRegistry();
  assert.equal(reg.resolve(""), null);
  assert.equal(reg.resolve(null), null);
  assert.equal(reg.resolve(undefined), null);
});

test("AccountRegistry.resolve — 精确匹配优先于大小写不敏感 (O(1) 命中)", async () => {
  const reg = new AccountRegistry();
  await reg.start("Alice", makeCfg({ nickname: "Alice-original" }));
  await reg.start("alice", makeCfg({ nickname: "alice-lower" }));
  // 精确匹配应胜出
  const exact = reg.resolve("alice");
  assert.equal(exact!.config.nickname, "alice-lower");
  const exactCap = reg.resolve("Alice");
  assert.equal(exactCap!.config.nickname, "Alice-original");
});

// ===== 14. getOrThrow 强类型拿 context =====

test("AccountRegistry.getOrThrow — 存在直接返回", async () => {
  const reg = new AccountRegistry();
  await reg.start("alice", makeCfg());
  const ctx = reg.getOrThrow("alice");
  assert.equal(ctx.accountId, "alice");
});

test("AccountRegistry.getOrThrow — 不存在抛错, 错误信息含已知 IDs", async () => {
  const reg = new AccountRegistry();
  await reg.start("alice", makeCfg());
  await reg.start("bob", makeCfg());
  assert.throws(
    () => reg.getOrThrow("ghost"),
    /account not found: ghost/,
  );
  try {
    reg.getOrThrow("ghost");
    assert.fail("应抛错");
  } catch (e) {
    const msg = (e as Error).message;
    assert.ok(msg.includes("alice"), "错误信息应含已知 IDs");
    assert.ok(msg.includes("bob"), "错误信息应含已知 IDs");
  }
});

test("AccountRegistry.getOrThrow — 空 registry 错误信息含 'none'", () => {
  const reg = new AccountRegistry();
  assert.throws(
    () => reg.getOrThrow("any"),
    /known: none/,
  );
});

// ===== 15. DB 持久化 (G2-3) =====
// 用最小 PersistOnlyFakeAdapter 注入 (不需要完整 DbAdapter 全部方法)

/** 仅实现 persist 相关的 3 方法, 其余 throw "not used in this test" */
class PersistOnlyFakeAdapter implements Partial<DbAdapter> {
  readonly backendName = "sqlite" as const;
  readonly accounts = new Map<string, import("../src/storage/db/types.js").AccountRecord>();

  async upsertAccount(record: import("../src/storage/db/types.js").AccountRecord): Promise<void> {
    this.accounts.set(record.account_id, { ...record });
  }
  async getAccounts(): Promise<import("../src/storage/db/types.js").AccountRecord[]> {
    return Array.from(this.accounts.values()).sort((a, b) =>
      a.account_id.localeCompare(b.account_id),
    );
  }
  async getAccount(accountId: string): Promise<import("../src/storage/db/types.js").AccountRecord | null> {
    return this.accounts.get(accountId) ?? null;
  }
  // 其余 DbAdapter 方法 stub (用 never 因为 persist 测试不会调用)
  async init(): Promise<void> { throw new Error("not used"); }
  async close(): Promise<void> { throw new Error("not used"); }
  async ping(): Promise<void> { throw new Error("not used"); }
  async saveMessage(): Promise<void> { throw new Error("not used"); }
  async getMessages(): Promise<never[]> { throw new Error("not used"); }
  async getMessageById(): Promise<null> { throw new Error("not used"); }
  async getMessageByMsgIdOrNewId(): Promise<null> { throw new Error("not used"); }
  async findMessageByMd5(): Promise<null> { throw new Error("not used"); }
  async saveContact(): Promise<void> { throw new Error("not used"); }
  async getContacts(): Promise<never[]> { throw new Error("not used"); }
  async saveChatroom(): Promise<void> { throw new Error("not used"); }
  async getChatrooms(): Promise<never[]> { throw new Error("not used"); }
  async getSessionState(): Promise<null> { throw new Error("not used"); }
  async upsertSessionState(): Promise<void> { throw new Error("not used"); }
  async logApiCall(): Promise<void> { throw new Error("not used"); }
  async getApiCalls(): Promise<never[]> { throw new Error("not used"); }
}

beforeEach(() => {
  resetAdapter();
});

test("AccountRegistry.persist — UPSERT 账号到 DB (含非敏感 config_json)", async () => {
  const fake = new PersistOnlyFakeAdapter();
  setAdapterForTest(fake as unknown as DbAdapter);

  const reg = new AccountRegistry();
  await reg.start("alice", makeCfg());
  await reg.persist("alice");

  assert.equal(fake.accounts.size, 1);
  const rec = fake.accounts.get("alice")!;
  assert.equal(rec.account_id, "alice");
  assert.equal(rec.nickname, "TestBot");
  assert.equal(rec.enabled, true);
  assert.ok(rec.config_json);
  const cfg = JSON.parse(rec.config_json!);
  assert.equal(cfg.debounceMs, 1500);
  assert.equal(cfg.requireAtMention, true);
  assert.equal(cfg.groupPolicy, "open");
  // 关键: 敏感字段不能进 config_json
  assert.ok(!cfg.tokenKey, "tokenKey must not leak to DB");
  assert.ok(!cfg.authcode, "authcode must not leak to DB");
  assert.ok(!cfg.webhookSecret, "webhookSecret must not leak to DB");
});

test("AccountRegistry.persist — 反映 vendorAuthed 状态", async () => {
  const fake = new PersistOnlyFakeAdapter();
  setAdapterForTest(fake as unknown as DbAdapter);

  const reg = new AccountRegistry();
  await reg.start("alice", makeCfg());
  const ctx = reg.get("alice")!;
  ctx.setVendorAuth("wxid_self_xx", "new-auth-123");

  await reg.persist("alice");

  const rec = fake.accounts.get("alice")!;
  assert.equal(rec.self_wxid, "wxid_self_xx", "应记录 selfWxid");
  // 注意: authcode 不存 DB, 但 selfWxid 存 (供 UI 显示)
});

test("AccountRegistry.persist — 不存在账号 no-op + warn (不抛)", async () => {
  const fake = new PersistOnlyFakeAdapter();
  setAdapterForTest(fake as unknown as DbAdapter);

  const reg = new AccountRegistry();
  await assert.doesNotReject(() => reg.persist("ghost"));
  assert.equal(fake.accounts.size, 0);
});

test("AccountRegistry.persist — UPSERT (重复调用更新非新增)", async () => {
  const fake = new PersistOnlyFakeAdapter();
  setAdapterForTest(fake as unknown as DbAdapter);

  const reg = new AccountRegistry();
  await reg.start("alice", makeCfg());
  await reg.persist("alice");
  await reg.persist("alice");
  await reg.persist("alice");

  assert.equal(fake.accounts.size, 1, "应只有 1 行 (UPSERT 幂等)");
});

test("AccountRegistry.loadAllFromDb — 返回所有已知账号", async () => {
  const fake = new PersistOnlyFakeAdapter();
  setAdapterForTest(fake as unknown as DbAdapter);
  // 直接往 fake 灌数据 (模拟历史数据)
  await fake.upsertAccount({ account_id: "alice", enabled: true });
  await fake.upsertAccount({ account_id: "bob", enabled: false });

  const reg = new AccountRegistry();
  const all = await reg.loadAllFromDb();
  assert.equal(all.length, 2);
  assert.deepEqual(all.map((r) => r.account_id).sort(), ["alice", "bob"]);
});

test("AccountRegistry.loadFromDb — 单个账号状态", async () => {
  const fake = new PersistOnlyFakeAdapter();
  setAdapterForTest(fake as unknown as DbAdapter);
  await fake.upsertAccount({ account_id: "alice", enabled: true, nickname: "Alice" });

  const reg = new AccountRegistry();
  const alice = await reg.loadFromDb("alice");
  assert.ok(alice);
  assert.equal(alice!.nickname, "Alice");

  const ghost = await reg.loadFromDb("ghost");
  assert.equal(ghost, null);
});

test("AccountRegistry.persist → loadFromDb — round-trip 一致", async () => {
  const fake = new PersistOnlyFakeAdapter();
  setAdapterForTest(fake as unknown as DbAdapter);

  const reg = new AccountRegistry();
  await reg.start("alice", makeCfg({ nickname: "MyAlice" }));
  await reg.persist("alice");

  // 新 registry 读回
  const reg2 = new AccountRegistry();
  const rec = await reg2.loadFromDb("alice");
  assert.ok(rec);
  assert.equal(rec!.nickname, "MyAlice");
  assert.equal(rec!.enabled, true);
});
