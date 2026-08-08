// src/send/msg.ts - Msg tag (18 endpoints: send text/image/video/voice/file/etc.)

import { postWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx, type Resp } from "./factory.js";

/**
 * v1.1.7: 构造小程序 appmsg XML (vendor SendApp 期望)
 * 公开给 test, 不直接 dispatch
 */
export function buildAppMsgXml(
  username: string,
  title: string,
  desc: string,
  mmPayload: Record<string, unknown>,
): string {
  const mmXml = Object.entries(mmPayload)
    .map(([k, v]) => `<${k}>${escapeXml(String(v))}</${k}>`)
    .join("");
  return (
    `<appmsg appid="" sdkver="0">` +
    `<title>${escapeXml(title)}</title>` +
    `<des>${escapeXml(desc)}</des>` +
    `<action>webview</action>` +
    `<type>2001</type>` + // 2001 = 小程序
    `<showtype>0</showtype>` +
    `<content/>` +
    `<url/>` +
    `<lowurl/>` +
    `<dataurl/>` +
    `<lowdataurl/>` +
    `<appattach/>` +
    `<mmapp>${mmXml}</mmapp>` +
    `<fromusername>${escapeXml(username)}</fromusername>` +
    `</appmsg>`
  );
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function makeWppMsg(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /**
     * v1.1.21 QUOTE-FIX (2026-08-08 19:07 接总立): 引用回复走 ShareLink + appmsg type=57 完整 refermsg
     * 根因: /Msg/Quote 接口 ret=-2 (vendor 实现问题); 简单 <svrid> 引用显示"引用内容不存在"
     * 正确: 完整 refermsg (svrid + fromusr + chatusr + displayname + content + createtime)
     *   content 放被引用消息原文 — 文本=原文, 图片=图片完整 XML (微信自动渲染缩略图)
     */
    quoteXml: (toWxid: string, xml: string) =>
      dispatch("/Msg/ShareLink", { ToWxid: toWxid, Type: 5, Xml: xml }),

    /** /Msg/Quote — 引用文本消息 (兼容保留) */
    quote: (msgId: string, toWxid: string, content: string) =>
      dispatch("/Msg/Quote", { msgId, toWxid, content }),

    /** /Msg/Revoke — 撤回消息 */
    // v1.1.17 FULL-FIX (P1-9): swagger RevokeMsgParamDoc = { ClientMsgId, NewMsgId, CreateTime, ToUserName }
    revoke: (msgId: string, newMsgId: string, toWxid: string) =>
      dispatch("/Msg/Revoke", {
        ClientMsgId: msgId,
        NewMsgId: newMsgId,
        CreateTime: Math.floor(Date.now() / 1000),
        ToUserName: toWxid,
      }),

    /** v1.1.17 FULL-FIX (P0-B): /Msg/SendApp 是群发消息端点, 不能用. 发 XML 用 /Msg/ShareLink (SendAppMsgParamDoc) */
    sendApp: (toWxid: string, xml: string, _appName?: string) =>
      dispatch("/Msg/ShareLink", { ToWxid: toWxid, Type: 5, Xml: xml }),

    /** /Msg/SendCDNFile — 发送 CDN 文件(转发) */
    sendCDNFile: (toWxid: string, fileUrl: string) =>
      dispatch("/Msg/SendCDNFile", { toWxid, fileUrl }),

    /** /Msg/SendCDNImg — 发送 CDN 图片 */
    sendCDNImg: (toWxid: string, imgUrl: string) =>
      dispatch("/Msg/SendCDNImg", { toWxid, imgUrl }),

    /** /Msg/SendCDNVideo — 发送 CDN 视频 */
    sendCDNVideo: (toWxid: string, videoUrl: string, thumbUrl?: string) =>
      dispatch("/Msg/SendCDNVideo", { toWxid, videoUrl, thumbUrl: thumbUrl ?? "" }),

    /** /Msg/SendEmoji — 发送 Emoji */
    sendEmoji: (toWxid: string, emojiMd5: string, emojiSize: number) =>
      dispatch("/Msg/SendEmoji", { toWxid, emojiMd5, emojiSize }),

    /** v1.1.7: /Msg/SendApp — 发送小程序卡片 (mini-program)
     *  小程序需要特定 XML 格式 (含 appid/title/desc/pagePath 等)
     *  vendor 期望 base64 编码的 mm_appmsg JSON
     *  参考 WeChat 公开协议: 客户端调用 addContact 后会拿到 username, 再用 SendApp
     */
    sendMiniProgram: (
      toWxid: string,
      mini: {
        appid: string;
        username: string;       // 小程序 gh_xxxxx
        title: string;
        description: string;
        thumbUrl: string;       // 缩略图 URL
        pagePath: string;       // 小程序页面路径
        version: "release" | "trial" | "develop";
      },
    ) => {
      // 构建 mm_appmsg payload
      const mmAppMsg = {
        app_brand_id: mini.appid,
        pkg_name: "com.tencent.mm",
        app_icon_url: mini.thumbUrl,
        jsapi_page_path: mini.pagePath,
        app_name: mini.title,
        app_description: mini.description,
        app_version: mini.version,
        miniprogram_state: "formal",
      };
      const xml = buildAppMsgXml(mini.username, mini.title, mini.description, mmAppMsg);
      return dispatch("/Msg/SendApp", { toWxid, xml, appName: mini.title });
    },

    /** v1.1.7: /Msg/SendApp 内部: 构造小程序 XML (包装)
     *  vendor 期望 <appmsg> 节点, type=2001 (mini-program) + <mmapp> 节点
     */
    sendAppFromXml: (toWxid: string, xml: string, _appName?: string) =>
      dispatch("/Msg/ShareLink", { ToWxid: toWxid, Type: 5, Xml: xml }),

    /** /Msg/SendTxt — 发送文本 */
    // v1.1.17 FULL-FIX (P0-A): swagger 要 { At: 逗号串, Content, ToWxid, Type: 1 }
    sendTxt: (toWxid: string, content: string, ats?: string[]) =>
      dispatch("/Msg/SendTxt", { ToWxid: toWxid, Content: content, At: (ats ?? []).join(","), Type: 1 }),

    /** /Msg/SendVideo — 发送视频 */
    sendVideo: (toWxid: string, videoUrl: string, thumbUrl?: string, videoDuration?: number) =>
      dispatch("/Msg/SendVideo", {
        toWxid,
        videoUrl,
        thumbUrl: thumbUrl ?? "",
        videoDuration: videoDuration ?? 0,
      }),

    /** /Msg/SendVoice — 发送语音 */
    sendVoice: (toWxid: string, voiceUrl: string, duration?: number) =>
      dispatch("/Msg/SendVoice", { toWxid, voiceUrl, duration: duration ?? 0 }),

    /** /Msg/SendXCX — 发送小程序消息 */
    sendXCX: (
      toWxid: string,
      xcxTitle: string,
      xcxDesc: string,
      xcxUrl: string,
      xcxAppId: string,
      thumbUrl?: string,
    ) =>
      dispatch("/Msg/SendXCX", {
        toWxid,
        xcxTitle,
        xcxDesc,
        xcxUrl,
        xcxAppId,
        thumbUrl: thumbUrl ?? "",
      }),

    /** /Msg/ShareCard — 分享名片 */
    shareCard: (toWxid: string, cardWxid: string, cardNickname: string, cardAvatar?: string) =>
      dispatch("/Msg/ShareCard", {
        toWxid,
        cardWxid,
        cardNickname,
        cardAvatar: cardAvatar ?? "",
      }),

    /** /Msg/ShareLink — 分享链接 */
    shareLink: (
      toWxid: string,
      title: string,
      desc: string,
      linkUrl: string,
      thumbUrl?: string,
    ) =>
      dispatch("/Msg/ShareLink", {
        toWxid,
        title,
        desc,
        linkUrl,
        thumbUrl: thumbUrl ?? "",
      }),

    /** /Msg/ShareLocation — 分享位置 */
    shareLocation: (toWxid: string, latitude: number, longitude: number, label?: string) =>
      dispatch("/Msg/ShareLocation", {
        toWxid,
        latitude,
        longitude,
        label: label ?? "",
      }),

    /** /Msg/ShareVideo — 分享视频消息 */
    shareVideo: (toWxid: string, videoTitle: string, videoUrl: string, desc: string, thumbUrl?: string) =>
      dispatch("/Msg/ShareVideo", {
        toWxid,
        videoTitle,
        videoUrl,
        desc,
        thumbUrl: thumbUrl ?? "",
      }),

    /** /Msg/StartAutoSync — 启动自动同步 */
    startAutoSync: (intervalMs?: number) =>
      dispatch("/Msg/StartAutoSync", { intervalMs: intervalMs ?? 30000 }),

    /** /Msg/Sync — 同步消息 */
    // v1.1.11 P0-N1: vendor body schema = Msg.SyncParamDoc (Scene=0, Synckey="")
    sync: () => dispatch("/Msg/Sync", { Scene: 0, Synckey: "" }),

    /** /Msg/UploadImg — 上传图片(返回 imgUrl 后用于 SendImg) */
    uploadImg: (imgBase64: string, toWxid: string): Resp =>
      postWppJson<{ imgUrl?: string; msgId?: string; newMsgId?: string }>(
        ctx.baseUrl,
        "/Msg/UploadImg",
        { imgBase64, toWxid },
        opts,
      ),
  };
}

export type WppMsgApi = ReturnType<typeof makeWppMsg>;
