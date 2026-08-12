// tests/send-message.test.ts - v1.3.17 MESSAGE-UNIFY
// 统一 sendMessage 发送适配 (老板拍板: "发送各种类型消息适配 message 方式, 便于网关各种调用")
// 覆盖: normalizeSendResp 统一返回 / sendMessage 各类型路由 (mock registry + api)

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

import { normalizeSendResp, sendMessage } from "../src/dispatch/send-message.js";
import { getDefaultAccountRegistry } from "../src/account-state.js";
import { AccountContext } from "../src/accounts/account-context.js";
import type { WppAccountConfig } from "../src/types.js";

function mockAccount(accountId: string): void {
  const reg = getDefaultAccountRegistry() as unknown as { contexts: Map<string, AccountContext> };
  const cfg: WppAccountConfig = {
    enabled: true, tokenKey: "tk", apiBaseUrl: "https://test", wsUrl: "wss://test",
    authcode: "ac", webhookHost: "127.0.0.1", webhookPort: 0, webhookPath: "/w",
    webhookSecret: "", allowFrom: [], groupPolicy: "open", groupAllowFrom: [],
    selfWxid: "wxid_bot", nickname: "test", requireAtMention: true, debounceMs: 1500,
    agent: "wpp-wechat",
  };
  const ctx = new AccountContext({ accountId, config: cfg });
  // 覆盖 apiClient → 假实现 (避免真实 HTTP)
  (ctx as unknown as { apiClient: unknown }).apiClient = {
    sendText: async () => ({ Code: 0, Data: { msgId: 111, newMsgId: "111n" }, raw: null }),
    sendImage: async () => ({ Code: 0, Data: { msgId: 222 }, raw: null }),
    sendVoice: async () => ({ Code: 0, Data: { msgId: 333 }, raw: null }),
    sendVideo: async () => ({ Code: 0, Data: { msgId: 444 }, raw: null }),
  };
  reg.contexts.set(accountId, ctx);
}

function clearRegistry(): void {
  const reg = getDefaultAccountRegistry() as unknown as { contexts: Map<string, AccountContext> };
  reg.contexts.clear();
}

beforeEach(() => {
  clearRegistry();
  mockAccount("default");
});

after(() => {
  clearRegistry();
});

// ===== normalizeSendResp =====

test("v1.3.17 — normalizeSendResp: Code=0 → ok, msgId String()", () => {
  const r = normalizeSendResp({ Code: 0, Data: { msgId: 1234567890123456 }, raw: null });
  assert.deepEqual(r, { ok: true, msgId: "1234567890123456", error: undefined });
});

test("v1.3.17 — normalizeSendResp: Code≠0 → error", () => {
  const r = normalizeSendResp({ Code: -2, CodeValue: "NETWORK_ERROR", Data: null, raw: null });
  assert.equal(r.ok, false);
  assert.ok(r.error?.includes("-2"));
});

test("v1.3.17 — normalizeSendResp: 缺 msgId → undefined", () => {
  const r = normalizeSendResp({ Code: 0, Data: {}, raw: null });
  assert.deepEqual(r, { ok: true, msgId: undefined, error: undefined });
});

// ===== sendMessage 路由 =====

test("v1.3.17 — sendMessage text → 走 apiClient.sendText + 统一返回", async () => {
  const r = await sendMessage({ accountId: "default", toWxid: "wxid_alice", type: "text", content: "你好" });
  assert.equal(r.ok, true);
  assert.equal(r.msgId, "111");
});

test("v1.3.17 — sendMessage image/video/voice → 走 apiClient 对应方法", async () => {
  const img = await sendMessage({ accountId: "default", toWxid: "wxid_a", type: "image", content: "https://oss/a.jpg" });
  assert.equal(img.msgId, "222");
  const vo = await sendMessage({ accountId: "default", toWxid: "wxid_a", type: "voice", content: "data:audio/silk;base64,AAAA", durationMs: 3000 });
  assert.equal(vo.msgId, "333");
  const vd = await sendMessage({ accountId: "default", toWxid: "wxid_a", type: "video", content: "https://oss/a.mp4" });
  assert.equal(vd.msgId, "444");
});

test("v1.3.17 — sendMessage 未知 type → 返回 error", async () => {
  const r = await sendMessage({ accountId: "default", toWxid: "wxid_a", type: "hologram", content: "x" } as never);
  assert.equal(r.ok, false);
  assert.ok(r.error?.includes("unsupported"));
});

test("v1.3.17 — sendMessage 账号不存在 → error", async () => {
  clearRegistry();
  const r = await sendMessage({ accountId: "ghost", toWxid: "wxid_a", type: "text", content: "hi" });
  assert.equal(r.ok, false);
  assert.ok(r.error?.includes("account not found"));
});
// tests/send-message-attachments.test.ts - v1.3.38 attachments 数组兼容 (借鉴 gewe)
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMediaFromAttachments } from "../src/dispatch/send-message.js";

test("attachments[0].media 优先", () => {
  const r = resolveMediaFromAttachments([{ type: "image", media: "https://x/img.png" }]);
  assert.equal(r.mediaUrl, "https://x/img.png");
});

test("attachments[0].path fallback", () => {
  const r = resolveMediaFromAttachments([{ path: "https://x/v.mp4" }]);
  assert.equal(r.mediaUrl, "https://x/v.mp4");
});

test("attachments[0].url fallback", () => {
  const r = resolveMediaFromAttachments([{ url: "https://x/f.pdf", name: "doc.pdf" }]);
  assert.equal(r.mediaUrl, "https://x/f.pdf");
  assert.equal(r.attName, "doc.pdf");
});

test("无 attachments 用 content fallback", () => {
  const r = resolveMediaFromAttachments(undefined, "https://x/old.mp3", "old.mp3");
  assert.equal(r.mediaUrl, "https://x/old.mp3");
});

test("attachments 空数组 fallback content", () => {
  const r = resolveMediaFromAttachments([], "https://x/content.png");
  assert.equal(r.mediaUrl, "https://x/content.png");
});
