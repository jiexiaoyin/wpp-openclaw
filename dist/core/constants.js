export const CHANNEL_ID = "wechatpadpro";
export const PLUGIN_NAME = "wechatpadpro";
export const PLUGIN_VERSION = "1.3.70";
export const DEFAULT_BOT_NICKNAME = "YourBot";
export const DEFAULT_ACCOUNT_ID = "default";
export const DEFAULT_VENDOR_API_BASE = "http://127.0.0.1:8062";
export const WS_PATH = "/ws/sync";
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
};
export const PeerKind = {
    DIRECT: "direct",
    GROUP: "group",
};
export const LOG_TAG = `[WPP ${PLUGIN_VERSION}]`;
export const DEFAULT_WEBHOOK_HOST = "127.0.0.1";
export const DEFAULT_WEBHOOK_PORT = 4398;
export const DEFAULT_WEBHOOK_PATH = "/wechatpadpro/webhook";
export const DEFAULT_DEBOUNCE_MS = 1500;
export const DEDUPE_TTL_MS = 30 * 60 * 1000;
export const REQUEST_TIMEOUT_MS = 30_000;
export const WEBHOOK_BODY_LIMIT_BYTES = 10 * 1024 * 1024;
export const API_TIMEOUT_MS = 30_000;
export const API_MAX_RETRIES = 3;
export const API_JSON_MAX_BYTES = 30 * 1024 * 1024;
export const VENDOR_BASE_PATH = "/api";
export const API_RETRY_BASE_MS = 500;
export const MCP_BASE_URL = "http://127.0.0.1:8062/mcp";
export const MCP_AUTH_TOKEN_ENV = "WECHATPRO_AUTHCODE";
export const MCP_TIMEOUT_MS = 5000;
export const GROUP_CONTEXT_WINDOW = 10;
export const GROUP_CONTEXT_MAX_IMAGES = 3;
