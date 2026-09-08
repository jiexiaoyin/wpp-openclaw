// src/inbound/parser/content.ts - 按 msgType 提取 content 文本
import { safeMatch, isCatastrophicRegex } from "../../core/safe-regex.js";
/** 群消息 group prefix 剥离: ":\n<sender nickname>:\n<content>" → "<content>" */
export function stripGroupPrefix(content) {
    if (!content)
        return "";
    // 用 safeMatch 截断防 ReDoS (原 regex 含嵌套排除类, 极端输入 O(n²) — gewe 实测 1000 字符 hang)
    const re = /^[^:\n]+:\n[^:\n]+:\n([\s\S]*)$/;
    if (isCatastrophicRegex(re))
        return content; // 防御性 fallback
    const m = safeMatch(re, content);
    if (m && m[1])
        return m[1].trim();
    return content;
}
/** Vendor 消息 type 数字 → human-readable */
export function describeMsgType(msgType) {
    const map = {
        1: "text",
        3: "image",
        6: "file", // Excel/PDF/Word/zip 等办公文件
        34: "voice",
        43: "video",
        47: "emoji",
        42: "card",
        48: "location",
        49: "app",
        51: "relay", // 群接龙
        53: "chat-history", // 历史教训: 实际是 53 不是 51
        10000: "system",
        10002: "revoke",
    };
    return map[msgType] ?? `unknown(${msgType})`;
}
//# sourceMappingURL=content.js.map