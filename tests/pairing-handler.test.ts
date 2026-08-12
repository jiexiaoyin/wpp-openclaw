// tests/pairing-handler.test.ts - v1.2.3 PAIRING 配对拦截 (handler 层)
// 覆盖: blocked DM /pair → 回调被调 (code 正确) + 不进 dispatched; 未启用/白名单内/群消息/自回环 → 不拦

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createWppInboundHandler,
} from "../src/inbound/handler.js";
import { defaultTriggerConfig } from "../src/inbound/triggers.js";
import { resetAdapter } from "../src/storage/db/factory.js";
import type { WppInboundMessage, WppWebhookPayload } from "../src/types.js";

function makeMsg(opts: Partial<WppInboundMessage> = {}): WppInboundMessage {
  return {
    accountId: "default",
    msgId: `m-${Math.random().toString(36).slice(2)}`,
    newMsgId: "",
    fromWxid: opts.peerKind === "group" ? "wxid_sender" : "wxid_stranger",
    chatroomId: opts.peerKind === "group" ? "chat1@chatroom" : undefined,
    msgType: 1,
    content: "hello",
    ts: Math.floor(Date.now() / 1000),
    raw: {} as WppWebhookPayload,
    peerKind: opts.peerKind ?? "direct",
    peerId: opts.peerId ?? (opts.peerKind === "group" ? "chat1@chatroom" : "wxid_stranger"),
    trigger: "direct",
    ...opts,
  };
}

function buildHandler(opts: {
  dmPairingEnabled?: boolean;
  allowFrom?: string[];
  botWxid?: string;
  onPairingAttempt?: (ctx: { msg: WppInboundMessage; code: string }) => void | Promise<void>;
}) {
  resetAdapter();
  const dispatched: WppInboundMessage[] = [];
  const pairingAttempts: Array<{ msg: WppInboundMessage; code: string }> = [];
  const handler = createWppInboundHandler({
    accountId: "default",
    triggerConfig: defaultTriggerConfig(),
    triggerCtx: {
      botWxid: opts.botWxid ?? "wxid_bot",
      botNickname: "testbot",
      allowFrom: opts.allowFrom ?? [],
      dmPairingEnabled: opts.dmPairingEnabled,
    },
    enableDispatch: true,
    onDispatch: async (msg) => { dispatched.push(msg); },
    dmPairingEnabled: opts.dmPairingEnabled,
    onPairingAttempt: async (ctx) => {
      pairingAttempts.push(ctx);
      if (opts.onPairingAttempt) await opts.onPairingAttempt(ctx);
    },
  });
  return { handler, dispatched, pairingAttempts };
}

async function flush(handler: ReturnType<typeof createWppInboundHandler>) {
  await handler.flushAll();
}

// ===== 拦截成功 =====

test("v1.2.3 PAIRING — blocked DM /pair → 回调被调 (code 正确) + 不进 dispatched", async () => {
  const { handler, dispatched, pairingAttempts } = buildHandler({ dmPairingEnabled: true, allowFrom: [] });
  await handler.handle({
    fromUser: "wxid_stranger",
    content: "/pair ABCD2345",
    msgType: 1,
    msgId: "p-1",
  } as unknown as WppWebhookPayload);
  await flush(handler);

  assert.equal(pairingAttempts.length, 1, "配对回调应被调");
  assert.equal(pairingAttempts[0]!.code, "ABCD2345");
  assert.equal(pairingAttempts[0]!.msg.fromWxid, "wxid_stranger");
  assert.equal(dispatched.length, 0, "配对消息不应触发 AI");
});

// ===== 未启用 =====

test("v1.2.3 PAIRING — dmPairingEnabled falsy → 回调不调", async () => {
  const { handler, pairingAttempts } = buildHandler({ dmPairingEnabled: false, allowFrom: [] });
  await handler.handle({
    fromUser: "wxid_stranger",
    content: "/pair ABCD2345",
    msgType: 1,
    msgId: "p-2",
  } as unknown as WppWebhookPayload);
  await flush(handler);
  assert.equal(pairingAttempts.length, 0, "未启用配对 → 不应调回调");
});

// ===== 白名单内 =====

test("v1.2.3 PAIRING — allowFrom 已含 sender → 正常 dispatch, 回调不调", async () => {
  const { handler, dispatched, pairingAttempts } = buildHandler({
    dmPairingEnabled: true,
    allowFrom: ["wxid_stranger"],
  });
  await handler.handle({
    fromUser: "wxid_stranger",
    content: "/pair ABCD2345",
    msgType: 1,
    msgId: "p-3",
  } as unknown as WppWebhookPayload);
  await flush(handler);
  assert.equal(pairingAttempts.length, 0, "白名单内 → 不当配对处理");
  assert.equal(dispatched.length, 1, "白名单内 → 正常触发 AI");
});

// ===== 群消息 =====

test("v1.2.3 PAIRING — 群消息 /pair → 回调不调", async () => {
  const { handler, pairingAttempts } = buildHandler({ dmPairingEnabled: true, allowFrom: [] });
  await handler.handle({
    fromUser: "wxid_sender",
    content: "/pair ABCD2345",
    msgType: 1,
    msgId: "p-4",
    chatroomId: "chat1@chatroom",
  } as unknown as WppWebhookPayload);
  await flush(handler);
  assert.equal(pairingAttempts.length, 0, "群聊 /pair → 不当配对处理");
});

// ===== 自回环 =====

test("v1.2.3 PAIRING — fromWxid === botWxid (自回环) → 回调不调", async () => {
  const { handler, pairingAttempts } = buildHandler({ dmPairingEnabled: true, allowFrom: [], botWxid: "wxid_bot" });
  await handler.handle({
    fromUser: "wxid_bot",
    content: "/pair ABCD2345",
    msgType: 1,
    msgId: "p-5",
  } as unknown as WppWebhookPayload);
  await flush(handler);
  assert.equal(pairingAttempts.length, 0, "bot 自己发 /pair → 不拦 (自回环 guard)");
});

// ===== 非配对文本 =====

test("v1.2.3 PAIRING — blocked DM 非配对文本 → 回调不调, 不进 dispatch", async () => {
  const { handler, pairingAttempts, dispatched } = buildHandler({ dmPairingEnabled: true, allowFrom: [] });
  await handler.handle({
    fromUser: "wxid_stranger",
    content: "你好啊",
    msgType: 1,
    msgId: "p-6",
  } as unknown as WppWebhookPayload);
  await flush(handler);
  assert.equal(pairingAttempts.length, 0);
  assert.equal(dispatched.length, 0);
});

// ===== 回调抛错不崩 batch =====

test("v1.2.3 PAIRING — onPairingAttempt reject → warn 不崩 batch", async () => {
  const { handler, pairingAttempts } = buildHandler({
    dmPairingEnabled: true,
    allowFrom: [],
    onPairingAttempt: async () => { throw new Error("boom"); },
  });
  await handler.handle({
    fromUser: "wxid_stranger",
    content: "/pair ABCD2345",
    msgType: 1,
    msgId: "p-7",
  } as unknown as WppWebhookPayload);
  await flush(handler); // 不应抛
  assert.equal(pairingAttempts.length, 1, "回调被调 (抛错前)");
});

// ===== 热切 dmPairingEnabled via triggerCtx =====

test("v1.2.3 PAIRING — triggerCtx.dmPairingEnabled=true (热切) 也拦", async () => {
  resetAdapter();
  const pairingAttempts: Array<{ msg: WppInboundMessage; code: string }> = [];
  const triggerCtx = {
    botWxid: "wxid_bot",
    botNickname: "testbot",
    allowFrom: [] as string[],
    dmPairingEnabled: false as boolean,
  };
  const handler = createWppInboundHandler({
    accountId: "default",
    triggerConfig: defaultTriggerConfig(),
    triggerCtx,
    enableDispatch: true,
    dmPairingEnabled: false, // opts 快照 false
    onPairingAttempt: async (ctx) => { pairingAttempts.push(ctx); },
  });
  // 模拟热重载: triggerCtx.dmPairingEnabled = true
  triggerCtx.dmPairingEnabled = true;
  await handler.handle({
    fromUser: "wxid_stranger",
    content: "/pair ABCD2345",
    msgType: 1,
    msgId: "p-8",
  } as unknown as WppWebhookPayload);
  await flush(handler);
  assert.equal(pairingAttempts.length, 1, "triggerCtx 热切 true → 应拦 (不依赖 opts 快照)");
});
