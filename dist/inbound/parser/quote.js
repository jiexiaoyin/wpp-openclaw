// src/inbound/parser/quote.ts - 引用消息 <refermsg> XML 解析
import { safeMatch } from "../../core/safe-regex.js";
/** Parse `<refermsg type="..."><type>...</type><svrid>...</svrid>...</refermsg>` block */
export function parseQuoteXml(content) {
    if (!content || !content.includes("<refermsg"))
        return null;
    // 用 safeMatch 截断 4096 防恶意构造 XML 触发 ReDoS
    const block = safeMatch(/<refermsg\b[^>]*>([\s\S]*?)<\/refermsg>/, content);
    if (!block || block[1] === undefined)
        return null;
    const inner = block[1];
    const tag = (name) => {
        const m = safeMatch(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`), inner, 2048);
        return m && m[1] ? m[1].trim() : undefined;
    };
    const result = {
        type: tag("type"),
        msgId: tag("svrid") ?? tag("msgid") ?? "",
        // 真实结构是 <fromusr> (不是 fromusername)
        fromWxid: tag("fromusr") ?? tag("fromusername"),
        title: tag("displayname") ?? tag("title"),
        content: tag("content"),
    };
    if (!result.msgId)
        return null;
    return result;
}
/** 从 raw_payload 提取 reply_context 引用信息 (无则 null) */
export function extractReferencedFromReplyContext(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const r = raw;
    const rc = r.reply_context;
    if (!rc || typeof rc !== "object")
        return null;
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
/** 从 raw_payload 提取 app.reference (category=quote 引用消息) 被引用信息 */
export function extractReferencedFromApp(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const r = raw;
    const app = r.app;
    if (!app || typeof app !== "object")
        return null;
    if (app.category !== "quote")
        return null;
    const ref = app.reference;
    if (!ref || typeof ref !== "object")
        return null;
    return {
        newMsgId: typeof ref.new_msg_id === "string" ? ref.new_msg_id : undefined,
        svrId: typeof ref.svr_id === "string" ? ref.svr_id : undefined,
        msgType: typeof ref.msg_type === "number" ? ref.msg_type : undefined,
        fromWxid: typeof ref.from_user_id === "string" ? ref.from_user_id : undefined,
        displayName: typeof ref.display_name === "string" ? ref.display_name : undefined,
    };
}
//# sourceMappingURL=quote.js.map