// src/state.ts - 进程内会话状态缓存 (出站 reply 时避免查 DB / 重派生 chatId/chatType)
// 与 SeenTracker (webhook-receiver.ts) 边界: SeenTracker 做 msgId 去重, sessionChatInfo 做出站定位, 职责正交。
// TTL 30 分钟防内存增长; cleanup() 由 account registry unregister 时调用。

const TTL_MS = 30 * 60 * 1000; // 30 min, 对齐 SeenTracker 默认值

export type SessionChatType = "group" | "single";

export interface SessionChatInfo {
  /** 当前 session 的对端 wxid (群=群ID, 私聊=对方 wxid) */
  chatId: string;
  /** 当前 session 的聊天类型 */
  chatType: SessionChatType;
  /** 当前 session 的 peerId (msg.peerId, 用于 outbound 参数校验) */
  peerId: string;
  /** 账号 ID (用于多账号隔离) */
  accountId: string;
  /** 最后一次 update 时间戳 (ms) */
  updatedAt: number;
}

const sessionChatInfo = new Map<string, SessionChatInfo>();

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
export function setSessionChatInfo(
  sessionKey: string,
  info: { chatId: string; chatType: SessionChatType; peerId: string; accountId: string },
): void {
  if (!sessionKey) return;
  sessionChatInfo.set(sessionKey, {
    ...info,
    updatedAt: Date.now(),
  });
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
export function getSessionChatInfo(sessionKey: string): SessionChatInfo | undefined {
  const info = sessionChatInfo.get(sessionKey);
  if (!info) return undefined;
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
export function deleteSessionChatInfo(sessionKey: string): boolean {
  return sessionChatInfo.delete(sessionKey);
}

/**
 * 清空所有 session chat info
 *
 * 调用点: account registry unregister / gateway shutdown / 单测 teardown
 */
export function clearAllSessionChatInfo(): void {
  sessionChatInfo.clear();
}

/**
 * 当前 Map 大小 (test introspection)
 */
export function sessionChatInfoSize(): number {
  return sessionChatInfo.size;
}
