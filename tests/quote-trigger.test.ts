// tests/quote-trigger.test.ts - v1.1.21 QUOTE-FIX
// 1. isQuoteRefToBot 修复: <fromusr> 真实结构 (之前只匹配 fromusername → 引用触发失效)
// 2. parseQuoteXml 提取 content/fromusr
// 3. buildQuoteContext 引用消息注入

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuoteXml } from "../src/inbound/parser/quote.js";
import { buildQuoteContext } from "../src/dispatch/reply-helpers.js";
import { shouldTrigger } from "../src/inbound/triggers.js";
import { defaultTriggerConfig } from "../src/inbound/triggers.js";
import type { WppInboundMessage } from "../src/types.js";

// 老板 19:14 真实引用消息结构 (refermsg 用 <fromusr>)
const QUOTE_XML = `<?xml version="1.0"?>
<msg>
  <appmsg appid="" sdkver="0">
    <title>你好</title>
    <type>57</type>
    <refermsg>
      <type>49</type>
      <svrid>513471006431325567</svrid>
      <fromusr>q139198824</fromusr>
      <chatusr>q139198824</chatusr>
      <displayname>接晓银</displayname>
      <content>这是完整refermsg引用测试：我看到你的昵称了</content>
      <createtime>1786187259</createtime>
    </refermsg>
  </appmsg>
</msg>`;

function makeMsg(content: string): WppInboundMessage {
  return {
    accountId: "default",
    msgId: "19581",
    newMsgId: "6870797688381657000",
    fromWxid: "wxid_dbdmq8riblxo12",
    msgType: 49,
    content,
    ts: 1786187300,
    raw: {},
    peerKind: "direct",
    peerId: "wxid_dbdmq8riblxo12",
    trigger: "at",
  };
}

test("parseQuoteXml — 提取 fromusr (真实结构) + content", () => {
  const r = parseQuoteXml(QUOTE_XML);
  assert.ok(r);
  assert.equal(r!.msgId, "513471006431325567");
  assert.equal(r!.fromWxid, "q139198824"); // fromusr 而非 fromusername
  assert.equal(r!.content, "这是完整refermsg引用测试：我看到你的昵称了");
});

test("isQuoteRefToBot — 群聊引用 bot wxid → quoteBot 触发 (修复 fromusr)", () => {
  const cfg = { ...defaultTriggerConfig(), quoteBotTrigger: { enabled: true }, groupPolicy: "open" };
  // 群聊引用 bot (q139198824): 群消息 fromusr=q139198824 是 bot → quoteBot
  const msg = makeMsg(QUOTE_XML);
  msg.peerKind = "group";
  msg.peerId = "57737516566@chatroom";
  msg.chatroomId = "57737516566@chatroom";
  const r = shouldTrigger(msg, cfg, { botWxid: "q139198824", botNickname: "接晓银", allowFrom: [] });
  assert.equal(r.triggered, true);
  assert.equal(r.via, "quoteBot");
});

test("buildQuoteContext — 引用消息注入结构化上下文", () => {
  const ctx = buildQuoteContext(makeMsg(QUOTE_XML));
  assert.ok(ctx, "引用消息应返回上下文");
  assert.ok(ctx!.includes("<quoted-msgid>513471006431325567</quoted-msgid>"));
  assert.ok(ctx!.includes("<quoted-fromusr>q139198824</quoted-fromusr>"));
  assert.ok(ctx!.includes("这是完整refermsg引用测试"), "被引用原文注入");
});

test("buildQuoteContext — 非引用消息返回 null", () => {
  const ctx = buildQuoteContext(makeMsg("普通消息"));
  assert.equal(ctx, null);
});
