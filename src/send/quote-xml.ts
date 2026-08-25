// src/send/quote-xml.ts - 引用回复 XML 构造
// 关键: appmsg type=57 客户端主气泡读 <title> 字段, <des> 在 type=57 被吞。
// 因此 title = AI 回复文字 (gewe 工作基线), 不能放被引用人 displayname (否则只显示 refermsg 预览)。

export interface QuoteSource {
  /** 被引用消息的 svrid (= inbound NewMsgId, vendor 全局唯一) */
  svrid: string;
  /** 被引用消息的发送者 wxid */
  fromusr?: string;
  /** 被引用消息的所属会话 wxid (群聊时 = 群id, 私聊时 = 对方 wxid) */
  chatusr?: string;
  /** 被引用消息的发送者昵称 (用于引用块展示) */
  displayname?: string;
  /** 被引用消息的原文 (文本=原文, 图片=图片 XML) */
  content?: string;
  /** 被引用消息的创建时间 (秒) */
  createtime?: number;
  /** 被引用消息的类型 (1=text 3=image 34=voice 43=video 47=emoji 49=app) */
  innerType?: number;
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
 * 引用回复 XML: title=des=AI 回复 (双填保险, 老客户端可能读 des), type=57, refermsg=svrid+fromusr
 */
export function buildQuoteReplyXml(
  replyContent: string,
  quote: QuoteSource,
  opts?: { innerType?: 57 | 49 },
): string {
  const innerType = opts?.innerType ?? 57;
  const reply = (replyContent || "引用回复").trim();
  const title = escapeXml(reply.slice(0, 500));
  const des = escapeXml(reply.slice(0, 500));

  // refermsg 极简化 (gewe 基线): 仅 svrid 客户端已能渲染; 加 fromusr 兼容老版本回查昵称
  const svrid = escapeXml(quote.svrid.trim());
  const fromusr = quote.fromusr ? escapeXml(quote.fromusr) : "";

  const refermsg = svrid
    ? `<refermsg>` +
      `<svrid>${svrid}</svrid>` +
      (fromusr ? `<fromusr>${fromusr}</fromusr>` : "") +
      `</refermsg>`
    : "";

  return `<appmsg><title>${title}</title><des>${des}</des><type>${innerType}</type>${refermsg}</appmsg>`;
}