// src/send/msg.ts - Msg tag (send text/image/video/voice/file/etc.)

import { postWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx, type Resp } from "./factory.js";
import { saveMessage } from "../db.js";
import { info, warn, formatErr } from "../core/logger.js";
import { safeFetchWithCap } from "../util/safe-fetch.js";
import { resolveImageToBase64 } from "../api/resolve-media.js";
import type { WppApiResponse } from "../api/client.js";

/**
 * v1.3.16 OUTBOUND-PERSIST: 发送到微信的消息统一入库 (老板拍板 "任意渠道发送都要入库, 以便引用 bot 消息")。
 * agent-tools msg 域工具走 makeWppMsg 直接调 vendor, 之前全部未入库 (outbound.ts 走 api-client 已入库)。
 */
const OUTBOUND_MSG_TYPES: Record<string, string> = {
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

/** 从 ShareLink Xml 提取 <title> (入库展示用, 非引用块) */
function extractXmlTitle(xml: unknown): string {
  if (typeof xml !== "string") return "";
  const m = xml.match(/<title>([\s\S]*?)<\/title>/);
  return m?.[1]?.trim() ?? "";
}

/** 从 endpoint + body 提取可读 content 入库 (base64 太长发 [图片]/[视频]/[语音] 标记 + URL) */
function outboundContentFor(ep: string, body: Record<string, unknown>): string {
  switch (ep) {
    case "/Msg/SendTxt": return String(body.Content ?? "");
    case "/Msg/SendCDNImg": return `[图片] ${body.Content ?? ""}`;
    case "/Msg/UploadImg": return "[图片]"; // Base64 太长
    case "/Msg/SendCDNVideo": return `[视频] ${body.Content ?? ""}`;
    case "/Msg/SendVideo": return "[视频]"; // Base64
    case "/Msg/ShareVideo": return "[视频]";
    case "/Msg/SendVoice": return "[语音]"; // Base64
    case "/Msg/SendCDNFile": return `[文件] ${body.fileUrl ?? ""}`;
    case "/Msg/SendEmoji": return `[表情] ${body.emojiMd5 ?? ""}`;
    case "/Msg/ShareCard": return `[名片] ${body.CardNickName ?? ""}`;
    case "/Msg/ShareLink": return `[链接] ${extractXmlTitle(body.Xml)}`;
    case "/Msg/ShareLocation": return `[位置] ${body.Label ?? body.Poiname ?? ""}`;
    case "/Msg/SendXCX": return `[小程序] ${body.xcxTitle ?? ""}`;
    default: return "";
  }
}

/**
 * v1.3.20 REVOKE-FIX: 从 vendor 发送响应提取消息 ID (兼容 Data.List[0] 结构)。
 * 实测 SendTxt 响应: Data.List[0] = { MsgId:0, ClientMsgid, NewMsgId, Createtime, servertime, ... }
 * (顶层 Data.msgId/newMsgId 是 undefined! 插件原用 d.msgId → 拿不到 ID, AI 撤回链路断裂)
 *
 * 返回:
 *   - newMsgId: List[0].NewMsgId (vendor 全局唯一, 撤回定位用)
 *   - clientMsgId: List[0].ClientMsgid ?? MsgId (撤回 ClientMsgId 参数用)
 *   - msgId: 兼容语义 = clientMsgId ?? newMsgId
 *   - createTime: List[0].Createtime (撤回 CreateTime 可用 server 时间)
 */
export function extractOutboundMsgIds(
  resp: WppApiResponse,
): { msgId?: string; newMsgId?: string; clientMsgId?: string; createTime?: number } {
  const d = (resp.Data ?? {}) as Record<string, unknown>;
  const list = Array.isArray(d.List) && d.List.length > 0 ? (d.List[0] as Record<string, unknown>) : null;
  // SendTxt: List[0].NewMsgId / ClientMsgid / Createtime; UploadImg: 顶层 Newmsgid(小写m) / Msgid / CreateTime
  const newMsgId = (list?.NewMsgId ?? d.Newmsgid ?? d.newMsgId ?? d.msgId) as number | string | undefined;
  const clientMsgId = (list?.ClientMsgid ?? list?.MsgId ?? d.Msgid ?? d.msgId) as number | string | undefined;
  const createTime =
    (typeof list?.Createtime === "number" ? (list.Createtime as number) : undefined) ??
    (typeof d.CreateTime === "number" ? (d.CreateTime as number) : undefined);
  const msgId = clientMsgId ?? newMsgId;
  return {
    msgId: msgId != null ? String(msgId) : undefined,
    newMsgId: newMsgId != null ? String(newMsgId) : undefined,
    clientMsgId: clientMsgId != null ? String(clientMsgId) : undefined,
    createTime,
  };
}

/**
 * 统一入库发送消息 (供 dispatch 收口 + sendFile + quote-reply 复用)。
 * 失败 (Code≠0) 不入库 (不留假记录); 入库失败只 warn 不阻塞发送。
 */
export async function persistOutboundMsg(
  ctx: WppAccountCtx,
  opts: { toWxid: string; msgType: string; content: string; resp: WppApiResponse },
): Promise<void> {
  try {
    const { toWxid, msgType, content, resp } = opts;
    // v1.3.59 P0-1 (2026-08-13 完整审阅): Code=0/200 只是 HTTP 层, 真正成功看 BaseResponse.ret===0
    //   否则 file/link 等 vendor 返 Code=0+ret=-2 时写入幽灵 outbound 记录 (污染上下文/引用)
    if (resp.Code !== 0 && resp.Code !== 200) return; // 发送失败不入库
    const baseRet = (resp.Data as { BaseResponse?: { ret?: number } } | undefined)?.BaseResponse?.ret;
    if (baseRet !== undefined && baseRet !== 0) return; // Code=0 但 ret≠0 → 实际失败, 不入库
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
  } catch (e) {
    warn(`[WPP v1.3.16 OUTBOUND-PERSIST] persist outbound failed (non-fatal): ${formatErr(e)}`);
  }
}

/** 端点→入库元数据 (发送类端点 + toWxid + 可读 content); 非发送端点或缺失 toWxid → null */
export function outboundMetaFor(
  ep: string,
  body: Record<string, unknown>,
): { toWxid: string; msgType: string; content: string } | null {
  const msgType = OUTBOUND_MSG_TYPES[ep];
  if (!msgType) return null;
  const toWxid = String(body.ToWxid ?? body.toWxid ?? "");
  if (!toWxid) return null;
  return { toWxid, msgType, content: outboundContentFor(ep, body) };
}

/**
 * v1.2.1 swagger-alignment: /Msg/ShareLink 期望 appmsg XML (SendAppMsgParamDoc {ToWxid, Type, Xml})
 * 分享链接标准 appmsg 结构 (type=5 = 链接卡片)
 */
function buildShareLinkXml(
  title: string,
  desc: string,
  linkUrl: string,
  thumbUrl?: string,
): string {
  return (
    `<appmsg>` +
    `<title>${escapeXml(title)}</title>` +
    `<des>${escapeXml(desc)}</des>` +
    `<type>5</type>` +
    `<url>${escapeXml(linkUrl)}</url>` +
    (thumbUrl ? `<thumburl>${escapeXml(thumbUrl)}</thumburl>` : "") +
    `<appattach></appattach>` +
    `</appmsg>`
  );
}

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
  // (agent-tools 工具走这里; 失败 Code≠0 由 persistOutboundMsg 内部跳过)
  // v1.3.19 UNIFY-SEND: 加 persist 参数 — api-client (shim) 委托时传 false 防双入库,
  //   outbound.ts 的 persistOutbound 负责入库
  const dispatch = async (ep: string, body: Record<string, unknown> = {}, persist = true) => {
    const r = await postWppJson(ctx.baseUrl, ep, body, opts);
    if (persist) {
      const meta = outboundMetaFor(ep, body);
      if (meta) await persistOutboundMsg(ctx, { ...meta, resp: r });
    }
    return r;
  };

  /**
   * v1.3.53 VOICE-DEGRADE: 下载 fileUrl → sendFileViaApp 发文件 (sendFile 复用 + 语音转码失败降级共用)。
   * 返回 WppApiResponse (sendFile 语义), 失败返 Code=-2 + 原因。
   */
  const sendFileViaAppFromUrl = async (toWxid: string, fileUrl: string, fileName: string): Promise<WppApiResponse> => {
    try {
      const buf = await safeFetchWithCap(fileUrl, { signal: AbortSignal.timeout(60_000) }, 50 * 1024 * 1024);
      if (buf.length === 0) return { Code: -2, CodeValue: "EMPTY_FILE", Data: null, raw: null };
      const state = await import("../account-state.js").then((m) => m.getDefaultAccountRegistry().get(ctx.accountId));
      if (!state) return { Code: -2, CodeValue: "NO_ACCOUNT", Data: null, raw: null };
      const r = await state.apiClient.sendFileViaApp(toWxid, fileName, buf.toString("base64"), buf.length);
      await persistOutboundMsg(ctx, { toWxid, msgType: "file", content: `[文件] ${fileName} ${fileUrl}`, resp: r });
      return r;
    } catch (e) {
      return { Code: -2, CodeValue: "SEND_FAIL", Data: null, raw: null };
    }
  };

  return {
    /**
     * 引用回复: ShareLink + appmsg type=57 完整 refermsg (vendor /Msg/Quote ret=-2 不可用;
     * 简单 <svrid> 引用显示"引用内容不存在")
     */
    quoteXml: (toWxid: string, xml: string) =>
      dispatch("/Msg/ShareLink", { ToWxid: toWxid, Type: 5, Xml: xml }),

    /** /Msg/Quote — 引用文本消息 (兼容保留) */
    quote: (msgId: string, toWxid: string, content: string) =>
      dispatch("/Msg/Quote", { msgId, toWxid, content }),

    /** /Msg/Revoke — 撤回消息 (swagger: ClientMsgId/NewMsgId/CreateTime/ToUserName) */
    /**
     * v1.3.20 REVOKE-FIX: RevokeMsgParamDoc 全 integer int64 — vendor Go 反序列化 string 到 int64 失败 (Code=-8 INVALID_ARGUMENT),
     * 必须传 number. NewMsgId 是 19 位大数, Number() 丢精度但 vendor 实测接受 (ret=0, 2026-08-10 实测).
     * CreateTime 必须用消息自己的 server time (createTime 参数, 来自 extractOutboundMsgIds.Createtime);
     *   now 会导致 vendor ret=0 但不真撤 (2026-08-10 老板实测 "撤回now 没撤").
     */
    revoke: (msgId: string, newMsgId: string, toWxid: string, createTime?: number) =>
      dispatch("/Msg/Revoke", {
        ClientMsgId: Number(msgId) || 0,
        NewMsgId: Number(newMsgId),
        CreateTime: createTime ?? Math.floor(Date.now() / 1000),
        ToUserName: toWxid,
      }),

    /** 发 XML 应用消息: /Msg/SendApp 是群发端点不能用, 用 /Msg/ShareLink */
    sendApp: (toWxid: string, xml: string, _appName?: string) =>
      dispatch("/Msg/ShareLink", { ToWxid: toWxid, Type: 5, Xml: xml }),

    /** /Msg/SendCDNFile — 发送 CDN 文件(转发) */
    sendCDNFile: (toWxid: string, fileUrl: string) =>
      dispatch("/Msg/SendCDNFile", { toWxid, fileUrl }),

    /**
     * v1.3.12 sendFile: 发送文件 (推荐). 下载 fileUrl → sendFileViaApp (UploadFile+type6).
     * 实测 SendCDNFile Ret=-2; sendFileViaApp 可发可打开 (有"未审核应用"标签, 方案 C 接受).
     * v1.3.18 P1-安全2 + F4 fix (2026-08-10): safeFetchWithCap (50MB cap + host 白名单),
     *   杜绝裸 fetch + Buffer.toString("base64") 双倍内存 + SSRF (恶意 fileUrl 读内网)
     */
    sendFile: (toWxid: string, fileUrl: string, fileName: string) =>
      sendFileViaAppFromUrl(toWxid, fileUrl, fileName),

    /** /Msg/SendCDNImg — 发送 CDN 图片 (v1.2.1 swagger-alignment: DefaultParamDoc {Content, ToWxid}) */
    sendCDNImg: (toWxid: string, imgUrl: string) =>
      dispatch("/Msg/SendCDNImg", { ToWxid: toWxid, Content: imgUrl }),

    /**
     * v1.3.19 UNIFY-SEND: 发送图片 (URL/base64/本地路径 → base64 → /Msg/UploadImg)。
     * 对齐 api-client 生产验证路径 (SendCDNImg vendor 拉外网图片可能 ret=-2, UploadImg 更可靠)。
     * persist 默认 true (收口入库); api-client shim 委托时传 false 防双入库。
     */
    sendImage: async (toWxid: string, imageUrlOrPath: string, persist = true) => {
      const Base64 = await resolveImageToBase64(imageUrlOrPath);
      return dispatch("/Msg/UploadImg", { ToWxid: toWxid, Base64 }, persist);
    },

    /** /Msg/SendCDNVideo — 发送 CDN 视频 (v1.2.1 swagger-alignment: DefaultParamDoc {Content, ToWxid}) */
    sendCDNVideo: (toWxid: string, videoUrl: string) =>
      dispatch("/Msg/SendCDNVideo", { ToWxid: toWxid, Content: videoUrl }),

    /** /Msg/SendEmoji — 发送 Emoji */
    sendEmoji: (toWxid: string, emojiMd5: string, emojiSize: number) =>
      dispatch("/Msg/SendEmoji", { toWxid, emojiMd5, emojiSize }),

    /** 小程序发送走 sendXCX (/Msg/SendXCX); 不再有 sendMiniProgram 死代码 (曾错调 /Msg/SendApp 群发端点) */

    /** 发送小程序 XML (vendor 期望 <appmsg> 节点, type=2001 mini-program + <mmapp>) */
    sendAppFromXml: (toWxid: string, xml: string, _appName?: string) =>
      dispatch("/Msg/ShareLink", { ToWxid: toWxid, Type: 5, Xml: xml }),

    /** /Msg/SendTxt — 发送文本 (swagger: At 逗号串 + Type:1; persist 默认 true 收口入库) */
    sendTxt: (toWxid: string, content: string, ats?: string[], persist = true) =>
      dispatch("/Msg/SendTxt", { ToWxid: toWxid, Content: content, At: (ats ?? []).join(","), Type: 1 }, persist),

    /** /Msg/SendVideo — 发送视频 (v1.2.1 P1-fix 字段 PascalCase; v1.3.19 URL→base64 + persist) */
    sendVideo: async (toWxid: string, videoUrl: string, thumbUrl?: string, playLengthMs?: number, persist = true) => {
      const Base64 = await resolveImageToBase64(videoUrl);
      const ImageBase64 = thumbUrl ? await resolveImageToBase64(thumbUrl) : "";
      return dispatch("/Msg/SendVideo", {
        ToWxid: toWxid,
        Base64,
        ImageBase64,
        PlayLength: playLengthMs ?? 0,
      }, persist);
    },

    /**
     * /Msg/SendVoice — 发送语音
     * v1.3.52 SILK-ONLY (2026-08-12 接总立): vendor /Msg/SendVoice **只接受 silk** (Type=4)。
     *   - 输入已是 silk (data:audio/silk / .silk / formatHint='silk') → 直接 base64, Type=4
     *   - 输入是 mp3/其它 → 必须经 silk-encoder 转码 (v1.3.48 起 ffmpeg PCM 24kHz → silk -tencent)
     *   - 转码失败 → v1.3.53 VOICE-DEGRADE: 降级为文件消息 (老板 6-12 16:36 偏好: 成功发语音, 失败降级文件)
     *     (绝不给 /Msg/SendVoice 传 mp3 — vendor 只收 silk)
     * 旧 v1.3.49 SILK-TYPE-FIX 的 Type 枚举: AMR=0, MP3=2, SILK=4, SPEEX=1, WAVE=3
     *   现在 Type 恒为 4 (SILK), formatHint 仅作 silk 识别提示, 不再映射 MP3=2
     */
    sendVoice: async (toWxid: string, voiceUrl: string, durationMs?: number, persist = true, formatHint?: "mp3" | "silk") => {
      const noQuery = (voiceUrl.split("?")[0] ?? "").toLowerCase();
      const isSilkInput = voiceUrl.startsWith("data:audio/silk") || noQuery.endsWith(".silk") || formatHint === "silk";
      let base64: string;
      let voiceTime = durationMs ?? 0;
      if (isSilkInput) {
        // silk 直接透传 (resolveImageToBase64 支持 data URI / URL / 本地路径)
        base64 = await resolveImageToBase64(voiceUrl);
      } else {
        // mp3/其它 → 强制转 silk (vendor 只收 silk)
        try {
          const { encodeMp3ToSilk } = await import("../dispatch/silk-encoder.js");
          const { silkBuffer, voiceDurationMs } = await encodeMp3ToSilk(voiceUrl);
          base64 = silkBuffer.toString("base64");
          voiceTime = durationMs ?? voiceDurationMs;
        } catch (e) {
          // v1.3.53 VOICE-DEGRADE (老板 6-12 偏好): 转码失败 → 降级发文件 (不抛错)
          warn(`[WPP v1.3.53 VOICE-DEGRADE] silk 转码失败, 降级发文件: ${formatErr(e)}`);
          const fileName = (voiceUrl.split("?")[0] ?? "").split("/").pop() || "voice.mp3";
          return sendFileViaAppFromUrl(toWxid, voiceUrl, fileName);
        }
      }
      return dispatch("/Msg/SendVoice", {
        ToWxid: toWxid,
        Base64: base64,
        Type: 4, // v1.3.52 SILK-ONLY: 恒 SILK
        VoiceTime: voiceTime,
      }, persist);
    },

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

    /** /Msg/ShareCard — 分享名片 (v1.2.1 swagger-alignment: ShareCardParamDoc {CardAlias, CardNickName, CardWxId, ToWxid}) */
    shareCard: (toWxid: string, cardWxid: string, cardNickname: string, cardAlias?: string) =>
      dispatch("/Msg/ShareCard", {
        ToWxid: toWxid,
        CardWxId: cardWxid,
        CardNickName: cardNickname,
        CardAlias: cardAlias ?? "",
      }),

    /** /Msg/ShareLink — 分享链接 (v1.2.1 swagger-alignment: SendAppMsgParamDoc {ToWxid, Type, Xml}) */
    shareLink: (
      toWxid: string,
      title: string,
      desc: string,
      linkUrl: string,
      thumbUrl?: string,
    ) =>
      dispatch("/Msg/ShareLink", {
        ToWxid: toWxid,
        Type: 5,
        Xml: buildShareLinkXml(title, desc, linkUrl, thumbUrl),
      }),

    /**
     * /Msg/ShareLocation — 分享位置 (v1.2.1 swagger-alignment: ShareLocationParamDoc {X, Y, Label, Poiname, Scale, Infourl, ToWxid})
     * v1.3.11: X=纬度(lat), Y=经度(lng) — 对齐 gewe (buildLocationPayload x=lat,y=lng), 反了会定位卡片缩略图错位
     */
    shareLocation: (toWxid: string, latitude: number, longitude: number, label?: string, poiName?: string) =>
      dispatch("/Msg/ShareLocation", {
        ToWxid: toWxid,
        X: latitude,
        Y: longitude,
        Label: label ?? "",
        Poiname: poiName ?? "",
        Scale: 16,
        Infourl: "",
      }),

    /** /Msg/ShareVideo — 分享视频消息 (v1.2.1 swagger-alignment: ShareVideoMsgParamDoc {ToWxid, Xml}) */
    shareVideo: (toWxid: string, xml: string) =>
      dispatch("/Msg/ShareVideo", {
        ToWxid: toWxid,
        Xml: xml,
      }),

    /** /Msg/StartAutoSync — 启动自动同步 (v1.2.1 swagger-alignment: SyncParam2Doc {TargetURL}) */
    startAutoSync: (targetUrl: string) =>
      dispatch("/Msg/StartAutoSync", { TargetURL: targetUrl }),

    /**
     * /Msg/SendGroupMassMsgText — 群发文本 (v1.3.67 新 vendor API)
     * ToIds=群 wxid 数组, Content=文本
     */
    sendGroupMassMsgText: (toIds: string[], content: string) =>
      dispatch("/Msg/SendGroupMassMsgText", { ToIds: toIds, Content: content }),

    /**
     * /Msg/SendFile — 发送文件 (v1.3.67 新 vendor API; 自动上传+发送)
     * ToWxid=目标, FileName=文件名, Base64=文件内容
     */
    sendFileV2: (toWxid: string, fileName: string, base64: string) =>
      dispatch("/Msg/SendFile", { ToWxid: toWxid, FileName: fileName, Base64: base64 }),

    /**
     * /Msg/SendAppMessage — 发送结构化应用卡片 (v1.3.67 新 API)
     * items=[{kind:'link'|'mini_program'|'music'|'file', ...}] 单次最多 20 项
     */
    sendAppMessage: (items: unknown[]) =>
      dispatch("/Msg/SendAppMessage", { items }),

    /** /Msg/Sync — 同步消息 (swagger: Msg.SyncParamDoc {Scene=0, Synckey=""}) */
    sync: () => dispatch("/Msg/Sync", { Scene: 0, Synckey: "" }),

    /** /Msg/UploadImg — 上传图片(返回 imgUrl 后用于 SendImg) (v1.2.1 P1-fix: 字段对齐 swagger Base64/ToWxid) */
    uploadImg: (imgBase64: string, toWxid: string): Resp =>
      postWppJson<{ imgUrl?: string; msgId?: string; newMsgId?: string }>(
        ctx.baseUrl,
        "/Msg/UploadImg",
        { Base64: imgBase64, ToWxid: toWxid },
        opts,
      ),
  };
}

export type WppMsgApi = ReturnType<typeof makeWppMsg>;
