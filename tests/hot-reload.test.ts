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
