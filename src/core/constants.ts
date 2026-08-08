// core/constants.ts - 全局常量 SSOT
// 仿 本项目 src/core/constants.ts 范式

export const CHANNEL_ID = "wechatpadpro";
export const PLUGIN_NAME = "wechatpadpro";
export const PLUGIN_VERSION = "1.1.26";

// 默认 bot 昵称 (仿 gewe-multi-agent DEFAULT_BOT_NICKNAME 范式)
// 用于群 @ 触发检测 (mention 匹配昵称而非 wxid, 见 inbound/parser/mention.ts)
// accounts/<id>.json 的 nickname 字段优先; 缺失时回退此默认
// 2026-08-08 18:15 老板指令: selfWxid/nickname 不要硬编码在代码, 配置驱动 + 默认值兜底
export const DEFAULT_BOT_NICKNAME = "接晓银";

// 单账号 demo 默认账号 ID (B 方案 accounts/<id>.json)
export const DEFAULT_ACCOUNT_ID = "default";

// 默认 vendor upstream base
// vendor: knowhub.cloud adminmaxapi (binary at /opt/1panel/docker/compose/WechatPadPro/)
// 公网反代: https://adminmaxapi.knowhub.cloud, 本机 fallback: http://127.0.0.1:8062
export const DEFAULT_VENDOR_API_BASE = "http://127.0.0.1:8062";

// WebSocket 路径 (vendor /ws/sync)
export const WS_PATH = "/ws/sync";

// 消息类型枚举 (vendor 定义, 见 swagger.json definitions)
export const MsgType = {
  TEXT: 1,
  IMAGE: 3,
  VOICE: 34,
  VIDEO: 43,
  EMOJI: 47,
  LOCATION: 48,
  APP: 49,
  CARD: 42,
  SYSTEM: 10000,
  REVOKE: 10002,
} as const;
export type MsgTypeValue = (typeof MsgType)[keyof typeof MsgType];

// peer 类型
export const PeerKind = {
  DIRECT: "direct",
  GROUP: "group",
} as const;
export type PeerKindValue = (typeof PeerKind)[keyof typeof PeerKind];

// 日志 tag
export const LOG_TAG = `[WPP ${PLUGIN_VERSION}]`;

// 默认 webhook 端口/路径 (avoid 4399/4398 跟其它 plugin 冲突)
export const DEFAULT_WEBHOOK_HOST = "0.0.0.0";
export const DEFAULT_WEBHOOK_PORT = 4398;
export const DEFAULT_WEBHOOK_PATH = "/wechatpadpro/webhook";

// 默认 debounce 毫秒 (跟 本项目 一致)
export const DEFAULT_DEBOUNCE_MS = 1500;

// 30 分钟 in-memory dedupe TTL (标准值)
export const DEDUPE_TTL_MS = 30 * 60 * 1000;
// v1.0.2 FIX-2: webhook 请求级 timeout (防 slow client DoS, 30s)
export const REQUEST_TIMEOUT_MS = 30_000;
// webhook body size 10 MB hard cap (标准值)
export const WEBHOOK_BODY_LIMIT_BYTES = 10 * 1024 * 1024;
// API HTTP timeout 30s (标准值)
export const API_TIMEOUT_MS = 30_000;
// API retries 3 次
export const API_MAX_RETRIES = 3;
// vendor basePath 是 /api
export const VENDOR_BASE_PATH = "/api";

// API 重试间隔 (exp backoff, base 500ms)
export const API_RETRY_BASE_MS = 500;
