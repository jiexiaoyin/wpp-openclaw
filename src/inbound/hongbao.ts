// src/inbound/hongbao.ts - v1.1.7 红包 (red packet) 检测 + 业务逻辑
// vendor 推送时, 红包消息有特定 msgType (appmsg subtype) 或 content 含特定 marker
// 这里提供 detect + 处理建议 (不自动拆, 业务上由 AI / 用户决定)

import { warn, info, formatErr } from "../core/logger.js";
import type { WppInboundMessage } from "../types.js";

/**
 * 检测消息是否是红包
 * - msgType 包含 "hongbao" / "redpacket" (vendor-specific)
 * - content 含 "红包" 关键字 (heuristic, 可能误判但够安全)
 * - raw.appmsg.type === 2002 (微信原生 red packet type)
 */
export function isRedPacketMessage(msg: WppInboundMessage): boolean {
  // heuristic 1: content 含 "红包" 关键字
  if (typeof msg.content === "string" && /红包|red.?packet/i.test(msg.content)) {
    return true;
  }
  // heuristic 2: raw.appmsg.type === 2002 (微信 native red packet)
  const appMsg = (msg.raw as Record<string, unknown>).appMsg as Record<string, unknown> | undefined;
  if (appMsg && (appMsg.type === 2002 || appMsg.type === "2002")) {
    return true;
  }
  // heuristic 3: raw.type 含 "hongbao" (vendor 私有)
  if (typeof (msg.raw as Record<string, unknown>).type === "string") {
    const t = (msg.raw as Record<string, unknown>).type as string;
    if (/hongbao|redpacket/i.test(t)) return true;
  }
  return false;
}

/**
 * 红包处理结果 (供 inbound/handler 决定下一步)
 */
export interface RedPacketProcessResult {
  /** 红包 URL (用于 OpenHongBao 端点) */
  url?: string;
  /** 红包 key (用于 OpenHongBao 端点) */
  key?: string;
  /** 是否要自动拆 (false = 仅 log) */
  shouldOpen: boolean;
}

/**
 * 从 raw payload 提取红包信息 (url + key for OpenHongBao)
 * vendor 推送时, 红包信息可能在 raw.hongbao / raw.appmsg.hongbaoInfo
 */
export function extractRedPacketInfo(msg: WppInboundMessage): RedPacketProcessResult {
  const raw = msg.raw as Record<string, unknown>;
  // 路径 1: raw.hongbao.url + raw.hongbao.key
  const hb = raw.hongbao as Record<string, unknown> | undefined;
  if (hb && typeof hb.url === "string" && typeof hb.key === "string") {
    return { url: hb.url as string, key: hb.key as string, shouldOpen: false };
  }
  // 路径 2: raw.appMsg.hongbaoInfo
  const appMsg = raw.appMsg as Record<string, unknown> | undefined;
  if (appMsg) {
    const info = appMsg.hongbaoInfo as Record<string, unknown> | undefined;
    if (info && typeof info.url === "string" && typeof info.key === "string") {
      return { url: info.url as string, key: info.key as string, shouldOpen: false };
    }
  }
  return { shouldOpen: false };
}

/**
 * v1.1.7: 红包消息处理 (handler 调用, 默认仅 log)
 * - 检测到: log + 提取 url/key (供后续业务使用)
 * - 未来可加 shouldOpen 配置 (AI 决策 / 用户配置)
 */
export function processRedPacket(
  msg: WppInboundMessage,
  onExtract?: (result: RedPacketProcessResult) => void | Promise<void>,
): RedPacketProcessResult {
  if (!isRedPacketMessage(msg)) {
    return { shouldOpen: false };
  }
  const result = extractRedPacketInfo(msg);
  info(`red packet detected: account=${msg.accountId} peer=${msg.peerId} url=${result.url ? "present" : "missing"}`);
  if (onExtract) {
    try {
      const r = onExtract(result);
      if (r && typeof (r as Promise<unknown>).then === "function") {
        (r as Promise<unknown>).catch((e) => warn(`redPacket onExtract error: ${formatErr(e)}`));
      }
    } catch (e) {
      warn(`redPacket onExtract sync error: ${formatErr(e)}`);
    }
  }
  return result;
}
