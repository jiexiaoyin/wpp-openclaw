// src/dispatch/pending-reply.ts - msgId → 路由上下文 Map (借鉴 gewe pending-reply)
// 群 @ 触发时记录"该回到哪个群/哪个 sender", 供 AI 回复工具兜底还原目标
//   防: AI 回复时若没带群 ID (误用 sender wxid), 可查 Map 还原为群 ID (不误发 DM)
// 仿 gewe: src/dispatch/pending-reply.ts (rememberReply/lookupReply/resolveTargetWxid)

import { logObj as log } from "../core/logger.js";

interface PendingReplyEntry {
  isGroup: boolean;
  roomId: string;
  senderId: string;
  accountId: string;
  __storedAt: number;
}

const pendingReplies = new Map<string, PendingReplyEntry>();
// 群最近 @ 记录 (accountId+roomId → msgId), 防跨账号串号
const lastGroupMentionByAccount = new Map<string, { roomId: string; msgId: string; storedAt: number }>();

const TTL_MS = 10 * 60 * 1000; // 10 分钟过期 (防内存泄漏)

/** 触发时记录: msgId → 路由上下文 (群@ 或 私聊) */
export function rememberReply(
  msgId: string,
  entry: Omit<PendingReplyEntry, "__storedAt">,
): void {
  if (!msgId) return;
  pendingReplies.set(msgId, { ...entry, __storedAt: Date.now() });
}

/** 按 msgId 查路由上下文 */
export function lookupReply(msgId: string): PendingReplyEntry | undefined {
  const e = pendingReplies.get(msgId);
  if (!e) return undefined;
  if (Date.now() - e.__storedAt > TTL_MS) {
    pendingReplies.delete(msgId);
    return undefined;
  }
  return e;
}

/** 群最近 @ 记录 (防跨账号串号) */
export function rememberLastGroupMention(accountId: string, roomId: string, msgId: string): void {
  lastGroupMentionByAccount.set(accountId, { roomId, msgId, storedAt: Date.now() });
}

/**
 * 回复目标兜底还原: 优先 msgId 路由, 其次群最近@, 最后 fallbackToWxid.
 *   AI 回复若误用 sender wxid (非群) → 用此还原为群 ID.
 */
export function resolveTargetWxid(
  accountId: string,
  msgId: string | undefined,
  fallbackToWxid: string,
): { toWxid: string; isGroup: boolean } {
  if (msgId) {
    const ctx = lookupReply(msgId);
    if (ctx && ctx.accountId === accountId) {
      return { toWxid: ctx.isGroup ? ctx.roomId : ctx.senderId, isGroup: ctx.isGroup };
    }
    // msgId 有记录但跨账号 → 不匹配, 直接 fallback (不 fall through 到别的账号的群@)
    if (ctx) return { toWxid: fallbackToWxid, isGroup: fallbackToWxid.endsWith("@chatroom") };
    // 群 @ 兜底 (仅本账号, msgId 完全无记录时)
    const last = lastGroupMentionByAccount.get(accountId);
    if (last && Date.now() - last.storedAt < TTL_MS) {
      log.debug(`[WPP pending-reply] msgId 无路由, 用群最近@ → ${last.roomId}`);
      return { toWxid: last.roomId, isGroup: true };
    }
  }
  return { toWxid: fallbackToWxid, isGroup: fallbackToWxid.endsWith("@chatroom") };
}

/** 清理过期 (心跳/定时调用) */
export function cleanupPendingReplies(): number {
  const now = Date.now();
  let removed = 0;
  for (const [k, v] of pendingReplies) {
    if (now - v.__storedAt > TTL_MS) {
      pendingReplies.delete(k);
      removed++;
    }
  }
  return removed;
}
