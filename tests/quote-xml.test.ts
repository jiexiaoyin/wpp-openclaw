// tests/quote-xml.test.ts - v1.1.30 GEWE-PARITY 引用回复 XML (极简 svrid-only)

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuoteReplyXml } from "../src/send/quote-xml.js";

test("buildQuoteReplyXml — 极简结构 (仿 gewe send/quote.js)", () => {
  const xml = buildQuoteReplyXml("我看到了", {
    svrid: "1851616721499466800",
  });
  // gewe 风格: appmsg + title + type=57 + refermsg (只有 svrid)
  assert.ok(xml.startsWith("<appmsg>"), "appmsg 包壳");
  assert.ok(xml.includes("<title>我看到了</title>"), "title");
  assert.ok(xml.includes("<type>57</type>"), "appmsg type 57");
  assert.ok(xml.includes("<refermsg><svrid>1851616721499466800</svrid></refermsg>"), "极简 refermsg 只含 svrid");
  // 关键: 不能有 content/fromusr/displayname/createtime/chatusr (vendor 客户端不解析这些)
  assert.ok(!xml.includes("<content>"), "不应有 content 字段");
  assert.ok(!xml.includes("<fromusr>"), "不应有 fromusr 字段");
  assert.ok(!xml.includes("<displayname>"), "不应有 displayname 字段");
  assert.ok(!xml.includes("<createtime>"), "不应有 createtime 字段");
  assert.ok(!xml.includes("<chatusr>"), "不应有 chatusr 字段");
});

test("buildQuoteReplyXml — 特殊字符正确 escape (title)", () => {
  const xml = buildQuoteReplyXml("Hello & \"World\" <test>", {
    svrid: "123456",
  });
  assert.ok(xml.includes("Hello &amp; &quot;World&quot; &lt;test&gt;"), "title 转义正确");
});

test("buildQuoteReplyXml — 空 svrid 时 refermsg 空 (gewe 行为)", () => {
  const xml = buildQuoteReplyXml("回复", { svrid: "" });
  assert.ok(xml.includes("<type>57</type>"), "appmsg type 57 还在");
  assert.ok(!xml.includes("<refermsg>"), "空 svrid → 无 refermsg");
});

test("buildQuoteReplyXml — 超长 title 截断 200 字符 (避免 vendor 限制)", () => {
  const long = "x".repeat(300);
  const xml = buildQuoteReplyXml(long, { svrid: "abc" });
  // 截断 200 字符 + 转义后是 200 个 'x' (escape 不影响纯字母)
  const titleMatch = xml.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
  assert.equal(titleMatch.length, 200, "title 截断到 200 字符");
});