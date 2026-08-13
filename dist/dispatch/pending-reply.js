import { logObj as log } from "../core/logger.js";
const pendingReplies = new Map();
const lastGroupMentionByAccount = new Map();
const TTL_MS = 10 * 60 * 1000;
export function rememberReply(msgId, entry) {
    if (!msgId)
        return;
    pendingReplies.set(msgId, { ...entry, __storedAt: Date.now() });
    if (pendingReplies.size > 500)
        cleanupPendingReplies();
}
export function lookupReply(msgId) {
    const e = pendingReplies.get(msgId);
    if (!e)
        return undefined;
    if (Date.now() - e.__storedAt > TTL_MS) {
        pendingReplies.delete(msgId);
        return undefined;
    }
    return e;
}
export function rememberLastGroupMention(accountId, roomId, msgId) {
    lastGroupMentionByAccount.set(accountId, { roomId, msgId, storedAt: Date.now() });
}
export function resolveTargetWxid(accountId, msgId, fallbackToWxid) {
    if (msgId) {
        const ctx = lookupReply(msgId);
        if (ctx && ctx.accountId === accountId) {
            return { toWxid: ctx.isGroup ? ctx.roomId : ctx.senderId, isGroup: ctx.isGroup };
        }
        if (ctx)
            return { toWxid: fallbackToWxid, isGroup: fallbackToWxid.endsWith("@chatroom") };
        const last = lastGroupMentionByAccount.get(accountId);
        if (last && Date.now() - last.storedAt < TTL_MS) {
            log.debug(`[WPP pending-reply] msgId 无路由, 用群最近@ → ${last.roomId}`);
            return { toWxid: last.roomId, isGroup: true };
        }
    }
    return { toWxid: fallbackToWxid, isGroup: fallbackToWxid.endsWith("@chatroom") };
}
export function cleanupPendingReplies() {
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
