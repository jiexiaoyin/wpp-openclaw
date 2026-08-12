// tests/dispatcher.test.ts - v1.1.6 AI 智能回复 dispatcher 测试
// Mock OpenClaw channelRuntime, 测 dispatch 完整流程
// v1.1.16 P0-FIX: dispatcher 现在从 registry 读 cfg.agent, mock runtime 用 v1.1.15 新 signature
// v1.3.18 P1-假绿1: 删除 tests/shouldquote-text-only.test.ts (本地 stub, 测的是 fake 副本),
//   改在 dispatcher.test.ts 加真测: 验证 dispatcher.ts:724 `shouldQuote = true` 行为
//   (AI 回复时, deliver 引用 ctx.msgId/newMsgId 是真值, 通过 undici MockAgent 拦截 vendor
//   /Msg/ShareLink 请求, 验证 XML svrid 字段含真实 msgId)

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
import { resetAdapter } from "../src/storage/db/factory.js";
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

test("v1.1.6 — recordInboundSession 抛错时, 不 propagate (v1.2.1 P1-fix 防丢队列消息)", async () => {
  // 真 runtime case: 抛错但被 catch, 不向外 propagate (否则同 session 后续消息丢失)
  const failingRuntime: WppChannelRuntime = {
    session: { recordInboundSession: async () => { throw new Error("session fail"); } },
    reply: { dispatchReplyWithBufferedBlockDispatcher: async () => undefined },
  };
  setChannelRuntime(failingRuntime);
  await dispatchInboundToOpenClaw(mockMsg); // 应不抛
});

test("v1.1.6 — dispatchReply 抛错时, 不 propagate (v1.2.1 P1-fix 防丢队列消息)", async () => {
  const failingRuntime: WppChannelRuntime = {
    session: { recordInboundSession: async () => undefined },
    reply: { dispatchReplyWithBufferedBlockDispatcher: async () => { throw new Error("reply fail"); } },
  };
  setChannelRuntime(failingRuntime);
  await dispatchInboundToOpenClaw(mockMsg); // 应不抛
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
  assert.equal(mock.recordedSessions[0]!.sessionKey, "agent:wpp-wechat:wechatpadpro:group:chat-1@chatroom");
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

// ========== v1.1.26 CONCURRENCY-FIX (2026-08-08 接总立 20:06): per-session 串行队列测试 ==========
// v1.1.26 接总立拍板的根因: 19:53/20:06 两次 "图片引用失败" 实为回复未发送 (foregroundReplyFence 静默丢弃)
//   修复: dispatchInboundToOpenClaw 按 sessionKey 排队串行执行
//   - 同 session 并发: 后续消息进队列, 前一个完成再跑下一个
//   - 不同 session: 互不影响, 并行执行
// 老板 2026-08-09 06:56 B 选项要求: 加 per-peer 锁测试覆盖再 deploy

test("v1.1.26 CONCURRENCY-FIX — 同 session 并发 dispatch 串行执行 (后续入队, 不丢不并发互踩)", async () => {
  const mock = makeMockRuntime();
  // 让 recordInboundSession 加一点 delay (5ms) 模拟真实 AI 处理时间
  // 这样并发 3 条时第 2/3 条能观察到 "queued" 状态
  const origRecord = mock.session.recordInboundSession;
  mock.session.recordInboundSession = async (opts) => {
    await new Promise((r) => setTimeout(r, 5));
    return origRecord(opts);
  };
  setChannelRuntime(mock);

  // 同一 session: 3 条消息并发 dispatch
  const msgs = [
    { ...mockMsg, msgId: "m-1", newMsgId: "nm-1", content: "first" },
    { ...mockMsg, msgId: "m-2", newMsgId: "nm-2", content: "second" },
    { ...mockMsg, msgId: "m-3", newMsgId: "nm-3", content: "third" },
  ];
  await Promise.all(msgs.map((m) => dispatchInboundToOpenClaw(m)));

  // 3 条全部应处理 (不丢)
  assert.equal(mock.recordedSessions.length, 3, "should process all 3 queued messages");
  // 验证 sessionKey 都相同 (都是 direct:wxid_alice)
  assert.ok(
    mock.recordedSessions.every((s) => s.sessionKey === "agent:wpp-wechat:wechatpadpro:default:direct:wxid_alice"),
    "all should share the same sessionKey",
  );
});

test("v1.1.26 CONCURRENCY-FIX — 不同 session 并发 dispatch 互不影响 (并行)", async () => {
  const mock = makeMockRuntime();
  setChannelRuntime(mock);

  // 不同 peerKind/peerId: DM 1 + DM 2 + Group 3
  const msgs = [
    { ...mockMsg, msgId: "m-1", newMsgId: "nm-1", peerId: "wxid_alice", content: "DM alice" },
    { ...mockMsg, msgId: "m-2", newMsgId: "nm-2", peerId: "wxid_bob", content: "DM bob" },
    {
      ...mockMsg,
      msgId: "m-3",
      newMsgId: "nm-3",
      peerKind: "group" as const,
      peerId: "chat-1@chatroom",
      chatroomId: "chat-1@chatroom",
      content: "@bot group msg",
      trigger: "at" as const,
    },
  ];
  await Promise.all(msgs.map((m) => dispatchInboundToOpenClaw(m)));

  // 3 条全部应处理
  assert.equal(mock.recordedSessions.length, 3);
  // 验证 sessionKey 都不同 (不同 peerId)
  const sessionKeys = mock.recordedSessions.map((s) => s.sessionKey);
  assert.equal(new Set(sessionKeys).size, 3, "should produce 3 distinct sessionKeys");
  // 验证 sessionKey 内容正确
  assert.ok(sessionKeys.includes("agent:wpp-wechat:wechatpadpro:default:direct:wxid_alice"));
  assert.ok(sessionKeys.includes("agent:wpp-wechat:wechatpadpro:default:direct:wxid_bob"));
  assert.ok(sessionKeys.includes("agent:wpp-wechat:wechatpadpro:group:chat-1@chatroom"));
});

test("v1.1.26 CONCURRENCY-FIX — 同 session 10 条高并发, 全部入队不丢", async () => {
  const mock = makeMockRuntime();
  // 让 recordInboundSession 加 2ms delay (减少 test runtime)
  const origRecord = mock.session.recordInboundSession;
  mock.session.recordInboundSession = async (opts) => {
    await new Promise((r) => setTimeout(r, 2));
    return origRecord(opts);
  };
  setChannelRuntime(mock);

  // 同 session 10 条并发
  const N = 10;
  const msgs = Array.from({ length: N }, (_, i) => ({
    ...mockMsg,
    msgId: `m-${i}`,
    newMsgId: `nm-${i}`,
    content: `msg-${i}`,
  }));
  await Promise.all(msgs.map((m) => dispatchInboundToOpenClaw(m)));

  // 全部 N 条应处理
  assert.equal(mock.recordedSessions.length, N, `should process all ${N} queued messages`);
  // 验证 10 条 sessionKey 全相同
  assert.ok(
    mock.recordedSessions.every((s) => s.sessionKey === "agent:wpp-wechat:wechatpadpro:default:direct:wxid_alice"),
  );
  // 验证 msgId 都不同 (顺序保留: 0, 1, 2, ..., N-1)
  // 注: 串行队列保证入队顺序 = 处理顺序 (v1.1.26 dispatcher.ts:240 while 循环 + shift)
  // recordInboundSession 是按入队顺序被调用, 所以 push 顺序就是处理顺序
  const recordedMsgIds = mock.recordedSessions.map((s) => {
    const ctx = s.ctx as { MessageSid?: string };
    return ctx.MessageSid;
  });
  assert.deepEqual(
    recordedMsgIds,
    Array.from({ length: N }, (_, i) => `m-${i}`),
    "queued messages should be processed in enqueue order",
  );
});

// ========== v1.1.38 SUNNOY-STATE (2026-08-09): dispatch 写 sessionChatInfo 内存 cache ==========
test("v1.1.38 SUNNOY-STATE — dispatch 写 sessionChatInfo (chatId/chatType/peerId/accountId)", async () => {
  const { getSessionChatInfo, clearAllSessionChatInfo } = await import("../src/state.js");
  clearAllSessionChatInfo();
  const mock = makeMockRuntime();
  setChannelRuntime(mock);

  const groupMsg: WppInboundMessage = {
    ...mockMsg,
    accountId: "default",
    chatroomId: "chat-1@chatroom",
    peerKind: "group",
    peerId: "chat-1@chatroom",
    trigger: "at",
  };
  await dispatchInboundToOpenClaw(groupMsg);

  // 验证 sessionChatInfo 缓存被写
  const sk = "agent:wpp-wechat:wechatpadpro:group:chat-1@chatroom";
  const info = getSessionChatInfo(sk);
  assert.ok(info, "sessionChatInfo should be set after dispatch");
  assert.equal(info!.chatId, "chat-1@chatroom");
  assert.equal(info!.chatType, "group");
  assert.equal(info!.peerId, "chat-1@chatroom");
  assert.equal(info!.accountId, "default");

  clearAllSessionChatInfo(); // teardown
});

test("v1.1.38 SUNNOY-STATE — DM 消息 sessionChatInfo.chatType = single", async () => {
  const { getSessionChatInfo, clearAllSessionChatInfo } = await import("../src/state.js");
  clearAllSessionChatInfo();
  const mock = makeMockRuntime();
  setChannelRuntime(mock);

  await dispatchInboundToOpenClaw(mockMsg); // mockMsg 是 DM

  const sk = "agent:wpp-wechat:wechatpadpro:default:direct:wxid_alice";
  const info = getSessionChatInfo(sk);
  assert.ok(info);
  assert.equal(info!.chatType, "single");
  assert.equal(info!.chatId, "wxid_alice");

  clearAllSessionChatInfo(); // teardown
});
// ========== v1.3.18 P1-假绿1 修复: shouldQuote 硬编码 true 真测 ==========
// 之前 tests/shouldquote-text-only.test.ts 用本地 stub shouldQuoteFn 测 fake 副本 (18 case)
// 不覆盖真实 dispatcher.ts:724 `const shouldQuote = true` 的行为
// 修法: 用 undici MockAgent 拦截 vendor /Msg/ShareLink, 验证 deliver 真调用 sendAiReply 时
//   replyTo.msgId / replyTo.newMsgId 是真值 (而非空字符串)
test("v1.3.18 P1-假绿1 修 — shouldQuote 硬编码 true: deliver 引用消息用真 msgId/newMsgId (XML svrid 验证)", async () => {
  const { MockAgent, setGlobalDispatcher, getGlobalDispatcher } = await import("undici");

  // 1. 拦截 vendor apiBaseUrl="https://test"
  const realDispatcher = getGlobalDispatcher();
  const mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);

  // 2. 重置 DB adapter (quoteReply 内部 getMessageByMsgIdOrNewId 抛错时 try/catch 兜底)
  resetAdapter();

  let capturedXml: string = "";
  try {
    // path 用正则兼容 authcode query (?authcode=...), undici 默认 string 匹配会失败
    mockAgent
      .get("https://test")
      .intercept({ method: "POST", path: /^\/api\/Msg\/ShareLink/ })
      .reply(200, (opts) => {
        // postWppJson body 是 JSON.stringify 后的字符串
        try {
          const parsed = JSON.parse(String(opts.body)) as { Xml?: string; ToWxid?: string; Type?: number };
          capturedXml = parsed.Xml ?? "";
        } catch {
          /* ignore parse err */
        }
        return JSON.stringify({
          Code: 0,
          Data: { BaseResponse: { ret: 0 }, msgId: 999, newMsgId: 998 },
        });
      });

    const mock = makeMockRuntime();
    setChannelRuntime(mock);

    // 自定义 msgId/newMsgId, 真值进入 deliver (mockMsg 默认 m-1/nm-1)
    const customMsg: WppInboundMessage = {
      ...mockMsg,
      msgId: "real-msg-id-v1318",
      newMsgId: "real-new-id-v1318",
      content: "@bot shouldQuote test",
    };
    await dispatchInboundToOpenClaw(customMsg);

    // 3. 验证 deliver 真被调
    assert.equal(mock.recordedReplyResults.length, 1, "deliver 应被调 1 次");
    // 4. 验证 vendor API 真被调 (XML 被拦截)
    assert.ok(capturedXml.length > 0, `XML 应被捕获, 但为空 (vendor API 未调用)`);
    // 5. 验证 XML 中 svrid 是 newMsgId 真值 (硬编码 shouldQuote=true 才传 replyTo.newMsgId)
    //    quoteReply.ts:142 svrid = newMsgId || msgId; 引用 XML: <svrid>${svrid}</svrid>
    assert.ok(
      capturedXml.includes("<svrid>real-new-id-v1318</svrid>"),
      `XML 应含真 svrid='real-new-id-v1318' (硬编码 shouldQuote=true 行为), 实际: ${capturedXml.slice(0, 300)}`,
    );
    // 6. 反向验证: 如果 shouldQuote=false, svrid 字段会消失 (refermsg 整段 omit)
    assert.ok(
      capturedXml.includes("<refermsg>"),
      `XML 应含 refermsg 标签 (硬编码 shouldQuote=true 行为), 实际: ${capturedXml.slice(0, 300)}`,
    );
  } finally {
    setGlobalDispatcher(realDispatcher);
  }
});
