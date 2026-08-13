import { isValidAtUser } from "./wxid.js";
import { safeMatchAll } from "../../core/safe-regex.js";
const AT_MENTION_PATTERNS = [
    /(wxid_[a-zA-Z0-9]+)@[^,\s]*/g,
    /@(wxid_[a-zA-Z0-9]+)/g,
    /<at\s+user="(wxid_[a-zA-Z0-9]+)"/g,
    /<atuserlist>[\s\S]*?<username>(wxid_[a-zA-Z0-9]+)<\/username>/g,
    /<atuserlist>[\s\S]*?<username>([a-zA-Z][a-zA-Z0-9_-]{5,})<\/username>/g,
    /@([a-zA-Z][a-zA-Z0-9_-]{5,})[^\s@]*/g,
];
export function extractAtUserList(content) {
    const out = new Set();
    for (const pat of AT_MENTION_PATTERNS) {
        const matches = safeMatchAll(pat, content);
        for (const m of matches) {
            const wxid = m[1];
            if (wxid && isValidAtUser(wxid))
                out.add(wxid);
        }
    }
    return Array.from(out);
}
export function stripAtMentions(content, botWxid) {
    if (!botWxid)
        return content;
    const escaped = botWxid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const truncated = content.length > 4096 ? content.slice(0, 4096) : content;
    return truncated
        .replace(new RegExp(`@${escaped}\\s*`, "g"), "")
        .replace(new RegExp(`\\b${escaped}\\b\\s*`, "g"), "")
        .trim();
}
export function isBotMentionedByText(content, botWxid) {
    if (!botWxid)
        return false;
    if (!content)
        return false;
    if (content.includes(`@${botWxid}`))
        return true;
    if (content.includes(` ${botWxid}`))
        return true;
    return extractAtUserList(content).includes(botWxid);
}
import { stripGroupContentPrefix } from "../../send/quote-reply.js";
export function cleanGroupMessage(content, botWxid) {
    if (!content)
        return content;
    const noSender = stripGroupContentPrefix(content) ?? content;
    const noAt = stripAtMentions(noSender, botWxid);
    return noAt;
}
