// tests/channel-meta.test.ts - Phase G7 channel meta + capabilities + gateway
// 覆盖: OpenClaw v3 channel 完整结构 (meta/capabilities/gateway 3 section)
// 仿 OpenClaw v2026.7.1+ channel 结构

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { wppChannelPlugin } from "../src/index.js";
import { resetDefaultRegistry } from "../src/account-state.js";
import type { WppAccountConfig } from "../src/types.js";

beforeEach(() => {
  resetDefaultRegistry();
});

// ===== helpers =====

function makeFakeCfg(overrides: Partial<WppAccountConfig> = {}): WppAccountConfig {
  return {
    enabled: true,
    tokenKey: "t",
    tokenKeyEnv: "WPP_TEST_TOKEN",
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
    ...overrides,
  };
}

// ===== 1. meta (5 测试) =====

test("meta — 含 label / selectionLabel / docsPath / blurb / aliases", () => {
  const meta = wppChannelPlugin.meta;
  assert.ok(meta, "必须有 meta 字段");
  assert.equal(meta.id, "wechatpadpro");
  assert.equal(typeof meta.label, "string");
  assert.ok(meta.label.length > 0);
  assert.equal(typeof meta.selectionLabel, "string");
  assert.ok(meta.selectionLabel.length > 0);
  assert.equal(typeof meta.docsPath, "string");
  assert.ok(meta.docsPath.includes("wechatpadpro"));
  assert.equal(typeof meta.blurb, "string");
  assert.ok(meta.blurb.length > 20);
  assert.ok(Array.isArray(meta.aliases));
  assert.ok(meta.aliases.includes("wpp"));
  assert.equal(meta.quickstartAllowFrom, true);
});

// ===== 2. capabilities (4 测试) =====

test("capabilities — chatTypes 含 direct + group", () => {
  const cap = wppChannelPlugin.capabilities;
  assert.ok(cap);
  assert.ok(Array.isArray(cap.chatTypes));
  assert.ok(cap.chatTypes.includes("direct"));
  assert.ok(cap.chatTypes.includes("group"));
});

test("capabilities — media=true (支持图片/语音/视频)", () => {
  assert.equal(wppChannelPlugin.capabilities.media, true);
});

test("capabilities — reactions/threads/nativeCommands=false (vendor 不支持)", () => {
  assert.equal(wppChannelPlugin.capabilities.reactions, false);
  assert.equal(wppChannelPlugin.capabilities.threads, false);
  assert.equal(wppChannelPlugin.capabilities.nativeCommands, false);
  assert.equal(wppChannelPlugin.capabilities.blockStreaming, false);
});

// ===== 3. gateway.startAccount (失败路径测试, 成功路径需真实 DB) =====

test("gateway.startAccount — 不存在账号返 ok:false + error (loadAccountConfig 抛错被 catch)", async () => {
  // accounts/<id>.json 不存在 → startAccountById 抛 "account config not found"
  // gateway.startAccount 的 try/catch 捕获, 返 ok:false + error
  const r = await wppChannelPlugin.gateway.startAccount({ accountId: "ghost-no-config-file" });
  assert.equal(r.ok, false);
  assert.ok(r.error);
  assert.match(r.error!, /not found|missing/);
});

test("gateway.startAccount — ctx 字段容忍 (account/channelRuntime/cfg 都 undefined 也能跑)", async () => {
  // 极端 ctx: 只传 accountId, 其他字段 undefined
  // startAccountById 不读 ctx, 走 accounts/<id>.json, 失败也是同样的错误路径
  const r = await wppChannelPlugin.gateway.startAccount({ accountId: "ghost-ctx" });
  assert.equal(r.ok, false);
  assert.ok(r.error, "error 应有内容");
});

test("gateway.startAccount — ctx 含 abortSignal/account/channelRuntime/cfg 全部传递不抛", async () => {
  // 复杂 ctx 也不应该 throw (可能被内部 catch), 只返 error
  const r = await wppChannelPlugin.gateway.startAccount({
    accountId: "ghost-complex",
    abortSignal: new AbortController().signal,
    account: { id: "fake" },
    channelRuntime: { foo: "bar" },
    cfg: { channels: { wechatpadpro: {} } },
  });
  assert.equal(r.ok, false);
  assert.ok(r.error);
});

// ===== 4. gateway.stopAccount (2 测试) =====

test("gateway.stopAccount — 已知账号返 ok=true (registry 移除)", async () => {
  const { getDefaultAccountRegistry } = await import("../src/account-state.js");
  const reg = getDefaultAccountRegistry();
  await reg.start("test-stop", makeFakeCfg());
  assert.equal(reg.size(), 1);

  const r = await wppChannelPlugin.gateway.stopAccount({ accountId: "test-stop" });
  assert.equal(r.ok, true);
  assert.equal(reg.size(), 0, "stopAccount 后 registry 应清空");
});

test("gateway.stopAccount — 不存在账号返 ok:false + error", async () => {
  const r = await wppChannelPlugin.gateway.stopAccount({ accountId: "ghost-stop" });
  assert.equal(r.ok, false);
  assert.ok(r.error);
});

// ===== 5. 整体结构完整性 =====

test("wppChannelPlugin — 8 section 都在 (kind/start/stop/sendText/sendImage/config/meta/capabilities/gateway/buildSessionKey)", () => {
  const required = [
    "kind", "start", "stop", "sendText", "sendImage",
    "config", "meta", "capabilities", "gateway", "buildSessionKey",
  ];
  for (const k of required) {
    assert.ok((wppChannelPlugin as Record<string, unknown>)[k], `missing section: ${k}`);
  }
});
