// src/api/client.ts - vendor HTTP API 客户端
// 范式仿 本项目/src/api/client.ts
// 关键:
//  - global fetch + AbortSignal.timeout(30s)  + 3 retries exp backoff
//  - 大整数预引号化 (vendor 返回 16+ 位 msgId → JSON.parse 丢精度 = silent killer)
//  - 5xx/网络错误重试, 其他 throw

import {
  API_TIMEOUT_MS,
  API_MAX_RETRIES,
  API_RETRY_BASE_MS,
  VENDOR_BASE_PATH,
} from "../core/constants.js";
import { warn, error, formatErr } from "../core/logger.js";
import { getDefaultAccountRegistry } from "../account-state.js";

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
 * Pre-process JSON text to wrap 16+ digit integers as quoted strings.
 * 关键: vendor 返回的 msg_id / new_msg_id 可能 16+ 位 (e.g. 1899234567890123456),
 *       不预先引号化 → JSON.parse 会丢精度 (Number.MAX_SAFE_INTEGER = 9007199254740992)
 *       silent killer: 消息回查时找不到
 */
export function stringifyLargeInts(jsonText: string): string {
  // 匹配 key 后接 16+ 整数 value 的 :1234567890123456,
  // 后面可以是 ,/空格/}/] 或字符串末尾
  return jsonText.replace(
    /("[\w$]+"\s*:\s*)(\d{16,})(?=[,\s}\]]|$)/g,
    '$1"$2"',
  );
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
  /** 是否需要 vendor 也签名 authcode (默认仅 tokenKey) — v1.1.15 P1-1: 已废弃, authcode 存在即自动注入 */
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
 * P0-1 complete-fix (2026-08-08): 空凭证兜底
 * agent tools meta 构建期 ctx 为空 (baseUrl="", tokenKey="", accountId=""),
 * 实际 execute 时从 registry 拿 default 账号真实凭证 (仿 gewe execute 动态解析 account).
 * 这样 plugin.agentTools 暴露的 162 个工具才真正可调用 (之前空 baseUrl → Failed to parse URL).
 */
export function resolveCallCtx(baseUrl: string, opts: WppCallOptions): ResolvedCallCtx {
  if (baseUrl && opts.tokenKey) {
    return { baseUrl, tokenKey: opts.tokenKey, authcode: opts.authcode };
  }
  try {
    const state = getDefaultAccountRegistry().get("default");
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
 * v1.1.15 P1-1 complete-fix: authcode 自动注入 URL query (仿老 api-client.ts:32-38)
 * vendor 全部 endpoint 要求 authcode, 实测 GET 无 authcode → HTTP 400 Code=-1 "缺少授权码"
 */
export function withAuthcodeQuery(url: string, authcode?: string): string {
  if (!authcode || url.includes("authcode=")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}authcode=${encodeURIComponent(authcode)}`;
}

/**
 * POST to vendor API with retries + timeout + large-int stringification.
 * - Always POST (vendor 二进制 scan: 都是 POST + GET) — 但 endpoint with '?key' 可能 GET, 一律 POST
 * - throws on non-retryable error after retries exhausted
 * - returns WppApiResponse on 2xx (with vendor Code 解析)
 */
export async function postWppJson<T = unknown>(
  baseUrl: string,
  endpoint: string,
  body: Record<string, unknown>,
  opts: WppCallOptions,
): Promise<WppApiResponse<T>> {
  // P0-1 complete-fix: 空凭证兜底 (agent tools meta 空 ctx → registry 真实凭证)
  const rt = resolveCallCtx(baseUrl, opts);
  const url = opts.raw ? `${rt.baseUrl.replace(/\/$/, "")}${endpoint.startsWith("/") ? endpoint : "/" + endpoint}` : buildUrl(rt.baseUrl, endpoint);
  // v1.1.15 P1-1 complete-fix: URL query 注入 authcode (vendor swagger 要求 query 必填)
  const finalUrl = withAuthcodeQuery(url, rt.authcode);
  const timeoutMs = opts.timeoutMs ?? API_TIMEOUT_MS;
  const maxRetries = opts.maxRetries ?? API_MAX_RETRIES;

  // v1.1.15 P1-1 complete-fix: authcode 自动注入 body 顶层 (不再依赖 withAuthcode flag)
  //   vendor 全部 endpoint 要求 authcode (实测缺失 → HTTP 400 Code=-1)
  // v1.1.17 FULL-FIX (P0-D): Admin 端点已从插件移除 (权限过高, 2026-08-08 老板拍板)
  //   这里加白名单防护: 即使未来有人误加 Admin 端点, 也不会把本账号 authcode 塞进 body
  //   (Admin 端点 body.authcode 语义 = "待操作的目标授权码", 无差别注入会删/改本账号授权码)
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

      const text = await res.text();
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
  // P0-1 complete-fix: 空凭证兜底 (agent tools meta 空 ctx → registry 真实凭证)
  const rt = resolveCallCtx(baseUrl, opts);
  // v1.1.15 P1-1 complete-fix: GET 也注入 authcode (vendor GET endpoint 如 /User/GetContractProfile 要求 query authcode)
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
