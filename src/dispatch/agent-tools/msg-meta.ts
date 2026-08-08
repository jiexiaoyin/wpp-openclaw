// src/dispatch/agent-tools/msg-meta.ts - Msg tag (18)

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppMsg } from "../../send/msg.js";
import type { WppAccountCtx } from "../../send/factory.js";

const ctx: WppAccountCtx = { baseUrl: "", tokenKey: "", accountId: "" };
const api = makeWppMsg(ctx);

export const MSG_META: ToolMeta = {
  /** /Msg/SendTxt */
  sendText: [
    "发送文本消息. 默认会在 ≥4000 字时按段落切片多段发.",
    Type.Object({
      toWxid: Type.String(),
      content: Type.String(),
      ats: Type.Optional(Type.Array(Type.String())),
    }),
    api.sendTxt,
  ],
  // v1.1.17 FULL-FIX (P0-B): sendAppMessage 工具已移除 — /Msg/SendApp 是「群发消息」端点
  // 代码原打在此端点上, Content="" + ToIds=nil 有误触发广播风险. 需要发 XML 请走 sendLink/sendCard.
  /** /Msg/SendCDNFile */
  sendCDNFile: [
    "发送 CDN 文件 (转发, 非上传). fileUrl 是 vendor 已上传的 cdnUrl.",
    Type.Object({ toWxid: Type.String(), fileUrl: Type.String() }),
    api.sendCDNFile,
  ],
  /** /Msg/SendCDNImg */
  sendCDNImage: [
    "发送 CDN 图片 (转发图片). imgUrl 必须来自 cdnDownloadImage 流程或 SendMsg 上传回调.",
    Type.Object({ toWxid: Type.String(), imgUrl: Type.String() }),
    api.sendCDNImg,
  ],
  /** /Msg/SendCDNVideo */
  sendCDNVideo: [
    "发送 CDN 视频 (转发视频).",
    Type.Object({
      toWxid: Type.String(),
      videoUrl: Type.String(),
      thumbUrl: Type.Optional(Type.String()),
    }),
    api.sendCDNVideo,
  ],
  /** /Msg/SendEmoji */
  sendEmoji: [
    "发送表情包 (按 md5 + size).",
    Type.Object({
      toWxid: Type.String(),
      emojiMd5: Type.String(),
      emojiSize: Type.Number(),
    }),
    api.sendEmoji,
  ],
  /** /Msg/Revoke */
  revokeMsg: [
    "撤回消息. msgId/newMsgId 必须来自之前 send* 调用的返回.",
    Type.Object({
      msgId: Type.String(),
      newMsgId: Type.String(),
      toWxid: Type.String(),
    }),
    api.revoke,
  ],
  /**
   * v1.1.21 QUOTE-FIX (2026-08-08 19:07 接总立): 引用回复 (文本/图片通用)
   * 走 ShareLink + appmsg type=57 + 完整 refermsg (svrid/fromusr/chatusr/displayname/content/createtime)
   * 根因: /Msg/Quote 接口 ret=-2; 简单 <svrid> 引用显示"引用内容不存在"
   * 图片引用: content 自动从 DB 取被引用消息原文 (图片 XML) → 微信渲染缩略图
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
    api.sendVoice,
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
    api.sendVideo,
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
    api.sendXCX,
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
    api.shareCard,
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
    api.shareLink,
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
    api.shareLocation,
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
    api.shareVideo,
  ],
  /** /Msg/UploadImg */
  uploadImage: [
    "上传图片拿 imgUrl. 上传后用 sendCDNImage 转发.",
    Type.Object({
      imgBase64: Type.String(),
      toWxid: Type.String(),
    }),
    api.uploadImg,
  ],
};
