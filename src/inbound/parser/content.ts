// src/inbound/parser/content.ts - 按 msgType 提取 content 文本

import type { MsgTypeValue } from "../../core/constants.js";

/** 群消息 group prefix 剥离: ":\n<sender nickname>:\n<content>" → "<content>" */
export function stripGroupPrefix(content: string): string {
  if (!content) return "";
  // 匹配 "xxx:\n" 两次 (sender + receiver)
  const m = content.match(/^[^:\n]+:\n[^:\n]+:\n([\s\S]*)$/);
  if (m && m[1]) return m[1].trim();
  return content;
}

/** Vendor 消息 type 数字 → human-readable */
export function describeMsgType(msgType: number): string {
  const map: Record<number, string> = {
    1: "text",
    3: "image",
    34: "voice",
    43: "video",
    47: "emoji",
    42: "card",
    48: "location",
    49: "app",
    51: "relay", // 群接龙
    53: "chat-history", // 历史教训: 实际是 53 不是 51
    10000: "system",
    10002: "revoke",
  };
  return map[msgType] ?? `unknown(${msgType})`;
}

/** 强制类型: 仅作为 util, 不影响 ParseInbound 类型 */
export type _MsgTypeKey = MsgTypeValue;
