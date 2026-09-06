// src/inbound/quote-svrid.ts - 引用消息 svrid 捕获 (v1.1.24)
// 2026-08-08 19:39 接总立验证成功: 真实 svrid (从引用消息 refermsg) + 完整图片 XML → 能定位 + 缩略图
// 核心: 微信 svrid 无法主动获取 (vendor 不提供), 只能从"别人引用该消息"的 refermsg.svrid 被动捕获
// 捕获后存 DB 映射 (md5 → svrid), AI 引用时优先查真实 svrid
import { parseQuoteXml } from "./parser/quote.js";
import { info, warn } from "../core/logger.js";
import { saveSvridMapping, getSvridByMd5 } from "../db.js";
/**
 * 从引用消息 content 里提取被引用图片的 md5
 * refermsg.content 是被引用消息原文 — 图片时含 <img ... md5="...">
 */
export function extractQuotedImgMd5(content) {
    if (!content)
        return undefined;
    const m = content.match(/md5="([0-9a-f]{32})"/i);
    return m ? m[1] : undefined;
}
/**
 * 捕获引用消息的 svrid → 存 DB 映射
 * 被引用消息 (refermsg.content) 的 md5 → svrid 关联
 * @param msgContent 收到的引用消息完整 content (含 refermsg)
 * @param accountId 账号
 */
export async function captureQuoteSvrid(msgContent, accountId) {
    if (!msgContent.includes("<refermsg")) {
        return { captured: false };
    }
    const parsed = parseQuoteXml(msgContent);
    if (!parsed?.msgId) {
        return { captured: false };
    }
    const svrid = parsed.msgId;
    // 被引用内容: 图片 → md5; 文本 → 无 md5
    const quotedContent = parsed.content;
    const md5 = extractQuotedImgMd5(quotedContent);
    try {
        // 存映射 (md5 → svrid); 文本消息 md5 为 null, 用 content hash 兜底
        await saveSvridMapping({
            account_id: accountId,
            svrid,
            msg_md5: md5 ?? null,
            // 被引用消息的 new_msg_id 可作关联线索 (如有)
            quoted_content_hash: quotedContent ? simpleHash(quotedContent.slice(0, 200)) : null,
            captured_at: Math.floor(Date.now() / 1000),
        });
        info(`[WPP v1.3.74] quote svrid captured: svrid=${svrid} md5=${md5 ?? "(text)"} (account=${accountId})`);
        return { svrid, md5: md5 ?? undefined, captured: true };
    }
    catch (e) {
        warn(`[WPP v1.3.74] quote svrid capture failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
        return { svrid, md5: md5 ?? undefined, captured: false };
    }
}
function simpleHash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h << 5) - h + s.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h).toString(36);
}
/**
 * 查真实 svrid: 优先 md5 映射, fallback 被引用消息的 new_msg_id
 * @param msgId 被引用消息 msg_id (DB 查询)
 * @param newMsgId 被引用消息 new_msg_id
 * @param content 被引用消息 content (含 md5 的话)
 * @param accountId 账号
 */
export async function resolveQuoteSvrid(msgId, newMsgId, content, accountId) {
    const md5 = extractQuotedImgMd5(content);
    if (md5) {
        const svrid = await getSvridByMd5(md5, accountId);
        if (svrid) {
            info(`[WPP v1.3.74] svrid resolved via md5: ${svrid} (md5=${md5})`);
            return svrid;
        }
    }
    if (newMsgId) {
        return newMsgId;
    }
    return msgId;
}
//# sourceMappingURL=quote-svrid.js.map