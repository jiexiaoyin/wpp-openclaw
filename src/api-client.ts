// src/api-client.ts - WeChatPadPro HTTP API compat shim
// v1.3.19 UNIFY-SEND: 降级为**薄 adapter** — 所有发送方法委托到 send/<tag>.ts (makeWppMsg),
//   行为单点维护在 send/ 层 (查找/扩展/修复只改一处)。保留 WppApiClient interface, 调用方零改动。
//
// 关键:
//   - sendText/sendImage/sendVoice/sendVideo/revokeMsg/syncMessage → makeWppMsg (persist:false)
//     入库由 outbound.ts 的 persistOutbound 负责 (避免双份入库)
//   - sendFileViaApp 保留实现 (send/msg.ts 的 sendFile 内部调它, 不循环委托)
//   - call<T> 通用端点调用保留 (ws-client/index 用)
//   - resolveImageToBase64/readLocalMedia 移到 src/api/resolve-media.ts, 此处 re-export 兼容旧测试

import { postWppJson, getWppJson, stringifyLargeInts } from "./api/client.js";
import { logObj as log } from "./core/logger.js";
import { safeFetchWithCap } from "./util/safe-fetch.js";
import { makeWppMsg } from "./send/msg.js";
import { makeWppGroup } from "./send/group.js";
import { makeWppFriend } from "./send/friend.js";
import { makeWppWebhook } from "./send/webhook.js";
import type { WppAccountConfig, WppApiClient, WppApiResponse } from "./types.js";

export { resolveImageToBase64, readLocalMedia } from "./api/resolve-media.js";

/** XML 转义 (v1.3.12 FILE-SEND: 文件名含特殊字符时防 XML 破坏) */
function escapeXml(s: string): string {
  return String(s ?? "").replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
      default: return c;
    }
  });
}

/** 构造 makeWppXxx ctx (由 cfg 派生, 行为对齐 send/ 层; 单账号 shim 固定 accountId=default) */
function makeCtx(cfg: WppAccountConfig) {
  return {
    baseUrl: cfg.apiBaseUrl,
    tokenKey: cfg.tokenKey,
    authcode: cfg.authcode,
    accountId: "default",
  };
}

function makeMsgFor(cfg: WppAccountConfig) {
  return makeWppMsg(makeCtx(cfg));
}
function makeGroupFor(cfg: WppAccountConfig) {
  return makeWppGroup(makeCtx(cfg));
}
function makeFriendFor(cfg: WppAccountConfig) {
  return makeWppFriend(makeCtx(cfg));
}
function makeWebhookFor(cfg: WppAccountConfig) {
  return makeWppWebhook(makeCtx(cfg));
}

export class WechatpadproApiClient implements WppApiClient {
  constructor(private cfg: WppAccountConfig) {}

  getBaseUrl(): string {
    return this.cfg.apiBaseUrl.replace(/\/$/, "");
  }

  getTokenKey(): string {
    return this.cfg.tokenKey;
  }

  /** 通用 POST 调用 (authcode/query 由 postWppJson 自动注入) */
  async call<T = unknown>(endpoint: string, body: Record<string, unknown> = {}): Promise<WppApiResponse<T>> {
    return postWppJson<T>(this.cfg.apiBaseUrl, endpoint, body, {
      tokenKey: this.cfg.tokenKey,
      authcode: this.cfg.authcode,
    });
  }

  /** 通用 GET 调用 (authcode/query 由 getWppJson 自动注入) */
  private async get<T = unknown>(endpoint: string): Promise<WppApiResponse<T>> {
    return getWppJson<T>(this.cfg.apiBaseUrl, endpoint, {
      tokenKey: this.cfg.tokenKey,
      authcode: this.cfg.authcode,
    });
  }

  // ============ Login (委托 send/msg.ts? 不 — login 走 send/login.ts, 但这里保留原实现兼容) ============
  async login(): Promise<{ qrcodeUrl: string; qrcodeData?: string }> {
    const r = await this.call<{ qrcodeUrl?: string; qrcodeData?: string }>("/Login/GetQR", {
      authcode: this.cfg.authcode,
    });
    const d = r.Data ?? {};
    return { qrcodeUrl: d.qrcodeUrl ?? "", qrcodeData: d.qrcodeData };
  }

  async checkLogin(uuid: string): Promise<{ status: number; expired?: boolean; acctSectResp?: unknown }> {
    const r = await this.call("/Login/CheckQR", { uuid, authcode: this.cfg.authcode });
    const d = (r.Data ?? {}) as { status?: number; expired?: boolean; acctSectResp?: unknown };
    return { status: d.status ?? 0, expired: d.expired, acctSectResp: d.acctSectResp };
  }

  async logout(): Promise<WppApiResponse> {
    return this.call("/Login/LogOut", {});
  }

  async heartbeat(): Promise<WppApiResponse> {
    return this.call("/Login/HeartBeat", {});
  }

  // ============ Msg (v1.3.19 UNIFY-SEND: 委托 send/msg.ts, persist:false 防双入库) ============
  async sendText(toWxid: string, text: string, ats?: string[]): Promise<WppApiResponse> {
    const api = makeMsgFor(this.cfg);
    return api.sendTxt(toWxid, text, ats, false);
  }

  async sendImage(toWxid: string, imageUrlOrPath: string): Promise<WppApiResponse> {
    const api = makeMsgFor(this.cfg);
    return api.sendImage(toWxid, imageUrlOrPath, false);
  }

  async sendVoice(toWxid: string, voiceUrlOrPath: string, durationMs?: number, formatHint?: "mp3" | "silk"): Promise<WppApiResponse> {
    const api = makeMsgFor(this.cfg);
    return api.sendVoice(toWxid, voiceUrlOrPath, durationMs, false, formatHint);
  }

  async sendVideo(
    toWxid: string,
    videoUrlOrPath: string,
    thumbUrlOrPath?: string,
    playLengthMs?: number,
  ): Promise<WppApiResponse> {
    const api = makeMsgFor(this.cfg);
    return api.sendVideo(toWxid, videoUrlOrPath, thumbUrlOrPath, playLengthMs, false);
  }

  // /Msg/SendApp 是「群发消息」(SendGroupMassMsgTextParamDoc)
  //   不是发 XML 应用消息，正确端点是 /Msg/ShareLink (SendAppMsgParamDoc: { ToWxid, Type, Xml })
  async sendApp(toWxid: string, xml: string): Promise<WppApiResponse> {
    return this.call("/Msg/ShareLink", { ToWxid: toWxid, Type: 5, Xml: xml });
  }

  /**
   * v1.3.12 FILE-SEND: 发送文件 (UploadFile 上传 → ShareLink type=6 文件 XML)。
   * 实测 SendCDNFile Content 各种格式 (mediaId/file_no/aeskey/XML) 全 Ret=-2 (vendor 未实现);
   * SendApp type=6 appmsg 可发可打开 (但微信端显示"未审核应用"标签, 接受 — 方案 C 老板拍板)。
   *
   * v1.3.18 P1-安全2: fileUrl (cdnUrl) 走 safeFetchWithCap, 防 SSRF + 字节 cap (50MB, 文件通常 <20MB)
   * (sendFile 转 base64 上传 vendor — 这方法本身接 base64, 不 fetch, 不需要改)
   *
   * 保留实现 (send/msg.ts 的 sendFile 内部调它, 不循环委托)。
   */
  async sendFileViaApp(
    toWxid: string,
    fileName: string,
    fileBase64: string,
    fileSize: number,
    fileUrl?: string,
  ): Promise<WppApiResponse> {
    let payloadBase64 = fileBase64;
    if (fileUrl && (!fileBase64 || fileBase64.length === 0)) {
      try {
        const buf = await safeFetchWithCap(fileUrl, { signal: AbortSignal.timeout(60_000) }, 50 * 1024 * 1024);
        payloadBase64 = buf.toString("base64");
      } catch (e) {
        const errMsg = (e as Error).message ?? String(e);
        return { Code: -2, CodeValue: `FETCH_FAIL:${errMsg.slice(0, 80)}`, Data: null, raw: null };
      }
    }
    const up = await this.call("/Tools/UploadFile", { base64: payloadBase64 });
    const mediaId = ((up.Data ?? {}) as { mediaId?: string }).mediaId ?? "";
    if (!mediaId) {
      return { ...up, Code: -2, CodeValue: "UPLOAD_NO_MEDIA_ID" };
    }
    const ext = (fileName.split(".").pop() || "dat").toLowerCase();
    const xml =
      `<appmsg appid="wxfile" sdkver="0">` +
      `<title>${escapeXml(fileName)}</title>` +
      `<des></des><action>view</action><type>6</type>` +
      `<content>dataType=1|filename=${escapeXml(fileName)}|fileext=${ext}|totallen=${fileSize}|attachid=${mediaId}|</content>` +
      `<appattach><totallen>${fileSize}</totallen><attachid>${mediaId}</attachid><fileext>${ext}</fileext></appattach>` +
      `</appmsg>`;
    return this.call("/Msg/ShareLink", { ToWxid: toWxid, Type: 6, Xml: xml });
  }

  async revokeMsg(msgId: string, newMsgId: string, toWxid: string, createTime?: number): Promise<WppApiResponse> {
    const api = makeMsgFor(this.cfg);
    return api.revoke(msgId, newMsgId, toWxid, createTime);
  }

  // vendor swagger /Msg/Sync body schema = Msg.SyncParamDoc
  async syncMessage(): Promise<WppApiResponse> {
    const api = makeMsgFor(this.cfg);
    return api.sync();
  }

  // ============ Group (委托 send/group.ts) ============
  async getChatroomInfo(chatroomId: string): Promise<WppApiResponse> {
    return makeGroupFor(this.cfg).getInfo(chatroomId);
  }

  // /Group/GetChatRoomMemberList 404 → /Group/GetChatRoomMemberDetail 200
  async getChatroomMemberList(chatroomId: string): Promise<WppApiResponse> {
    return makeGroupFor(this.cfg).getMemberDetail(chatroomId);
  }

  // ============ Friend (委托 send/friend.ts) ============
  async getContactList(): Promise<WppApiResponse> {
    return makeFriendFor(this.cfg).getContractList();
  }

  // ============ User (保留原实现: GET /User/GetContractProfile) ============
  // /User/GetProfile 404 → /User/GetContractProfile 200; swagger authcode 在 query
  async getProfile(): Promise<WppApiResponse> {
    return this.get("/User/GetContractProfile");
  }

  // ============ Webhook (委托 send/webhook.ts) ============
  async setWebhook(url: string, _authcode: string): Promise<WppApiResponse> {
    // webhook.set 保留 v1.1.17 P0-E enabled:true 修复; authcode 由 ctx 注入 (与调用方传的 cfg.authcode 同值)
    return makeWebhookFor(this.cfg).set(url);
  }

  async getWebhook(): Promise<WppApiResponse> {
    return makeWebhookFor(this.cfg).get();
  }

  // setBusinessWebhook 字段不同 (syncMessageUrl/logoutUrl), 保留原实现
  async setBusinessWebhook(syncMessageUrl: string, logoutUrl: string): Promise<WppApiResponse> {
    return this.call("/Webhook/Business/Set", { syncMessageUrl, logoutUrl });
  }

  async startAutoSync(targetUrl: string): Promise<WppApiResponse> {
    return makeMsgFor(this.cfg).startAutoSync(targetUrl);
  }

  async removeWebhook(): Promise<WppApiResponse> {
    return makeWebhookFor(this.cfg).remove();
  }
}

// stringifyLargeInts 重导出 (供老代码引用)
export { stringifyLargeInts };

// 明确 log 引用防止 tree-shake 误删 (logger 已是 side-effect free)
void log;
