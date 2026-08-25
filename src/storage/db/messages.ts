// src/storage/db/messages.ts - wpp_messages CRUD 便捷封装
// 全部通过 getAdapter() 拿 adapter, 不直接 import mysql2 (解耦 backend)

import { getAdapter } from "./factory.js";
import type { MessageRecord, SvridMappingRecord } from "./types.js";

export async function saveMessage(record: MessageRecord): Promise<void> {
  return getAdapter().saveMessage(record);
}

export async function getMessages(opts: {
  accountId?: string;
  peerKind?: string;
  peerId?: string;
  /** v1.2.4: 按发送者过滤 (群聊查触发人历史) */
  fromWxid?: string;
  limit?: number;
  beforeTs?: number;
}): Promise<MessageRecord[]> {
  return getAdapter().getMessages(opts);
}

export async function getMessageById(
  msgId: string,
  accountId: string,
): Promise<MessageRecord | null> {
  return getAdapter().getMessageById(msgId, accountId);
}

/**
 * v1.1.19 DB-DEDUP (2026-08-08 18:33 接总立方案 A): 按 msg_id 或 new_msg_id 查已存在 inbound 消息。
 * 用于 dispatch 前持久化去重 — SeenTracker 是内存态, gateway 重启即清空;
 * vendor 重放消息 (Synckey="" 全量拉取) 在重启后重新触发 dispatch → 重复 AI 回复。
 * 查 DB 则重启后依然去重 (wpp_messages 表 UNIQUE 索引已保证物理唯一)。
 *
 * v1.3.18 P1-核心2 fix (2026-08-10): 加 opts.direction 参数, 引用解析路径传 "any" 查全部方向
 *   - dedup (handler.ts:514): 默认 inbound
 *   - 引用解析 (dispatcher.ts:resolveReferencedMessage + quote-reply.ts): any
 */
export async function getMessageByMsgIdOrNewId(
  msgId: string | undefined,
  newMsgId: string | undefined,
  accountId: string,
  opts?: { direction?: "inbound" | "outbound" | "any" },
): Promise<MessageRecord | null> {
  return getAdapter().getMessageByMsgIdOrNewId(msgId, newMsgId, accountId, opts);
}

export async function findMessageByMd5(
  md5: string,
  accountId: string,
): Promise<MessageRecord | null> {
  return getAdapter().findMessageByMd5(md5, accountId);
}

/** v1.1.24 QUOTE-SVRID: 存 svrid 映射 (md5 → svrid, 从引用消息捕获) */
export async function saveSvridMapping(
  record: SvridMappingRecord,
): Promise<void> {
  return getAdapter().saveSvridMapping(record);
}

/** v1.1.24 QUOTE-SVRID: 按 md5 查真实 svrid */
export async function getSvridByMd5(
  md5: string,
  accountId: string,
): Promise<string | null> {
  return getAdapter().getSvridByMd5(md5, accountId);
}

/** v1.1.25 SYNC-STATE: 保存账号 Synckey 增量游标 */
export async function saveSynckey(
  accountId: string,
  synckey: string,
): Promise<void> {
  return getAdapter().saveSynckey(accountId, synckey);
}

/** v1.1.25 SYNC-STATE: 读账号 Synckey (无则 null → 首次全量) */
export async function getSynckey(
  accountId: string,
): Promise<string | null> {
  return getAdapter().getSynckey(accountId);
}
