// src/state.ts - 进程内会话状态缓存 (出站 reply 时避免查 DB / 重派生 chatId/chatType)
// 与 SeenTracker (webhook-receiver.ts) 边界: SeenTracker 做 msgId 去重, sessionChatInfo 做出站定位, 职责正交。
// TTL 30 分钟防内存增长; cleanup() 由 account registry unregister 时调用。
const TTL_MS = 30 * 60 * 1000; // 30 min, 对齐 SeenTracker 默认值
const sessionChatInfo = new Map();
/**
 * 设置 / 刷新 session 的 chat info
 *
 * 调用点: dispatchInboundToOpenClaw 入口 (inbound 路径), 每条入站消息 dispatch 前
 * 不调用: outbound 路径 (因为 outbound 本来就知道 chatId/toWxid)
 *
 * @param sessionKey - 完整 sessionKey
 *   - 群聊: agent:<id>:wechatpadpro:group:<peerId> (5 段, framework parseSessionDeliveryRoute 期望)
 *   - DM:   agent:<id>:wechatpadpro:<accountId>:direct:<peerId> (6 段)
 * @param info - chatId/chatType/peerId/accountId
 */
export function setSessionChatInfo(sessionKey, info) {
    if (!sessionKey)
        return;
    sessionChatInfo.set(sessionKey, {
        ...info,
        updatedAt: Date.now(),
    });
    // v1.3.59 P1-1 (2026-08-13 完整审阅): 生产无读取路径 (outbound 从不读), TTL 剪枝从不触发
    //   → Map 无限增长。写时顺带清理过期 (阈值触发, 不常驻扫描)。
    if (sessionChatInfo.size > 500) {
        const now = Date.now();
        for (const [k, v] of sessionChatInfo) {
            if (now - v.updatedAt > TTL_MS)
                sessionChatInfo.delete(k);
        }
    }
}
/**
 * 获取 session 的 chat info
 *
 * 调用点: outbound 入口 (outbound.ts sendText/sendImage 等), 当 caller 没显式传 chatId 时
 * 返回: undefined if 不存在 / 已过期 (30 min TTL)
 *
 * @param sessionKey - 完整 sessionKey
 * @returns SessionChatInfo | undefined
 */
export function getSessionChatInfo(sessionKey) {
    const info = sessionChatInfo.get(sessionKey);
    if (!info)
        return undefined;
    if (Date.now() - info.updatedAt > TTL_MS) {
        sessionChatInfo.delete(sessionKey);
        return undefined;
    }
    return info;
}
/**
 * 删除单个 session 的 chat info
 *
 * 调用点: 未来如需手动 invalidate (e.g., 群成员变更后强制刷新)
 */
export function deleteSessionChatInfo(sessionKey) {
    return sessionChatInfo.delete(sessionKey);
}
/**
 * 清空所有 session chat info
 *
 * 调用点: account registry unregister / gateway shutdown / 单测 teardown
 */
export function clearAllSessionChatInfo() {
    sessionChatInfo.clear();
}
/**
 * 当前 Map 大小 (test introspection)
 */
export function sessionChatInfoSize() {
    return sessionChatInfo.size;
}
//# sourceMappingURL=state.js.map