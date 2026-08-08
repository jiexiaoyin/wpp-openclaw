// src/send/quote-reply.ts - quoteReply 工具实现 (v1.1.21)
// 2026-08-08 19:07 接总立: 引用回复 (文本 + 图片) 走完整 refermsg XML → ShareLink
// 流程: AI 调 quoteReply(toWxid, content, msgId)
//   1. 查 DB 被引用消息 (getMessageByMsgIdOrNewId) 补全 refermsg 字段
//   2. buildQuoteReplyXml 构造完整 XML (content 放原文/图片XML)
//   3. 用 registry 完整 ctx (baseUrl+tokenKey) 发 ShareLink
// v1.1.26-FIX (2026-08-08 20:16): 修复 baseUrl 空字符串 bug
//   根因: makeWppMsg({ baseUrl: "", tokenKey: "", accountId }) 空 ctx →
//     postWppJson 拼 URL 失败 "Failed to parse URL from /api/Msg/ShareLink"
//     → 所有 AI 图片引用回复静默失败 (文本走 sendText 正常, 图片走 quoteReply 全挂)
//   修复: 从 registry.get(accountId).apiClient 拿真实 baseUrl/tokenKey → 直接 postWppJson

import { getMessageByMsgIdOrNewId } from "../db.js";
import { postWppJson } from "../api/client.js";
import { buildQuoteReplyXml } from "./quote-xml.js";
import { resolveQuoteSvrid } from "../inbound/quote-svrid.js";
import { getDefaultAccountRegistry } from "../account-state.js";
import { info } from "../core/logger.js";

export interface QuoteReplyParams {
  toWxid: string;
  content: string;
  /** 被引用消息的 msgId (DB 查询用) */
  msgId: string;
  /** 可选: 被引用消息的 newMsgId (fallback) */
  newMsgId?: string;
  accountId?: string;
}

/**
 * 引用回复 (文本/图片通用):
 * - 从 DB 查被引用消息, 拿原文 content (图片=图片XML) + fromWxid 等
 * - 构造完整 refermsg → ShareLink 发送
 */
export async function quoteReply(params: QuoteReplyParams): Promise<{ ok: boolean; msg?: string; data?: unknown }> {
  const { toWxid, content, msgId, newMsgId, accountId } = params;
  const acct = accountId ?? "default";

  // v1.1.30 GEWE-PARITY (2026-08-08 21:20 接总立: 分析 gewe 后的核心修正):
  //   gewe send/quote.js: safeSvrid = escapeXmlText(quoteDetails.msgId?.trim())
  //   gewe handler.ts:166 pendingQuoteDetails = { msgId: newMessageId, ... }
  //   即 gewe 直接用 inbound 的 newMessageId 当 svrid — vendor 全局唯一 ID
  //
  // 之前 v1.1.24+ 的 resolveQuoteSvrid (映射表/fallback msgId) 错了!
  //   - 映射表仅靠 "别人引用该消息" 被动填充 → 大部分消息没真实 svrid
  //   - fallback msgId 不是 svrid (WSS 验证 svrid 跟 msgId 无关)
  //   - fallback newMsgId 是对的 — 但之前的 fallback 顺序是 msgId 优先
  // fix: svrid 直接用 inbound newMsgId (vendor 全局唯一, 微信服务器端能用它查原消息)
  let quote: { svrid: string; } = {
    svrid: newMsgId || msgId || "",  // gewe 范式: newMsgId 优先 (vendor 全局唯一 svrid)
  };
  try {
    const rec = await getMessageByMsgIdOrNewId(msgId, newMsgId, acct);
    if (rec) {
      // 查映射表是否有真实 svrid (老板手动引用图片时被动捕获的)
      const mappedSvrid = await resolveQuoteSvrid(msgId, newMsgId, rec.content ?? undefined, acct);
      // 映射表命中且有效: 用映射表; 否则 fallback newMsgId
      if (mappedSvrid && mappedSvrid !== msgId) {
        quote = { svrid: mappedSvrid };
      } else {
        quote = { svrid: newMsgId || msgId || "" };
      }
    }
  } catch {
    // DB 查询失败不阻塞 — refermsg 用最小字段
  }

  // 2. 构造 XML + 发送 — v1.1.26-FIX: postWppJson 带 registry ctx (resolveCallCtx fallback)
  //    之前 makeWppMsg({ baseUrl: "", tokenKey: "", accountId }) → ctxToCallOpts 空 opts
  //    → resolveCallCtx 拿不到 tokenKey → 空 URL/凭证 → ShareLink 全挂
  const xml = buildQuoteReplyXml(content, quote);
  const state = getDefaultAccountRegistry().get(acct);
  const cfg = state?.config;
  info(`[WPP v1.1.30] quoteReply ShareLink: to=${toWxid} svrid=${quote.svrid} (gewe-parity: 极简结构)`);
  // v1.1.26-IMG-CONTENT: 打印实际 XML 片段以便调试缩略图问题 (老板需看 vendor 收的什么)
  //    打印中间 300 (refermsg.content 部分 — 包含图片 XML)
  const totalLen = xml.length;
  const midStart = Math.max(0, Math.floor(totalLen / 2) - 150);
  info(`[WPP v1.1.26] quoteReply XML (mid 300 chars at pos ${midStart}): ${xml.slice(midStart, midStart + 300).replace(/\n/g, "\\n")}`);
  info(`[WPP v1.1.26] quoteReply XML totalLen=${totalLen}`);
  const resp = await postWppJson(cfg?.apiBaseUrl ?? "", "/Msg/ShareLink", {
    ToWxid: toWxid,
    Type: 5,
    Xml: xml,
  }, {
    tokenKey: cfg?.tokenKey ?? "",
    authcode: cfg?.authcode ?? "",
    timeoutMs: 30000,
  });
  const ok = resp.Code === 0;
  return {
    ok,
    msg: ok ? "引用回复已发送" : `发送失败 Code=${resp.Code} ${resp.CodeValue ?? ""}`,
    data: resp.Data,
  };
}
