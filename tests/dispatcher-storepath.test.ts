// tests/dispatcher-storepath.test.ts - v1.1.15 P0-DISPATCH (2026-08-08 老板 15:27)
// 验证: dispatcher 调用时 storePath + ctxPayload + dispatcherOptions.deliver 全部传对
// 根因: v1.1.6 接入时 dispatcher.signature 跟 framework 真实签名不一致
//   → framework finalizeInboundContext(ctx) 取 ctx.SupplementalContext 时 ctx=undefined
//   → unhandled rejection → gateway 崩溃 → restart-loop breaker

import { test } from "node:test";
import assert from "node:assert/strict";
import type { WppChannelRuntime } from "../src/dispatch/dispatcher.js";
import { setChannelRuntime, dispatchInboundToOpenClaw } from "../src/dispatch/dispatcher.js";

const FAKE_STORE_PATH = "/test/sessions/default/sessions.json";

function makeFakeRuntime(opts: {
  storePath?: string;
  failResolveStorePath?: boolean;
  noResolveStorePath?: boolean;
}): WppChannelRuntime {
  const recordCalls: any[] = [];
  const dispatchCalls: any[] = [];
  const runtime: any = {
    session: {
      recordInboundSession: async (o: any) => { recordCalls.push(o); },
    },
    reply: {
      dispatchReplyWithBufferedBlockDispatcher: async (o: any) => { dispatchCalls.push(o); },
    },
  };
  if (!opts.noResolveStorePath) {
    runtime.session.resolveStorePath = (store: string, o: any) => {
      if (opts.failResolveStorePath) throw new Error("resolve boom");
      recordCalls.push({ _resolveStorePath: true, store, opts: o });
      return opts.storePath ?? FAKE_STORE_PATH;
    };
  }
  (runtime as any).__recordCalls = recordCalls;
  (runtime as any).__dispatchCalls = dispatchCalls;
  return runtime;
}

test("1. recordInboundSession + dispatchReplyWithBufferedBlockDispatcher 都收 ctxPayload + storePath", async () => {
  const fake = makeFakeRuntime({});
  const cfg = { gateway: { mode: "local" } };
  setChannelRuntime(fake);
  try {
    await dispatchInboundToOpenClaw(
      {
        accountId: "default",
        msgId: "m1",
        newMsgId: "n1",
        fromWxid: "q139198824",
        msgType: 1,
        content: "hi",
        ts: Math.floor(Date.now() / 1000),
        raw: {},
        peerKind: "direct",
        peerId: "q139198824",
      } as any,
      { channelRuntime: fake, cfg } as any
    );
    const recordCalls = (fake as any).__recordCalls.filter((c: any) => !c._resolveStorePath);
    const dispatchCalls = (fake as any).__dispatchCalls;
    assert.equal(recordCalls.length, 1, "recordInboundSession 应被调一次");
    assert.equal(dispatchCalls.length, 1, "dispatchReplyWithBufferedBlockDispatcher 应被调一次");
    assert.equal(recordCalls[0].storePath, FAKE_STORE_PATH);
    const ctx = recordCalls[0].ctx;
    assert.equal(ctx.Body, "hi");
    assert.equal(ctx.From, "wechatpadpro:q139198824");
    assert.equal(ctx.AccountId, "default");
    assert.equal(ctx.ChatType, "direct");
    assert.equal(ctx.SessionKey, recordCalls[0].sessionKey);
    assert.equal(ctx.Provider, "wechatpadpro");
    assert.equal(ctx.Surface, "wechatpadpro");
    assert.equal(ctx.MessageSid, "m1");
    assert.equal(dispatchCalls[0].ctx, ctx);
    assert.equal(dispatchCalls[0].cfg, cfg);
    assert.equal(typeof dispatchCalls[0].dispatcherOptions.deliver, "function");
  } finally {
    setChannelRuntime(null);
  }
});

test("2. resolveStorePath throw → storePath fallback empty string", async () => {
  const fake = makeFakeRuntime({ failResolveStorePath: true });
  setChannelRuntime(fake);
  try {
    await dispatchInboundToOpenClaw(
      {
        accountId: "default",
        msgId: "m2", newMsgId: "n2", fromWxid: "x",
        msgType: 1, content: "y", ts: 1, raw: {}, peerKind: "direct", peerId: "x",
      } as any,
      { channelRuntime: fake } as any
    );
    const recordCalls = (fake as any).__recordCalls.filter((c: any) => !c._resolveStorePath);
    assert.equal(recordCalls.length, 1);
    assert.equal(recordCalls[0].storePath, "");
  } finally {
    setChannelRuntime(null);
  }
});

test("3. runtime without resolveStorePath → backward compat", async () => {
  const fake = makeFakeRuntime({ noResolveStorePath: true });
  setChannelRuntime(fake);
  try {
    await dispatchInboundToOpenClaw(
      {
        accountId: "default",
        msgId: "m3", newMsgId: "n3", fromWxid: "x",
        msgType: 1, content: "z", ts: 1, raw: {}, peerKind: "direct", peerId: "x",
      } as any,
      { channelRuntime: fake } as any
    );
    const recordCalls = (fake as any).__recordCalls.filter((c: any) => !c._resolveStorePath);
    assert.equal(recordCalls.length, 1);
    assert.equal(recordCalls[0].storePath, "");
  } finally {
    setChannelRuntime(null);
  }
});

test("4. group message ctxPayload ChatType=group + ConversationLabel=chatroomId", async () => {
  const fake = makeFakeRuntime({});
  setChannelRuntime(fake);
  try {
    await dispatchInboundToOpenClaw(
      {
        accountId: "default",
        msgId: "g1", newMsgId: "ng1",
        fromWxid: "wxid_member1",
        toWxid: "57237508162@chatroom",
        chatroomId: "57237508162@chatroom",
        msgType: 1,
        content: "群消息内容",
        ts: 1, raw: {},
        peerKind: "group",
        peerId: "57237508162@chatroom",
      } as any,
      { channelRuntime: fake } as any
    );
    const recordCalls = (fake as any).__recordCalls.filter((c: any) => !c._resolveStorePath);
    assert.equal(recordCalls[0].ctx.ChatType, "group");
    assert.equal(recordCalls[0].ctx.ConversationLabel, "57237508162@chatroom");
    assert.equal(recordCalls[0].ctx.From, "wechatpadpro:wxid_member1");
    assert.equal(recordCalls[0].ctx.To, "wechatpadpro:57237508162@chatroom");
  } finally {
    setChannelRuntime(null);
  }
});

test("5. dispatcherOptions.deliver receives payload.text and calls sendAiReply", async () => {
  const fake = makeFakeRuntime({});
  setChannelRuntime(fake);
  try {
    await dispatchInboundToOpenClaw(
      {
        accountId: "default",
        msgId: "m5", newMsgId: "n5", fromWxid: "q139198824",
        msgType: 1, content: "user question", ts: 1, raw: {},
        peerKind: "direct", peerId: "q139198824",
      } as any,
      { channelRuntime: fake } as any
    );
    const dispatchCall = (fake as any).__dispatchCalls[0];
    const deliverResult = await dispatchCall.dispatcherOptions.deliver({ text: "AI reply test" }, {});
    assert.ok(deliverResult !== null);
    assert.equal(typeof deliverResult.ok, "boolean");
  } finally {
    setChannelRuntime(null);
  }
});