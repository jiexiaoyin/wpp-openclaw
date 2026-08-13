import { safeMatch, isCatastrophicRegex } from "../../core/safe-regex.js";
export function stripGroupPrefix(content) {
    if (!content)
        return "";
    const re = /^[^:\n]+:\n[^:\n]+:\n([\s\S]*)$/;
    if (isCatastrophicRegex(re))
        return content;
    const m = safeMatch(re, content);
    if (m && m[1])
        return m[1].trim();
    return content;
}
export function describeMsgType(msgType) {
    const map = {
        1: "text",
        3: "image",
        6: "file",
        34: "voice",
        43: "video",
        47: "emoji",
        42: "card",
        48: "location",
        49: "app",
        51: "relay",
        53: "chat-history",
        10000: "system",
        10002: "revoke",
    };
    return map[msgType] ?? `unknown(${msgType})`;
}
