// src/inbound/media-enrich/voice.ts - 语音消息 enrich (v0 XML + v1 Binary + STT/vendor transcript)
// 从 media-enrich.ts v1.3.26 拆分 (2026-08-10, P3-2): 仅搬运, 不优化

import { logObj as log, formatErr } from "../../core/logger.js";
import { safeFetchWithCap } from "../../util/safe-fetch.js";
import { transcribeSilkBuffer } from "../../storage/stt.js";
import { parseVoiceXml } from "./xml.js";
import { loadOssConfig, uploadToOss, downloadByEndpoint, buildOssKey } from "./shared.js";
import type { MediaEnrichResult } from "./shared.js";
import type { WppAccountCtx } from "../../send/factory.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

/** 语音消息 (msgType=34) 下载 + OSS + STT 转写 */
export async function enrichVoiceMessage(
  ctx: WppAccountCtx,
  xml: string,
): Promise<MediaEnrichResult> {
  const parsed = parseVoiceXml(xml);
  if (!parsed) return { mediaUrl: null, mediaSize: null, error: "no aeskey/fileNo in xml" };
  const oss = loadOssConfig();
  if (!oss) return { mediaUrl: null, mediaSize: null, error: "oss credentials missing" };
  let tmpPath: string | null = null;
  let sttText: string | null = null;
  try {
    // vendor 端点无 Cdn 前缀 (错调 /Tools/CdnDownloadVoice 会 404)
    const b64 = await downloadByEndpoint(ctx, "/Tools/DownloadVoice", parsed.aesKey, parsed.fileNo);
    const buf = Buffer.from(b64, "base64");
    tmpPath = path.join(os.tmpdir(), `wpp-voice-${crypto.randomBytes(6).toString("hex")}.silk`);
    fs.writeFileSync(tmpPath, buf);
    const filename = `${parsed.md5 ?? crypto.randomBytes(8).toString("hex")}.silk`;
    const ossKey = buildOssKey(ctx.accountId, "voices", filename);
    const url = await uploadToOss(oss, tmpPath, ossKey);
    // 下载完顺手 STT 转写 (siliconflow SenseVoiceSmall); 失败不阻塞
    try {
      const sttR = await transcribeSilkBuffer(buf);
      if (sttR?.text) {
        sttText = sttR.text;
        log.info(`[WPP v1.2.0] voice STT ok: text="${sttText.slice(0, 50)}${sttText.length > 50 ? "..." : ""}"`);
      }
    } catch (e) {
      log.warn(`[WPP v1.2.0] voice STT failed (non-fatal): ${formatErr(e)}`);
    }
    log.info(`[WPP v1.2.0] voice enrich OSS: ${url} (${buf.length} bytes, ${parsed.durationMs ?? "?"}ms)`);
    // 把 STT 文字拼到 MediaEnrichResult 让 handler 注入 content
    return { mediaUrl: url, mediaSize: buf.length, ...(sttText ? { filename: sttText } : {}) };
  } catch (e) {
    log.warn(`[WPP v1.2.0] voice enrich failed: ${formatErr(e)}`, { aesKey: parsed.aesKey });
    return { mediaUrl: null, mediaSize: null, error: (e as Error).message };
  } finally {
    if (tmpPath) try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}
/**
 * v1.2.6 VOICE-DOWNLOAD-BINARY: 新版 vendor (8/10) 语音推送带 voice.download_context,
 * 提交给 DownloadVoiceBinary → 返回 SILK/AMR/MP3/WAV 原始字节 → STT 转写 + OSS。
 */
export interface V1VoiceDownloadCtx {
  msgId: number;
  newMsgId: string;
  clientMsgId: string;
  masterBufId: string;
  format: number;
  length: number;
  chatRoomName?: string;
  fromUserName?: string;
  toUserName?: string;
}
/** 从 raw_payload 提取新版语音 download_context (kind=voice + voice.download_context) */
export function isV1SchemaVoice(raw: unknown): { isV1: boolean; voiceCtx?: V1VoiceDownloadCtx } {
  if (!raw || typeof raw !== "object") return { isV1: false };
  const r = raw as Record<string, unknown>;
  if (r.kind !== "voice") return { isV1: false };
  const vc = (r.voice as Record<string, unknown> | undefined)?.download_context as
    | Record<string, unknown>
    | undefined;
  if (!vc || typeof vc.msg_id !== "number") return { isV1: false };
  return {
    isV1: true,
    voiceCtx: {
      msgId: vc.msg_id,
      newMsgId: typeof vc.new_msg_id === "string" ? vc.new_msg_id : "",
      clientMsgId: typeof vc.client_msg_id === "string" ? vc.client_msg_id : "",
      masterBufId: typeof vc.master_buf_id === "string" ? vc.master_buf_id : "0",
      format: typeof vc.format === "number" ? vc.format : 4,
      length: typeof vc.length === "number" ? vc.length : 0,
      chatRoomName: typeof vc.chat_room_name === "string" ? vc.chat_room_name : undefined,
      fromUserName: typeof vc.from_user_name === "string" ? vc.from_user_name : undefined,
      toUserName: typeof vc.to_user_name === "string" ? vc.to_user_name : undefined,
    },
  };
}
/**
 * 用新版 DownloadVoiceBinary 下载语音 → STT 转写 + OSS。
 * v1.3.22 VENDOR-TRANSCRIPT: 优先用 vendor 自带 transcript (voice.transcript, wechat_official),
 *   免插件 STT (省 token + 快 + 准). 无 vendor transcript 才走 SiliconFlow STT。
 * 返回 { mediaUrl, mediaSize, filename: STT文字 } — handler 注入 content 让 AI 看到转写。
 */
export async function enrichVoiceMessageFromV1(
  ctx: WppAccountCtx,
  voiceCtx: V1VoiceDownloadCtx,
  vendorTranscript?: string,
): Promise<MediaEnrichResult> {
  const oss = loadOssConfig();
  if (!oss) return { mediaUrl: null, mediaSize: null, error: "oss credentials missing" };
  let tmpPath: string | null = null;
  let sttText: string | null = null;
  // v1.3.22 VENDOR-TRANSCRIPT: vendor 已转写 (voice.transcript) → 直接用它, 不下载不 STT
  const vendorText = vendorTranscript?.trim();
  if (vendorText) {
    sttText = vendorText;
    log.info(`[WPP v1.3.22 VENDOR-TRANSCRIPT] use vendor transcript (wechat_official): "${vendorText.slice(0, 50)}"`);
    return { mediaUrl: null, mediaSize: null, filename: sttText };
  }
  try {
    const url = `${ctx.baseUrl.replace(/\/$/, "")}/api/Tools/DownloadVoiceBinary?authcode=${encodeURIComponent(ctx.authcode ?? "")}`;
    const buf = await safeFetchWithCap(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "TokenKey": ctx.tokenKey },
        body: JSON.stringify({
          msg_id: voiceCtx.msgId,
          new_msg_id: voiceCtx.newMsgId,
          client_msg_id: voiceCtx.clientMsgId,
          master_buf_id: voiceCtx.masterBufId,
          format: voiceCtx.format,
          length: voiceCtx.length,
          chat_room_name: voiceCtx.chatRoomName,
          from_user_name: voiceCtx.fromUserName,
          to_user_name: voiceCtx.toUserName,
        }),
        signal: AbortSignal.timeout(30_000),
      },
      20 * 1024 * 1024, // 20MB hard cap (silk 通常 <2MB)
    );
    if (buf.length === 0) {
      return { mediaUrl: null, mediaSize: null, error: "DownloadVoiceBinary empty" };
    }

    tmpPath = path.join(os.tmpdir(), `wpp-voice-v1-${crypto.randomBytes(6).toString("hex")}.silk`);
    fs.writeFileSync(tmpPath, buf);

    try {
      const sttR = await transcribeSilkBuffer(buf);
      if (sttR?.text) {
        sttText = sttR.text;
        log.info(`[WPP v1.2.6 VOICE-DOWNLOAD-BINARY] STT ok: "${sttText.slice(0, 50)}${sttText.length > 50 ? "..." : ""}"`);
      }
    } catch (e) {
      log.warn(`[WPP v1.2.6] voice STT failed (non-fatal): ${formatErr(e)}`);
    }

    const filename = `${crypto.randomBytes(8).toString("hex")}.silk`;
    const ossKey = buildOssKey(ctx.accountId, "voices", filename);
    const ossUrl = await uploadToOss(oss, tmpPath, ossKey);
    log.info(`[WPP v1.2.6 VOICE-DOWNLOAD-BINARY] ok: ${ossUrl} (${buf.length} bytes)`);
    return { mediaUrl: ossUrl, mediaSize: buf.length, ...(sttText ? { filename: sttText } : {}) };
  } catch (e) {
    log.warn(`[WPP v1.2.6 VOICE-DOWNLOAD-BINARY] failed: ${formatErr(e)}`);
    return { mediaUrl: null, mediaSize: null, error: (e as Error).message };
  } finally {
    if (tmpPath) try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}
