import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
import { saveMessage } from "../db.js";
import { info, warn, formatErr } from "../core/logger.js";
import { safeFetchWithCap } from "../util/safe-fetch.js";
import { resolveImageToBase64 } from "../api/resolve-media.js";
const OUTBOUND_MSG_TYPES = {
    "/Msg/SendTxt": "text",
    "/Msg/SendCDNImg": "image",
    "/Msg/UploadImg": "image",
    "/Msg/SendCDNVideo": "video",
    "/Msg/SendVideo": "video",
    "/Msg/ShareVideo": "video",
    "/Msg/SendVoice": "voice",
    "/Msg/SendCDNFile": "file",
    "/Msg/SendEmoji": "emoji",
    "/Msg/ShareCard": "card",
    "/Msg/ShareLink": "link",
    "/Msg/ShareLocation": "location",
    "/Msg/SendXCX": "miniprogram",
};
function extractXmlTitle(xml) {
    if (typeof xml !== "string")
        return "";
    const m = xml.match(/<title>([\s\S]*?)<\/title>/);
    return m?.[1]?.trim() ?? "";
}
function outboundContentFor(ep, body) {
    switch (ep) {
        case "/Msg/SendTxt": return String(body.Content ?? "");
        case "/Msg/SendCDNImg": return `[图片] ${body.Content ?? ""}`;
        case "/Msg/UploadImg": return "[图片]";
        case "/Msg/SendCDNVideo": return `[视频] ${body.Content ?? ""}`;
        case "/Msg/SendVideo": return "[视频]";
        case "/Msg/ShareVideo": return "[视频]";
        case "/Msg/SendVoice": return "[语音]";
        case "/Msg/SendCDNFile": return `[文件] ${body.fileUrl ?? ""}`;
        case "/Msg/SendEmoji": return `[表情] ${body.emojiMd5 ?? ""}`;
        case "/Msg/ShareCard": return `[名片] ${body.CardNickName ?? ""}`;
        case "/Msg/ShareLink": return `[链接] ${extractXmlTitle(body.Xml)}`;
        case "/Msg/ShareLocation": return `[位置] ${body.Label ?? body.Poiname ?? ""}`;
        case "/Msg/SendXCX": return `[小程序] ${body.xcxTitle ?? ""}`;
        default: return "";
    }
}
export function extractOutboundMsgIds(resp) {
    const d = (resp.Data ?? {});
    const list = Array.isArray(d.List) && d.List.length > 0 ? d.List[0] : null;
    const newMsgId = (list?.NewMsgId ?? d.Newmsgid ?? d.newMsgId ?? d.msgId);
    const clientMsgId = (list?.ClientMsgid ?? list?.MsgId ?? d.Msgid ?? d.msgId);
    const createTime = (typeof list?.Createtime === "number" ? list.Createtime : undefined) ??
        (typeof d.CreateTime === "number" ? d.CreateTime : undefined);
    const msgId = clientMsgId ?? newMsgId;
    return {
        msgId: msgId != null ? String(msgId) : undefined,
        newMsgId: newMsgId != null ? String(newMsgId) : undefined,
        clientMsgId: clientMsgId != null ? String(clientMsgId) : undefined,
        createTime,
    };
}
export async function persistOutboundMsg(ctx, opts) {
    try {
        const { toWxid, msgType, content, resp } = opts;
        if (resp.Code !== 0 && resp.Code !== 200)
            return;
        const baseRet = resp.Data?.BaseResponse?.ret;
        if (baseRet !== undefined && baseRet !== 0)
            return;
        const ids = extractOutboundMsgIds(resp);
        await saveMessage({
            account_id: ctx.accountId,
            msg_id: ids.newMsgId ?? ids.msgId ?? null,
            new_msg_id: ids.newMsgId ?? null,
            direction: "outbound",
            peer_kind: toWxid.endsWith("@chatroom") ? "group" : "direct",
            peer_id: toWxid,
            msg_type: msgType,
            content,
            raw_payload: resp.raw,
        });
        info(`[WPP v1.3.16 OUTBOUND-PERSIST] saved outbound msgType=${msgType} to=${toWxid} msgId=${ids.newMsgId ?? ""}`);
    }
    catch (e) {
        warn(`[WPP v1.3.16 OUTBOUND-PERSIST] persist outbound failed (non-fatal): ${formatErr(e)}`);
    }
}
export function outboundMetaFor(ep, body) {
    const msgType = OUTBOUND_MSG_TYPES[ep];
    if (!msgType)
        return null;
    const toWxid = String(body.ToWxid ?? body.toWxid ?? "");
    if (!toWxid)
        return null;
    return { toWxid, msgType, content: outboundContentFor(ep, body) };
}
function buildShareLinkXml(title, desc, linkUrl, thumbUrl) {
    return (`<appmsg>` +
        `<title>${escapeXml(title)}</title>` +
        `<des>${escapeXml(desc)}</des>` +
        `<type>5</type>` +
        `<url>${escapeXml(linkUrl)}</url>` +
        (thumbUrl ? `<thumburl>${escapeXml(thumbUrl)}</thumburl>` : "") +
        `<appattach></appattach>` +
        `</appmsg>`);
}
export function buildAppMsgXml(username, title, desc, mmPayload) {
    const mmXml = Object.entries(mmPayload)
        .map(([k, v]) => `<${k}>${escapeXml(String(v))}</${k}>`)
        .join("");
    return (`<appmsg appid="" sdkver="0">` +
        `<title>${escapeXml(title)}</title>` +
        `<des>${escapeXml(desc)}</des>` +
        `<action>webview</action>` +
        `<type>2001</type>` +
        `<showtype>0</showtype>` +
        `<content/>` +
        `<url/>` +
        `<lowurl/>` +
        `<dataurl/>` +
        `<lowdataurl/>` +
        `<appattach/>` +
        `<mmapp>${mmXml}</mmapp>` +
        `<fromusername>${escapeXml(username)}</fromusername>` +
        `</appmsg>`);
}
function escapeXml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
export function makeWppMsg(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = async (ep, body = {}, persist = true) => {
        const r = await postWppJson(ctx.baseUrl, ep, body, opts);
        if (persist) {
            const meta = outboundMetaFor(ep, body);
            if (meta)
                await persistOutboundMsg(ctx, { ...meta, resp: r });
        }
        return r;
    };
    const sendFileViaAppFromUrl = async (toWxid, fileUrl, fileName) => {
        try {
            const buf = await safeFetchWithCap(fileUrl, { signal: AbortSignal.timeout(60_000) }, 50 * 1024 * 1024);
            if (buf.length === 0)
                return { Code: -2, CodeValue: "EMPTY_FILE", Data: null, raw: null };
            const state = await import("../account-state.js").then((m) => m.getDefaultAccountRegistry().get(ctx.accountId));
            if (!state)
                return { Code: -2, CodeValue: "NO_ACCOUNT", Data: null, raw: null };
            const r = await state.apiClient.sendFileViaApp(toWxid, fileName, buf.toString("base64"), buf.length);
            await persistOutboundMsg(ctx, { toWxid, msgType: "file", content: `[文件] ${fileName} ${fileUrl}`, resp: r });
            return r;
        }
        catch (e) {
            return { Code: -2, CodeValue: "SEND_FAIL", Data: null, raw: null };
        }
    };
    return {
        quoteXml: (toWxid, xml) => dispatch("/Msg/ShareLink", { ToWxid: toWxid, Type: 5, Xml: xml }),
        quote: (msgId, toWxid, content) => dispatch("/Msg/Quote", { msgId, toWxid, content }),
        revoke: (msgId, newMsgId, toWxid, createTime) => dispatch("/Msg/Revoke", {
            ClientMsgId: Number(msgId) || 0,
            NewMsgId: Number(newMsgId),
            CreateTime: createTime ?? Math.floor(Date.now() / 1000),
            ToUserName: toWxid,
        }),
        sendApp: (toWxid, xml, _appName) => dispatch("/Msg/ShareLink", { ToWxid: toWxid, Type: 5, Xml: xml }),
        sendCDNFile: (toWxid, fileUrl) => dispatch("/Msg/SendCDNFile", { toWxid, fileUrl }),
        sendFile: (toWxid, fileUrl, fileName) => sendFileViaAppFromUrl(toWxid, fileUrl, fileName),
        sendCDNImg: (toWxid, imgUrl) => dispatch("/Msg/SendCDNImg", { ToWxid: toWxid, Content: imgUrl }),
        sendImage: async (toWxid, imageUrlOrPath, persist = true) => {
            const Base64 = await resolveImageToBase64(imageUrlOrPath);
            return dispatch("/Msg/UploadImg", { ToWxid: toWxid, Base64 }, persist);
        },
        sendCDNVideo: (toWxid, videoUrl) => dispatch("/Msg/SendCDNVideo", { ToWxid: toWxid, Content: videoUrl }),
        sendEmoji: (toWxid, emojiMd5, emojiSize) => dispatch("/Msg/SendEmoji", { toWxid, emojiMd5, emojiSize }),
        sendAppFromXml: (toWxid, xml, _appName) => dispatch("/Msg/ShareLink", { ToWxid: toWxid, Type: 5, Xml: xml }),
        sendTxt: (toWxid, content, ats, persist = true) => dispatch("/Msg/SendTxt", { ToWxid: toWxid, Content: content, At: (ats ?? []).join(","), Type: 1 }, persist),
        sendVideo: async (toWxid, videoUrl, thumbUrl, playLengthMs, persist = true) => {
            const Base64 = await resolveImageToBase64(videoUrl);
            const ImageBase64 = thumbUrl ? await resolveImageToBase64(thumbUrl) : "";
            return dispatch("/Msg/SendVideo", {
                ToWxid: toWxid,
                Base64,
                ImageBase64,
                PlayLength: playLengthMs ?? 0,
            }, persist);
        },
        sendVoice: async (toWxid, voiceUrl, durationMs, persist = true, formatHint) => {
            const noQuery = (voiceUrl.split("?")[0] ?? "").toLowerCase();
            const isSilkInput = voiceUrl.startsWith("data:audio/silk") || noQuery.endsWith(".silk") || formatHint === "silk";
            let base64;
            let voiceTime = durationMs ?? 0;
            if (isSilkInput) {
                base64 = await resolveImageToBase64(voiceUrl);
            }
            else {
                try {
                    const { encodeMp3ToSilk } = await import("../dispatch/silk-encoder.js");
                    const { silkBuffer, voiceDurationMs } = await encodeMp3ToSilk(voiceUrl);
                    base64 = silkBuffer.toString("base64");
                    voiceTime = durationMs ?? voiceDurationMs;
                }
                catch (e) {
                    warn(`[WPP v1.3.53 VOICE-DEGRADE] silk 转码失败, 降级发文件: ${formatErr(e)}`);
                    const fileName = (voiceUrl.split("?")[0] ?? "").split("/").pop() || "voice.mp3";
                    return sendFileViaAppFromUrl(toWxid, voiceUrl, fileName);
                }
            }
            return dispatch("/Msg/SendVoice", {
                ToWxid: toWxid,
                Base64: base64,
                Type: 4,
                VoiceTime: voiceTime,
            }, persist);
        },
        sendXCX: (toWxid, xcxTitle, xcxDesc, xcxUrl, xcxAppId, thumbUrl) => dispatch("/Msg/SendXCX", {
            toWxid,
            xcxTitle,
            xcxDesc,
            xcxUrl,
            xcxAppId,
            thumbUrl: thumbUrl ?? "",
        }),
        shareCard: (toWxid, cardWxid, cardNickname, cardAlias) => dispatch("/Msg/ShareCard", {
            ToWxid: toWxid,
            CardWxId: cardWxid,
            CardNickName: cardNickname,
            CardAlias: cardAlias ?? "",
        }),
        shareLink: (toWxid, title, desc, linkUrl, thumbUrl) => dispatch("/Msg/ShareLink", {
            ToWxid: toWxid,
            Type: 5,
            Xml: buildShareLinkXml(title, desc, linkUrl, thumbUrl),
        }),
        shareLocation: (toWxid, latitude, longitude, label, poiName) => dispatch("/Msg/ShareLocation", {
            ToWxid: toWxid,
            X: latitude,
            Y: longitude,
            Label: label ?? "",
            Poiname: poiName ?? "",
            Scale: 16,
            Infourl: "",
        }),
        shareVideo: (toWxid, xml) => dispatch("/Msg/ShareVideo", {
            ToWxid: toWxid,
            Xml: xml,
        }),
        startAutoSync: (targetUrl) => dispatch("/Msg/StartAutoSync", { TargetURL: targetUrl }),
        sendGroupMassMsgText: (toIds, content) => dispatch("/Msg/SendGroupMassMsgText", { ToIds: toIds, Content: content }),
        sendFileV2: (toWxid, fileName, base64) => dispatch("/Msg/SendFile", { ToWxid: toWxid, FileName: fileName, Base64: base64 }),
        sendAppMessage: (items) => dispatch("/Msg/SendAppMessage", { items }),
        sync: () => dispatch("/Msg/Sync", { Scene: 0, Synckey: "" }),
        uploadImg: (imgBase64, toWxid) => postWppJson(ctx.baseUrl, "/Msg/UploadImg", { Base64: imgBase64, ToWxid: toWxid }, opts),
    };
}
