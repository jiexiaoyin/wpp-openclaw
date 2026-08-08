import { test } from "node:test";
import assert from "node:assert";
import { shouldTrigger } from "../src/inbound/triggers.js";
import { defaultTriggerConfig } from "../src/inbound/triggers.js";
import type { WppInboundMessage } from "../src/types.js";

// v1.1.18 NICKNAME-MENTION: 群消息 @中文昵称 应触发
test("v1.1.18 — 群消息 @中文昵称 (e.g. @接晓银) 触发", () => {
  const msg = {
    accountId: "default",
    peerKind: "group",
    peerId: "57737516566@chatroom",
    chatroomId: "57737516566@chatroom",
    fromWxid: "wxid_eezdbu1ytws422",
    content: "wxid_eezdbu1ytws422:\n@接晓银 你好",
    msgType: "1",
    ts: Date.now(),
  } as unknown as WppInboundMessage;
  const cfg = { ...defaultTriggerConfig(), requireAtMention: true, groupPolicy: "allowlist", groupAllowFrom: ["57737516566@chatroom"] };
  const r = shouldTrigger(msg, cfg, { botWxid: "q139198824", botNickname: "接晓银", allowFrom: ["wxid_dbdmq8riblxo12"] });
  assert.strictEqual(r.triggered, true);
  assert.strictEqual(r.via, "at");
});

// 对照组: 无 @ 不触发 (requireAtMention=true)
test("v1.1.18 — 群消息无 @ 不触发 (requireAtMention=true)", () => {
  const msg = {
    accountId: "default",
    peerKind: "group",
    peerId: "57737516566@chatroom",
    chatroomId: "57737516566@chatroom",
    fromWxid: "wxid_eezdbu1ytws422",
    content: "wxid_eezdbu1ytws422:\n你好",
    msgType: "1",
    ts: Date.now(),
  } as unknown as WppInboundMessage;
  const cfg = { ...defaultTriggerConfig(), requireAtMention: true, groupPolicy: "allowlist", groupAllowFrom: ["57737516566@chatroom"] };
  const r = shouldTrigger(msg, cfg, { botWxid: "q139198824", botNickname: "接晓银", allowFrom: ["wxid_dbdmq8riblxo12"] });
  assert.strictEqual(r.triggered, false);
});
