// src/dispatch/reply-helpers.ts - quote reply + format helpers
// 仿 本项目/src/dispatch/reply-helpers.ts
import { parseQuoteXml } from "../inbound/parser/quote.js";
export function buildQuoteContext(msg) {
    // v1.1.21 QUOTE-FIX: 引用消息才注入 (非引用返回 null)
    if (!msg.content.includes("<refermsg"))
        return null;
    // 解析 refermsg 块 — 拿被引用内容 (文本原文 / 图片 XML) + 发送者
    const parsed = parseQuoteXml(msg.content);
    const sender = msg.fromNickname ?? msg.fromWxid;
    if (!parsed) {
        return `<quoted-sender>${sender}</quoted-sender>
<quoted-msgid>${msg.msgId}</quoted-msgid>`;
    }
    // 被引用内容: 文本直接显示, 图片显示类型提示
    const isImg = parsed.content?.includes("<img") ?? false;
    const refContent = isImg
        ? "(被引用内容是一张图片)"
        : (parsed.content && parsed.content.length > 0 ? parsed.content : parsed.title ?? "(未知内容)");
    return `<quoted-sender>${sender}</quoted-sender>
<quoted-msgid>${parsed.msgId}</quoted-msgid>
<quoted-fromusr>${parsed.fromWxid ?? ""}</quoted-fromusr>
<quoted-content>${refContent.slice(0, 300).replace(/</g, "&lt;")}</quoted-content>`;
}
export function formatOutbound(text, opts) {
    let out = text;
    if (opts?.trim !== false)
        out = out.trim();
    return out;
}
export const LOCATION_SEND_MARKER = "<<WPP_LOCATION_SEND>>";
//# sourceMappingURL=reply-helpers.js.map