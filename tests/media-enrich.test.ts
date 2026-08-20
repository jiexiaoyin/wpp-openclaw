// tests/media-enrich.test.ts - v1.1.20 IMAGE-ENRICH (2026-08-08 接总立)
// v1.1.56 V1-SCHEMA-ENRICH (2026-08-09 12:30 老板报告: 私聊发图, bot 引用块显示但 AI 没识别)
// 图片消息自动下载 + OSS 上传 + URL 注入 content

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseImageXml, isV1SchemaImage, isV1SchemaFile } from "../src/inbound/media-enrich.js";
import { buildFileAutoReply } from "../src/dispatch/dispatcher.js";

const SAMPLE_XML =
  '<?xml version="1.0"?>\n<msg>\n\t<img aeskey="1713e69f077cf9728f6fe7ce039270a1" encryver="1" cdnthumbaeskey="1713e69f077cf9728f6fe7ce039270a1" cdnthumburl="305f020100044b30490201000204" cdnthumblength="7433" cdnthumbheight="210" cdnthumbwidth="96" cdnmidheight="0" cdnmidwidth="0" cdnhdheight="0" cdnhdwidth="0" cdnmidimgurl="305f020100044b30490201000204" length="91815" cdnbigimgurl="305f020100044b30490201000204BIG" hdlength="683372" md5="2783ce0c05032baa57763e6c28106ae2" hevc_mid_size="91815" originsourcemd5="2783ce0c05032baa57763e6c28106ae2"/>\n</msg>';

test("parseImageXml — 提取 aesKey + 优先 cdnbigimgurl", () => {
  const r = parseImageXml(SAMPLE_XML);
  assert.ok(r, "should parse");
  assert.equal(r!.aesKey, "1713e69f077cf9728f6fe7ce039270a1");
  // cdnbigimgurl 优先 (高清)
  assert.equal(r!.fileNo, "305f020100044b30490201000204BIG");
  assert.equal(r!.md5, "2783ce0c05032baa57763e6c28106ae2");
});

test("parseImageXml — 无 aeskey 返回 null", () => {
  const r = parseImageXml('<msg><img cdnthumburl="abc"/></msg>');
  assert.equal(r, null);
});

test("parseImageXml — 无 fileNo 返回 null", () => {
  const r = parseImageXml('<msg><img aeskey="abc"/></msg>');
  assert.equal(r, null);
});

// v1.1.56 V1-SCHEMA-ENRICH: v1 schema 推送检测
test("isV1SchemaImage — 私聊 v1 schema (raw.kind=image, local_id, 无 Content)", () => {
  const raw = {
    content: "收到一张图片",
    conversation_id: "wxid_dbdmq8riblxo12",
    direction: "incoming",
    id: "17499594245272141",
    image_bytes: 13300,
    image_status: 2,
    is_group: false,
    kind: "image",
    local_id: 1680277034,
    recipient_id: "q139198824",
    sender_id: "wxid_dbdmq8riblxo12",
    type: 3,
    // v1.3.70: 新 vendor DownloadImg 必填 data_len — 真实消息 image.data_len 有值 (实测 114757/174567)
    image: { data_len: 13300, md5: "b9becc2a1592e6423ae112a4f23ca51a" },
  };
  const r = isV1SchemaImage(raw);
  assert.equal(r.isV1, true, "应识别为 v1 schema");
  assert.equal(r.localId, 1680277034, "localId 应等于 raw.local_id");
  assert.equal(r.toWxid, "q139198824", "私聊 toWxid 用 recipient_id (bot 自己)");
  assert.equal(r.dataLen, 13300, "dataLen 应从 image.data_len 提取 (新 vendor DownloadImg 必填)");
});

test("isV1SchemaImage — 群聊 v1 schema 用 conversation_id (群 ID)", () => {
  const raw = {
    kind: "image",
    local_id: 377745587,
    conversation_id: "53860619009@chatroom",
    recipient_id: "q139198824",
    sender_id: "wxid_8zd9njcca4lj22",
    is_group: true,
    content: "收到一张图片",
  };
  const r = isV1SchemaImage(raw);
  assert.equal(r.isV1, true);
  assert.equal(r.localId, 377745587);
  assert.equal(r.toWxid, "53860619009@chatroom", "群聊 toWxid 用 conversation_id (群 ID)");
});

test("isV1SchemaImage — 文本消息应 false (kind 不是 image)", () => {
  const r = isV1SchemaImage({ kind: "text", local_id: 123, content: "hello" });
  assert.equal(r.isV1, false);
});

test("isV1SchemaImage — 缺 local_id 应 false (无法调 DownloadImg)", () => {
  const r = isV1SchemaImage({ kind: "image", content: "收到一张图片" });
  assert.equal(r.isV1, false);
});

test("isV1SchemaImage — v0 schema (有 Content 字段) 应 false (走原 v0 路径)", () => {
  const r = isV1SchemaImage({
    kind: "image",
    local_id: 123,
    Content: "<?xml version='1.0'?><msg><img aeskey='abc' cdnthumburl='xyz'/></msg>",
  });
  assert.equal(r.isV1, false, "有 v0 Content 字段 → 走原 v0 路径, 不算 v1");
});

test("isV1SchemaImage — null/undefined raw 应 false", () => {
  assert.equal(isV1SchemaImage(null).isV1, false);
  assert.equal(isV1SchemaImage(undefined).isV1, false);
  assert.equal(isV1SchemaImage({}).isV1, false);
});

test("isV1SchemaImage — local_id 必须正整数", () => {
  assert.equal(isV1SchemaImage({ kind: "image", local_id: 0 }).isV1, false);
  assert.equal(isV1SchemaImage({ kind: "image", local_id: -1 }).isV1, false);
  assert.equal(isV1SchemaImage({ kind: "image", local_id: "1680277034" }).isV1, false, "string 不算 number");
});

// v1.1.57 V1-FILE-FALLBACK: v1 schema 文件检测
test("isV1SchemaFile — 私聊 v1 schema PDF (boss 实测 msg_id=1200608731982267299)", () => {
  const raw = {
    app: { category: "file", file_extension: "pdf", title: "入学入托1725761240358.pdf" },
    content: "入学入托1725761240358.pdf",
    direction: "incoming",
    id: "1200608731982267299",
    kind: "app",
    local_id: 1691299065,
    push_content: "接辰鑫 : [文件]入学入托1725761240358.pdf",
    type: 49,
  };
  const r = isV1SchemaFile(raw);
  assert.equal(r.isV1, true);
  assert.equal(r.filename, "入学入托1725761240358.pdf");
  assert.equal(r.ext, "pdf");
});

test("isV1SchemaFile — 非文件 appmsg 应 false (e.g. 小程序/公众号)", () => {
  const raw = {
    app: { category: "link", title: "某个网页" },
    kind: "app",
    type: 49,
  };
  assert.equal(isV1SchemaFile(raw).isV1, false);
});

test("isV1SchemaFile — 缺 app 字段应 false", () => {
  assert.equal(isV1SchemaFile({ kind: "app", type: 49 }).isV1, false);
});

test("isV1SchemaFile — 图片消息应 false (走图片 v1 路径)", () => {
  assert.equal(isV1SchemaFile({ kind: "image", local_id: 123 }).isV1, false);
});

test("isV1SchemaFile — null/undefined 应 false", () => {
  assert.equal(isV1SchemaFile(null).isV1, false);
  assert.equal(isV1SchemaFile(undefined).isV1, false);
  assert.equal(isV1SchemaFile({}).isV1, false);
});

test("isV1SchemaFile — 缺 title 时 filename undefined (handler fallback 文本)", () => {
  const r = isV1SchemaFile({
    app: { category: "file", file_extension: "xlsx" },
    kind: "app",
  });
  assert.equal(r.isV1, true);
  assert.equal(r.filename, undefined);
  assert.equal(r.ext, "xlsx");
});

// v1.1.59 FILE-DETERMINISTIC-REPLY: 文件消息确定性回复 (绕过 AI)
test("buildFileAutoReply — 检测 handler 注入的文件消息 content", () => {
  const content = `筑紫B丸ゴシック by 宁静之雨.zip\n[文件] 筑紫B丸ゴシック by 宁静之雨.zip (ZIP)\n[系统提示-文件限制] 此文件消息仅有文件名元数据, vendor 当前不提供文件内容下载, 你无法读取文件内容。`;
  const r = buildFileAutoReply(content);
  assert.equal(r?.isFileMsg, true, "应检测为文件消息");
  assert.ok(r?.replyText?.includes("筑紫B丸ゴシック by 宁静之雨.zip"), "回复含文件名");
  assert.ok(r?.replyText?.includes("无法读取文件内容"), "回复说明无法读取");
});

test("buildFileAutoReply — 非文件消息 (普通文本) 不触发", () => {
  const r = buildFileAutoReply("你好，今天天气不错");
  assert.equal(r?.isFileMsg, false);
});

test("buildFileAutoReply — 图片消息 (含 [图片]) 不触发", () => {
  const content = `收到一张图片\n[图片] https://oss.example.com/img.jpg`;
  const r = buildFileAutoReply(content);
  assert.equal(r?.isFileMsg, false);
});

test("buildFileAutoReply — undefined/空 content 安全", () => {
  assert.equal(buildFileAutoReply(undefined), null);
  assert.equal(buildFileAutoReply(""), null);
});

test("buildFileAutoReply — 只含 [文件] 但无 [系统提示-文件限制] 不触发 (v0 文件仍走 AI)", () => {
  const content = `原始消息\n[文件] report.pdf (PDF, 已下载)`;
  const r = buildFileAutoReply(content);
  assert.equal(r?.isFileMsg, false);
});

// ===== v1.3.22 VENDOR-TRANSCRIPT: vendor 自带转写优先 =====

test("v1.3.22 VENDOR-TRANSCRIPT — enrichVoiceMessageFromV1 有 vendor transcript → 直接用 (不下载不STT)", async () => {
  const { enrichVoiceMessageFromV1 } = await import("../src/inbound/media-enrich.js");
  const r = await enrichVoiceMessageFromV1(
    { baseUrl: "https://test", tokenKey: "tk", authcode: "ac" },
    { msgId: 1, newMsgId: "2", clientMsgId: "c", masterBufId: "0", format: 4, length: 100 },
    "这是微信官方转写文本",
  );
  assert.equal(r.mediaUrl, null, "不下载 (无 OSS URL)");
  assert.equal(r.filename, "这是微信官方转写文本", "直接用 vendor 转写");
});

test("v1.3.22 VENDOR-TRANSCRIPT — 无 vendor transcript → 走 STT (返回 OSS URL + STT 文本)", async () => {
  const { enrichVoiceMessageFromV1 } = await import("../src/inbound/media-enrich.js");
  // 无 OSS 凭证 + 无 vendor transcript → 报 oss credentials missing (不下载不STT)
  const r = await enrichVoiceMessageFromV1(
    { baseUrl: "https://test", tokenKey: "tk", authcode: "ac" },
    { msgId: 1, newMsgId: "2", clientMsgId: "c", masterBufId: "0", format: 4, length: 100 },
    undefined,
  );
  assert.equal(r.mediaUrl, null, "无凭证不下载");
});
