// core/env.ts - 环境变量收口
// 仿 本项目/src/core/env.ts 范式 (typed frozen ENV_KEYS)

// WPP_* 环境变量清单 (typed frozen — TS 编译期校验)
export const ENV_KEYS = {
  // MariaDB
  WPP_DB_PASSWORD: "WPP_DB_PASSWORD",
  WPP_DB_HOST: "WPP_DB_HOST",
  WPP_DB_PORT: "WPP_DB_PORT",
  WPP_DB_USER: "WPP_DB_USER",
  WPP_DB_NAME: "WPP_DB_NAME",
  // 兼容旧名 (从 .env 已用 WECHATPRO_DB_PASSWORD 镜像)
  WECHATPRO_DB_PASSWORD: "WECHATPRO_DB_PASSWORD",
  // vendor vendor
  WPP_API_BASE: "WPP_API_BASE",
  WPP_TOKEN_KEY: "WPP_TOKEN_KEY",
  WPP_AUTHCODE: "WPP_AUTHCODE",
  // webhook
  WPP_WEBHOOK_HOST: "WPP_WEBHOOK_HOST",
  WPP_WEBHOOK_PORT: "WPP_WEBHOOK_PORT",
  WPP_WEBHOOK_PATH: "WPP_WEBHOOK_PATH",
  WPP_WEBHOOK_SECRET: "WPP_WEBHOOK_SECRET",
  // runtime
  WPP_DEBUG: "WPP_DEBUG",
} as const;

export type EnvKey = (typeof ENV_KEYS)[keyof typeof ENV_KEYS];

const TRUTHY_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);

/**
 * Get env var; fallback if undefined/empty.
 * 关键: process.env only — 不读 .env file (按 README .env 在 plugin root, 用 readEnvValue util)
 */
export function getEnv(key: string, fallback?: string): string | undefined {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  return v;
}

export function getEnvBool(key: string, fallback = false): boolean {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  return TRUTHY_VALUES.has(v.toLowerCase());
}

export function getEnvNumber(key: string, fallback?: number): number | undefined {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

/** 给 logger / config 用的统一缺失诊断 */
export function requireEnv(key: string): string {
  const v = process.env[key];
  if (v === undefined || v === "") {
    throw new Error(`required env var missing: ${key}`);
  }
  return v;
}
