// src/send/quote-xml.ts - 引用回复 XML 构造 (v1.1.30 GEWE-PARITY)
// 2026-08-08 21:19 接总立分析 gewe 实现后的修正:
//   gewe send/quote.js 的极简结构是 vendor 服务器端期望的格式 — 我之前加的 6+字段是错的!
//
// gewe 实现 (dist/send/quote.js):
//   export async function gewePostQuoteReply(account, toWxid, quoteDetails, replyContent) {
//     const safeTitle = escapeXmlText(replyTitle);
//     const safeSvrid = escapeXmlText(quoteDetails.msgId?.trim() || "");
//     const refermsg = safeSvrid ? `<refermsg><svrid>${safeSvrid}</svrid></refermsg>` : "";
//     const appMsgXml = `<appmsg><title>${safeTitle}</title><type>57</type>${refermsg}</appmsg>`;
//     return gewePostAppMsg(account, toWxid, appMsgXml);
//   }
//
// 关键洞察:
//   1. **refermsg 只放 svrid** — 微信服务器端用 svrid 查原消息补全 (缩略图 + 定位)
//   2. **不加 content/fromusr/displayname/createtime** — 这些字段让微信客户端解析混乱
//   3. **svrid 用 inbound NewMsgId** (vendor 全局唯一 ID) — 不是 msgId 也不是手工映射
//   4. **AI 多模态上下文** — gewe handler.ts:180 把原图 OSS URL push 到 mediaList → AI 看到图 → 生成内容
//   5. **图片引用缩略图** — 微信服务器端从 svrid 查原消息 → 渲染缩略图 (因为 svrid 是真 svrid)
//
// 之前 WPP 实现的 4 个错误:
//   ① 加了 refermsg.content (图片 XML 原样嵌入/转义) — vendor 不解析, 客户端混乱
//   ② 加了 fromusr/chatusr/displayname/createtime — 客户端解析但跟服务器端冲突
//   ③ svrid 用 resolveQuoteSvrid() 映射表/fallback msgId — 不是真 svrid
//   ④ handler.ts 没把原图 push 到 AI 多模态上下文 — AI 看图要靠运气

export interface QuoteSource {
  /** 被引用消息的 svrid (= inbound NewMsgId, vendor 全局唯一) */
  svrid: string;
  /** gewe 兼容字段 (保留字段但极简 XML 不用) */
  fromusr?: string;
  displayname?: string;
  content?: string;
  createtime?: number;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * 构造引用回复 XML (appmsg type=57 + 极简 refermsg)
 * 仿 gewe send/quote.js: 只放 svrid, 其他字段交给微信服务器端从 svrid 查原消息补全
 * @param replyContent 要发送的回复内容
 * @param quote 被引用消息信息 (svrid 是必填 = inbound NewMsgId)
 */
export function buildQuoteReplyXml(
  replyContent: string,
  quote: QuoteSource,
): string {
  const title = escapeXml((replyContent || "引用回复").trim().slice(0, 200));
  const svrid = escapeXml(quote.svrid.trim());

  // v1.1.30 GEWE-PARITY: 极简结构 — 仅 svrid
  // 微信服务器端会用 svrid 查原消息补全 (渲染缩略图 + 提供定位跳转)
  const refermsg = svrid ? `<refermsg><svrid>${svrid}</svrid></refermsg>` : "";

  return `<appmsg><title>${title}</title><type>57</type>${refermsg}</appmsg>`;
}