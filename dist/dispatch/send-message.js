// src/dispatch/send-message.ts - v1.3.17 MESSAGE-UNIFY 统一发送入口
// 老板拍板: "让发送各种类型消息都能完美适配 message 方式, 以便以后网关各种调用"
// 网关/AI/外部 API 各种调用统一走 sendMessage(), 内部按 type 路由到正确发送实现, 自动入库 (v1.3.16 OUTBOUND-PERSIST)。
//
// 路由策略:
//   text/image/video/voice → outbound.ts (api-client + persistOutbound, 已入库, 处理 chunk/base64/thumb)
//   file/link/card/location/miniprogram/emoji → send/msg.ts makeWppMsg (真实 ctx, dispatch 收口自动入库)
//
// 统一返回 { ok, msgId, error } — 各实现返回格式归一化。
import { sendText, sendImage, sendVoice, sendVideo } from "./outbound.js";
import { makeWppMsg } from "../send/msg.js";
import { getDefaultAccountRegistry } from "../account-state.js";
/**
 * v1.3.38: 从 attachments 数组解析媒体 (att.media/path/url 优先 + 老字段 fallback).
 * 仿 gewe resolveMediaFromAttachment.
 */
export function resolveMediaFromAttachments(attachments, content, fileName) {
    const att = Array.isArray(attachments) ? attachments[0] : null;
    return {
        mediaUrl: att?.media ?? att?.path ?? att?.url ?? content ?? "",
        attName: att?.name ?? fileName ?? "",
        mimeType: att?.mimeType ?? "",
    };
}
/**
 * v1.3.57 P1-1 (2026-08-13 交付审阅): vendor 成功判据统一 — Code=0/200 只是 HTTP 层,
 * 真正成功看 Data.BaseResponse.ret===0 (与 outbound.ts isSendOk 一致, 防 file/link 等 5 类
 * 在 vendor 返 Code=0+ret=-2 时误报成功)。
 */
function isVendorOk(resp) {
    if (resp.Code !== 0 && resp.Code !== 200)
        return false;
    const baseRet = resp.Data?.BaseResponse?.ret;
    return baseRet === 0 || baseRet === undefined;
}
/** WppApiResponse → 统一 SendResult (msg 域工具返回格式归一化) */
export function normalizeSendResp(resp) {
    const ok = isVendorOk(resp);
    const d = (resp.Data ?? {});
    return {
        ok,
        msgId: d.msgId != null ? String(d.msgId) : undefined,
        error: ok ? undefined : `vendor Code=${resp.Code} ${resp.CodeValue ?? ""}`.trim(),
    };
}
/** 从 registry 构造 makeWppMsg 真实 ctx (msg 域工具需要真实 baseUrl/tokenKey) */
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
/**
 * 统一发送入口: 按 type 路由到对应发送实现, 统一返回 {ok, msgId, error}。
 * 所有成功发送自动入库 (text/image/video/voice 走 outbound persistOutbound;
 * file/link/card/location/miniprogram/emoji 走 makeWppMsg dispatch 收口 v1.3.16)。
 */
export async function sendMessage(p) {
    const { accountId, toWxid, type } = p;
    // v1.3.38 ATTACHMENTS (借鉴 gewe): attachments 数组优先 (AI message 工具传 media/path/url)
    //   媒体类型 (image/video/voice/file) 用 att 的 media/path/url 作媒体 URL, 老 content fallback
    const { mediaUrl, attName } = resolveMediaFromAttachments(p.attachments, p.content, p.fileName);
    const mediaContent = mediaUrl || p.content || "";
    // 统一 msgId 为 string (msg 域 normalizeSendResp 已 String(); outbound 返回原样可能 number)
    const s = (v) => v != null ? String(v) : undefined;
    switch (type) {
        case "text": {
            const r = await sendText(accountId, toWxid, p.content ?? "", p.ats);
            // v1.3.20 REVOKE-FIX: 透传 newMsgId + createTime (撤回需要, CreateTime 必须用 server time)
            return { ok: r.ok, msgId: s(r.msgId), newMsgId: s(r.newMsgId), createTime: r.createTime, error: r.error };
        }
        case "image": {
            const r = await sendImage(accountId, toWxid, mediaContent);
            return { ok: r.ok, msgId: s(r.msgId), newMsgId: s(r.newMsgId), createTime: r.createTime, error: r.error };
        }
        case "voice": {
            // ============================================================
            // v1.3.52 SILK-ONLY (2026-08-12): vendor /Msg/SendVoice 只收 silk (Type=4)。
            //   send/msg.ts sendVoice 已是唯一收口: silk 输入直接透传, mp3/其它强制转码,
            //   Type 恒=4。formatHint 现在仅作 silk 识别提示 (不再映射 Type)。
            //   - .silk URL / data:audio/silk → "silk" (透传)
            //   - .mp3 URL / 其它 → "mp3" (会经 SILK-ENCODER 转码, 不是直发 mp3)
            // ============================================================
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
//# sourceMappingURL=send-message.js.map