// session-key.ts - 4 段设计 (防 2026-08-01 误判铁律 + 本项目 架构哲学)
// 2026-08-04 init

import type { PeerKindValue } from "./core/constants.js";

/**
 * SessionKey 4 段设计 (借鉴 本项目, 但用 wechatpadpro channelId):
 *
 *   agent:<agentId>:wechatpadpro:<accountId>:<peerKind>:<peerId>
 *
 * - agentId       OpenClaw agent 名 (boss 主 agent 是 "main")
 * - channelId     固定 "wechatpadpro" (plugin manifest 唯一)
 * - accountId     账号 ID (单账号 demo 用 "default", 后续多账号每账号独立)
 * - peerKind      "direct" 或 "group"
 * - peerId        私聊: fromWxid; 群聊: chatroomId
 *
 * 设计意图 (2026-08-01 老板立的 4 段原则):
 *   1. accountId 段对未来多账号多 agent 路由是硬性区分字段, 不能简化
 *   2. 群聊按 chatroom 聚合 (不按成员拆 session)
 */
export function buildSessionKey(opts: {
  agentId: string;
  accountId: string;
  peerKind: PeerKindValue;
  peerId: string;
}): string {
  return `agent:${opts.agentId}:wechatpadpro:${opts.accountId}:${opts.peerKind}:${opts.peerId}`;
}

export function parseSessionKey(key: string): {
  agentId: string;
  channelId: string;
  accountId: string;
  peerKind: PeerKindValue;
  peerId: string;
} | null {
  const parts = key.split(":");
  if (parts.length !== 6) return null;
  const [p0, p1, p2, p3, p4, p5] = parts;
  if (p0 === undefined || p1 === undefined || p2 === undefined || p3 === undefined || p4 === undefined || p5 === undefined) {
    return null;
  }
  if (p0 !== "agent" || p2 !== "wechatpadpro") return null;
  return {
    agentId: p1,
    channelId: p2,
    accountId: p3,
    peerKind: p4 as PeerKindValue,
    peerId: p5,
  };
}
