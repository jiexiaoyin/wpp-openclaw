import { parseQuoteXml } from "./parser/quote.js";
import { info, warn } from "../core/logger.js";
import { saveSvridMapping, getSvridByMd5 } from "../db.js";
export function extractQuotedImgMd5(content) {
    if (!content)
        return undefined;
    const m = content.match(/md5="([0-9a-f]{32})"/i);
    return m ? m[1] : undefined;
}
export async function captureQuoteSvrid(msgContent, accountId) {
    if (!msgContent.includes("<refermsg")) {
        return { captured: false };
    }
    const parsed = parseQuoteXml(msgContent);
    if (!parsed?.msgId) {
        return { captured: false };
    }
    const svrid = parsed.msgId;
    const quotedContent = parsed.content;
    const md5 = extractQuotedImgMd5(quotedContent);
    try {
        await saveSvridMapping({
            account_id: accountId,
            svrid,
            msg_md5: md5 ?? null,
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
