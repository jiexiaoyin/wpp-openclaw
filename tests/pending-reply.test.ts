// tests/pending-reply.test.ts - v1.3.38 PENDING-REPLY 路由 Map (借鉴 gewe)
import { test } from "node:test";
import assert from "node:assert/strict";
import { rememberReply, lookupReply, resolveTargetWxid, cleanupPendingReplies, rememberLastGroupMention } from "../src/dispatch/pending-reply.js";

test("rememberReply + lookupReply — 群@记录路由", () => {
  rememberReply("msg-1", { isGroup: true, roomId: "g@chatroom", senderId: "wxid_user", accountId: "default" });
  const e = lookupReply("msg-1");
  assert.equal(e?.isGroup, true);
  assert.equal(e?.roomId, "g@chatroom");
  cleanupPendingReplies();
});

test("resolveTargetWxid — 群@按 msgId 还原群 ID (防误发 DM)", () => {
  rememberReply("msg-g", { isGroup: true, roomId: "g@chatroom", senderId: "wxid_user", accountId: "default" });
  const r = resolveTargetWxid("default", "msg-g", "wxid_user");
  assert.equal(r.toWxid, "g@chatroom");
  assert.equal(r.isGroup, true);
  cleanupPendingReplies();
});

test("resolveTargetWxid — 私聊还原 senderId", () => {
  rememberReply("msg-d", { isGroup: false, roomId: "wxid_user", senderId: "wxid_user", accountId: "default" });
  const r = resolveTargetWxid("default", "msg-d", "");
  assert.equal(r.toWxid, "wxid_user");
  assert.equal(r.isGroup, false);
  cleanupPendingReplies();
});

test("resolveTargetWxid — 无 msgId 用 fallback", () => {
  const r = resolveTargetWxid("default", undefined, "wxid_fallback");
  assert.equal(r.toWxid, "wxid_fallback");
});

test("resolveTargetWxid — 群最近@ 兜底 (msgId 无路由)", () => {
  rememberLastGroupMention("default", "g2@chatroom", "msg-x");
  const r = resolveTargetWxid("default", "unknown-msg", "wxid_user");
  assert.equal(r.toWxid, "g2@chatroom");
  assert.equal(r.isGroup, true);
  cleanupPendingReplies();
});

test("resolveTargetWxid — 跨账号隔离 (别的账号记录不影响)", () => {
  rememberReply("msg-a", { isGroup: true, roomId: "gA@chatroom", senderId: "sA", accountId: "acctA" });
  const r = resolveTargetWxid("default", "msg-a", "wxid_fallback");
  assert.equal(r.toWxid, "wxid_fallback", "别的账号记录不该命中");
  cleanupPendingReplies();
});
