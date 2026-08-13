import { parseQuoteXml } from "../inbound/parser/quote.js";
export function buildQuoteContext(msg) {
    if (!msg.content.includes("<refermsg"))
        return null;
    const parsed = parseQuoteXml(msg.content);
    const sender = msg.fromNickname ?? msg.fromWxid;
    if (!parsed) {
        return `<quoted-sender>${sender}</quoted-sender>
<quoted-msgid>${msg.msgId}</quoted-msgid>`;
    }
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
