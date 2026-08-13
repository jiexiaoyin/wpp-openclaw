import { DEFAULT_VENDOR_API_BASE, VENDOR_BASE_PATH, WS_PATH, DEFAULT_BOT_NICKNAME, DEFAULT_WEBHOOK_HOST, DEFAULT_WEBHOOK_PORT, DEFAULT_WEBHOOK_PATH, DEFAULT_DEBOUNCE_MS, DEFAULT_ACCOUNT_ID, REQUEST_TIMEOUT_MS, WEBHOOK_BODY_LIMIT_BYTES, API_TIMEOUT_MS, API_MAX_RETRIES, API_RETRY_BASE_MS, DEDUPE_TTL_MS, } from "./constants.js";
export const RUNTIME_DEFAULTS = {
    defaults: {
        vendorApiBase: DEFAULT_VENDOR_API_BASE,
        vendorBasePath: VENDOR_BASE_PATH,
        vendorWsPath: WS_PATH,
        botNickname: DEFAULT_BOT_NICKNAME,
        webhookHost: DEFAULT_WEBHOOK_HOST,
        webhookPort: DEFAULT_WEBHOOK_PORT,
        webhookPath: DEFAULT_WEBHOOK_PATH,
        debounceMs: DEFAULT_DEBOUNCE_MS,
    },
    runtime: {
        apiTimeoutMs: API_TIMEOUT_MS,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        webhookBodyLimitBytes: WEBHOOK_BODY_LIMIT_BYTES,
        apiMaxRetries: API_MAX_RETRIES,
        apiRetryBaseMs: API_RETRY_BASE_MS,
        dedupeTtlMs: DEDUPE_TTL_MS,
        sttTimeoutMs: 60_000,
        mediaTimeoutMs: 60_000,
        execTimeoutMs: 30_000,
        configCacheTtlMs: 60_000,
    },
    vendor: {
        name: "wechatpadpro",
        authHeader: "X-TokenKey",
    },
    sync: {
        fallbackSyncMs: 60_000,
        wsReconnect: {
            initialDelayMs: 1_000,
            maxDelayMs: 30_000,
            multiplier: 2,
        },
        enableWsClient: true,
        enableHttpFallback: true,
    },
    defaultAccountId: DEFAULT_ACCOUNT_ID,
};
export function resolveGlobalConfig(cfg) {
    return {
        defaults: {
            vendorApiBase: cfg?.defaults?.vendorApiBase ?? RUNTIME_DEFAULTS.defaults.vendorApiBase,
            vendorBasePath: cfg?.defaults?.vendorBasePath ?? RUNTIME_DEFAULTS.defaults.vendorBasePath,
            vendorWsPath: cfg?.defaults?.vendorWsPath ?? RUNTIME_DEFAULTS.defaults.vendorWsPath,
            botNickname: cfg?.defaults?.botNickname ?? RUNTIME_DEFAULTS.defaults.botNickname,
            webhookHost: cfg?.defaults?.webhookHost ?? RUNTIME_DEFAULTS.defaults.webhookHost,
            webhookPort: cfg?.defaults?.webhookPort ?? RUNTIME_DEFAULTS.defaults.webhookPort,
            webhookPath: cfg?.defaults?.webhookPath ?? RUNTIME_DEFAULTS.defaults.webhookPath,
            debounceMs: cfg?.defaults?.debounceMs ?? RUNTIME_DEFAULTS.defaults.debounceMs,
        },
        runtime: {
            apiTimeoutMs: cfg?.runtime?.apiTimeoutMs ?? RUNTIME_DEFAULTS.runtime.apiTimeoutMs,
            requestTimeoutMs: cfg?.runtime?.requestTimeoutMs ?? RUNTIME_DEFAULTS.runtime.requestTimeoutMs,
            webhookBodyLimitBytes: cfg?.runtime?.webhookBodyLimitBytes ?? RUNTIME_DEFAULTS.runtime.webhookBodyLimitBytes,
            apiMaxRetries: cfg?.runtime?.apiMaxRetries ?? RUNTIME_DEFAULTS.runtime.apiMaxRetries,
            apiRetryBaseMs: cfg?.runtime?.apiRetryBaseMs ?? RUNTIME_DEFAULTS.runtime.apiRetryBaseMs,
            dedupeTtlMs: cfg?.runtime?.dedupeTtlMs ?? RUNTIME_DEFAULTS.runtime.dedupeTtlMs,
            sttTimeoutMs: cfg?.runtime?.sttTimeoutMs ?? RUNTIME_DEFAULTS.runtime.sttTimeoutMs,
            mediaTimeoutMs: cfg?.runtime?.mediaTimeoutMs ?? RUNTIME_DEFAULTS.runtime.mediaTimeoutMs,
            execTimeoutMs: cfg?.runtime?.execTimeoutMs ?? RUNTIME_DEFAULTS.runtime.execTimeoutMs,
            configCacheTtlMs: cfg?.runtime?.configCacheTtlMs ?? RUNTIME_DEFAULTS.runtime.configCacheTtlMs,
        },
        vendor: {
            name: cfg?.vendor?.name ?? RUNTIME_DEFAULTS.vendor.name,
            authHeader: cfg?.vendor?.authHeader ?? RUNTIME_DEFAULTS.vendor.authHeader,
        },
    };
}
export function resolveSyncConfig(cfg) {
    const enableWsClient = cfg?.sync?.enableWsClient ?? RUNTIME_DEFAULTS.sync.enableWsClient;
    const enableHttpFallback = cfg?.sync?.enableHttpFallback ?? RUNTIME_DEFAULTS.sync.enableHttpFallback;
    const fallbackSyncMs = enableHttpFallback
        ? (cfg?.sync?.fallbackSyncMs ?? RUNTIME_DEFAULTS.sync.fallbackSyncMs)
        : 0;
    return {
        fallbackSyncMs,
        wsReconnect: {
            initialDelayMs: cfg?.sync?.wsReconnect?.initialDelayMs ?? RUNTIME_DEFAULTS.sync.wsReconnect.initialDelayMs,
            maxDelayMs: cfg?.sync?.wsReconnect?.maxDelayMs ?? RUNTIME_DEFAULTS.sync.wsReconnect.maxDelayMs,
            multiplier: cfg?.sync?.wsReconnect?.multiplier ?? RUNTIME_DEFAULTS.sync.wsReconnect.multiplier,
        },
        enableWsClient,
        enableHttpFallback,
    };
}
