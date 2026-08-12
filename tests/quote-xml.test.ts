// tests/quote-xml.test.ts - v1.1.55 QUOTE-TITLE-FIX 引用回复 XML (gewe 范式)
// 2026-08-09 12:10 修复: <title> 改回 AI 回复文字 (客户端 type=57 主气泡渲染)
//                refermsg 简化为 svrid + fromusr (gewe 仅 svrid, WPP 加 fromusr 兼容老客户端)

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuoteReplyXml } from "../src/send/quote-xml.js";

test("buildQuoteReplyXml — v1.1.55 gewe 范式 (title=AI, 极简 refermsg)", () => {
  const xml = buildQuoteReplyXml("AI 真实回复: 收到", {
    svrid: "1851616721499466800",
    fromusr: "wxid_user1",
  });
  // v1.1.55: appmsg + title=AI 回复 (主气泡) + des=AI 回复 (fallback) + type=57 + 极简 refermsg
  assert.ok(xml.startsWith("<appmsg>"), "appmsg 包壳");
  assert.ok(xml.includes("<title>AI 真实回复: 收到</title>"), "title = AI 回复文字 (客户端主气泡)");
  assert.ok(xml.includes("<des>AI 真实回复: 收到</des>"), "des = AI 回复文字 (type=5/老客户端 fallback)");
  assert.ok(xml.includes("<type>57</type>"), "appmsg type 57 (vendor WPP 引用回复标准)");
  assert.ok(xml.includes("<svrid>1851616721499466800</svrid>"), "refermsg.svrid");
  assert.ok(xml.includes("<fromusr>wxid_user1</fromusr>"), "refermsg.fromusr (老微信客户端回查昵称)");
  // v1.1.55 移除: 不应再包含 type/chatusr/displayname/content/createtime 字段
  assert.ok(!xml.includes("<displayname>"), "v1.1.55 移除 refermsg.displayname");
  assert.ok(!xml.includes("<content>"), "v1.1.55 移除 refermsg.content");
  assert.ok(!xml.includes("<createtime>"), "v1.1.55 移除 refermsg.createtime");
  assert.ok(!xml.includes("<chatusr>"), "v1.1.55 移除 refermsg.chatusr");
});

test("buildQuoteReplyXml — innerType=49 fallback (vendor WPP 内部 type)", () => {
  const xml = buildQuoteReplyXml(
    "回复",
    { svrid: "123", fromusr: "u1" },
    { innerType: 49 },
  );
  assert.ok(xml.includes("<type>49</type>"), "appmsg type 49 (vendor WPP 内部引用回复)");
});

test("buildQuoteReplyXml — 字段缺失时 (无 fromusr) 仍生成 refermsg", () => {
  const xml = buildQuoteReplyXml("回复", { svrid: "123" });
  assert.ok(xml.includes("<title>回复</title>"), "title = AI 回复文字");
  assert.ok(xml.includes("<des>回复</des>"), "des = AI 回复文字");
  assert.ok(xml.includes("<refermsg>"), "refermsg 仍生成 (gewe 行为)");
  assert.ok(xml.includes("<svrid>123</svrid>"), "refermsg.svrid 仍在");
  assert.ok(!xml.includes("<fromusr>"), "无 fromusr → 不输出该字段");
});

test("buildQuoteReplyXml — 特殊字符正确 escape (title + des)", () => {
  const xml = buildQuoteReplyXml("Hello & \"World\" <test>", {
    svrid: "123456",
    fromusr: "wxid_boss",
  });
  assert.ok(xml.includes("Hello &amp; &quot;World&quot; &lt;test&gt;"), "title/des 转义正确");
});

test("buildQuoteReplyXml — 空 svrid 时 refermsg 空 (gewe 行为)", () => {
  const xml = buildQuoteReplyXml("回复", { svrid: "" });
  assert.ok(xml.includes("<type>57</type>"), "appmsg type 57 还在");
  assert.ok(!xml.includes("<refermsg>"), "空 svrid → 无 refermsg");
});

test("buildQuoteReplyXml — 超长 AI 回复截断 500 字符 (避免 vendor 限制)", () => {
  const long = "x".repeat(800);
  const xml = buildQuoteReplyXml(long, { svrid: "abc" });
  const titleMatch = xml.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
  const desMatch = xml.match(/<des>([^<]*)<\/des>/)?.[1] ?? "";
  assert.equal(titleMatch.length, 500, "title 截断到 500 字符");
  assert.equal(desMatch.length, 500, "des 截断到 500 字符");
});

test("buildQuoteReplyXml — 空 replyContent 时回退 '引用回复'", () => {
  const xml = buildQuoteReplyXml("", { svrid: "abc" });
  assert.ok(xml.includes("<title>引用回复</title>"), "空 replyContent → title 回退 '引用回复'");
  assert.ok(xml.includes("<des>引用回复</des>"), "空 replyContent → des 回退 '引用回复'");
});
test("v1.1.34 QUOTE-WXID-FIX — stripGroupContentPrefix 清洗 wxid 前缀", async () => {
  const { stripGroupContentPrefix } = await import("../src/send/quote-reply.js");
  // 群消息 vendor 格式: "wxid_xxx:\n正文"
  assert.equal(
    stripGroupContentPrefix("wxid_eezdbu1ytws422:\n@接晓银 你好"),
    "@接晓银 你好",
    "应剥离 wxid 前缀",
  );
  // 无前缀正常文本不受影响
  assert.equal(stripGroupContentPrefix("普通文本"), "普通文本");
  // 空/undefined 安全
  assert.equal(stripGroupContentPrefix(undefined), undefined);
  assert.equal(stripGroupContentPrefix(""), "");
  // 多行内容只剥首行前缀
  assert.equal(
    stripGroupContentPrefix("wxid_aaa:\n第一行\n第二行"),
    "第一行\n第二行",
  );
});

test("v1.1.35 QUOTE-WXID-FIX-2 — extractGroupSenderWxid 从 content 前缀提取发送者", async () => {
  const { extractGroupSenderWxid } = await import("../src/send/quote-reply.js");
  // business callback 真实格式: "wxid_xxx:\n正文"
  assert.equal(
    extractGroupSenderWxid("wxid_eezdbu1ytws422:\n@接晓银 你好"),
    "wxid_eezdbu1ytws422",
    "应提取 wxid 前缀",
  );
  // 无前缀正常文本 → undefined
  assert.equal(extractGroupSenderWxid("普通文本"), undefined);
  // 空/undefined 安全
  assert.equal(extractGroupSenderWxid(undefined), undefined);
  assert.equal(extractGroupSenderWxid(""), undefined);
  // 非 wxid 前缀 (昵称开头) → undefined (不误判)
  assert.equal(extractGroupSenderWxid("小明:\n你好"), undefined);
});

// ===== v1.3.5 QUOTE-REPLY-CONTEXT: 新版 vendor 引用走 reply_context =====
import { extractReferencedFromReplyContext } from "../src/inbound/parser/quote.js";

test("v1.3.5 — extractReferencedFromReplyContext 解析新版引用", () => {
  const raw = {
    reply_context: {
      chat_user_id: "57737516566@chatroom",
      conversation_id: "57737516566@chatroom",
      from_user_id: "wxid_eezdbu1ytws422",
      msg_id: 676150378,
      msg_type: 49,
      new_msg_id: "5949556859716261171",
      quote_content: "这个图了@接晓银",
      svr_id: "5949556859716261171",
      to_wxid: "57737516566@chatroom",
    },
  };
  const rc = extractReferencedFromReplyContext(raw);
  assert.ok(rc, "应解析 reply_context");
  assert.equal(rc!.msgId, 676150378);
  assert.equal(rc!.svrId, "5949556859716261171");
  assert.equal(rc!.quoteContent, "这个图了@接晓银");
  assert.equal(rc!.msgType, 49);
  assert.equal(rc!.chatroomId, "57737516566@chatroom");
});

test("v1.3.5 — extractReferencedFromReplyContext 无 reply_context → null", () => {
  assert.equal(extractReferencedFromReplyContext(null), null);
  assert.equal(extractReferencedFromReplyContext({}), null);
  assert.equal(extractReferencedFromReplyContext({ content: "hi" }), null);
});

// ===== v1.3.6 QUOTE-APP-REFERENCE: 被引用信息在 app.reference (category=quote) =====
import { extractReferencedFromApp } from "../src/inbound/parser/quote.js";

test("v1.3.6 — extractReferencedFromApp 解析 app.reference (引用图)", () => {
  const raw = {
    app: {
      category: "quote",
      reference: {
        chat_user_id: "wxid_eezdbu1ytws422",
        display_name: "益融小助理",
        from_user_id: "57737516566@chatroom",
        msg_type: 3,
        new_msg_id: "5739862881048543172",
        svr_id: "5739862881048543172",
      },
      title: "测试这个图片",
    },
  };
  const ref = extractReferencedFromApp(raw);
  assert.ok(ref, "应解析 app.reference");
  assert.equal(ref!.newMsgId, "5739862881048543172");
  assert.equal(ref!.svrId, "5739862881048543172");
  assert.equal(ref!.msgType, 3);
  assert.equal(ref!.displayName, "益融小助理");
});

test("v1.3.6 — extractReferencedFromApp 非 quote → null", () => {
  assert.equal(extractReferencedFromApp({ app: { category: "file" } }), null);
  assert.equal(extractReferencedFromApp({}), null);
  assert.equal(extractReferencedFromApp(null), null);
});

// ===== v1.3.33 GROUP-MENTION-REPLY: 群聊引用回复 @ 被回复人 =====
import { buildGroupMentionPrefix } from "../src/send/quote-reply.js";

test("v1.3.33 — 群聊回复加 @昵称 前缀", () => {
  assert.equal(
    buildGroupMentionPrefix("57737516566@chatroom", "你好！", "周州", "wxid_zhou"),
    "@周州 你好！",
  );
});

test("v1.3.33 — 私聊不加 @ (非 @chatroom)", () => {
  assert.equal(buildGroupMentionPrefix("wxid_abc", "你好", "某人", "wxid_abc"), "你好");
});

test("v1.3.33 — 群聊但 displayName 缺失 → 用 fromusr 兜底", () => {
  assert.equal(
    buildGroupMentionPrefix("57737516566@chatroom", "回复", undefined, "wxid_zhou"),
    "@wxid_zhou 回复",
  );
});

test("v1.3.33 — 群聊 displayName 与 fromusr 相同 → 用 displayName", () => {
  assert.equal(
    buildGroupMentionPrefix("g@chatroom", "内容", "周州", "周州"),
    "@周州 内容",
  );
});

test("v1.3.33 — 无昵称无 wxid → 原样", () => {
  assert.equal(buildGroupMentionPrefix("g@chatroom", "内容", undefined, undefined), "内容");
});
