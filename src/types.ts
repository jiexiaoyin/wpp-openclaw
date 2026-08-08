// types.ts - 接口定义 (单账号 demo, 多账号可扩展)
// 2026-08-04 init

import type { PeerKindValue } from "./core/constants.js";

// 单账号配置 (accounts/default.json schema)
export interface WppAccountConfig {
  enabled: boolean;
  tokenKey: string;
  tokenKeyEnv?: string;        // 环境变量名 (B 方案: 凭证不入 JSON)
  apiBaseUrl: string;
  wsUrl: string;
  authcode: string;
  authcodeEnv?: string;
  webhookHost: string;
  webhookPort: number;
  webhookPath: string;
  /** v1.1.15 BUSINESS-CB: 业务回调路径 (走 /Webhook/Business/Set + /Msg/StartAutoSync 完整消息) */
  webhookBusinessPath?: string;
  webhookSecret: string;
  // v1.0.1 P1-1: optional env-based secret (避免明文落盘)
  webhookSecretEnv?: string;
  // v1.1.12 2026-08-08 接总立 P0 (autoSetWebhook): 公网入口 + 启动自动注册
  // 拼成 vendor push URL = `${webhookPublicUrl}${webhookPath}`
  webhookPublicUrl?: string;
  webhookPublicUrlEnv?: string;     // 环境变量名 (跟 tokenKey/authcode 一致 B 方案)
  autoSetWebhook?: boolean;          // 默认 true; false 则跳过自动 setWebhook (老板手动)
  setWebhookRetries?: number;        // 默认 3 (1s/3s/9s backoff)
  allowFrom: string[];
  groupPolicy: "open" | "disabled" | "allowlist" | "closed";
  groupAllowFrom: string[];
  selfWxid: string;
  nickname: string;
  requireAtMention: boolean;
  debounceMs: number;
  /**
   * v1.1.16 P0-fix (2026-08-08): 老板主号 P0 污染事件 (16:00:38 fan-out dispatch)
   *
   * 根因: dispatcher.ts 之前 hardcode `agentId: "main"`, 完全没读这个字段,
   *       导致老板主号所有微信联系人 (25+) 全部被路由到 main agent → AI auto-reply 准备 → 401/502 错误消息发出去
   *
   * 必填: 单账号 demo 必填 (e.g. "wpp-wechat"); 防止再次硬编码 main (防 P0 污染)
   * 不传: 启动时校验失败, 抛 `account.agent required` (强制 reject)
   */
  agent: string;
  /**
   * v1.1.17 FULL-FIX (P1-g): 触发器配置 (热重载同步用)
   * 可选 — 不配则用 defaultTriggerConfig() 默认值
   */
  keywordTrigger?: {
    enabled: boolean;
    keywords: string[];
    mode?: "exact" | "contains" | "regex";
  };
  msgTypeTrigger?: {
    enabled: boolean;
    appMsgTypes?: number[];
    whitelistGroups?: string[];
  };
  quoteBotTrigger?: {
    enabled: boolean;
  };
  blacklistGroups?: string[];
  chatroomDebug?: boolean;
}

// 全局配置 (config.json)
export interface WppGlobalConfig {
  storage: {
    saveHistory: boolean;
    db: {
      backend: "mariadb" | "mysql" | "sqlite";
      mariadb: {
        host: string;
        port: number;
        user: string;
        password: string;
        passwordEnv?: string;
        database: string;
        connectionLimit: number;
      };
    };
  };
}

// 账号运行时状态 (类似 本项目 AccountState)
// G1 升级: 加 mutation 方法 (attachWsClient / attachWebhookServer / setVendorAuth / stop)
//         AccountContext 类实现本接口, structural typing 保证兼容
export interface WppAccountState {
  accountId: string;
  config: WppAccountConfig;
  apiClient: WppApiClient;
  wsClient?: WppWsClient;
  webhookServer?: WppWebhookServer;
  // vendor 鉴权状态
  vendorAuthed: boolean;
  authcode: string;
  selfWxid: string;
  // G1 mutation methods (由 AccountContext 实现)
  attachWsClient(ws: WppWsClient): void;
  attachWebhookServer(srv: WppWebhookServer): void;
  setVendorAuth(selfWxid: string, authcode: string): void;
  stop(): Promise<void>;
  // v1.1.12 P1-1 (2026-08-08): periodic setWebhook retry timer
  // 启动时 setWebhook 失败 → 后台每 5 分钟重试, 成功 clearInterval
  // shutdown 时统一 clear (防泄漏)
  setRetryTimer(timer: NodeJS.Timeout): void;
  clearRetryTimer(timer?: NodeJS.Timeout): void;
}

// 占位接口 (实现见对应文件)
export interface WppApiClient {
  getBaseUrl(): string;
  getTokenKey(): string;
  call<T = unknown>(endpoint: string, body: Record<string, unknown>): Promise<WppApiResponse<T>>;
  login(): Promise<{ qrcodeUrl: string; qrcodeData?: string }>;
  checkLogin(uuid: string): Promise<{ status: number; expired?: boolean; acctSectResp?: unknown }>;
  sendText(toWxid: string, text: string, ats?: string[]): Promise<WppApiResponse>;
  sendImage(toWxid: string, imageUrlOrPath: string): Promise<WppApiResponse>;
  sendVoice(toWxid: string, voiceUrlOrPath: string, durationMs?: number): Promise<WppApiResponse>;
  sendVideo(toWxid: string, videoUrlOrPath: string, thumbUrl?: string): Promise<WppApiResponse>;
  sendApp(toWxid: string, xml: string): Promise<WppApiResponse>;
  revokeMsg(msgId: string, newMsgId: string, toWxid: string): Promise<WppApiResponse>;
  syncMessage(): Promise<WppApiResponse>;
  getContactList(): Promise<WppApiResponse>;
  getChatroomInfo(chatroomId: string): Promise<WppApiResponse>;
  getChatroomMemberList(chatroomId: string): Promise<WppApiResponse>;
  // v1.1.12 (2026-08-08): webhook tag endpoints (autoSetWebhook 用)
  setWebhook(url: string, authcode: string): Promise<WppApiResponse>;
  getWebhook(): Promise<WppApiResponse>;
  /** v1.1.15 BUSINESS-CB (2026-08-08): 业务回调注册 (vendor 推完整消息) */
  setBusinessWebhook(syncMessageUrl: string, logoutUrl: string): Promise<WppApiResponse>;
  /** v1.1.15 BUSINESS-CB (2026-08-08): 启动自动同步轮询 */
  startAutoSync(targetUrl: string): Promise<WppApiResponse>;
  removeWebhook(): Promise<WppApiResponse>;
}

export interface WppApiResponse<T = unknown> {
  Code: number;
  CodeValue?: string;
  Data?: T;
  raw: unknown;
}

export interface WppWsClient {
  start(): Promise<void>;
  stop(): Promise<void>;
  isConnected(): boolean;
}

export interface WppWebhookServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

// vendor 推送的 webhook 消息 payload (2026-08-04 from real swagger 抽样)
export interface WppWebhookPayload {
  // 不同消息类型字段不一样, 此处用 unknown 兜底
  [key: string]: unknown;
}

// inbound 消息统一格式 (OpenClaw Agent 输入)
export interface WppInboundMessage {
  accountId: string;
  msgId: string;
  newMsgId: string;
  fromWxid: string;
  fromNickname?: string;
  chatroomId?: string;            // 群消息时有值
  toWxid?: string;
  msgType: number;
  content: string;
  ts: number;
  raw: unknown;
  // 派生字段
  peerKind: PeerKindValue;
  peerId: string;                 // 私聊: fromWxid; 群聊: chatroomId
  /** 4-way trigger 命中 (Phase D 升级) */
  trigger:
    | "direct"
    | "at"
    | "keyword"
    | "msgType"
    | "quoteBot"
    | "group-open";
  /** Phase D 加: 群消息提取的 @列表 (供 prompt / debug) */
  atUserList?: string[];
}

// outbound 发送结果
export interface WppOutboundResult {
  ok: boolean;
  msgId?: string;
  newMsgId?: string;
  error?: string;
  raw?: unknown;
}
