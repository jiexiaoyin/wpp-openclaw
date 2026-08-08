// src/dispatch/outbound.ts - OpenClaw channel outbound
// 范式仿 本项目/src/dispatch/outbound.ts
// G3 重构: getAccountState → getDefaultAccountRegistry().get (走 class API, 替代 module facade)

import { logObj as log, formatErr } from "../core/logger.js";
import type { WppAccountState } from "../types.js";
import { getDefaultAccountRegistry } from "../account-state.js";
import { saveMessage } from "../db.js";
import type { WppApiResponse } from "../api/client.js";

const TEXT_CHUNK_LIMIT = 4000;

function inferPeerKind(toWxid: string): "direct" | "group" | "room" {
  return toWxid.endsWith("@chatroom") ? "group" : "direct";
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
    const d = (r.Data ?? {}) as { msgId?: string; newMsgId?: string };
    await saveMessage({
      account_id: state.accountId,
      msg_id: d.msgId ?? null,
      new_msg_id: d.newMsgId ?? null,
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
): Promise<{ ok: boolean; msgId?: string; newMsgId?: string; error?: string }> {
  const state = getDefaultAccountRegistry().get(accountId);
  if (!state) return { ok: false, error: `account not found: ${accountId}` };
  const peerKind = inferPeerKind(toWxid);
  let accumulated = "";
  let lastMsgId: string | undefined;
  let lastNewId: string | undefined;
  // chunk long texts (Markdown-aware 简化版: 按 \n\n 切)
  const chunks = text.length <= TEXT_CHUNK_LIMIT ? [text] : chunkMarkdown(text, TEXT_CHUNK_LIMIT);
  for (const chunk of chunks) {
    accumulated += chunk;
    const r = await state.apiClient.sendText(toWxid, chunk, ats);
    if (r.Code !== 0 && r.Code !== 200) {
      return { ok: false, error: `vendor Code=${r.Code}`, msgId: lastMsgId, newMsgId: lastNewId };
    }
    const d = (r.Data ?? {}) as { msgId?: string; newMsgId?: string };
    lastMsgId = d.msgId;
    lastNewId = d.newMsgId;
    await persistOutbound(state, peerKind, toWxid, "text", chunk, r);
  }
  return { ok: true, msgId: lastMsgId, newMsgId: lastNewId };
}

export async function sendImage(
  accountId: string,
  toWxid: string,
  imageUrlOrPath: string,
): Promise<{ ok: boolean; msgId?: string; newMsgId?: string; error?: string }> {
  const state = getDefaultAccountRegistry().get(accountId);
  if (!state) return { ok: false, error: `account not found: ${accountId}` };
  const r = await state.apiClient.sendImage(toWxid, imageUrlOrPath);
  const peerKind = inferPeerKind(toWxid);
  await persistOutbound(state, peerKind, toWxid, "image", imageUrlOrPath, r);
  if (r.Code !== 0 && r.Code !== 200) return { ok: false, error: `vendor Code=${r.Code}` };
  const d = (r.Data ?? {}) as { msgId?: string; newMsgId?: string };
  return { ok: true, msgId: d.msgId, newMsgId: d.newMsgId };
}

export async function sendVoice(
  accountId: string,
  toWxid: string,
  voiceUrlOrPath: string,
  durationMs?: number,
): Promise<{ ok: boolean; msgId?: string; error?: string }> {
  const state = getDefaultAccountRegistry().get(accountId);
  if (!state) return { ok: false, error: `account not found: ${accountId}` };
  const r = await state.apiClient.sendVoice(toWxid, voiceUrlOrPath, durationMs);
  const peerKind = inferPeerKind(toWxid);
  // v1.1.17 FULL-FIX (P1-f): 先判 Code 再 persist — 失败不留假记录 (之前先 persist 后判 Code)
  if (r.Code !== 0 && r.Code !== 200) return { ok: false, error: `vendor Code=${r.Code}` };
  await persistOutbound(state, peerKind, toWxid, "voice", voiceUrlOrPath, r);
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
  const r = await state.apiClient.sendVideo(toWxid, videoUrlOrPath, thumbUrl);
  const peerKind = inferPeerKind(toWxid);
  // v1.1.17 FULL-FIX (P1-f): 先判 Code 再 persist — 失败不留假记录
  if (r.Code !== 0 && r.Code !== 200) return { ok: false, error: `vendor Code=${r.Code}` };
  await persistOutbound(state, peerKind, toWxid, "video", videoUrlOrPath, r);
  const d = (r.Data ?? {}) as { msgId?: string };
  return { ok: true, msgId: d.msgId };
}

export async function revokeMsg(
  accountId: string,
  toWxid: string,
  msgId: string,
  newMsgId: string,
): Promise<{ ok: boolean; error?: string }> {
  const state = getDefaultAccountRegistry().get(accountId);
  if (!state) return { ok: false, error: `account not found: ${accountId}` };
  const r = await state.apiClient.revokeMsg(msgId, newMsgId, toWxid);
  if (r.Code !== 0 && r.Code !== 200) return { ok: false, error: `vendor Code=${r.Code}` };
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
