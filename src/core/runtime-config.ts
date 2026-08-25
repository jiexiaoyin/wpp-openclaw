// src/core/runtime-config.ts - 运行时配置解析器 (v1.1.40 GLOBAL-CONFIG)
//
// 设计原则 (B 方案兼容):
//
// 借鉴 sunnoy/wecom §openclaw-compat.js resolvePluginConfig 范式
//   - sunnoy 用 module-level Map 缓存解析结果
//   - WPP 用对象 + getter 函数 (单例), 避免每次调用都重读 config

import type { WppGlobalConfig, WppAccountConfig } from "../types.js";
import {
  DEFAULT_VENDOR_API_BASE,
  VENDOR_BASE_PATH,
  WS_PATH,
  DEFAULT_BOT_NICKNAME,
  DEFAULT_WEBHOOK_HOST,
  DEFAULT_WEBHOOK_PORT,
  DEFAULT_WEBHOOK_PATH,
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_ACCOUNT_ID,
  REQUEST_TIMEOUT_MS,
  WEBHOOK_BODY_LIMIT_BYTES,
  API_TIMEOUT_MS,
  API_MAX_RETRIES,
  API_RETRY_BASE_MS,
  DEDUPE_TTL_MS,
} from "./constants.js";

// ============================================================
// 默认值常量 (集中管理, 唯一来源)
// ============================================================

export const RUNTIME_DEFAULTS = {
  // defaults 分组
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
  // runtime 分组
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
  // vendor 分组
  vendor: {
    name: "wechatpadpro",
    authHeader: "X-TokenKey",
  },
  // sync 分组 (WppAccountConfig.sync)
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

// ============================================================
// 解析器: GlobalConfig (config.json 提供 + 兜底)
// ============================================================

export interface ResolvedGlobalConfig {
  defaults: typeof RUNTIME_DEFAULTS.defaults;
  runtime: typeof RUNTIME_DEFAULTS.runtime;
  vendor: typeof RUNTIME_DEFAULTS.vendor;
}

/**
 * 解析 WppGlobalConfig → 完整 ResolvedGlobalConfig (所有字段填充默认值)
 *
 * 调用方: index.ts plugin register 时, 缓存结果到 module-level
 *
 * @param cfg 从 config.json 读的 WppGlobalConfig (可能字段缺失)
 * @returns ResolvedGlobalConfig (所有字段保证有值)
 */
export function resolveGlobalConfig(cfg: WppGlobalConfig | undefined): ResolvedGlobalConfig {
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

// ============================================================
// 解析器: AccountConfig.sync (单账号独有, 从 WppAccountConfig 读)
// ============================================================

export interface ResolvedSyncConfig {
  fallbackSyncMs: number;
  wsReconnect: {
    initialDelayMs: number;
    maxDelayMs: number;
    multiplier: number;
  };
  enableWsClient: boolean;
  enableHttpFallback: boolean;
}

export function resolveSyncConfig(cfg: WppAccountConfig | undefined): ResolvedSyncConfig {
  const enableWsClient = cfg?.sync?.enableWsClient ?? RUNTIME_DEFAULTS.sync.enableWsClient;
  const enableHttpFallback = cfg?.sync?.enableHttpFallback ?? RUNTIME_DEFAULTS.sync.enableHttpFallback;
  // v1.1.41 WS-DEGRADE: enableHttpFallback=false → fallbackSyncMs=0 (ws-client start() 会跳过 timer)
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

/**
 * 解析 WppAccountConfig.sync → ResolvedSyncConfig
 *
 * @param cfg WppAccountConfig
 * @returns ResolvedSyncConfig (所有字段保证有值)
 */