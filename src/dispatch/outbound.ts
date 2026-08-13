// src/dispatch/outbound.ts - OpenClaw channel outbound
// 范式仿 本项目/src/dispatch/outbound.ts
// G3 重构: getAccountState → getDefaultAccountRegistry().get (走 class API, 替代 module facade)

import { logObj as log, formatErr } from "../core/logger.js";
import type { WppAccountState } from "../types.js";
import { getDefaultAccountRegistry } from "../account-state.js";
import { saveMessage } from "../db.js";
import { extractOutboundMsgIds } from "../send/msg.js";
import { uploadMediaToOss } from "./media-oss.js";
import { resolveImageToBase64 } from "../api/resolve-media.js";
import type { WppApiResponse } from "../api/client.js";
import { execAsync } from "../util/exec.js";
import { safeFetchWithCap } from "../util/safe-fetch.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const TEXT_CHUNK_LIMIT = 4000;

/**
 * v1.3.18 P1-核心3 fix (2026-08-10): 统一发送判据 — Code=0 只是 HTTP 200, 真正成功看 Data.BaseResponse.ret === 0
 *   之前: 5 个 send 函数只看 r.Code, 不查 Data.BaseResponse.ret → vendor 返 Code=0 + ret=-2 时误报成功
 *   现在: 看 Code && ret, 与 quote-reply.ts:220 已正确判据保持一致
 *   兼容: undefined ret 视为成功 (老 vendor 不返 BaseResponse 兌底)
 */
function isSendOk(r: { Code: number; Data?: unknown }): boolean {
  if (r.Code !== 0 && r.Code !== 200) return false;
  const baseRet = (r.Data as { BaseResponse?: { ret?: number } } | undefined)?.BaseResponse?.ret;
  return baseRet === 0 || baseRet === undefined;
}

/**
 * v1.3.8 VIDEO-THUMB: 从视频 URL/路径抽首帧生成缩略图 base64 (微信端发视频必须带缩略图才显示)。
 * ffmpeg 抽 1s 帧 → JPEG base64。失败返回 null (不阻塞, 降级无缩略图)。
 * v1.3.18 P1-安全2 + F5 fix (2026-08-10): safeFetchWithCap (50MB cap + host 白名单),
 *   原本 fetch 整个视频 (F5), 现在 50MB cap (实际只取 1 帧缩略图, 不需要全视频)
 */
export async function generateVideoThumbnailBase64(
  videoUrlOrPath: string,
): Promise<string | null> {
  let tmpIn: string | null = null;
  let tmpOut: string | null = null;
  try {
    // 下载远程视频到临时文件 (OSS URL)
    if (videoUrlOrPath.startsWith("http")) {
      tmpIn = path.join(os.tmpdir(), `wpp-vthumb-in-${crypto.randomBytes(6).toString("hex")}.mp4`);
      const buf = await safeFetchWithCap(videoUrlOrPath, { signal: AbortSignal.timeout(30_000) }, 50 * 1024 * 1024);
      if (buf.length === 0) return null;
      fs.writeFileSync(tmpIn, buf);
    } else {
      tmpIn = videoUrlOrPath;
    }
    tmpOut = path.join(os.tmpdir(), `wpp-vthumb-${crypto.randomBytes(6).toString("hex")}.jpg`);
    const r = await execAsync("ffmpeg", [
      "-y", "-autorotate", "1", "-i", tmpIn, "-ss", "1", "-frames:v", "1",
      "-q:v", "5", "-vf", "scale=720:-2", tmpOut,
    ], { timeoutMs: 20_000 });
    if (r.code !== 0 || !fs.existsSync(tmpOut)) return null;
    const b64 = fs.readFileSync(tmpOut).toString("base64");
    log.debug(`[WPP v1.3.8 VIDEO-THUMB] generated ${b64.length} bytes base64`);
    return b64;
  } catch (e) {
    log.warn(`[WPP v1.3.8 VIDEO-THUMB] failed (non-fatal, no thumb): ${formatErr(e)}`);
    return null;
  } finally {
    try { if (tmpIn && tmpIn !== videoUrlOrPath) fs.unlinkSync(tmpIn); } catch {}
    try { if (tmpOut) fs.unlinkSync(tmpOut); } catch {}
  }
}

function inferPeerKind(toWxid: string): "direct" | "group" | "room" {
  return toWxid.endsWith("@chatroom") ? "group" : "direct";
}

/** v1.3.53 VOICE-DEGRADE: 从 URL/路径推文件名兑底 (文件降级显示用) */
function inferVoiceFileName(urlOrPath: string): string {
  const base = (urlOrPath.split("?")[0] ?? "").split("/").pop() ?? "";
  return base || "voice.mp3";
}

async function persistOutbound(
  state: WppAccountState,
  peerKind: "direct" | "group" | "room",
  toWxid: string,
  msgType: string,
  content: string,
  r: WppApiResponse,
): Promise<void> {
  try {
    const ids = extractOutboundMsgIds(r);
    await saveMessage({
      account_id: state.accountId,
      msg_id: ids.newMsgId ?? ids.msgId ?? null,
      new_msg_id: ids.newMsgId ?? null,
      direction: "outbound",
      peer_kind: peerKind,
      peer_id: toWxid,
      msg_type: msgType,
      content,
      raw_payload: r.raw,
    });
  } catch (e) {
    log.warn(`persist outbound err: ${formatErr(e)}`);
  }
}

export async function sendText(
  accountId: string,
  toWxid: string,
  text: string,
  ats?: string[],
): Promise<{ ok: boolean; msgId?: string; newMsgId?: string; createTime?: number; error?: string }> {
  const state = getDefaultAccountRegistry().get(accountId);
  if (!state) return { ok: false, error: `account not found: ${accountId}` };
  const peerKind = inferPeerKind(toWxid);
  let accumulated = "";
  let lastMsgId: string | undefined;
  let lastNewId: string | undefined;
  let lastCreateTime: number | undefined;
  // chunk long texts (Markdown-aware 简化版: 按 \n\n 切)
  const chunks = text.length <= TEXT_CHUNK_LIMIT ? [text] : chunkMarkdown(text, TEXT_CHUNK_LIMIT);
  for (const chunk of chunks) {
    accumulated += chunk;
    const r = await state.apiClient.sendText(toWxid, chunk, ats);
    if (!isSendOk(r)) {
      const baseRet = (r.Data as { BaseResponse?: { ret?: number } } | undefined)?.BaseResponse?.ret;
      return { ok: false, error: `vendor Code=${r.Code} ret=${baseRet ?? "?"}`, msgId: lastMsgId, newMsgId: lastNewId };
    }
    const ids = extractOutboundMsgIds(r);
    lastMsgId = ids.msgId;
    lastNewId = ids.newMsgId;
    lastCreateTime = ids.createTime;
    await persistOutbound(state, peerKind, toWxid, "text", chunk, r);
  }
  return { ok: true, msgId: lastMsgId, newMsgId: lastNewId, createTime: lastCreateTime };
}

export async function sendImage(
  accountId: string,
  toWxid: string,
  imageUrlOrPath: string,
): Promise<{ ok: boolean; msgId?: string; newMsgId?: string; createTime?: number; error?: string }> {
  const state = getDefaultAccountRegistry().get(accountId);
  if (!state) return { ok: false, error: `account not found: ${accountId}` };
  // v1.3.22 SELF-MEDIA-OSS: 发图前取 base64 → 上传 OSS (供入库用 OSS 公网 URL)
  let ossContent = imageUrlOrPath;
  try {
    const b64 = await resolveImageToBase64(imageUrlOrPath);
    const buf = Buffer.from(b64, "base64");
    if (buf.length > 0) {
      const ossUrl = await uploadMediaToOss(buf, "image", "jpg", accountId);
      if (ossUrl) ossContent = ossUrl;
    }
  } catch (e) {
    log.warn(`[WPP v1.3.22 SELF-MEDIA-OSS] image base64/upload skipped (keep source): ${formatErr(e)}`);
  }
  const r = await state.apiClient.sendImage(toWxid, imageUrlOrPath);
  const peerKind = inferPeerKind(toWxid);
  if (!isSendOk(r)) {
    const baseRet = (r.Data as { BaseResponse?: { ret?: number } } | undefined)?.BaseResponse?.ret;
    return { ok: false, error: `vendor Code=${r.Code} ret=${baseRet ?? "?"}` };
  }
  // v1.3.22: 入库 content 用 OSS URL (自己发的图可查可引用)
  await persistOutbound(state, peerKind, toWxid, "image", ossContent, r);
  const ids = extractOutboundMsgIds(r);
  return { ok: true, msgId: ids.msgId, newMsgId: ids.newMsgId, createTime: ids.createTime };
}

export async function sendVoice(
  accountId: string,
  toWxid: string,
  voiceUrlOrPath: string,
  durationMs?: number,
  formatHint?: "mp3" | "silk",
): Promise<{ ok: boolean; msgId?: string; error?: string }> {
  const state = getDefaultAccountRegistry().get(accountId);
  if (!state) return { ok: false, error: `account not found: ${accountId}` };
  // ============================================================
  // v1.3.48 SILK-ENCODER (2026-08-12 接总立 P0, 修复 vendor /Msg/SendVoice ret=-2 静默拒收)
  //
  // 根因: vendor /Msg/SendVoice 只接受 silk base64 (24kHz mono + !SILK_V3 头),
  //   但 WPP plugin sendVoice 路径一直把 mp3 base64 直接传过去 → vendor 拒收 ret=-2
  // 老板 query 8-12 10:44: "参考 gewe 插件之前发送语音的逻辑看看"
  // 老板 8-12 10:23: "语音要注意格式转化问题呀"
  // 老板 6-12 21:50 历史已诊断过 silk 转码 bug, 7-24 01:54 老板拍板过 silk encoder 范式
  // 8-12 10:17 AI 误判 framework sendMessage ok=true 是真成功 (实际是 wrapper 不抛错 + 静默 ret=-2)
  //
  // 修复 (仿 GeWe v1.4.4 src/send/voice.ts:230 geweConvertAndSendMp3AsVoice):
  //   1. mp3 → ffmpeg PCM 24kHz mono (-ar 24000 -ac 1)
  //   2. PCM → silk encoder -tencent -quiet (生成微信 silk 期望的 0x02 + !SILK_V3 头)
  //   3. silkBuffer base64 → data: URI → 传给 vendor /Msg/SendVoice (原 vendor 接口只接 Base64, 不接 URL)
  //   4. 传不出去降级为 sendFile (老板 6-12 16:36 偏好: 成功发为语音, 失败降级文件)
  //
  // 不动现有 sendImage/sendFile/sendVideo (它们各自路径正确)
  // 不动现有 v1.3.22 SELF-MEDIA-OSS 入库逻辑 (ossContent 用 silk URL)
  // ============================================================
  let ossContent = voiceUrlOrPath;
  let vendorInput = voiceUrlOrPath;
  let actualDurationMs = durationMs;
  try {
    const { encodeMp3ToSilk } = await import("./silk-encoder.js");
    const { silkBuffer, voiceDurationMs } = await encodeMp3ToSilk(voiceUrlOrPath);
    actualDurationMs = actualDurationMs ?? voiceDurationMs;
    // 上传 OSS (v1.3.22 SELF-MEDIA-OSS 入库用)
    const ossUrl = await uploadMediaToOss(silkBuffer, "voice", "silk", accountId);
    if (ossUrl) ossContent = ossUrl;
    // 给 vendor 的输入改成 silk base64 (data: URI)
    vendorInput = `data:audio/silk;base64,${silkBuffer.toString("base64")}`;
    log.info(`[WPP v1.3.48 SILK-ENCODER] mp3 → silk (${silkBuffer.length} bytes, ${voiceDurationMs}ms) → vendor /Msg/SendVoice`);
  } catch (e) {
    // v1.3.53 VOICE-DEGRADE (2026-08-12 接总立 P3-1, 老板 6-12 16:36 偏好): silk 转码失败 → 降级为文件消息
    //   - 绝不给 /Msg/SendVoice 传 mp3 (vendor 只收 silk, 直传必 ret=-2)
    //   - 但 mp3 可当文件发 → 用户拿到可播放的音频文件, 不是啥都拿不到
    //   - 文件降级也失败 → 才整体失败
    const errMsg = formatErr(e);
    log.warn(`[WPP v1.3.53 VOICE-DEGRADE] silk 转码失败, 降级发文件: ${errMsg}`);
    try {
      const buf = await safeFetchWithCap(voiceUrlOrPath, { signal: AbortSignal.timeout(60_000) }, 50 * 1024 * 1024);
      if (buf.length === 0) return { ok: false, error: `silk 转码失败 (${errMsg}) + 文件降级下载空` };
      const fileName = inferVoiceFileName(voiceUrlOrPath);
      const fileR = await state.apiClient.sendFileViaApp(toWxid, fileName, buf.toString("base64"), buf.length);
      if (!isSendOk(fileR)) {
        const baseRet = (fileR.Data as { BaseResponse?: { ret?: number } } | undefined)?.BaseResponse?.ret;
        return { ok: false, error: `silk 转码失败 (${errMsg}) + 文件降级 vendor Code=${fileR.Code} ret=${baseRet ?? "?"}` };
      }
      await persistOutbound(state, inferPeerKind(toWxid), toWxid, "file", voiceUrlOrPath, fileR);
      const ids = extractOutboundMsgIds(fileR);
      return { ok: true, msgId: ids.msgId };
    } catch (e2) {
      return { ok: false, error: `silk 转码失败 (${errMsg}) + 文件降级失败: ${formatErr(e2)}` };
    }
  }
  const r = await state.apiClient.sendVoice(toWxid, vendorInput, actualDurationMs, formatHint ?? "silk");
  const peerKind = inferPeerKind(toWxid);
  if (!isSendOk(r)) {
    const baseRet = (r.Data as { BaseResponse?: { ret?: number } } | undefined)?.BaseResponse?.ret;
    return { ok: false, error: `vendor Code=${r.Code} ret=${baseRet ?? "?"}` };
  }
  await persistOutbound(state, peerKind, toWxid, "voice", ossContent, r);
  const d = (r.Data ?? {}) as { msgId?: string };
  return { ok: true, msgId: d.msgId };
}

export async function sendVideo(
  accountId: string,
  toWxid: string,
  videoUrlOrPath: string,
  thumbUrl?: string,
): Promise<{ ok: boolean; msgId?: string; error?: string }> {
  const state = getDefaultAccountRegistry().get(accountId);
  if (!state) return { ok: false, error: `account not found: ${accountId}` };
  let imageBase64 = thumbUrl ?? "";
  if (!imageBase64) {
    imageBase64 = (await generateVideoThumbnailBase64(videoUrlOrPath)) ?? "";
    if (imageBase64) log.info(`[WPP v1.3.8 VIDEO-THUMB] auto-generated thumb for video (${videoUrlOrPath.slice(0, 60)})`);
  }
  // v1.3.22 SELF-MEDIA-OSS: 发视频前取 base64 → 上传 OSS (入库用 OSS 公网 URL)
  let ossContent = videoUrlOrPath;
  try {
    const b64 = await resolveImageToBase64(videoUrlOrPath);
    const buf = Buffer.from(b64, "base64");
    if (buf.length > 0) {
      const ossUrl = await uploadMediaToOss(buf, "video", "mp4", accountId);
      if (ossUrl) ossContent = ossUrl;
    }
  } catch (e) {
    log.warn(`[WPP v1.3.22 SELF-MEDIA-OSS] video base64/upload skipped (keep source): ${formatErr(e)}`);
  }
  const r = await state.apiClient.sendVideo(toWxid, videoUrlOrPath, imageBase64);
  const peerKind = inferPeerKind(toWxid);
  if (!isSendOk(r)) {
    const baseRet = (r.Data as { BaseResponse?: { ret?: number } } | undefined)?.BaseResponse?.ret;
    return { ok: false, error: `vendor Code=${r.Code} ret=${baseRet ?? "?"}` };
  }
  await persistOutbound(state, peerKind, toWxid, "video", ossContent, r);
  const d = (r.Data ?? {}) as { msgId?: string };
  return { ok: true, msgId: d.msgId };
}

export async function revokeMsg(
  accountId: string,
  toWxid: string,
  msgId: string,
  newMsgId: string,
  createTime?: number,
): Promise<{ ok: boolean; error?: string }> {
  const state = getDefaultAccountRegistry().get(accountId);
  if (!state) return { ok: false, error: `account not found: ${accountId}` };
  //   (实测 now → vendor ret=0 但不真撤; server time → 撤回成功 + 推送 10002 撤回事件)
  const r = await state.apiClient.revokeMsg(msgId, newMsgId, toWxid, createTime);
  if (!isSendOk(r)) {
    const baseRet = (r.Data as { BaseResponse?: { ret?: number } } | undefined)?.BaseResponse?.ret;
    return { ok: false, error: `vendor Code=${r.Code} ret=${baseRet ?? "?"}` };
  }
  return { ok: true };
}


// ============ v1.1.17 恢复 (被 sendApp 删除时误删, 从备份恢复) ============

/** 简易 markdown chunker: 按段落优先 (\n\n) 切, 每段独立不超 limit */
function chunkMarkdown(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const out: string[] = [];
  let current = "";
  const lines = text.split("\n");
  for (const line of lines) {
    if (current.length + line.length + 1 > limit) {
      if (current) out.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) out.push(current);
  return out;
}

/** normalize payload before sending (频道唯一 stub — 后续可加更多转换) */
export function normalizePayload(text: string): string {
  return text.trim();
}

/** chunker 入口 */
export const chunker = (text: string) =>
  text.length <= TEXT_CHUNK_LIMIT ? [text] : chunkMarkdown(text, TEXT_CHUNK_LIMIT);
