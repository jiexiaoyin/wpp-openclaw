import { Type } from "typebox";
import { makeWppMsg } from "../../send/msg.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";
function getMsgApi() {
    const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
    if (!state)
        throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
    return makeWppMsg({
        baseUrl: state.config.apiBaseUrl,
        tokenKey: state.config.tokenKey,
        authcode: state.authcode,
        accountId: getCurrentAccountId() ?? "default",
    });
}
export const MSG_META = {
    sendText: [
        "发送文本消息. 默认会在 ≥4000 字时按段落切片多段发.",
        Type.Object({
            toWxid: Type.String(),
            content: Type.String(),
            ats: Type.Optional(Type.Array(Type.String())),
        }),
        (toWxid, content, ats) => getMsgApi().sendTxt(toWxid, content, ats),
    ],
    sendCDNFile: [
        "发送 CDN 文件 (转发, 非上传). fileUrl 是 vendor 已上传的 cdnUrl.",
        Type.Object({ toWxid: Type.String(), fileUrl: Type.String() }),
        (toWxid, fileUrl) => getMsgApi().sendCDNFile(toWxid, fileUrl),
    ],
    sendFile: [
        "发送文件给用户. fileUrl 是 OSS/公网可下载的 URL, fileName 是显示的文件名 (含扩展名).",
        Type.Object({
            toWxid: Type.String(),
            fileUrl: Type.String(),
            fileName: Type.String(),
        }),
        (toWxid, fileUrl, fileName) => getMsgApi().sendFile(toWxid, fileUrl, fileName),
    ],
    sendCDNImage: [
        "发送 CDN 图片 (转发图片). imgUrl 必须来自 cdnDownloadImage 流程或 SendMsg 上传回调.",
        Type.Object({ toWxid: Type.String(), imgUrl: Type.String() }),
        (toWxid, imgUrl) => getMsgApi().sendCDNImg(toWxid, imgUrl),
    ],
    sendCDNVideo: [
        "发送 CDN 视频 (转发视频).",
        Type.Object({
            toWxid: Type.String(),
            videoUrl: Type.String(),
            thumbUrl: Type.Optional(Type.String()),
        }),
        (toWxid, videoUrl, _thumbUrl) => getMsgApi().sendCDNVideo(toWxid, videoUrl),
    ],
    sendEmoji: [
        "发送表情包 (按 md5 + size).",
        Type.Object({
            toWxid: Type.String(),
            emojiMd5: Type.String(),
            emojiSize: Type.Number(),
        }),
        (toWxid, emojiMd5, emojiSize) => getMsgApi().sendEmoji(toWxid, emojiMd5, emojiSize),
    ],
    revokeMsg: [
        "撤回消息. msgId/newMsgId/createTime 必须来自之前 sendMessage/sendText 的返回 (createTime 必传, 否则撤回无效).",
        Type.Object({
            msgId: Type.String(),
            newMsgId: Type.String(),
            toWxid: Type.String(),
            createTime: Type.Optional(Type.Number({ description: "发送返回的 server 创建时间 (必传否则撤回无效)" })),
        }),
        (msgId, newMsgId, toWxid, createTime) => getMsgApi().revoke(msgId, newMsgId, toWxid, createTime),
    ],
    quoteReply: [
        "引用回复. 参数: toWxid(目标), content(回复内容), msgId(被引用消息msgId, 可选newMsgId). 自动从 DB 取被引用消息构造完整引用卡片 (文本/图片通用).",
        Type.Object({
            toWxid: Type.String(),
            content: Type.String(),
            msgId: Type.String(),
            newMsgId: Type.Optional(Type.String()),
        }),
        async (toWxid, content, msgId, newMsgId) => {
            const { quoteReply } = await import("../../send/quote-reply.js");
            return quoteReply({ toWxid, content, msgId, newMsgId });
        },
    ],
    sendVoice: [
        "发送语音消息.",
        Type.Object({
            toWxid: Type.String(),
            voiceUrl: Type.String(),
            duration: Type.Optional(Type.Number({ description: "毫秒" })),
        }),
        (toWxid, voiceUrl, duration) => getMsgApi().sendVoice(toWxid, voiceUrl, duration),
    ],
    sendVideo: [
        "发送视频. thumbUrl 必须 vendor accepted 的 cdn thumb url.",
        Type.Object({
            toWxid: Type.String(),
            videoUrl: Type.String(),
            thumbUrl: Type.Optional(Type.String()),
            videoDuration: Type.Optional(Type.Number()),
        }),
        (toWxid, videoUrl, thumbUrl, videoDuration) => getMsgApi().sendVideo(toWxid, videoUrl, thumbUrl, videoDuration),
    ],
    sendMiniProgram: [
        "发送小程序卡片.",
        Type.Object({
            toWxid: Type.String(),
            xcxTitle: Type.String(),
            xcxDesc: Type.String(),
            xcxUrl: Type.String(),
            xcxAppId: Type.String(),
            thumbUrl: Type.Optional(Type.String()),
        }),
        (toWxid, xcxTitle, xcxDesc, xcxUrl, xcxAppId, _thumbUrl) => getMsgApi().sendXCX(toWxid, xcxTitle, xcxDesc, xcxUrl, xcxAppId),
    ],
    sendContactCard: [
        "分享联系人名片.",
        Type.Object({
            toWxid: Type.String(),
            cardWxid: Type.String(),
            cardNickname: Type.String(),
            cardAvatar: Type.Optional(Type.String()),
        }),
        (toWxid, cardWxid, cardNickname, _cardAvatar) => getMsgApi().shareCard(toWxid, cardWxid, cardNickname),
    ],
    sendLinkShare: [
        "发送分享链接.",
        Type.Object({
            toWxid: Type.String(),
            title: Type.String(),
            desc: Type.String(),
            linkUrl: Type.String(),
            thumbUrl: Type.Optional(Type.String()),
        }),
        (toWxid, title, desc, linkUrl, _thumbUrl) => getMsgApi().shareLink(toWxid, title, desc, linkUrl),
    ],
    sendLocation: [
        "发送位置.",
        Type.Object({
            toWxid: Type.String(),
            latitude: Type.Number(),
            longitude: Type.Number(),
            label: Type.Optional(Type.String()),
        }),
        (toWxid, latitude, longitude, label) => getMsgApi().shareLocation(toWxid, latitude, longitude, label),
    ],
    shareVideoMsg: [
        "发送分享视频消息.",
        Type.Object({
            toWxid: Type.String(),
            videoTitle: Type.String(),
            videoUrl: Type.String(),
            desc: Type.String(),
            thumbUrl: Type.Optional(Type.String()),
        }),
        (toWxid, _videoTitle, _videoUrl, _desc, _thumbUrl) => getMsgApi().shareVideo(toWxid, ""),
    ],
    sendMessage: [
        "统一发送消息. toWxid 目标(群id或对方wxid), type 类型(text/image/video/voice/file/link/card/location/miniprogram/emoji), content 内容或URL. 文本用 content 正文; 图片/视频/语音/文件用 content 填 OSS/公网URL; 链接用 title+desc+content(URL); 名片用 cardWxid+cardNickname; 位置用 latitude+longitude+label. 推荐优先用此工具.",
        Type.Object({
            toWxid: Type.String(),
            type: Type.String({ description: "text/image/video/voice/file/link/card/location/miniprogram/emoji" }),
            content: Type.String({ description: "正文(文本) 或 URL(媒体/文件/链接)" }),
            fileName: Type.Optional(Type.String({ description: "file: 文件名含扩展名" })),
            title: Type.Optional(Type.String({ description: "link/miniprogram: 标题" })),
            desc: Type.Optional(Type.String({ description: "link/miniprogram: 描述" })),
            thumbUrl: Type.Optional(Type.String({ description: "image/video/link: 缩略图URL" })),
            appId: Type.Optional(Type.String({ description: "miniprogram: 小程序appId" })),
            latitude: Type.Optional(Type.Number({ description: "location: 纬度" })),
            longitude: Type.Optional(Type.Number({ description: "location: 经度" })),
            label: Type.Optional(Type.String({ description: "location: 位置标签" })),
            cardWxid: Type.Optional(Type.String({ description: "card: 名片wxid" })),
            cardNickname: Type.Optional(Type.String({ description: "card: 名片昵称" })),
            durationMs: Type.Optional(Type.Number({ description: "voice/video: 时长毫秒" })),
            size: Type.Optional(Type.Number({ description: "emoji: 大小字节" })),
            ats: Type.Optional(Type.Array(Type.String(), { description: "text: 群@ wxid列表" })),
        }),
        async (toWxid, type, content, fileName, title, desc, thumbUrl, appId, latitude, longitude, label, cardWxid, cardNickname, durationMs, size, ats) => {
            const { sendMessage } = await import("../../dispatch/send-message.js");
            const r = await sendMessage({
                accountId: getCurrentAccountId() ?? "default",
                toWxid,
                type: type,
                content,
                fileName, title, desc, thumbUrl, appId,
                latitude, longitude, label,
                cardWxid, cardNickname,
                durationMs, size, ats,
            });
            return r.ok
                ? JSON.stringify({ ok: true, msgId: r.msgId, newMsgId: r.newMsgId, createTime: r.createTime })
                : `发送失败: ${r.error}`;
        },
    ],
    uploadImage: [
        "上传图片拿 imgUrl. 上传后用 sendCDNImage 转发.",
        Type.Object({
            imgBase64: Type.String(),
            toWxid: Type.String(),
        }),
        (imgBase64, toWxid) => getMsgApi().uploadImg(imgBase64, toWxid),
    ],
    sendGroupMassMsgText: [
        "群发文本消息到多个群 (ToIds=群 wxid 数组).",
        Type.Object({
            toIds: Type.Array(Type.String()),
            content: Type.String(),
        }),
        (toIds, content) => getMsgApi().sendGroupMassMsgText(toIds, content),
    ],
    sendFileV2: [
        "发送文件 (文件名 + base64 内容). 自动上传并发送.",
        Type.Object({
            toWxid: Type.String(),
            fileName: Type.String(),
            base64: Type.String(),
        }),
        (toWxid, fileName, base64) => getMsgApi().sendFileV2(toWxid, fileName, base64),
    ],
    sendAppMessage: [
        "发送结构化应用卡片 (链接/小程序/音乐/文件). items 数组, 单次最多 20 项.",
        Type.Object({
            items: Type.Array(Type.Unknown()),
        }),
        (items) => getMsgApi().sendAppMessage(items),
    ],
};
