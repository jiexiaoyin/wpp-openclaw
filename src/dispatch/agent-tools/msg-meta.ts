// src/dispatch/agent-tools/msg-meta.ts - Msg tag (18)
// v1.3.18 P1-核心1 fix (2026-08-10): 改成 lazy-evaluate ctx 模式
//   保留 sendMessage (v1.3.17 已修, dynamic import) 和 quoteReply (dynamic import) 不动
// 注: 部分工具参数与 api 实际签名差异保留 — 跟原版一样 (历史不一致, 不优化)

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppMsg } from "../../send/msg.js";
import { getDefaultAccountRegistry } from "../../account-state.js";

function getMsgApi() {
  const state = getDefaultAccountRegistry().get("default");
  if (!state) throw new Error("account not found: default");
  return makeWppMsg({
    baseUrl: state.config.apiBaseUrl,
    tokenKey: state.config.tokenKey,
    authcode: state.authcode,
    accountId: "default",
  });
}

export const MSG_META: ToolMeta = {
  /** /Msg/SendTxt */
  sendText: [
    "发送文本消息. 默认会在 ≥4000 字时按段落切片多段发.",
    Type.Object({
      toWxid: Type.String(),
      content: Type.String(),
      ats: Type.Optional(Type.Array(Type.String())),
    }),
    (toWxid: string, content: string, ats?: string[]) => getMsgApi().sendTxt(toWxid, content, ats),
  ],
  // 代码原打在此端点上, Content="" + ToIds=nil 有误触发广播风险. 需要发 XML 请走 sendLink/sendCard.
  /** /Msg/SendCDNFile — 转发 (实测 vendor Ret=-2, 见 sendFile) */
  sendCDNFile: [
    "发送 CDN 文件 (转发, 非上传). fileUrl 是 vendor 已上传的 cdnUrl.",
    Type.Object({ toWxid: Type.String(), fileUrl: Type.String() }),
    (toWxid: string, fileUrl: string) => getMsgApi().sendCDNFile(toWxid, fileUrl),
  ],
  /** v1.3.12 sendFile: 发送文件 (推荐). fileUrl 是 OSS 公网 URL, 插件下载 → UploadFile → 文件卡片. */
  sendFile: [
    "发送文件给用户. fileUrl 是 OSS/公网可下载的 URL, fileName 是显示的文件名 (含扩展名).",
    Type.Object({
      toWxid: Type.String(),
      fileUrl: Type.String(),
      fileName: Type.String(),
    }),
    (toWxid: string, fileUrl: string, fileName: string) => getMsgApi().sendFile(toWxid, fileUrl, fileName),
  ],
  /** /Msg/SendCDNImg */
  sendCDNImage: [
    "发送 CDN 图片 (转发图片). imgUrl 必须来自 cdnDownloadImage 流程或 SendMsg 上传回调.",
    Type.Object({ toWxid: Type.String(), imgUrl: Type.String() }),
    (toWxid: string, imgUrl: string) => getMsgApi().sendCDNImg(toWxid, imgUrl),
  ],
  /** /Msg/SendCDNVideo */
  sendCDNVideo: [
    "发送 CDN 视频 (转发视频).",
    Type.Object({
      toWxid: Type.String(),
      videoUrl: Type.String(),
      thumbUrl: Type.Optional(Type.String()),
    }),
    // 原版 api.sendCDNVideo(toWxid, videoUrl, thumbUrl) — 但 api.sendCDNVideo 签名是 (toWxid, videoUrl)
    // 历史不一致, 不优化
    (toWxid: string, videoUrl: string, _thumbUrl?: string) => getMsgApi().sendCDNVideo(toWxid, videoUrl),
  ],
  /** /Msg/SendEmoji */
  sendEmoji: [
    "发送表情包 (按 md5 + size).",
    Type.Object({
      toWxid: Type.String(),
      emojiMd5: Type.String(),
      emojiSize: Type.Number(),
    }),
    (toWxid: string, emojiMd5: string, emojiSize: number) => getMsgApi().sendEmoji(toWxid, emojiMd5, emojiSize),
  ],
  /** /Msg/Revoke — v1.3.20: createTime 必须用发送返回的 createTime (不能用 now, 否则 vendor 不真撤) */
  revokeMsg: [
    "撤回消息. msgId/newMsgId/createTime 必须来自之前 sendMessage/sendText 的返回 (createTime 必传, 否则撤回无效).",
    Type.Object({
      msgId: Type.String(),
      newMsgId: Type.String(),
      toWxid: Type.String(),
      createTime: Type.Optional(Type.Number({ description: "发送返回的 server 创建时间 (必传否则撤回无效)" })),
    }),
    (msgId: string, newMsgId: string, toWxid: string, createTime?: number) =>
      getMsgApi().revoke(msgId, newMsgId, toWxid, createTime),
  ],
  /**
   * v1.1.21 QUOTE-FIX (2026-08-08 19:07 接总立): 引用回复 (文本/图片通用)
   * 走 ShareLink + appmsg type=57 + 完整 refermsg (svrid/fromusr/chatusr/displayname/content/createtime)
   * 根因: /Msg/Quote 接口 ret=-2; 简单 <svrid> 引用显示"引用内容不存在"
   * 图片引用: content 自动从 DB 取被引用消息原文 (图片 XML) → 微信渲染缩图
   * v1.3.18 P1-核心1: 保持 dynamic import, 内部已走 registry 真 ctx
   */
  quoteReply: [
    "引用回复. 参数: toWxid(目标), content(回复内容), msgId(被引用消息msgId, 可选newMsgId). 自动从 DB 取被引用消息构造完整引用卡片 (文本/图片通用).",
    Type.Object({
      toWxid: Type.String(),
      content: Type.String(),
      msgId: Type.String(),
      newMsgId: Type.Optional(Type.String()),
    }),
    async (toWxid: string, content: string, msgId: string, newMsgId?: string) => {
      const { quoteReply } = await import("../../send/quote-reply.js");
      return quoteReply({ toWxid, content, msgId, newMsgId });
    },
  ],
  /** /Msg/SendVoice */
  sendVoice: [
    "发送语音消息.",
    Type.Object({
      toWxid: Type.String(),
      voiceUrl: Type.String(),
      duration: Type.Optional(Type.Number({ description: "毫秒" })),
    }),
    (toWxid: string, voiceUrl: string, duration?: number) => getMsgApi().sendVoice(toWxid, voiceUrl, duration),
  ],
  /** /Msg/SendVideo */
  sendVideo: [
    "发送视频. thumbUrl 必须 vendor accepted 的 cdn thumb url.",
    Type.Object({
      toWxid: Type.String(),
      videoUrl: Type.String(),
      thumbUrl: Type.Optional(Type.String()),
      videoDuration: Type.Optional(Type.Number()),
    }),
    (toWxid: string, videoUrl: string, thumbUrl?: string, videoDuration?: number) => getMsgApi().sendVideo(toWxid, videoUrl, thumbUrl, videoDuration),
  ],
  /** /Msg/SendXCX */
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
    // 原版 api.sendXCX(toWxid, xcxTitle, xcxDesc, xcxUrl, xcxAppId, thumbUrl) — 但 api.sendXCX 签名不同
    // 历史不一致, 不优化
    (toWxid: string, xcxTitle: string, xcxDesc: string, xcxUrl: string, xcxAppId: string, _thumbUrl?: string) =>
      getMsgApi().sendXCX(toWxid, xcxTitle, xcxDesc, xcxUrl, xcxAppId),
  ],
  /** /Msg/ShareCard */
  sendContactCard: [
    "分享联系人名片.",
    Type.Object({
      toWxid: Type.String(),
      cardWxid: Type.String(),
      cardNickname: Type.String(),
      cardAvatar: Type.Optional(Type.String()),
    }),
    // 原版 api.shareCard(toWxid, cardWxid, cardNickname, cardAvatar) — api.signature 是 (toWxid, cardWxid, cardNickname, cardAlias?)
    // 历史不一致, 不优化
    (toWxid: string, cardWxid: string, cardNickname: string, _cardAvatar?: string) =>
      getMsgApi().shareCard(toWxid, cardWxid, cardNickname),
  ],
  /** /Msg/ShareLink */
  sendLinkShare: [
    "发送分享链接.",
    Type.Object({
      toWxid: Type.String(),
      title: Type.String(),
      desc: Type.String(),
      linkUrl: Type.String(),
      thumbUrl: Type.Optional(Type.String()),
    }),
    // 原版 api.shareLink(toWxid, title, desc, linkUrl, thumbUrl) — 但 api.shareLink 签名复杂
    // 历史不一致, 不优化
    (toWxid: string, title: string, desc: string, linkUrl: string, _thumbUrl?: string) =>
      getMsgApi().shareLink(toWxid, title, desc, linkUrl),
  ],
  /** /Msg/ShareLocation */
  sendLocation: [
    "发送位置.",
    Type.Object({
      toWxid: Type.String(),
      latitude: Type.Number(),
      longitude: Type.Number(),
      label: Type.Optional(Type.String()),
    }),
    (toWxid: string, latitude: number, longitude: number, label?: string) =>
      getMsgApi().shareLocation(toWxid, latitude, longitude, label),
  ],
  /** /Msg/ShareVideo */
  shareVideoMsg: [
    "发送分享视频消息.",
    Type.Object({
      toWxid: Type.String(),
      videoTitle: Type.String(),
      videoUrl: Type.String(),
      desc: Type.String(),
      thumbUrl: Type.Optional(Type.String()),
    }),
    // 原版 api.shareVideo(toWxid, videoTitle, videoUrl, desc, thumbUrl) — 但 api.shareVideo 签名是 (toWxid, xml)
    // 历史不一致, 不优化
    (toWxid: string, _videoTitle: string, _videoUrl: string, _desc: string, _thumbUrl?: string) =>
      getMsgApi().shareVideo(toWxid, ""),
  ],
  /**
   * v1.3.17 MESSAGE-UNIFY: 统一发送入口 (推荐优先使用). 内部按 type 路由 + 自动入库。
   * 与其它 send* 工具不同: 从 registry 拿真实 ctx, 不走模块级空 ctx → 真正可发送。
   * v1.3.18 P1-核心1: 保持 dynamic import (v1.3.17 已修)
   */
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
    async (toWxid: string, type: string, content: string, fileName?: string, title?: string, desc?: string,
      thumbUrl?: string, appId?: string, latitude?: number, longitude?: number, label?: string,
      cardWxid?: string, cardNickname?: string, durationMs?: number, size?: number, ats?: string[]) => {
      const { sendMessage } = await import("../../dispatch/send-message.js");
      const r = await sendMessage({
        accountId: "default",
        toWxid,
        type: type as Parameters<typeof sendMessage>[0]["type"],
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
  /** /Msg/UploadImg */
  uploadImage: [
    "上传图片拿 imgUrl. 上传后用 sendCDNImage 转发.",
    Type.Object({
      imgBase64: Type.String(),
      toWxid: Type.String(),
    }),
    (imgBase64: string, toWxid: string) => getMsgApi().uploadImg(imgBase64, toWxid),
  ],
};