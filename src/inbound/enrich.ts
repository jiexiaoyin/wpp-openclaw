// src/inbound/enrich.ts - DB 单一入口 (仿 本项目/src/inbound/enrich.ts)
// 关键: webhook / handler 都通过本文件写 DB, 避免 webhook 自己 INSERT + handler 再 UPDATE 的重复修复模式

import { logObj as log, formatErr } from "../core/logger.js";
import { saveMessage } from "../db.js";
import type { WppInboundMessage } from "../types.js";

export interface EnrichResult {
  saved: boolean;
  error?: string;
  record?: Record<string, unknown>;
}

/**
 * Persist inbound message to wpp_messages. Idempotent — same msgId can call twice safely.
 * 关键: 不抛, 吞错返 saved:false (silent killer 永久救回靠 caller log)
 */
export async function enrichAndSaveMessage(
  msg: WppInboundMessage,
): Promise<EnrichResult> {
  try {
    await saveMessage({
      account_id: msg.accountId,
      msg_id: msg.msgId,
      new_msg_id: msg.newMsgId,
      // v1.3.21 REVOKE-FIX: 用 msg.direction (outgoing 图片 = outbound), 默认 inbound
      direction: msg.direction ?? "inbound",
      peer_kind: msg.peerKind,
      peer_id: msg.peerId,
      peer_name: msg.fromNickname,
      chat_id: msg.chatroomId,
      msg_type: String(msg.msgType),
      content: msg.content,
      raw_payload: msg.raw,
      from_wxid: msg.fromWxid,
      ts: msg.ts,
    });
    return { saved: true };
  } catch (e) {
    log.warn(`enrichAndSaveMessage failed: ${formatErr(e)}`, {
      msgId: msg.msgId,
    });
    return { saved: false, error: (e as Error).message };
  }
}

/** 多个消息批量保存 */
export async function enrichBatch(batch: WppInboundMessage[]): Promise<{
  saved: number;
  failed: number;
}> {
  let saved = 0;
  let failed = 0;
  for (const msg of batch) {
    const r = await enrichAndSaveMessage(msg);
    if (r.saved) saved++;
    else failed++;
  }
  log.info(`enrichBatch: ${saved} saved, ${failed} failed (size=${batch.length})`);
  return { saved, failed };
}
