// v2026-08-14 15:13 C-fix (老板 query 15:02 拍板 C+D): 验证 cfg.agentId 注入
//
// 场景:
//   1. account 配置了 agent="wpp-wechat" → cfg 注入 agentId="wpp-wechat"
//   2. account 没配 agent 字段 → cfg 不注入 (避免 fallback "main" 干扰 framework)
//   3. cfg 已有 agentId → 不覆盖 (老板在 ctx 直接传的情况)

import test from "node:test";
import assert from "node:assert/strict";
import { getDefaultAccountRegistry, resetDefaultRegistry } from "../src/account-state.js";
import { setChannelRuntime, dispatchInboundToOpenClaw } from "../src/dispatch/dispatcher.js";
import type { WppAccountConfig } from "../src/types.js";

function makeFakeRuntime() {
  const recordCalls: unknown[] = [];
  const dispatchCalls: unknown[] = [];
  const runtime = {
    session: {
      resolveStorePath: () => "/fake/store",
      recordInboundSession: async (opts: unknown) => {
        recordCalls.push(opts);
      },
    },
    reply: {
      dispatchReplyWithBufferedBlockDispatcher: async (opts: unknown) => {
        dispatchCalls.push(opts);
      },
    },
  };
  (runtime as unknown as { __recordCalls: unknown[] }).__recordCalls = recordCalls;
  (runtime as unknown as { __dispatchCalls: unknown[] }).__dispatchCalls = dispatchCalls;
  return runtime;
}

function makeMsg(accountId: string) {
  return {
    accountId,
    msgId: "m1",
    newMsgId: "n1",
    fromWxid: "q139198824",
    msgType: 1,
    content: "hi",
    ts: Math.floor(Date.now() / 1000),
    raw: {},
    peerKind: "direct",
    peerId: "q139198824",
  } as unknown as Parameters<typeof dispatchInboundToOpenClaw>[0];
}

function baseCfg(): WppAccountConfig {
  return {
    enabled: true,
    tokenKeyEnv: "_WPP_MOCK_NO_ENV",
    tokenKey: "mock-token",
    apiBaseUrl: "https://mock/api",
    wsUrl: "wss://mock/ws",
    authcodeEnv: "_WPP_MOCK_NO_ENV",
    authcode: "mock-authcode",
    webhookHost: "127.0.0.1",
    webhookPort: 0,
    webhookPath: "/test/webhook",
    webhookSecret: "",
    allowFrom: [],
    groupPolicy: "open",
    groupAllowFrom: [],
    selfWxid: "",
    nickname: "test",
    requireAtMention: false,
    debounceMs: 1500,
  };
}

test("1. account.agent='wpp-wechat' → cfg 自动注入 agentId='wpp-wechat'", async () => {
  resetDefaultRegistry();
  const reg = getDefaultAccountRegistry();
  await reg.start("default", { ...baseCfg(), agent: "wpp-wechat" });
  const fake = makeFakeRuntime();
  setChannelRuntime(fake);
  try {
    await dispatchInboundToOpenClaw(makeMsg("default"), {
      channelRuntime: fake,
      cfg: { gateway: { mode: "local" } },
    } as never);
    const dispatchCalls = (fake as unknown as { __dispatchCalls: Array<{ cfg: { agentId?: string; gateway?: unknown } }> }).__dispatchCalls;
    assert.equal(dispatchCalls.length, 1, "dispatch 应调一次");
    assert.equal(dispatchCalls[0].cfg.agentId, "wpp-wechat", "cfg.agentId 应被注入");
    assert.deepEqual(dispatchCalls[0].cfg.gateway, { mode: "local" }, "cfg 原有字段保留");
  } finally {
    setChannelRuntime(null);
    await reg.stop("default");
  }
});

test("2. account 没配 agent → cfg 不注入 agentId (避免 fallback 'main' 干扰)", async () => {
  resetDefaultRegistry();
  const reg = getDefaultAccountRegistry();
  await reg.start("default2", baseCfg());
  const fake = makeFakeRuntime();
  setChannelRuntime(fake);
  try {
    await dispatchInboundToOpenClaw(makeMsg("default2"), {
      channelRuntime: fake,
      cfg: { gateway: { mode: "local" } },
    } as never);
    const dispatchCalls = (fake as unknown as { __dispatchCalls: Array<{ cfg: Record<string, unknown> }> }).__dispatchCalls;
    assert.equal(dispatchCalls.length, 1);
    assert.equal(dispatchCalls[0].cfg.agentId, undefined, "account 没配 agent → cfg.agentId 不应注入");
    assert.deepEqual(dispatchCalls[0].cfg, { gateway: { mode: "local" } }, "cfg 完全保持原样");
  } finally {
    setChannelRuntime(null);
    await reg.stop("default2");
  }
});

test("3. cfg 已有 agentId → 不覆盖 (老板直接传 ctx.cfg.agentId 优先)", async () => {
  resetDefaultRegistry();
  const reg = getDefaultAccountRegistry();
  await reg.start("default3", { ...baseCfg(), agent: "wpp-wechat" });
  const fake = makeFakeRuntime();
  setChannelRuntime(fake);
  try {
    await dispatchInboundToOpenClaw(makeMsg("default3"), {
      channelRuntime: fake,
      cfg: { gateway: { mode: "local" }, agentId: "custom-agent" },
    } as never);
    const dispatchCalls = (fake as unknown as { __dispatchCalls: Array<{ cfg: { agentId?: string } }> }).__dispatchCalls;
    assert.equal(dispatchCalls.length, 1);
    assert.equal(dispatchCalls[0].cfg.agentId, "custom-agent", "cfg.agentId 已存在时不注入");
  } finally {
    setChannelRuntime(null);
    await reg.stop("default3");
  }
});