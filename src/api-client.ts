// api-client.ts - WeChatPadPro HTTP API 封装
// 完整 236 paths, 本 v0.1.0 优先实现 P0 业务
// 2026-08-04 init
// 2026-08-08 P1-2 complete-fix: 3 个 endpoint 名对齐 swagger (实测 404 → 200)
//   /Msg/SendImg → /Msg/SendCDNImg (body: Content/ToWxid)
//   /Group/GetChatRoomMemberList → /Group/GetChatRoomMemberDetail (body: QID)
//   /User/GetProfile → /User/GetContractProfile (authcode 在 query, 无 body)

import { request } from "undici";
import { stringifyLargeInts } from "./api/client.js";
import { logObj as log } from "./core/logger.js";
import type { WppAccountConfig, WppApiClient, WppApiResponse } from "./types.js";

// 实现核心 18 个 endpoint (P0 业务)
// Login: GetQR / CheckQR / HeartBeat / LogOut
// Msg:   SendTxt / SendCDNImg / SendVideo / SendVoice / SendApp / Revoke / Sync
// Group: GetChatRoomInfo / GetChatRoomMemberDetail
// Friend: GetContractList
// User: GetContractProfile
// Webhook: Set / Get / Remove
// 后续按 16 tag 分批推

export class WechatpadproApiClient implements WppApiClient {
  constructor(private cfg: WppAccountConfig) {}

  getBaseUrl(): string {
    return this.cfg.apiBaseUrl.replace(/\/$/, "");
  }

  getTokenKey(): string {
    return this.cfg.tokenKey;
  }

  // 通用 POST 调用 (basePath=/api)
  async call<T = unknown>(endpoint: string, body: Record<string, unknown> = {}): Promise<WppApiResponse<T>> {
    // v1.1.11 P0-N1: vendor 全部 endpoint 要求 authcode (query 优先, body 备援 — 见 swagger)
    //   不传 → "缺少授权码或未找到与该Wxid绑定的授权码" 返 400
    //   兜底: 任何 call() 自动 inject cfg.authcode 到 query string
    let ep = endpoint;
    if (this.cfg.authcode && !ep.includes("authcode=")) {
      const sep = ep.includes("?") ? "&" : "?";
      ep = `${ep}${sep}authcode=${encodeURIComponent(this.cfg.authcode)}`;
    }
    const url = `${this.getBaseUrl()}/api${ep}`;
    const start = Date.now();
    try {
      const res = await request(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // vendor 自定义鉴权 (X-TokenKey 在 header, 也可在 body)
          "X-TokenKey": this.cfg.tokenKey,
        },
        body: JSON.stringify(body),
        headersTimeout: 30_000,
        bodyTimeout: 60_000,
      });
      const text = await res.body.text();
      const latency = Date.now() - start;
      // v1.1.17 FULL-FIX (P0-H/I): 大整数精度保护 (vendor 返回 16+ 位 msgId → 裸 JSON.parse 丢精度)
      // + 解析失败不再判 Code=0 (vendor 走公网反代返回 HTML/502 时, HTTP 2xx 会被误判为成功)
      const safe = stringifyLargeInts(text);
      let json: unknown = null;
      let parseOk = false;
      try {
        json = JSON.parse(safe);
        parseOk = true;
      } catch {
        json = { raw: text };
      }
      const obj = (json ?? {}) as { Code?: number; CodeValue?: string; Data?: T };
      log.debug(`API ${endpoint} → ${res.statusCode} code=${obj.Code ?? "?"} (${latency}ms)`);
      return {
        Code: parseOk ? (obj.Code ?? (res.statusCode === 200 ? 0 : -1)) : -1,
        CodeValue: parseOk ? obj.CodeValue : "PARSE_FAILED",
        Data: obj.Data,
        raw: json,
      };
    } catch (err) {
      const latency = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`API ${endpoint} → network error: ${msg} (${latency}ms)`);
      return { Code: -1, CodeValue: "NETWORK_ERROR", raw: msg };
    }
  }

  // 通用 GET 调用 (basePath=/api; vendor 部分 endpoint 是 GET, 如 /Webhook/Get /User/GetContractProfile)
  // P2 complete-fix (2026-08-08): 之前只有 POST call(), /Webhook/Get 用 POST → 404
  async get<T = unknown>(endpoint: string, query: Record<string, unknown> = {}): Promise<WppApiResponse<T>> {
    let ep = endpoint;
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    if (this.cfg.authcode) qs.set("authcode", this.cfg.authcode);
    const q = qs.toString();
    if (q) ep = `${ep}${ep.includes("?") ? "&" : "?"}${q}`;
    const url = `${this.getBaseUrl()}/api${ep}`;
    const start = Date.now();
    try {
      const res = await request(url, {
        method: "GET",
        headers: {
          "X-TokenKey": this.cfg.tokenKey,
        },
        headersTimeout: 30_000,
      });
      const text = await res.body.text();
      const latency = Date.now() - start;
      // v1.1.17 FULL-FIX (P0-H/I): 同 POST 路径 — 大整数保护 + 解析失败判失败
      const safe = stringifyLargeInts(text);
      let json: unknown = null;
      let parseOk = false;
      try {
        json = JSON.parse(safe);
        parseOk = true;
      } catch {
        json = { raw: text };
      }
      const obj = (json ?? {}) as { Code?: number; CodeValue?: string; Data?: T };
      log.debug(`API GET ${endpoint} → ${res.statusCode} code=${obj.Code ?? "?"} (${latency}ms)`);
      return {
        Code: parseOk ? (obj.Code ?? (res.statusCode === 200 ? 0 : -1)) : -1,
        CodeValue: parseOk ? obj.CodeValue : "PARSE_FAILED",
        Data: obj.Data,
        raw: json,
      };
    } catch (err) {
      const latency = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`API GET ${endpoint} → network error: ${msg} (${latency}ms)`);
      return { Code: -1, CodeValue: "NETWORK_ERROR", raw: msg };
    }
  }

  // ============ Login ============
  async login(): Promise<{ qrcodeUrl: string; qrcodeData?: string }> {
    const r = await this.call<{ qrcodeUrl?: string; qrcodeData?: string }>(
      "/Login/GetQR",
      { authcode: this.cfg.authcode },
    );
    const d = r.Data ?? {};
    return {
      qrcodeUrl: d.qrcodeUrl ?? "",
      qrcodeData: d.qrcodeData,
    };
  }

  async checkLogin(uuid: string): Promise<{ status: number; expired?: boolean; acctSectResp?: unknown }> {
    const r = await this.call("/Login/CheckQR", { uuid, authcode: this.cfg.authcode });
    const d = (r.Data ?? {}) as { status?: number; expired?: boolean; acctSectResp?: unknown };
    return {
      status: d.status ?? 0,
      expired: d.expired,
      acctSectResp: d.acctSectResp,
    };
  }

  async logout(): Promise<WppApiResponse> {
    return this.call("/Login/LogOut", {});
  }

  async heartbeat(): Promise<WppApiResponse> {
    return this.call("/Login/HeartBeat", {});
  }

  // ============ Msg ============
  // v1.1.17 FULL-FIX (P0-A): swagger Msg.SendNewMsgParamDoc = { At: string, Content, ToWxid, Type: integer }
  //   At 是逗号分隔字符串 (非数组), Type 必须传 1 (描述原文 "Type请填写1  At == 群@,多个wxid请用,隔开")
  //   之前传 { toWxid, content, ats: string[] } → Go 匹配不上 → 群 @ 从未生效 (Code=0 无报错)
  async sendText(toWxid: string, text: string, ats?: string[]): Promise<WppApiResponse> {
    const At = ats && ats.length > 0 ? ats.join(",") : "";
    return this.call("/Msg/SendTxt", { ToWxid: toWxid, Content: text, At, Type: 1 });
  }

  // v1.1.27 SENDIMG-FIX (2026-08-08 20:53 接总立: 改用单跳 base64 发图):
  //   之前 v1.1.21 P1-2: /Msg/SendCDNImg {content: url} — vendor 拉外网图片失敗 BaseResponse.ret=-2
  //   根因: SendCDNImg Content 是 vendor 已上传的 CDN URL (不是任意 URL, 不是 base64)
  //   fix: /Msg/UploadImg {Base64, ToWxid} — swagger Msg.SendImageMsgParamDoc明确字段 Base64
  //   - 与手机端发送图片行为一致 (vendor 接受 raw base64 直传)
  //   - 无需中间 CDN 跳转, 无需 OSS 外网拉取
  //   参数支持三种输入:
  //     1. 本地文件路径 (eg "/tmp/k.png") → 读文件 → base64
  //     2. HTTP/HTTPS URL (eg "https://oss.../k.png") → 下载 → base64
  //     3. data: URI 或已是纯 base64 → 直接送
  async sendImage(toWxid: string, imageUrlOrPath: string): Promise<WppApiResponse> {
    const Base64 = await resolveImageToBase64(imageUrlOrPath);
    return this.call("/Msg/UploadImg", { ToWxid: toWxid, Base64 });
  }

  async sendVoice(toWxid: string, voiceUrlOrPath: string, durationMs?: number): Promise<WppApiResponse> {
    return this.call("/Msg/SendVoice", { toWxid, voiceUrl: voiceUrlOrPath, duration: durationMs });
  }

  async sendVideo(toWxid: string, videoUrlOrPath: string, thumbUrl?: string): Promise<WppApiResponse> {
    return this.call("/Msg/SendVideo", { toWxid, videoUrl: videoUrlOrPath, thumbUrl: thumbUrl ?? "" });
  }

  // v1.1.17 FULL-FIX (P0-B): /Msg/SendApp 是「群发消息」(SendGroupMassMsgTextParamDoc), 不是发 XML 应用消息
  // 正确端点是 /Msg/ShareLink (SendAppMsgParamDoc: { ToWxid, Type, Xml })
  // 但 AI 工具 sendAppMessage 已移除 (防误触群发广播), 此方法仅内部兼容保留
  async sendApp(toWxid: string, xml: string): Promise<WppApiResponse> {
    return this.call("/Msg/ShareLink", { ToWxid: toWxid, Type: 5, Xml: xml });
  }

  // v1.1.17 FULL-FIX (P1-9): swagger Msg.RevokeMsgParamDoc = { ClientMsgId, NewMsgId, CreateTime, ToUserName }
  //   之前传 { msgId, newMsgId, toWxid } → Go 匹配不上 → 撤回不可用 (静默 Code=0)
  async revokeMsg(msgId: string, newMsgId: string, toWxid: string): Promise<WppApiResponse> {
    const CreateTime = Math.floor(Date.now() / 1000);
    return this.call("/Msg/Revoke", {
      ClientMsgId: msgId,
      NewMsgId: newMsgId,
      CreateTime,
      ToUserName: toWxid,
    });
  }

  async syncMessage(): Promise<WppApiResponse> {
    // v1.1.11 P0-N1: vendor swagger /Msg/Sync body schema = Msg.SyncParamDoc
    //   "Scene填写0,Synckey留空". 空 body {} → vendor 400 code=-1 (silent killer)
    return this.call("/Msg/Sync", { Scene: 0, Synckey: "" });
  }

  // ============ Group ============
  async getChatroomInfo(chatroomId: string): Promise<WppApiResponse> {
    return this.call("/Group/GetChatRoomInfo", { chatroomId });
  }

  async getChatroomMemberList(chatroomId: string): Promise<WppApiResponse> {
    // P1-2 complete-fix: /Group/GetChatRoomMemberList 实测 404 → /Group/GetChatRoomMemberDetail 实测 200 Code=0
    // swagger body: Group.GetChatRoomParamDoc [QID] (QID = chatroomId)
    return this.call("/Group/GetChatRoomMemberDetail", { QID: chatroomId });
  }

  // ============ Friend ============
  async getContactList(): Promise<WppApiResponse> {
    return this.call("/Friend/GetContractList", {});
  }

  // ============ User ============
  async getProfile(): Promise<WppApiResponse> {
    // P1-2 complete-fix: /User/GetProfile 实测 404 → /User/GetContractProfile 实测 200 Code=0
    // swagger: authcode 在 query (call() 自动注入), 无 body
    return this.call("/User/GetContractProfile", {});
  }

  // ============ Webhook ============
  // v1.1.17 FULL-FIX (P0-E): swagger webhook.WebhookConfig = { enabled, includeSelfMessage, messageTypes, retryCount, secret, timeout, url }
  //   之前只传 { url, authcode }, enabled 缺失 → Go bool 零值 false → webhook 设了等于没设 (8/8 推送故障最大嫌疑)
  async setWebhook(url: string, authcode: string): Promise<WppApiResponse> {
    return this.call("/Webhook/Set", {
      url,
      authcode,
      enabled: true,
      retryCount: 3,
      timeout: 10,
      messageTypes: ["all"],
    });
  }

  async getWebhook(): Promise<WppApiResponse> {
    // P2 complete-fix: /Webhook/Get 是 GET 方法 (swagger), 之前用 POST → 404
    return this.get("/Webhook/Get", {});
  }

  /** v1.1.15 BUSINESS-CB: 设置业务回调 URL (vendor 会向 syncMessageUrl 推送完整消息) */
  async setBusinessWebhook(syncMessageUrl: string, logoutUrl: string): Promise<WppApiResponse> {
    return this.call("/Webhook/Business/Set", { syncMessageUrl, logoutUrl });
  }

  /** v1.1.15 BUSINESS-CB: 启动自动同步 (之后 vendor 主动推送完整消息) */
  async startAutoSync(targetUrl: string): Promise<WppApiResponse> {
    return this.call("/Msg/StartAutoSync", { TargetURL: targetUrl });
  }

  async removeWebhook(): Promise<WppApiResponse> {
    return this.call("/Webhook/Remove", {});
  }

}

// ============================================================================
// v1.1.27 SENDIMG-FIX: 图片输入三态统一转 base64 (供 sendImage 调用)
// 兼容: 本地文件路径 / HTTP(S) URL / data URI / 已是 base64 字符串
// ============================================================================

import { readFile } from "node:fs/promises";

const DATA_URI_RE = /^data:[^;]+;base64,(.*)$/s;

/** 改外带函数 (脱离 class 供多场景复用) */
export async function resolveImageToBase64(input: string): Promise<string> {
  if (!input) throw new Error("resolveImageToBase64: empty input");
  // 1. data URI → 取逗号后纯 base64
  const m = DATA_URI_RE.exec(input);
  if (m && m[1]) return m[1].trim();
  // 2. HTTP(S) URL → 下载 → base64
  if (/^https?:\/\//i.test(input)) {
    const r = await fetch(input);
    if (!r.ok) throw new Error(`resolveImageToBase64: fetch ${input} failed ${r.status}`);
    const buf = new Uint8Array(await r.arrayBuffer());
    return Buffer.from(buf).toString("base64");
  }
  // 3. file:// 本地路径
  if (input.startsWith("file://")) {
    const p = input.slice("file://".length);
    const buf = await readFile(p);
    return buf.toString("base64");
  }
  // 4. 本地路径 → 读文件 → base64
  if (input.startsWith("/") || input.startsWith("./") || input.startsWith("../")) {
    const buf = await readFile(input);
    return buf.toString("base64");
  }
  // 5. 默认当已是 base64 字符串送出
  return input.trim();
}
