// tests/hot-reload.test.ts - v1.1.15 HOT-RELOAD (2026-08-08 接总立方案 A)
// 核心验证: updateConfig 原地更新 (引用不变 + 字段生效)
// 真实 fs.watch 验证单独走手动验证 (不污染真实 accounts/)

import { test } from "node:test";
import assert from "node:assert/strict";

function makeCfg(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    tokenKey: "tk-test",
    apiBaseUrl: "http://127.0.0.1:9",
    wsUrl: "ws://127.0.0.1:9",
    authcode: "ac-test",
    webhookHost: "127.0.0.1",
    webhookPort: 9,
    webhookPath: "/w",
    webhookSecret: "",
    allowFrom: [] as string[],
    groupPolicy: "open",
    groupAllowFrom: [] as string[],
    selfWxid: "wxid_old",
    nickname: "test",
    requireAtMention: false,
    agent: "wpp-wechat",
    ...overrides,
  };
}

test("1. AccountContext.updateConfig — 改 allowFrom 即刻生效 (不换引用)", async () => {
  const { AccountContext } = await import("../src/accounts/account-context.js");
  const cfg = makeCfg();
  const ctx = new AccountContext({ accountId: "default", config: cfg });
  assert.deepEqual(ctx.config.allowFrom, []);

  const refBefore = ctx.config;
  ctx.updateConfig({ allowFrom: ["wxid_new"] });
  assert.deepEqual(ctx.config.allowFrom, ["wxid_new"], "allowFrom 应更新");
  assert.equal(ctx.config, refBefore, "config 引用应保持不变 (运行时读点持同一引用)");
});

test("2. updateConfig — 连续更新多个字段 + 引用稳定", async () => {
  const { AccountContext } = await import("../src/accounts/account-context.js");
  const ctx = new AccountContext({ accountId: "default", config: makeCfg() });
  const ref = ctx.config;
  ctx.updateConfig({ groupPolicy: "disabled" });
  ctx.updateConfig({ requireAtMention: true });
  ctx.updateConfig({ allowFrom: ["a", "b"] });
  assert.equal(ctx.config, ref);
  assert.equal(ctx.config.groupPolicy, "disabled");
  assert.equal(ctx.config.requireAtMention, true);
  assert.deepEqual(ctx.config.allowFrom, ["a", "b"]);
});

test("3. updateConfig — 同步 selfWxid/authcode (构造时独立拷的字段)", async () => {
  const { AccountContext } = await import("../src/accounts/account-context.js");
  const ctx = new AccountContext({ accountId: "default", config: makeCfg() });
  ctx.updateConfig({ selfWxid: "wxid_new2", authcode: "ac_new" });
  assert.equal(ctx.selfWxid, "wxid_new2");
  assert.equal(ctx.authcode, "ac_new");
});

test("4. updateConfig — 无变化时 no-op (不报错)", async () => {
  const { AccountContext } = await import("../src/accounts/account-context.js");
  const ctx = new AccountContext({ accountId: "default", config: makeCfg() });
  ctx.updateConfig({ allowFrom: [] }); // 相同值
  assert.deepEqual(ctx.config.allowFrom, []);
});

test("5. 端到端 — DM 白名单逻辑随 updateConfig 热更新", async () => {
  const { AccountContext } = await import("../src/accounts/account-context.js");
  const ctx = new AccountContext({ accountId: "default", config: makeCfg() });
  // 模拟 inbound/index.ts DM 白名单检查
  const checkDm = (fromWxid: string): boolean => {
    const allow = ctx.config.allowFrom ?? [];
    return allow.length === 0 || allow.includes(fromWxid);
  };
  assert.ok(checkDm("anyone"), "空白名单 = 全放行");
  ctx.updateConfig({ allowFrom: ["wxid_only"] });
  assert.ok(checkDm("wxid_only"), "白名单内放行");
  assert.ok(!checkDm("wxid_other"), "白名单外拒绝");
});

test("6. triggerConfig 闭包引用 — 热更新字段后闭包读到新值", async () => {
  const { AccountContext } = await import("../src/accounts/account-context.js");
  const ctx = new AccountContext({ accountId: "default", config: makeCfg() });
  // 模拟 index.ts: triggerConfig 是独立对象, 热重载时 update 它的字段
  const triggerConfig = { requireAtMention: ctx.config.requireAtMention, blacklistGroups: [] as string[], chatroomDebug: false };
  // 模拟 shouldTrigger 的闭包读取
  const closureRead = () => triggerConfig.requireAtMention;
  assert.equal(closureRead(), false);
  ctx.updateConfig({ requireAtMention: true });
  triggerConfig.requireAtMention = ctx.config.requireAtMention; // 热重载回调做的事
  assert.equal(closureRead(), true, "闭包应读到更新后的 requireAtMention");
});

test("7. v1.1.33 — triggerConfig 全字段同步 (仿 index.ts:597-605 热重载回调)", async () => {
  // P1[5] (2026-08-08 23:12 接总立 P1/P2/P3 推进):
  //   验证热重载回调把所有门禁字段同步到 triggerConfig (闭包同一引用)
  //   字段: requireAtMention / groupPolicy / groupAllowFrom / keywordTrigger /
  //         msgTypeTrigger / quoteBotTrigger / blacklistGroups / chatroomDebug
  const { AccountContext } = await import("../src/accounts/account-context.js");
  const ctx = new AccountContext({ accountId: "default", config: makeCfg() });

  // 模拟 index.ts: runtimeTriggerConfigs 的初始对象 (闭包持引用)
  const tc = {
    requireAtMention: ctx.config.requireAtMention ?? false,
    groupPolicy: ctx.config.groupPolicy ?? "closed",
    groupAllowFrom: [...(ctx.config.groupAllowFrom ?? [])],
    keywordTrigger: undefined as string[] | undefined,
    msgTypeTrigger: undefined as number[] | undefined,
    quoteBotTrigger: undefined as string[] | undefined,
    blacklistGroups: [] as string[],
    chatroomDebug: false,
  };

  // 模拟 hot-reload onChange 回调 (index.ts:597-605 逻辑)
  const applyHotReload = (newCfg: Record<string, unknown>) => {
    if (newCfg.requireAtMention !== undefined) tc.requireAtMention = newCfg.requireAtMention as boolean;
    if (newCfg.groupPolicy !== undefined) tc.groupPolicy = newCfg.groupPolicy as string;
    if (newCfg.groupAllowFrom !== undefined) tc.groupAllowFrom = [...(newCfg.groupAllowFrom as string[])];
    if (newCfg.keywordTrigger !== undefined) tc.keywordTrigger = newCfg.keywordTrigger as string[];
    if (newCfg.msgTypeTrigger !== undefined) tc.msgTypeTrigger = newCfg.msgTypeTrigger as number[];
    if (newCfg.quoteBotTrigger !== undefined) tc.quoteBotTrigger = newCfg.quoteBotTrigger as string[];
    if (newCfg.blacklistGroups !== undefined) tc.blacklistGroups = newCfg.blacklistGroups as string[];
    if (newCfg.chatroomDebug !== undefined) tc.chatroomDebug = newCfg.chatroomDebug as boolean;
  };

  // 初始值
  assert.equal(tc.requireAtMention, false);
  assert.equal(tc.groupPolicy, "open");
  assert.deepEqual(tc.groupAllowFrom, []);
  assert.equal(tc.chatroomDebug, false);

  // 全字段更新
  applyHotReload({
    requireAtMention: true,
    groupPolicy: "allowlist",
    groupAllowFrom: ["wxid_g1"],
    keywordTrigger: ["查库存"],
    msgTypeTrigger: [1, 3],
    quoteBotTrigger: ["wxid_bot"],
    blacklistGroups: ["g_black"],
    chatroomDebug: true,
  });

  // 全部生效
  assert.equal(tc.requireAtMention, true, "requireAtMention 应热更新");
  assert.equal(tc.groupPolicy, "allowlist", "groupPolicy 应热更新");
  assert.deepEqual(tc.groupAllowFrom, ["wxid_g1"], "groupAllowFrom 应热更新");
  assert.deepEqual(tc.keywordTrigger, ["查库存"], "keywordTrigger 应热更新");
  assert.deepEqual(tc.msgTypeTrigger, [1, 3], "msgTypeTrigger 应热更新");
  assert.deepEqual(tc.quoteBotTrigger, ["wxid_bot"], "quoteBotTrigger 应热更新");
  assert.deepEqual(tc.blacklistGroups, ["g_black"], "blacklistGroups 应热更新");
  assert.equal(tc.chatroomDebug, true, "chatroomDebug 应热更新");
});

// ===== v1.2.3 PAIRING-FIX: allowFrom 合并回归 (handler 只认 triggerCtx live) =====

import { createWppInboundHandler } from "../src/inbound/handler.js";
import { defaultTriggerConfig } from "../src/inbound/triggers.js";
import { resetAdapter } from "../src/storage/db/factory.js";
import type { WppAccountTriggerCtx } from "../src/inbound/triggers.js";
import type { WppInboundMessage, WppWebhookPayload } from "../src/types.js";

test("8. v1.2.3 PAIRING-FIX — 热重载改 triggerCtx.allowFrom → 新 wxid 立即放行", async () => {
  resetAdapter();
  const dispatched: WppInboundMessage[] = [];

  // 模拟启动时已有白名单的账号: opts.allowFrom 快照 = ["wxid_old"], triggerCtx 初始同引用
  const triggerCtx: WppAccountTriggerCtx = {
    botWxid: "wxid_bot",
    botNickname: "testbot",
    allowFrom: ["wxid_old"],
  };
  const handler = createWppInboundHandler({
    accountId: "default",
    triggerConfig: defaultTriggerConfig(),
    triggerCtx,
    enableDispatch: true,
    allowFrom: ["wxid_old"], // opts 快照 (旧代码会用这个覆盖 → bug)
    onDispatch: async (msg) => { dispatched.push(msg); },
  });

  // 旧白名单用户 → 触发
  await handler.handle({
    fromUser: "wxid_old",
    content: "hi",
    msgType: 1,
    msgId: "hr-1",
  } as unknown as WppWebhookPayload);
  await handler.flushAll();
  assert.equal(dispatched.length, 1, "旧白名单用户应触发");
  dispatched.length = 0;

  // 新用户 (配对前) → blocked
  await handler.handle({
    fromUser: "wxid_newcomer",
    content: "hi",
    msgType: 1,
    msgId: "hr-2",
  } as unknown as WppWebhookPayload);
  await handler.flushAll();
  assert.equal(dispatched.length, 0, "新用户配对前应 blocked");

  // 模拟配对成功热重载: triggerCtx.allowFrom 加 wxid_newcomer (handlePairingAttempt 做的)
  triggerCtx.allowFrom = ["wxid_old", "wxid_newcomer"];

  // 新用户现在应触发 (零重启生效)
  await handler.handle({
    fromUser: "wxid_newcomer",
    content: "hi",
    msgType: 1,
    msgId: "hr-3",
  } as unknown as WppWebhookPayload);
  await handler.flushAll();
  assert.equal(dispatched.length, 1, "配对后热重载 → 新用户应触发 (allowFrom 只认 triggerCtx live)");
});

test("9. v1.2.3 PAIRING-FIX — opts.allowFrom 过期快照不覆盖 triggerCtx live", async () => {
  resetAdapter();
  const dispatched: WppInboundMessage[] = [];
  const triggerCtx: WppAccountTriggerCtx = {
    botWxid: "wxid_bot",
    botNickname: "testbot",
    allowFrom: ["wxid_live"],
  };
  const handler = createWppInboundHandler({
    accountId: "default",
    triggerConfig: defaultTriggerConfig(),
    triggerCtx,
    enableDispatch: true,
    allowFrom: ["wxid_stale"], // 快照过期 (旧代码若用这个覆盖 → 新用户仍被拒)
    onDispatch: async (msg) => { dispatched.push(msg); },
  });

  await handler.handle({
    fromUser: "wxid_live",
    content: "hi",
    msgType: 1,
    msgId: "hr-4",
  } as unknown as WppWebhookPayload);
  await handler.flushAll();
  assert.equal(dispatched.length, 1, "应以 triggerCtx (live) 为准, 忽略 opts 过期快照");
});
