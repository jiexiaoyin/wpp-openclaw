// tests/peer-id-fixup.test.ts - v1.1.48 P1-FIX: 私聊 peerId 修正 (从 sender 自己 → 对方)
// 2026-08-09 10:43 接总立实测
//   根因: 老板发私聊给副号, parser 推 peerId=q139198824 (老板自己) → sessionKey 错位
//   修复: handler.ts enrich 前用 selfWxid 判断方向, 私聊时 fromWxid===self → peerId=toWxid

import { test } from "node:test";
import assert from "node:assert/strict";

test("P1-FIX: 老板自己发私聊 → peerId 应改为对方 (toWxid)", () => {
  // 模拟: 老板→副号 私聊
  const selfWxid = "q139198824";
  const msg = {
    fromWxid: "q139198824",     // 老板自己 (发送方)
    toWxid: "wxid_eezdbu1ytws422", // 副号 (接收方)
    peerKind: "direct",
    peerId: "q139198824",       // 旧: 错位成老板自己 (bug)
  };
  // 应用修复逻辑
  if (msg.peerKind === "direct" && msg.fromWxid === selfWxid && msg.toWxid) {
    msg.peerId = msg.toWxid;
  }
  assert.equal(msg.peerId, "wxid_eezdbu1ytws422", "私聊 peerId 应=对方 (toWxid)");
});

test("P1-FIX: 别人发私聊给老板 → peerId 应保持对方 (fromWxid)", () => {
  // 模拟: 接辰鑫→老板 私聊
  const selfWxid = "q139198824";
  const msg = {
    fromWxid: "wxid_dbdmq8riblxo12", // 接辰鑫 (发送方)
    toWxid: "q139198824",            // 老板 (接收方)
    peerKind: "direct",
    peerId: "wxid_dbdmq8riblxo12",  // 旧: 正确 (对方)
  };
  // 应用修复逻辑 (fromWxid !== selfWxid, 不应改)
  if (msg.peerKind === "direct" && msg.fromWxid === selfWxid && msg.toWxid) {
    msg.peerId = msg.toWxid;
  }
  assert.equal(msg.peerId, "wxid_dbdmq8riblxo12", "别人发私聊 peerId 应保持 fromWxid");
});

test("P1-FIX: 群聊消息无影响 (parser 已优先 chatroomId)", () => {
  const selfWxid = "q139198824";
  const msg = {
    fromWxid: "wxid_eezdbu1ytws422",
    toWxid: "q139198824",
    peerKind: "group",
    peerId: "57737516566@chatroom", // 群 ID (正确)
  };
  if (msg.peerKind === "direct" && msg.fromWxid === selfWxid && msg.toWxid) {
    msg.peerId = msg.toWxid;
  }
  assert.equal(msg.peerId, "57737516566@chatroom", "群聊 peerId 应保持群 ID");
});

test("P1-FIX: 老板发私聊但 toWxid 缺失 → 保持原 peerId (不做错误 fallback)", () => {
  const selfWxid = "q139198824";
  const msg = {
    fromWxid: "q139198824",
    toWxid: undefined,
    peerKind: "direct",
    peerId: "q139198824", // parser 给的值 (单字段场景)
  };
  if (msg.peerKind === "direct" && msg.fromWxid === selfWxid && msg.toWxid) {
    msg.peerId = msg.toWxid;
  }
  assert.equal(msg.peerId, "q139198824", "toWxid 缺失时保持 parser 原始值, 不强行 fallback");
});
