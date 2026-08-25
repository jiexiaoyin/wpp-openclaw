// src/inbound/parser/quote.ts - 引用消息 <refermsg> XML 解析

import { safeMatch } from "../../core/safe-regex.js";

export interface QuoteRef {
  msgId: string;
  newMsgId?: string;
  fromWxid?: string;
  title?: string;
  type?: string;
  /** 被引用消息原文 (文本=原文, 图片=图片XML) */
  content?: string;
}

/** Parse `<refermsg type="..."><type>...</type><svrid>...</svrid>...</refermsg>` block */
export function parseQuoteXml(content: string): QuoteRef | null {
  if (!content || !content.includes("<refermsg")) return null;
  // 用 safeMatch 截断 4096 防恶意构造 XML 触发 ReDoS
  const block = safeMatch(/<refermsg\b[^>]*>([\s\S]*?)<\/refermsg>/, content);
  if (!block || block[1] === undefined) return null;
  const inner = block[1];

  const tag = (name: string): string | undefined => {
    const m = safeMatch(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`), inner, 2048);
    return m && m[1] ? m[1].trim() : undefined;
  };

  const result: QuoteRef = {
    type: tag("type"),
    msgId: tag("svrid") ?? tag("msgid") ?? "",
    // 真实结构是 <fromusr> (不是 fromusername)
    fromWxid: tag("fromusr") ?? tag("fromusername"),
    title: tag("displayname") ?? tag("title"),
    content: tag("content"),
  };
  if (!result.msgId) return null;
  return result;
}

/**
 * v1.3.5 QUOTE-REPLY-CONTEXT: 新版 vendor 引用走 raw_payload.reply_context (非 content <refermsg> XML)。
 * 结构: { msg_id: uint32, new_msg_id, svr_id, quote_content, msg_type, from_user_id, ... }
 * 提取被引用消息的定位字段 (msg_id 可能是被引用消息 local_id, svr_id 可能是当前消息自身)。
 */
export interface ReplyContextRef {
  /** vendor 内部 msg_id (uint32) — 可能是被引用消息 local_id */
  msgId?: number;
  newMsgId?: string;
  svrId?: string;
  /** 被引用内容文字 (图片消息则为描述) */
  quoteContent?: string;
  /** 被引用消息类型 (3=图片, 49=文件, 1=文本...) */
  msgType?: number;
  fromWxid?: string;
  chatroomId?: string;
}

/** 从 raw_payload 提取 reply_context 引用信息 (无则 null) */
export function extractReferencedFromReplyContext(raw: unknown): ReplyContextRef | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const rc = r.reply_context as Record<string, unknown> | undefined;
  if (!rc || typeof rc !== "object") return null;
  return {
    msgId: typeof rc.msg_id === "number" ? rc.msg_id : undefined,
    newMsgId: typeof rc.new_msg_id === "string" ? rc.new_msg_id : undefined,
    svrId: typeof rc.svr_id === "string" ? rc.svr_id : undefined,
    quoteContent: typeof rc.quote_content === "string" ? rc.quote_content : undefined,
    msgType: typeof rc.msg_type === "number" ? rc.msg_type : undefined,
    fromWxid: typeof rc.from_user_id === "string" ? rc.from_user_id : undefined,
    chatroomId: typeof rc.chat_user_id === "string" ? rc.chat_user_id : undefined,
  };
}

/**
 * v1.3.6 QUOTE-APP-REFERENCE: 新版 vendor 引用消息的**被引用信息在 app.reference** (category=quote),
 * 不在 reply_context! 结构:
 *   app: { category: "quote", reference: { new_msg_id, svr_id, msg_type, from_user_id, display_name } }
 * 实测: app.reference.new_msg_id 精确匹配 DB msg_id 列 → 定位被引用消息 (图/文件/文本)
 */
export interface AppReference {
  newMsgId?: string;
  svrId?: string;
  msgType?: number;
  fromWxid?: string;
  displayName?: string;
}

/** 从 raw_payload 提取 app.reference (category=quote 引用消息) 被引用信息 */
export function extractReferencedFromApp(raw: unknown): AppReference | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const app = r.app as Record<string, unknown> | undefined;
  if (!app || typeof app !== "object") return null;
  if (app.category !== "quote") return null;
  const ref = app.reference as Record<string, unknown> | undefined;
  if (!ref || typeof ref !== "object") return null;
  return {
    newMsgId: typeof ref.new_msg_id === "string" ? ref.new_msg_id : undefined,
    svrId: typeof ref.svr_id === "string" ? ref.svr_id : undefined,
    msgType: typeof ref.msg_type === "number" ? ref.msg_type : undefined,
    fromWxid: typeof ref.from_user_id === "string" ? ref.from_user_id : undefined,
    displayName: typeof ref.display_name === "string" ? ref.display_name : undefined,
  };
}
