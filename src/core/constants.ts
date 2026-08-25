// core/constants.ts - 全局常量 SSOT

export const CHANNEL_ID = "wechatpadpro";
export const PLUGIN_NAME = "wechatpadpro";
export const PLUGIN_VERSION = "1.5.2";

// 默认 bot 昵称 (群 @ 触发检测用; accounts/<id>.json nickname 优先, 配置驱动 + 默认兜底)
export const DEFAULT_BOT_NICKNAME = "YourBot";

// 单账号 demo 默认账号 ID (B 方案 accounts/<id>.json)
export const DEFAULT_ACCOUNT_ID = "default";

// 默认 vendor upstream base
// vendor: WeChatPadPro 服务端 (adminmaxapi), 本机 fallback: http://127.0.0.1:8062
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

export const PeerKind = {
  DIRECT: "direct",
  GROUP: "group",
} as const;
export type PeerKindValue = (typeof PeerKind)[keyof typeof PeerKind];

// 日志 tag
export const LOG_TAG = `[WPP ${PLUGIN_VERSION}]`;

// 默认 webhook 端口/路径 (avoid 4399/4398 跟其它 plugin 冲突)
// v1.2.1 P1-fix (安全): 默认 127.0.0.1 仅本机监听, 防 0.0.0.0 全网卡暴露 → 伪造 webhook prompt injection
export const DEFAULT_WEBHOOK_HOST = "127.0.0.1";
export const DEFAULT_WEBHOOK_PORT = 4398;
export const DEFAULT_WEBHOOK_PATH = "/wechatpadpro/webhook";

// 默认 debounce 毫秒 (跟 本项目 一致)
/**
 * v1.3.74 PERF: 默认 debounce 1500ms → 500ms (老板 2026-08-22 拍板, 高 ROI 性能优化).
 *   - 1500ms 是早期设计保守值, 实测 webhook 到达延迟中位数 < 200ms, debounce 等到 1.5s 浪费明显
 *   - 500ms 仍保留多包批合并 (用户配置优先 accounts/*.json debounceMs 不变)
 *   - 配合 WS+webhook dedupe (webhook-receiver SeenTracker 范式), 整体回复延迟 -1s
 *   - 风险: 极低 — 用户在 accounts/*.json 已显式配置的不受影响; 极端群高频消息场景下 batch 略小但功能等价
 */
export const DEFAULT_DEBOUNCE_MS = 500;

// 30 分钟 in-memory dedupe TTL (标准值)
export const DEDUPE_TTL_MS = 30 * 60 * 1000;
export const REQUEST_TIMEOUT_MS = 30_000;
// webhook body size 10 MB hard cap (标准值)
export const WEBHOOK_BODY_LIMIT_BYTES = 10 * 1024 * 1024;
// API HTTP timeout 30s (标准值)
export const API_TIMEOUT_MS = 30_000;
// API retries 3 次
export const API_MAX_RETRIES = 3;
// v1.3.59 P2: JSON 响应体字节 cap (媒体端点经此下载 base64, 防巨型响应 OOM; 30MB 够图片/小文件)
export const API_JSON_MAX_BYTES = 30 * 1024 * 1024;
// vendor basePath 是 /api
export const VENDOR_BASE_PATH = "/api";

// API 重试间隔 (exp backoff, base 500ms)
export const API_RETRY_BASE_MS = 500;

// vendor MCP 服务 (v1.2.0 新增 — 老板 2026-08-09 发现 vendor 提供 MCP 端点)
// 端点: vendor 容器内 127.0.0.1:8062/mcp (beego mcp_enabled=true)
// 鉴权: Authorization: Bearer <token> (实测 = WECHATPRO_AUTHCODE, 非 TokenKey)
export const MCP_BASE_URL = "http://127.0.0.1:8062/mcp";
/** MCP 鉴权 token 的环境变量名 (复用 WECHATPRO_AUTHCODE, 凭证单一来源铁律) */
export const MCP_AUTH_TOKEN_ENV = "WECHATPRO_AUTHCODE";
/** MCP 调用超时 (5s, vendor 本地反代快) */
export const MCP_TIMEOUT_MS = 5000;

// (老板 2026-08-10 拍板: 删内存缓冲, DB 按人查, 查 10 条)
// 默认值 (per-account accounts/<id>.json 可覆盖: groupContextWindow)
export const GROUP_CONTEXT_WINDOW = 10;
/**
 * v1.2.4: 群聊上下文最多保留几张图 (老板拍板 "图片入 session 控制在 3 张之内")。
 * 图片 ≤3 张直接塞 MediaUrls 给主模型看图 (已实证 MediaUrls 有效), 超过 3 张丢最旧的含图消息。
 */
export const GROUP_CONTEXT_MAX_IMAGES = 3;
