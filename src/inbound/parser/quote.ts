// src/inbound/parser/quote.ts - 引用消息 <refermsg> XML 解析

export interface QuoteRef {
  msgId: string;
  newMsgId?: string;
  fromWxid?: string;
  title?: string;
  type?: string;
  /** v1.1.21: 被引用消息原文 (文本=原文, 图片=图片XML) */
  content?: string;
}

/** Parse `<refermsg type="..."><type>...</type><svrid>...</svrid>...</refermsg>` block */
export function parseQuoteXml(content: string): QuoteRef | null {
  if (!content || !content.includes("<refermsg")) return null;
  const block = content.match(/<refermsg\b[^>]*>([\s\S]*?)<\/refermsg>/);
  if (!block || block[1] === undefined) return null;
  const inner = block[1];

  const tag = (name: string): string | undefined => {
    const m = inner.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`));
    return m && m[1] ? m[1].trim() : undefined;
  };

  const result: QuoteRef = {
    type: tag("type"),
    msgId: tag("svrid") ?? tag("msgid") ?? "",
    // v1.1.21: 真实结构是 <fromusr> (之前只认 fromusername → 引用来源丢失)
    fromWxid: tag("fromusr") ?? tag("fromusername"),
    title: tag("displayname") ?? tag("title"),
    content: tag("content"),
  };
  if (!result.msgId) return null;
  return result;
}
