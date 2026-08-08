// tests/v1.1.7-special-msg.test.ts - 特殊消息类型 (hongbao + mini-program)
// 测 src/inbound/hongbao.ts 检测 + src/send/msg.ts buildAppMsgXml

import { test } from "node:test";
import assert from "node:assert/strict";

import { isRedPacketMessage, extractRedPacketInfo, processRedPacket } from "../src/inbound/hongbao.js";
import { buildAppMsgXml } from "../src/send/msg.js";
import type { WppInboundMessage } from "../src/types.js";

// ===== hongbao 检测 =====

test("v1.1.7 — isRedPacketMessage: content 含 '红包' 关键字", () => {
  const msg: WppInboundMessage = {
    accountId: "default", msgId: "m", newMsgId: "n", fromWxid: "x",
    chatroomId: undefined, toWxid: undefined, msgType: 1,
    content: "新红包 来了", ts: 0, raw: {},
    peerKind: "direct", peerId: "x", trigger: "direct",
  };
  assert.equal(isRedPacketMessage(msg), true);
});

test("v1.1.7 — isRedPacketMessage: raw.appMsg.type=2002 (微信原生红包)", () => {
  const msg: WppInboundMessage = {
    accountId: "default", msgId: "m", newMsgId: "n", fromWxid: "x",
    chatroomId: undefined, toWxid: undefined, msgType: 1,
    content: "hello", ts: 0, raw: { appMsg: { type: 2002 } },
    peerKind: "direct", peerId: "x", trigger: "direct",
  };
  assert.equal(isRedPacketMessage(msg), true);
});

test("v1.1.7 — isRedPacketMessage: 普通消息返 false", () => {
  const msg: WppInboundMessage = {
    accountId: "default", msgId: "m", newMsgId: "n", fromWxid: "x",
    chatroomId: undefined, toWxid: undefined, msgType: 1,
    content: "普通文本", ts: 0, raw: {},
    peerKind: "direct", peerId: "x", trigger: "direct",
  };
  assert.equal(isRedPacketMessage(msg), false);
});

test("v1.1.7 — isRedPacketMessage: redpacket 关键字 (英文)", () => {
  const msg: WppInboundMessage = {
    accountId: "default", msgId: "m", newMsgId: "n", fromWxid: "x",
    chatroomId: undefined, toWxid: undefined, msgType: 1,
    content: "redpacket for you", ts: 0, raw: {},
    peerKind: "direct", peerId: "x", trigger: "direct",
  };
  assert.equal(isRedPacketMessage(msg), true);
});

// ===== 红包信息提取 =====

test("v1.1.7 — extractRedPacketInfo: raw.hongbao.url+key", () => {
  const msg: WppInboundMessage = {
    accountId: "default", msgId: "m", newMsgId: "n", fromWxid: "x",
    chatroomId: undefined, toWxid: undefined, msgType: 1,
    content: "红包", ts: 0,
    raw: { hongbao: { url: "https://wx.qq.com/hb/123", key: "abc" } },
    peerKind: "direct", peerId: "x", trigger: "direct",
  };
  const info = extractRedPacketInfo(msg);
  assert.equal(info.url, "https://wx.qq.com/hb/123");
  assert.equal(info.key, "abc");
  assert.equal(info.shouldOpen, false, "默认不自动拆");
});

test("v1.1.7 — extractRedPacketInfo: 缺 url/key 返空", () => {
  const msg: WppInboundMessage = {
    accountId: "default", msgId: "m", newMsgId: "n", fromWxid: "x",
    chatroomId: undefined, toWxid: undefined, msgType: 1,
    content: "红包", ts: 0, raw: {},
    peerKind: "direct", peerId: "x", trigger: "direct",
  };
  const info = extractRedPacketInfo(msg);
  assert.equal(info.url, undefined);
  assert.equal(info.key, undefined);
});

test("v1.1.7 — processRedPacket: 非红包返空 (no-op)", () => {
  const msg: WppInboundMessage = {
    accountId: "default", msgId: "m", newMsgId: "n", fromWxid: "x",
    chatroomId: undefined, toWxid: undefined, msgType: 1,
    content: "普通文本", ts: 0, raw: {},
    peerKind: "direct", peerId: "x", trigger: "direct",
  };
  const result = processRedPacket(msg);
  assert.equal(result.shouldOpen, false);
  assert.equal(result.url, undefined);
});

test("v1.1.7 — processRedPacket: 红包返 url+key, 不拆 (默认安全)", () => {
  const msg: WppInboundMessage = {
    accountId: "default", msgId: "m", newMsgId: "n", fromWxid: "x",
    chatroomId: undefined, toWxid: undefined, msgType: 1,
    content: "红包来了", ts: 0,
    raw: { hongbao: { url: "https://x.com/h", key: "k" } },
    peerKind: "direct", peerId: "x", trigger: "direct",
  };
  const result = processRedPacket(msg);
  assert.equal(result.url, "https://x.com/h");
  assert.equal(result.key, "k");
  assert.equal(result.shouldOpen, false, "默认 shouldOpen=false (业务决策, 不自动拆)");
});

test("v1.1.7 — processRedPacket: onExtract 回调可注入 (未来 AI 决策入口)", () => {
  const msg: WppInboundMessage = {
    accountId: "default", msgId: "m", newMsgId: "n", fromWxid: "x",
    chatroomId: undefined, toWxid: undefined, msgType: 1,
    content: "红包", ts: 0,
    raw: { hongbao: { url: "https://x.com/h", key: "k" } },
    peerKind: "direct", peerId: "x", trigger: "direct",
  };
  let capturedUrl: string | undefined;
  processRedPacket(msg, (result) => {
    capturedUrl = result.url;
  });
  assert.equal(capturedUrl, "https://x.com/h", "onExtract 收到 url");
});

// ===== 小程序 XML builder =====

test("v1.1.7 — buildAppMsgXml: 含 type=2001 (mini-program)", () => {
  const xml = buildAppMsgXml(
    "gh_abc123",
    "我的小程序",
    "这是描述",
    { appid: "wxabc", app_name: "我的小程序" },
  );
  assert.match(xml, /<appmsg/);
  assert.match(xml, /<type>2001<\/type>/, "type 2001 = 小程序");
  assert.match(xml, /<mmapp>/);
  assert.match(xml, /<fromusername>gh_abc123<\/fromusername>/);
  assert.match(xml, /<appid>wxabc<\/appid>/);
});

test("v1.1.7 — buildAppMsgXml: XML escape (特殊字符)", () => {
  const xml = buildAppMsgXml(
    "user<>&\"'",
    "<title>&",
    "desc'\"",
    { key: "<value>&" },
  );
  // 内容里的特殊字符应被转义 (注意: 标签本身 <title> 是 raw, 内容里 <title>& 才转义)
  assert.ok(xml.includes("&lt;title&gt;&amp;"), "<title>& in title 应 escape");
  assert.ok(xml.includes("&lt;value&gt;&amp;"), "<value>& in mmapp key 应 escape");
  // 至少有一个 escape 形式
  assert.match(xml, /&(amp|lt|gt|quot|apos);/);
  // username 全 escape
  assert.ok(xml.includes("user&lt;&gt;&amp;&quot;&apos;"), "username 5 字符全 escape");
});

test("v1.1.7 — buildAppMsgXml: 多个 mmapp 字段正确输出", () => {
  const xml = buildAppMsgXml(
    "gh_test",
    "title",
    "desc",
    {
      appid: "wxid",
      pkg_name: "com.test",
      app_version: "release",
      miniprogram_state: "formal",
    },
  );
  assert.match(xml, /<appid>wxid<\/appid>/);
  assert.match(xml, /<pkg_name>com\.test<\/pkg_name>/);
  assert.match(xml, /<app_version>release<\/app_version>/);
  assert.match(xml, /<miniprogram_state>formal<\/miniprogram_state>/);
});
