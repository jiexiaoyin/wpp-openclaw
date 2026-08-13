// src/api/client.ts - vendor HTTP API 客户端
// global fetch + 超时 + 3 retries; 大整数预引号化 (16+ 位 msgId 防 JSON.parse 丢精度)

import {
  API_TIMEOUT_MS,
  API_MAX_RETRIES,
  API_RETRY_BASE_MS,
  VENDOR_BASE_PATH,
  DEFAULT_ACCOUNT_ID,
  API_JSON_MAX_BYTES,
} from "../core/constants.js";
import { warn, error, formatErr } from "../core/logger.js";
import { getDefaultAccountRegistry } from "../account-state.js";
import { stringifyLargeInts } from "../util/bigint.js";
export { stringifyLargeInts }; // re-export (v1.3.27: 定义移入 util/bigint.ts, 兼容老调用方/测试)

/** Generic vendor API response shape (vendor 用 Code 字段判定) */
export interface WppApiResponse<T = unknown> {
  Code: number; // 0 = OK, -1/-8 = error, 200 = 兼容 http 200
  CodeValue?: string;
  Data?: T;
  raw: unknown;
}

/** Retryable http/network error patterns */
const RETRYABLE_PATTERNS = [
  /fetch failed/i,
  /ECONNREFUSED/,
  /ETIMEDOUT/,
  /ENOTFOUND/,
  /EAI_AGAIN/,
  /socket hang up/i,
  /aborted/,
];

function isRetryable(status: number, err?: unknown): boolean {
  if (status >= 500 && status < 600) return true;
  if (status === 408 || status === 429) return true;
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return RETRYABLE_PATTERNS.some((re) => re.test(msg));
}

/**
 * 反向: parseJson 时如果 msgId 是数字 (e.g. 后端忘了引号), 也尝试修复.
 * 但最佳策略是在 vendor 返回处修复, 调用方拿到 string.
 */
export function parseJsonText(text: string): unknown {
  const safe = stringifyLargeInts(text);
  try {
    return JSON.parse(safe);
  } catch {
    return null;
  }
}

/** Build full URL: {baseUrl}/api{endpoint} */
export function buildUrl(baseUrl: string, endpoint: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const ep = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${base}${VENDOR_BASE_PATH}${ep}`;
}

export interface WppCallOptions {
  /** 鉴权 tokenKey (vendor X-TokenKey header 或 body) */
  tokenKey: string;
  /** 已废弃: authcode 存在即自动注入, 无需显式开关 */
  withAuthcode?: boolean;
  /** vendor authcode (swagger 要求 query 必填, 实测缺失 → HTTP 400 Code=-1) */
  authcode?: string;
  /** 业务上下文 (account_id), 仅记日志用, 不发 vendor */
  accountId?: string;
  /** Default 30s timeout override */
  timeoutMs?: number;
  /** Default 3 retries override (0 = no retry) */
  maxRetries?: number;
  /** 不走 basePath 拼接 (vendor 极少数路径是 /Tools/... 不在 /api 下) */
  raw?: boolean;
}

export interface ResolvedCallCtx {
  baseUrl: string;
  tokenKey: string;
  authcode?: string;
}

/**
 * 空凭证兜底: agent tools meta 构建期 ctx 为空, execute 时从 registry 拿真实凭证 (否则 Failed to parse URL)
 */
export function resolveCallCtx(baseUrl: string, opts: WppCallOptions): ResolvedCallCtx {
  if (baseUrl && opts.tokenKey) {
    return { baseUrl, tokenKey: opts.tokenKey, authcode: opts.authcode };
  }
  // v1.3.59 P2 (2026-08-13 完整审阅): 缺凭证回落 default 前警告 (多账号下易跨账号凭证泄露)
  warn(`[WPP v1.3.59] resolveCallCtx: 缺凭证 (baseUrl=${baseUrl ? "有" : "空"} tokenKey=${opts.tokenKey ? "有" : "空"}) — 回落 default 账号凭证, 多账号场景请显式传凭证`);
  try {
    // 兜底取默认账号凭证 (单账号 demo); 多账号时调用方应带 baseUrl+tokenKey 直接返回
    const state = getDefaultAccountRegistry().get(DEFAULT_ACCOUNT_ID);
    if (state?.config) {
      const cfg = state.config;
      return {
        baseUrl: cfg.apiBaseUrl || baseUrl,
        tokenKey: cfg.tokenKey || opts.tokenKey,
        authcode: cfg.authcode || opts.authcode,
      };
    }
  } catch {
    // registry 未就绪 — 用原值 (调用方会拿到明确错误)
  }
  return { baseUrl, tokenKey: opts.tokenKey, authcode: opts.authcode };
}

/**
 * authcode 自动注入 URL query (vendor 全部 endpoint 要求, 缺失 → HTTP 400 "缺少授权码")
 */
export function withAuthcodeQuery(url: string, authcode?: string): string {
  if (!authcode || url.includes("authcode=")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}authcode=${encodeURIComponent(authcode)}`;
}

/**
 * POST to vendor API with retries + timeout + large-int stringification.
 */
export async function postWppJson<T = unknown>(
  baseUrl: string,
  endpoint: string,
  body: Record<string, unknown>,
  opts: WppCallOptions,
): Promise<WppApiResponse<T>> {
  // 空凭证兜底 (agent tools meta 空 ctx → registry 真实凭证)
  const rt = resolveCallCtx(baseUrl, opts);
  const url = opts.raw ? `${rt.baseUrl.replace(/\/$/, "")}${endpoint.startsWith("/") ? endpoint : "/" + endpoint}` : buildUrl(rt.baseUrl, endpoint);
  // URL query 注入 authcode (vendor swagger 要求 query 必填)
  const finalUrl = withAuthcodeQuery(url, rt.authcode);
  const timeoutMs = opts.timeoutMs ?? API_TIMEOUT_MS;
  const maxRetries = opts.maxRetries ?? API_MAX_RETRIES;

  // authcode 自动注入 body 顶层; Admin 端点白名单防护 (body.authcode 语义不同, 无差别注入会删/改本账号授权码)
  const finalBody: Record<string, unknown> = { ...body };
  const ADMIN_ENDPOINTS = ["/Admin/", "/User/GetAllOnline"];
  const isAdminEndpoint = ADMIN_ENDPOINTS.some((p) => endpoint.startsWith(p));
  if (rt.authcode && finalBody["authcode"] === undefined && !isAdminEndpoint) {
    finalBody["authcode"] = rt.authcode;
  }

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const start = Date.now();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(finalUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // vendor 自定义鉴权: X-TokenKey 头部 (adminmaxapi 二进制读取)
          "X-TokenKey": rt.tokenKey,
          "X-Request-Id": `wpp-${Date.now()}-${attempt}`,
        },
        body: JSON.stringify(finalBody),
        signal: ac.signal,
      });
      clearTimeout(timer);

      // v1.3.59 P2 (2026-08-13 完整审阅): JSON 响应体字节 cap (媒体端点经此下载 base64, 防巨型响应 OOM)
      const cl = Number(res.headers.get("content-length") ?? 0);
      if (cl > API_JSON_MAX_BYTES) {
        lastErr = new Error(`postWppJson ${endpoint} response too large: ${cl} > ${API_JSON_MAX_BYTES}`);
        return { Code: -2, CodeValue: "RESPONSE_TOO_LARGE", Data: undefined, raw: null };
      }
      const text = await res.text();
      if (text.length > API_JSON_MAX_BYTES) {
        lastErr = new Error(`postWppJson ${endpoint} response too large: ${text.length} > ${API_JSON_MAX_BYTES}`);
        return { Code: -2, CodeValue: "RESPONSE_TOO_LARGE", Data: undefined, raw: null };
      }
      const latency = Date.now() - start;

      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        if (isRetryable(res.status) && attempt <= maxRetries) {
          warn(`postWppJson ${endpoint} retry ${attempt}/${maxRetries}: HTTP ${res.status}`, {
            url,
            latencyMs: latency,
          });
          await backoff(attempt);
          continue;
        }
        return {
          Code: res.status,
          CodeValue: `HTTP_${res.status}`,
          raw: text,
        };
      }

      const obj = parseJsonText(text) as
        | { Code?: number; CodeValue?: string; Data?: T }
        | null;
      const ok = obj && typeof obj === "object" ? obj : {};
      const Code = ok.Code ?? 0;
      return {
        Code,
        CodeValue: ok.CodeValue,
        Data: ok.Data,
        raw: obj,
      };
    } catch (e) {
      clearTimeout(timer);
      const latency = Date.now() - start;
      lastErr = e;
      if (isRetryable(0, e) && attempt <= maxRetries) {
        warn(`postWppJson ${endpoint} retry ${attempt}/${maxRetries}: ${formatErr(e)}`, {
          url,
          latencyMs: latency,
        });
        await backoff(attempt);
        continue;
      }
      error(`postWppJson ${endpoint} failed: ${formatErr(e)}`, {
        url,
        latencyMs: latency,
      });
      return {
        Code: -1,
        CodeValue: "NETWORK_ERROR",
        raw: (e as Error).message,
      };
    }
  }

  // unreachable — loop always returns — but for type safety:
  error(`postWppJson ${endpoint} exhausted retries`, lastErr);
  return {
    Code: -1,
    CodeValue: "RETRIES_EXHAUSTED",
    raw: lastErr instanceof Error ? lastErr.message : String(lastErr),
  };
}

async function backoff(attempt: number): Promise<void> {
  const delay = API_RETRY_BASE_MS * Math.pow(2, attempt - 1);
  const jitter = Math.floor(Math.random() * 100);
  await new Promise((r) => setTimeout(r, delay + jitter));
}

/** GET 变种 (vendor: HeartBeatLogs/LongLinkStatus/CheckCanSetAlias/GetOnlineInfo/GroupList/List/GeneratePayQCode)  */
export async function getWppJson<T = unknown>(
  baseUrl: string,
  endpoint: string,
  opts: WppCallOptions,
): Promise<WppApiResponse<T>> {
  // 空凭证兜底; GET 也注入 authcode (vendor GET endpoint 要求 query authcode)
  const rt = resolveCallCtx(baseUrl, opts);
  const url = withAuthcodeQuery(buildUrl(rt.baseUrl, endpoint), rt.authcode);
  const timeoutMs = opts.timeoutMs ?? API_TIMEOUT_MS;
  const maxRetries = opts.maxRetries ?? API_MAX_RETRIES;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "X-TokenKey": rt.tokenKey,
          "X-Request-Id": `wpp-${Date.now()}-${attempt}`,
        },
        signal: ac.signal,
      });
      clearTimeout(timer);
      const text = await res.text();
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        if (isRetryable(res.status) && attempt <= maxRetries) {
          await backoff(attempt);
          continue;
        }
        return { Code: res.status, raw: text };
      }
      const obj = parseJsonText(text) as { Code?: number; Data?: T } | null;
      const ok = obj && typeof obj === "object" ? obj : {};
      return { Code: ok.Code ?? 0, Data: ok.Data, raw: obj };
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (isRetryable(0, e) && attempt <= maxRetries) {
        await backoff(attempt);
        continue;
      }
      return { Code: -1, CodeValue: "NETWORK_ERROR", raw: (e as Error).message };
    }
  }
  return {
    Code: -1,
    CodeValue: "RETRIES_EXHAUSTED",
    raw: lastErr instanceof Error ? lastErr.message : String(lastErr),
  };
}
