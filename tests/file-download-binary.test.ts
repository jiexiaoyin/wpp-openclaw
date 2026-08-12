// tests/file-download-binary.test.ts - v1.2.5 FILE-DOWNLOAD-BINARY
// 新版 vendor DownloadFileBinary 完整下载 v1 schema 文件
// 覆盖: isV1SchemaFile 提取 download_context / enrichFileMessageFromV1Binary 下载+OSS

import { test } from "node:test";
import assert from "node:assert/strict";

import { isV1SchemaFile, enrichFileMessageFromV1Binary } from "../src/inbound/media-enrich.js";
import type { WppAccountCtx } from "../src/send/factory.js";

// ===== isV1SchemaFile 提取 download_context =====

test("v1.2.5 — isV1SchemaFile 提取新版 download_context", () => {
  const raw = {
    kind: "app",
    app: { category: "file", title: "报告.pdf", file_extension: "pdf" },
    file: {
      download_context: {
        attach_id: "@cdn_xxx",
        user_name: "wxid_dbdmq8riblxo12",
        data_len: 129583,
        endpoint: "/api/Tools/DownloadFileBinary",
        section: { start_pos: 0, data_len: 129583 },
      },
    },
  };
  const r = isV1SchemaFile(raw);
  assert.equal(r.isV1, true);
  assert.equal(r.filename, "报告.pdf");
  assert.equal(r.ext, "pdf");
  assert.ok(r.downloadCtx, "应提取 download_context");
  assert.equal(r.downloadCtx!.attachId, "@cdn_xxx");
  assert.equal(r.downloadCtx!.userName, "wxid_dbdmq8riblxo12");
  assert.equal(r.downloadCtx!.dataLen, 129583);
});

test("v1.2.5 — isV1SchemaFile 无 download_context (旧版推送) 不报错", () => {
  const raw = {
    kind: "app",
    app: { category: "file", title: "旧文件.pdf", file_extension: "pdf" },
  };
  const r = isV1SchemaFile(raw);
  assert.equal(r.isV1, true);
  assert.equal(r.filename, "旧文件.pdf");
  assert.equal(r.downloadCtx, undefined, "旧推送无 download_context");
});

test("v1.2.5 — isV1SchemaFile 非文件消息返回 false", () => {
  assert.equal(isV1SchemaFile({ kind: "text" }).isV1, false);
  assert.equal(isV1SchemaFile(null).isV1, false);
});

// ===== enrichFileMessageFromV1Binary =====

test("v1.2.5 — enrichFileMessageFromV1Binary 缺 attach_id 返回错误", async () => {
  const ctx: WppAccountCtx = { baseUrl: "http://test", tokenKey: "tk", authcode: "ac", accountId: "default" };
  const r = await enrichFileMessageFromV1Binary(
    ctx,
    { attachId: "", userName: "u", dataLen: 100 },
    "a.pdf",
    "pdf",
  );
  assert.equal(r.mediaUrl, null);
  assert.ok(r.error, "缺 attach_id 应报错");
});

// ===== v1.2.5 IMAGE-CDN: isV1SchemaImage 提取 cdn_download_contexts =====
import { isV1SchemaImage } from "../src/inbound/media-enrich.js";

test("v1.2.5 IMAGE-CDN — isV1SchemaImage 提取 standard 变体 cdn_download_contexts", () => {
  const raw = {
    kind: "image",
    local_id: 1357416805,
    conversation_id: "57737516566@chatroom",
    recipient_id: "q139198824",
    image: {
      aes_key: "f4458f103581036190d1fb0c077df0b0",
      cdn_download_contexts: [
        { endpoint: "/api/Tools/CdnDownloadImage", file_aes_key: "f4458f103581036190d1fb0c077df0b0", file_no: "cdn_standard_xxx", variant: "standard" },
        { endpoint: "/api/Tools/CdnDownloadImage", file_aes_key: "f4458f103581036190d1fb0c077df0b0", file_no: "cdn_thumb_xxx", variant: "thumbnail" },
      ],
      md5: "739234c72fa65e1a6997a6bd7f09ccc0",
    },
  };
  const r = isV1SchemaImage(raw);
  assert.equal(r.isV1, true);
  assert.equal(r.localId, 1357416805);
  assert.equal(r.toWxid, "57737516566@chatroom");
  assert.ok(r.cdnDownloadCtx, "应提取 cdn_download_contexts");
  assert.equal(r.cdnDownloadCtx!.fileNo, "cdn_standard_xxx", "应优先 standard 变体");
  assert.equal(r.md5, "739234c72fa65e1a6997a6bd7f09ccc0");
});

test("v1.2.5 IMAGE-CDN — isV1SchemaImage 无 cdn_download_contexts 不报错", () => {
  const raw = { kind: "image", local_id: 123, conversation_id: "g@chatroom", recipient_id: "bot" };
  const r = isV1SchemaImage(raw);
  assert.equal(r.isV1, true);
  assert.equal(r.cdnDownloadCtx, undefined, "旧推送无 cdn_download_contexts");
});

// ===== v1.2.6 VOICE-DOWNLOAD-BINARY: isV1SchemaVoice 提取 download_context =====
import { isV1SchemaVoice } from "../src/inbound/media-enrich.js";

test("v1.2.6 VOICE — isV1SchemaVoice 提取新版 voice.download_context", () => {
  const raw = {
    kind: "voice",
    type: 34,
    local_id: 1660506587,
    voice: {
      download_context: {
        chat_room_name: "57737516566@chatroom",
        client_msg_id: "client-123",
        format: 4,
        from_user_name: "57737516566@chatroom",
        length: 4206,
        master_buf_id: "0",
        msg_id: 1660506587,
        new_msg_id: "1346019200999807490",
        to_user_name: "q139198824",
      },
    },
  };
  const r = isV1SchemaVoice(raw);
  assert.equal(r.isV1, true);
  assert.equal(r.voiceCtx!.msgId, 1660506587);
  assert.equal(r.voiceCtx!.newMsgId, "1346019200999807490");
  assert.equal(r.voiceCtx!.clientMsgId, "client-123");
  assert.equal(r.voiceCtx!.chatRoomName, "57737516566@chatroom");
  assert.equal(r.voiceCtx!.format, 4);
});

test("v1.2.6 VOICE — isV1SchemaVoice 非语音/无 download_context 返回 false", () => {
  assert.equal(isV1SchemaVoice({ kind: "text" }).isV1, false);
  assert.equal(isV1SchemaVoice({ kind: "voice" }).isV1, false, "无 download_context");
  assert.equal(isV1SchemaVoice(null).isV1, false);
});
