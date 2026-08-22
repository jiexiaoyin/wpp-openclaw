// types.ts - 接口定义 (单账号 demo, 多账号可扩展)

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
  /** 业务回调路径 (走 /Webhook/Business/Set + /Msg/StartAutoSync 完整消息) */
  webhookBusinessPath?: string;
  /** v1.3.63 P1-7: webhook path token (随机 hex, 插入 path 防伪造触发 AI). 配了 → /wechatpadpro/<token>/webhook */
  webhookPathToken?: string;
  webhookSecret: string;
  // optional env-based secret (避免明文落盘)
  webhookSecretEnv?: string;
  // 公网入口 + 启动自动注册 (autoSetWebhook)
  // 拼成 vendor push URL = `${webhookPublicUrl}${webhookPath}`
  webhookPublicUrl?: string;
  webhookPublicUrlEnv?: string;     // 环境变量名 (跟 tokenKey/authcode 一致 B 方案)
  autoSetWebhook?: boolean;          // 默认 true; false 则跳过自动 setWebhook
  setWebhookRetries?: number;        // 默认 3 (1s/3s/9s backoff)
  allowFrom: string[];
  /**
   * v1.2.3 PAIRING: 启用 DM 配对码 (默认 false = 关闭)
   *   显式 true 才启用: 白名单外用户私聊 `/pair <8位码>` 自助兑换 → wxid 写进 allowFrom (零重启生效)
   */
  dmPairingEnabled?: boolean;
  /**
   * 管理员 wxid 列表
   *   默认 [selfWxid] (老板 = 管理员)
   *   未来扩展: 限频豁免 / 脱敏豁免 / 优先回复
   */
  adminUsers?: string[];
  /**
   * v1.3.41 FRIENDCIRCLE-GUARD (老板 2026-08-11): 朋友圈发布开关 (默认 false 关闭).
   *   false = 朋友圈发布完全禁用 (任何人不能发, 防误发公开内容)
   *   true  = 启用, 但仅 friendCirclePublishAllowFrom 或 adminUsers 里的 wxid 可发
   */
  friendCirclePublishEnabled?: boolean;
  /** v1.3.41: 朋友圈发布白名单 (缺省用 adminUsers; 未配则全禁) */
  friendCirclePublishAllowFrom?: string[];
  /** v1.3.71: 小微智能体能力开关 (默认 false 关闭; /xiaowei on|off 命令控制) */
  xiaoweiEnabled?: boolean;
  /**
   * 命令白名单配置
   *   未设置 = 不启用命令机制 (所有 /xxx 被 AI 当普通消息处理, 保持现有行为)
   *   设置后: 不在白名单的命令 → 静默拒绝 (return null, 不进 AI)
   *
   * @example
   *   commandAllowlist: {
   *     allowlist: ["reset", "status", "help"],
   *     prefix: "/",  // 默认
   *     blockMessage: "未授权命令"  // 默认中文
   *   }
   */
  commandAllowlist?: {
    allowlist: string[];
    prefix?: string;
    blockMessage?: string;
  };

  /**
   * WS 重连策略 (单账号独有, 不同 vendor 稳定性不同)
   *   替代原 ws-client.ts 中硬编码 retryDelay / maxRetryDelay / fallbackSyncMs
   *   未提供时使用代码兜底默认值
   */
  sync?: {
    /** HTTP 轮询兜底间隔毫秒 (默认 60000) */
    fallbackSyncMs?: number;
    /** WS 重连策略 */
    wsReconnect?: {
      /** 初始重连延迟毫秒 (默认 1000) */
      initialDelayMs?: number;
      /** 最大重连延迟毫秒 (默认 30000) */
      maxDelayMs?: number;
      /** 重连延迟倍增因子 (默认 2, exp backoff) */
      multiplier?: number;
    };
    /**
     * 启用 WS 主动推送路径
     *   默认 true (保持当前行为)
     *   设为 false 则只靠 callback + HTTP 轮询 (资源 -40%, dedup -68%)
     *   适用场景: 多账号场景下让 WS 仅作 fallback, 不主动推
     *
     * 决策: callback (主) + HTTP 轮询 (兜底) 可靠, WS 非唯一救命路径
     */
    enableWsClient?: boolean;
    /**
     * 启用 HTTP 轮询兜底 (fallback 60s)
     *   默认 true
     *   设为 false 则禁用 60s /Msg/Sync 轮询 (仅靠 callback)
     *   适用场景: vendor 推送调度稳定时, 减少 60s × 60 calls/h 无用轮询
     */
    enableHttpFallback?: boolean;
  };
  groupPolicy: "open" | "disabled" | "allowlist" | "closed";
  groupAllowFrom: string[];
  /**
   * v1.2.4 GROUP-CONTEXT: 是否允许非触发群消息进白名单群上下文 (默认 false = 关闭, 老板拍板)
   *   显式 true 才开启: 群里发图/发文本不 @ → 缓冲, 触发时按 @ 人过滤注入 AI 上下文 (图片≤3 直接 MediaUrls 看图)
   */
  groupContextEnabled?: boolean;
  /** v1.2.4 GROUP-CONTEXT: 上下文条数 (默认 20, 1-100; 环形缓冲硬上限) */
  groupContextWindow?: number;
  /**
   * v1.3.1 LLM-INTENT: 群聊上下文用 LLM 智能判断注入哪些候选 (默认 true, 老板拍板)
   *   false → 回退规则 media/topic 过滤; 仅 groupContextEnabled 开时生效
   */
  llmIntentEnabled?: boolean;
  /** v1.3.1 LLM-INTENT: LLM 判断超时毫秒 (默认 5000) */
  llmIntentTimeoutMs?: number;
  /** v1.3.1 LLM-INTENT: LLM 判断模型 (默认 "MiniMax-M2.5", 快+便宜) */
  llmIntentModel?: string;
  /**
   * v1.3.2 EMBED-INTENT: 用 embedding 快路径定位相关候选 (默认 true, 老板拍板混用)
   *   非命令意图 → embedding 相似度 top-N (ms); 命令类/embedding 失败 → LLM 兜底
   *   false → 直接 LLM (回退 v1.3.1)
   */
  embedIntentEnabled?: boolean;
  /** v1.3.2 EMBED-INTENT: embedding 选 top-N (默认 5) */
  embedIntentTopN?: number;
  /** v1.3.2 EMBED-INTENT: embedding 相似度阈值 (默认 0.3, 低于则 LLM 兜底) */
  embedIntentThreshold?: number;
  selfWxid: string;
  nickname: string;
  requireAtMention: boolean;
  debounceMs: number;
  /**
   * agent 必填 (e.g. "wpp-wechat"), 禁止 "main" — 曾因硬编码 main 导致多账号串号 (25+ 联系人 fan-out)
   * 缺失时启动校验抛错强制 reject
   */
  agent: string;
  /**
   * 触发器配置 (热重载同步用)
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
  /**
   * v1.3.77 AI-UNIFY: 统一 LLM 判断模型配置 (心流/黑话共用)
   *   heartflow.model / jargon.model 未配时默认引用 ai.judgeModel; 配了则各自覆盖
   */
  ai?: {
    /** 统一判断模型 (默认 "MiniMax-M2.5", 快+便宜) */
    judgeModel?: string;
    /** LLM 调用超时毫秒 (默认 5000) */
    timeoutMs?: number;
  };
  /**
   * v1.3.75 HEARTFLOW: 群聊主动回复 (心流机制, 未@消息主动参与)
   *   enabled=false (默认) 完全关闭; 显式 true 才启用
   *   配置项: model/replyThreshold/energyDecayRate/energyRecoveryRate/contextMessagesCount/
   *           minReplyIntervalSec/whitelistGroups/weights/includeReasoning/maxRetries/timeoutMs
   *   model 未配 → 默认 ai.judgeModel (v1.3.77)
   */
  heartflow?: import("./inbound/heartflow.js").HeartflowConfig;
  /**
   * v1.3.76 JARGON: 群黑话挖掘 (自主学习, 旁路采集 + 定时挖掘)
   *   enabled=false (默认) 完全关闭
   *   开启后旁路采集群消息词频 → 定时 LLM 挖掘黑话 → 存 DB → AI 可查 query_jargon
   *   model 未配 → 默认 ai.judgeModel (v1.3.77)
   */
  jargon?: import("./inbound/jargon.js").JargonConfig;
  /**
   * v1.3.77 AFFECTION: 好感度/社交关系系统
   *   enabled=false (默认) 完全关闭
   *   开启后旁路处理群消息 → 交互分类 (关键词规则+可选LLM) → 好感度增减 + 情绪状态
   *   情绪注入 system prompt (dispatcher), 影响 AI 回复风格
   */
  affection?: import("./inbound/affection.js").AffectionConfig;
  /**
   * v1.2.0 VENDOR-MCP: 是否启用 vendor MCP 增强 (文件消息下载尝试)
   * 默认 true; false 则完全跳过 MCP (纯 v1 确定性回复兜底)
   * 注: 只调只读工具 (wechat_get_recent_messages), 不碰写, 不影响微信
   */
  mcpEnabled?: boolean;
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
        /** v1.3.63 P2: 池排队上限 (超限拒绝, 防耗尽时无限等待) */
        queueLimit?: number;
      };
    };
  };

  /**
   * 全局默认值
   *   替代原硬编码在 src/core/constants.ts 的 DEFAULT_* 系列
   *   未提供时使用代码兜底默认值 (B 方案兼容: config 缺失不报错)
   *   改动点: 19 项硬编码 → 2 个分组 (defaults + runtime)
   */
  defaults?: {
    /** vendor API base URL (默认 "http://127.0.0.1:8062") */
    vendorApiBase?: string;
    /** vendor base path (默认 "/api") */
    vendorBasePath?: string;
    /** vendor WS 路径 (默认 "/ws/sync") */
    vendorWsPath?: string;
    /** 默认机器人昵称 (默认 "YourBot") */
    botNickname?: string;
    /** 默认 webhook host (默认 "0.0.0.0") */
    webhookHost?: string;
    /** 默认 webhook port (默认 4398) */
    webhookPort?: number;
    /** 默认 webhook path (默认 "/wechatpadpro/webhook") */
    webhookPath?: string;
    /** 默认 debounce 毫秒 (默认 1500) */
    debounceMs?: number;
  };

  /**
   * 全局运行时参数 (所有账号共用)
   *   替代原硬编码 REQUEST_TIMEOUT_MS / API_TIMEOUT_MS / WEBHOOK_BODY_LIMIT_BYTES 等
   */
  runtime?: {
    /** vendor API HTTP timeout 毫秒 (默认 30000) */
    apiTimeoutMs?: number;
    /** webhook request timeout 毫秒 (默认 30000) */
    requestTimeoutMs?: number;
    /** webhook body size hard cap bytes (默认 10MB) */
    webhookBodyLimitBytes?: number;
    /** vendor API HTTP 重试次数 (默认 3) */
    apiMaxRetries?: number;
    /** vendor API 重试 base 间隔毫秒 (默认 500, exp backoff) */
    apiRetryBaseMs?: number;
    /** in-memory msgId dedupe TTL 毫秒 (默认 30 min) */
    dedupeTtlMs?: number;
    /** STT (语音转文字) 单次超时毫秒 (默认 60000) */
    sttTimeoutMs?: number;
    /** media enrich 单次超时毫秒 (默认 60000) */
    mediaTimeoutMs?: number;
    /** exec 单次超时毫秒 (默认 30000) */
    execTimeoutMs?: number;
    /** config cache TTL 毫秒 (默认 60000) */
    configCacheTtlMs?: number;
  };

  /**
   * vendor 相关路径配置
   */
  vendor?: {
    /** vendor 名称 (默认 "wechatpadpromax08") — 用于日志/审计 */
    name?: string;
    /** 鉴权 header 名 (默认 "X-TokenKey") */
    authHeader?: string;
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
  attachWebhookServer(srv: WppWebhookServer, paths?: string[]): void;
  setVendorAuth(selfWxid: string, authcode: string): void;
  stop(): Promise<void>;
  // periodic setWebhook retry timer
  // 启动时 setWebhook 失败 → 后台每 5 分钟重试, 成功 clearInterval
  // shutdown 时统一 clear (防泄漏)
  setRetryTimer(timer: NodeJS.Timeout): void;
  clearRetryTimer(timer?: NodeJS.Timeout): void;
  // inbound debouncer flushAll 钩子
  //   之前: stop() 拿不到 handler 闭包内 debouncer 引用 → 停机丢失 buffered 消息
  //   fix: index.ts attachInboundFlush(inboundHandler.flushAll), stop() 时先 flush 再停 ws/webhook
  attachInboundFlush(hook: () => Promise<void>): void;
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
  sendVoice(toWxid: string, voiceUrlOrPath: string, durationMs?: number, formatHint?: "mp3" | "silk"): Promise<WppApiResponse>;
  sendVideo(toWxid: string, videoUrlOrPath: string, thumbUrlOrPath?: string, playLengthMs?: number): Promise<WppApiResponse>;
  sendApp(toWxid: string, xml: string): Promise<WppApiResponse>;
  /** v1.3.12 FILE-SEND: 发送文件 (UploadFile 上传 → ShareLink type=6 文件 XML) */
  sendFileViaApp(toWxid: string, fileName: string, fileBase64: string, fileSize: number): Promise<WppApiResponse>;
  revokeMsg(msgId: string, newMsgId: string, toWxid: string, createTime?: number): Promise<WppApiResponse>;
  syncMessage(): Promise<WppApiResponse>;
  getContactList(): Promise<WppApiResponse>;
  getChatroomInfo(chatroomId: string): Promise<WppApiResponse>;
  getChatroomMemberList(chatroomId: string): Promise<WppApiResponse>;
  // webhook tag endpoints (autoSetWebhook 用)
  setWebhook(url: string, authcode: string): Promise<WppApiResponse>;
  getWebhook(): Promise<WppApiResponse>;
  /** 业务回调注册 (vendor 推完整消息) */
  setBusinessWebhook(syncMessageUrl: string, logoutUrl: string): Promise<WppApiResponse>;
  /** 启动自动同步轮询 */
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
  addPath(path: string, onMessage: (payload: WppWebhookPayload) => void | Promise<void>): void;
  /** v1.3.63 P1: 移除账号时清理 path */
  removePath(path: string): void;
}

// vendor 推送的 webhook 消息 payload (from real swagger 抽样)
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
  /** v1.3.21 REVOKE-FIX: 消息方向 (inbound/outbound) — 用于 outgoing 图片入库正确标 direction */
  direction?: "inbound" | "outbound";
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
    | "group-open"
    | "heartflow"; // v1.3.75: 心流主动参与群聊
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
