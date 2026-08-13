import { sendText, sendImage, sendVoice, sendVideo } from "./outbound.js";
import { makeWppMsg } from "../send/msg.js";
import { getDefaultAccountRegistry } from "../account-state.js";
export function resolveMediaFromAttachments(attachments, content, fileName) {
    const att = Array.isArray(attachments) ? attachments[0] : null;
    return {
        mediaUrl: att?.media ?? att?.path ?? att?.url ?? content ?? "",
        attName: att?.name ?? fileName ?? "",
        mimeType: att?.mimeType ?? "",
    };
}
function isVendorOk(resp) {
    if (resp.Code !== 0 && resp.Code !== 200)
        return false;
    const baseRet = resp.Data?.BaseResponse?.ret;
    return baseRet === 0 || baseRet === undefined;
}
export function normalizeSendResp(resp) {
    const ok = isVendorOk(resp);
    const d = (resp.Data ?? {});
    return {
        ok,
        msgId: d.msgId != null ? String(d.msgId) : undefined,
        error: ok ? undefined : `vendor Code=${resp.Code} ${resp.CodeValue ?? ""}`.trim(),
    };
}
function msgApiFor(accountId) {
    const state = getDefaultAccountRegistry().get(accountId);
    if (!state)
        return null;
    return makeWppMsg({
        baseUrl: state.config.apiBaseUrl,
        tokenKey: state.config.tokenKey,
        authcode: state.authcode,
        accountId,
    });
}
async function callMsg(accountId, fn) {
    const api = msgApiFor(accountId);
    if (!api)
        return { ok: false, error: `account not found: ${accountId}` };
    try {
        return normalizeSendResp(await fn(api));
    }
    catch (e) {
        return { ok: false, error: e.message };
    }
}
export async function sendMessage(p) {
    const { accountId, toWxid, type } = p;
    const { mediaUrl, attName } = resolveMediaFromAttachments(p.attachments, p.content, p.fileName);
    const mediaContent = mediaUrl || p.content || "";
    const s = (v) => v != null ? String(v) : undefined;
    switch (type) {
        case "text": {
            const r = await sendText(accountId, toWxid, p.content ?? "", p.ats);
            return { ok: r.ok, msgId: s(r.msgId), newMsgId: s(r.newMsgId), createTime: r.createTime, error: r.error };
        }
        case "image": {
            const r = await sendImage(accountId, toWxid, mediaContent);
            return { ok: r.ok, msgId: s(r.msgId), newMsgId: s(r.newMsgId), createTime: r.createTime, error: r.error };
        }
        case "voice": {
            const voiceUrlNoQuery = (mediaContent.split("?")[0] ?? "").toLowerCase();
            const formatHint = mediaContent.startsWith("data:audio/silk") || voiceUrlNoQuery.endsWith(".silk")
                ? "silk"
                : "mp3";
            const r = await sendVoice(accountId, toWxid, mediaContent, p.durationMs, formatHint);
            return { ok: r.ok, msgId: s(r.msgId), newMsgId: s(r.newMsgId), createTime: r.createTime, error: r.error };
        }
        case "video": {
            const r = await sendVideo(accountId, toWxid, mediaContent, p.thumbUrl);
            return { ok: r.ok, msgId: s(r.msgId), newMsgId: s(r.newMsgId), createTime: r.createTime, error: r.error };
        }
        case "file":
            return callMsg(accountId, (api) => api.sendFile(toWxid, mediaContent, attName || p.fileName || "file"));
        case "link":
            return callMsg(accountId, (api) => api.shareLink(toWxid, p.title ?? "", p.desc ?? "", p.content ?? "", p.thumbUrl));
        case "card":
            return callMsg(accountId, (api) => api.shareCard(toWxid, p.cardWxid ?? "", p.cardNickname ?? ""));
        case "location":
            return callMsg(accountId, (api) => api.shareLocation(toWxid, p.latitude ?? 0, p.longitude ?? 0, p.label));
        case "miniprogram":
            return callMsg(accountId, (api) => api.sendXCX(toWxid, p.title ?? "", p.desc ?? "", p.content ?? "", p.appId ?? "", p.thumbUrl));
        case "emoji":
            return callMsg(accountId, (api) => api.sendEmoji(toWxid, p.content ?? "", p.size ?? 0));
        default:
            return { ok: false, error: `unsupported type: ${type}` };
    }
}
