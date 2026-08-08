// tests/dispatcher.test.ts - v1.1.6 AI 智能回复 dispatcher 测试
// Mock OpenClaw channelRuntime, 测 dispatch 完整流程
// v1.1.16 P0-FIX: dispatcher 现在从 registry 读 cfg.agent, mock runtime 用 v1.1.15 新 signature

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

import {
  dispatchInboundToOpenClaw,
  setChannelRuntime,
  type WppChannelRuntime,
} from "../src/dispatch/dispatcher.js";
import { getDefaultAccountRegistry } from "../src/account-state.js";
import { AccountRegistry } from "../src/accounts/account-registry.js";
import { AccountContext } from "../src/accounts/account-context.js";
import type { WppInboundMessage } from "../src/types.js";

/** v1.1.16 P0-FIX: mock 一个有 agent 字段的 account context (注入到 module default registry) */
function mockAccountRegistry(accountId: string, agent: string): void {
  const reg = getDefaultAccountRegistry() as unknown as { contexts: Map<string, AccountContext> };
  const cfg = {
    enabled: true,
    tokenKey: "test-token",
    apiBaseUrl: "https://test",
    wsUrl: "wss://test",
    authcode: "test-auth",
    webhookHost: "0.0.0.0",
    webhookPort: 0,
    webhookPath: "/test",
    webhookSecret: "",
    allowFrom: [],
    groupPolicy: "open" as const,
    groupAllowFrom: [],
    selfWxid: "wxid_bot",
    nickname: "test",
    requireAtMention: true,
    debounceMs: 1500,
    agent,
  };
  const ctx = new AccountContext({ accountId, config: cfg });
  reg.contexts.set(accountId, ctx);
}

// ===== Mock runtime =====

function makeMockRuntime(): WppChannelRuntime & {
  recordedSessions: Array<{ storePath: string; sessionKey: string; ctx: unknown }>;
  dispatchedReplies: Array<{ ctx: unknown; cfg: unknown; dispatcherOptions: { deliver: (payload: { text?: string }, info: unknown) => Promise<unknown> } }>;
  recordedReplyResults: Array<{ text: string; result: unknown }>;
} {
  const runtime = {
    recordedSessions: [] as Array<{ storePath: string; sessionKey: string; ctx: unknown }>,
    dispatchedReplies: [] as Array<{ ctx: unknown; cfg: unknown; dispatcherOptions: { deliver: (payload: { text?: string }, info: unknown) => Promise<unknown> } }>,
    recordedReplyResults: [] as Array<{ text: string; result: unknown }>,
    session: {
      recordInboundSession: async (opts: { storePath: string; sessionKey: string; ctx: unknown }) => {
        runtime.recordedSessions.push(opts);
      },
    },
    reply: {
      dispatchReplyWithBufferedBlockDispatcher: async (opts: {
        ctx: unknown;
        cfg: unknown;
        dispatcherOptions: { deliver: (payload: { text?: string }, info: unknown) => Promise<unknown> };
      }) => {
        runtime.dispatchedReplies.push(opts);
        // 模拟 AI 调 deliver(payload, info)
        const ctx = opts.ctx as { Body?: string } | undefined;
        const body = ctx?.Body ?? "";
        const aiText = `AI reply to: ${body}`;
        const result = await opts.dispatcherOptions.deliver({ text: aiText }, {});
        runtime.recordedReplyResults.push({ text: aiText, result });
      },
    },
  };
  return runtime;
}

const mockMsg: WppInboundMessage = {
  accountId: "default",
  msgId: "m-1",
  newMsgId: "nm-1",
  fromWxid: "wxid_alice",
  fromNickname: "Alice",
  chatroomId: undefined,
  toWxid: undefined,
  msgType: 1,
  content: "hello bot",
  ts: Date.now(),
  raw: {},
  peerKind: "direct",
  peerId: "wxid_alice",
  trigger: "direct",
};

// ===== Tests =====

beforeEach(() => {
  setChannelRuntime(null); // reset
  // v1.1.16 P0-FIX: 每个 test 重新注册 default account
  mockAccountRegistry("default", "wpp-wechat");
  mockAccountRegistry("alice", "wpp-wechat");
});

after(() => {
  setChannelRuntime(null);
});

test("v1.1.6 — dispatch 没 runtime 时 NOOP (不抛错)", async () => {
  setChannelRuntime(null);
  await dispatchInboundToOpenClaw(mockMsg);
  // 应不抛错, 不调任何外部
});

test("v1.1.6 — dispatch 调 recordInboundSession (1 次, 正确 sessionKey + ctx)", async () => {
  const mock = makeMockRuntime();
  setChannelRuntime(mock);
  await dispatchInboundToOpenClaw(mockMsg);
  assert.equal(mock.recordedSessions.length, 1);
  // v1.1.16 P0-FIX: sessionKey 现在用 account.agent ("wpp-wechat"), 不用 hardcode "main"
  assert.equal(mock.recordedSessions[0]!.sessionKey, "agent:wpp-wechat:wechatpadpro:default:direct:wxid_alice");
  // v1.1.15 P0-DISPATCH: inbound 字段已搬到 ctx (ctx.MessageSid)
  const ctx = mock.recordedSessions[0]!.ctx as { MessageSid?: string };
  assert.equal(ctx.MessageSid, "m-1");
});

test("v1.1.6 — dispatch 调 dispatchReplyWithBufferedBlockDispatcher (1 次)", async () => {
  const mock = makeMockRuntime();
  setChannelRuntime(mock);
  await dispatchInboundToOpenClaw(mockMsg);
  assert.equal(mock.dispatchedReplies.length, 1);
  // v1.1.15 P0-DISPATCH: dispatcherOptions 包含 deliver 回调
  assert.equal(typeof mock.dispatchedReplies[0]!.dispatcherOptions.deliver, "function");
});

test("v1.1.6 — deliver 回调 (AI 文本) 传回 (recorded)", async () => {
  const mock = makeMockRuntime();
  setChannelRuntime(mock);
  await dispatchInboundToOpenClaw(mockMsg);
  assert.equal(mock.recordedReplyResults.length, 1);
  assert.match(mock.recordedReplyResults[0]!.text, /AI reply to: hello bot/);
});

test("v1.1.6 — deliver 返 ok 时, 调 sendText 走 vendor (mock 失败也无害)", async () => {
  // 没 vendor 真实连接, sendAiReply 会 fail, 但不抛 (log + 返 ok:false)
  const mock = makeMockRuntime();
  setChannelRuntime(mock);
  await dispatchInboundToOpenClaw(mockMsg);
  // recordedReplyResults 应有 1 条 (AI text 触发 deliver, 内部 try/catch 不抛)
  assert.equal(mock.recordedReplyResults.length, 1);
});

test("v1.1.6 — recordInboundSession 抛错时, NOOP runtime 不 propagate, 真 runtime propagate", async () => {
  // NOOP case: 不抛
  setChannelRuntime(null);
  await dispatchInboundToOpenClaw(mockMsg); // 应不抛

  // 真 runtime case: propagate
  const failingRuntime: WppChannelRuntime = {
    session: { recordInboundSession: async () => { throw new Error("session fail"); } },
    reply: { dispatchReplyWithBufferedBlockDispatcher: async () => undefined },
  };
  setChannelRuntime(failingRuntime);
  await assert.rejects(
    () => dispatchInboundToOpenClaw(mockMsg),
    /session fail/,
  );
});

test("v1.1.6 — dispatchReply 抛错时, 真 runtime propagate, NOOP 不", async () => {
  const failingRuntime: WppChannelRuntime = {
    session: { recordInboundSession: async () => undefined },
    reply: { dispatchReplyWithBufferedBlockDispatcher: async () => { throw new Error("reply fail"); } },
  };
  setChannelRuntime(failingRuntime);
  await assert.rejects(
    () => dispatchInboundToOpenClaw(mockMsg),
    /reply fail/,
  );
});

test("v1.1.6 — 多账号 (group) 消息, sessionKey 含 group 标识", async () => {
  const mock = makeMockRuntime();
  setChannelRuntime(mock);
  const groupMsg: WppInboundMessage = {
    ...mockMsg,
    accountId: "alice",
    chatroomId: "chat-1@chatroom",
    peerKind: "group",
    peerId: "chat-1@chatroom",
    content: "@bot help",
    trigger: "at",
  };
  await dispatchInboundToOpenClaw(groupMsg);
  // v1.1.16 P0-FIX: 用 account.agent ("wpp-wechat"), 不用 hardcode "main"
  assert.equal(mock.recordedSessions[0]!.sessionKey, "agent:wpp-wechat:wechatpadpro:alice:group:chat-1@chatroom");
});

test("v1.1.16 P0-FIX — registry 找不到 account 时 fallback main + warn (兼容测试)", async () => {
  const unknownMsg: WppInboundMessage = { ...mockMsg, accountId: "unknown-account" };
  const mock = makeMockRuntime();
  setChannelRuntime(mock);
  // 不 mock registry for unknown-account
  await dispatchInboundToOpenClaw(unknownMsg);
  // sessionKey fallback to "main" + warn log
  assert.equal(mock.recordedSessions[0]!.sessionKey, "agent:main:wechatpadpro:unknown-account:direct:wxid_alice");
});

test("v1.1.16 P0-FIX — account.agent missing 时 fallback main + warn (防 P0 污染)", async () => {
  // mock 一个 agent 字段缺失的 account
  mockAccountRegistry("noagent", ""); // 空字符串触发 fallback
  const noAgentMsg: WppInboundMessage = { ...mockMsg, accountId: "noagent" };
  const mock = makeMockRuntime();
  setChannelRuntime(mock);
  await dispatchInboundToOpenClaw(noAgentMsg);
  // 验证 fallback "main" + warn log (生产环境 startAccountById 已经 throw 拦截)
  assert.equal(mock.recordedSessions[0]!.sessionKey, "agent:main:wechatpadpro:noagent:direct:wxid_alice");
});