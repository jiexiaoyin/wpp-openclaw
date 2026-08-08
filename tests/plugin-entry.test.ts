// tests/plugin-entry.test.ts - Phase G3.5 wppChannelPlugin + plugin 公开 API 集成测试
// 覆盖:
//   - wppChannelPlugin: sendText/sendImage 的 registry 校验 (未知账号 → 清晰 error)
//   - plugin: OpenClaw v2026.7.1 manifest wrapper + register(api) 行为
// 注意: 不测实际 vendor 调用 (需要真实 vendor 或 mock fetch, 太重)

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { wppChannelPlugin, plugin } from "../src/index.js";
import { getDefaultAccountRegistry, resetDefaultRegistry } from "../src/account-state.js";

beforeEach(() => {
  resetDefaultRegistry();
});

// ===== sendText / sendImage — 未知账号 =====

test("wppChannelPlugin.sendText — 未知账号返 ok:false + 含 known 列表", async () => {
  const r = await wppChannelPlugin.sendText("ghost", "wxid_xxx", "hello");
  assert.equal(r.ok, false);
  assert.match(r.error!, /account not found: ghost/);
  assert.match(r.error!, /known: none/);
});

test("wppChannelPlugin.sendText — 已知账号列表展示 (registry 内部状态)", async () => {
  // 先 start 1 个账号 (模拟 plugin 已启动)
  await getDefaultAccountRegistry().start("alice", {
    enabled: true,
    tokenKey: "t",
    apiBaseUrl: "http://127.0.0.1:8062",
    wsUrl: "ws://127.0.0.1:8062/ws",
    authcode: "",
    webhookHost: "127.0.0.1",
    webhookPort: 8099,
    webhookPath: "/wpp/webhook",
    webhookSecret: "s",
    allowFrom: ["*"],
    groupPolicy: "open",
    groupAllowFrom: [],
    selfWxid: "wxid_a",
    nickname: "Alice",
    requireAtMention: true,
    debounceMs: 1500,
  });

  const r = await wppChannelPlugin.sendText("bob", "wxid_xxx", "hello");
  assert.equal(r.ok, false);
  assert.match(r.error!, /account not found: bob/);
  assert.match(r.error!, /known: alice/);
});

test("wppChannelPlugin.sendImage — 未知账号返 ok:false + 含 known 列表", async () => {
  const r = await wppChannelPlugin.sendImage("ghost", "wxid_xxx", "http://x/y.jpg");
  assert.equal(r.ok, false);
  assert.match(r.error!, /account not found: ghost/);
  assert.match(r.error!, /known: none/);
});

// ===== buildSessionKey utility =====

test("wppChannelPlugin.buildSessionKey — 委托给 session-key 模块", () => {
  const k = wppChannelPlugin.buildSessionKey({
    agentId: "main",
    accountId: "alice",
    peerKind: "direct",
    peerId: "wxid_bob",
  });
  assert.equal(typeof k, "string");
  assert.ok(k.includes("alice"), `session key 应含 accountId, got: ${k}`);
});

// ===== manifest 字段 =====

test("wppChannelPlugin — manifest 字段正确", () => {
  assert.equal(wppChannelPlugin.kind, "channel");
  assert.equal(wppChannelPlugin.id, "wechatpadpro");
  assert.ok(typeof wppChannelPlugin.version === "string");
  assert.equal(typeof wppChannelPlugin.start, "function");
  assert.equal(typeof wppChannelPlugin.stop, "function");
  assert.equal(typeof wppChannelPlugin.sendText, "function");
  assert.equal(typeof wppChannelPlugin.sendImage, "function");
});

// ===== plugin manifest (v2026.7.1 契约) =====

test("plugin — OpenClaw v2026.7.1 manifest 字段 (id/name/version/description/configSchema)", () => {
  assert.equal(plugin.id, "wechatpadpro");
  assert.equal(typeof plugin.name, "string");
  assert.ok(plugin.name.length > 0);
  assert.match(plugin.version, /^\d+\.\d+\.\d+/);
  assert.equal(typeof plugin.description, "string");
  assert.ok(plugin.description.length > 20);
  assert.equal(plugin.configSchema.type, "object");
});

test("plugin.register(api) — 调 api.registerChannel({ plugin: wppChannelPlugin }) 1 次", () => {
  const calls: Array<{ plugin?: unknown }> = [];
  const mockApi = {
    registerChannel: (arg: { plugin?: unknown }) => {
      calls.push(arg);
    },
  };
  plugin.register(mockApi);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.plugin, wppChannelPlugin);
});
