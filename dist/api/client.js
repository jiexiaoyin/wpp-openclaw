import { API_TIMEOUT_MS, API_MAX_RETRIES, API_RETRY_BASE_MS, VENDOR_BASE_PATH, DEFAULT_ACCOUNT_ID, API_JSON_MAX_BYTES, } from "../core/constants.js";
import { warn, error, formatErr } from "../core/logger.js";
import { getDefaultAccountRegistry } from "../account-state.js";
import { stringifyLargeInts } from "../util/bigint.js";
export { stringifyLargeInts };
const RETRYABLE_PATTERNS = [
    /fetch failed/i,
    /ECONNREFUSED/,
    /ETIMEDOUT/,
    /ENOTFOUND/,
    /EAI_AGAIN/,
    /socket hang up/i,
    /aborted/,
];
function isRetryable(status, err) {
    if (status >= 500 && status < 600)
        return true;
    if (status === 408 || status === 429)
        return true;
    if (!err)
        return false;
    const msg = err instanceof Error ? err.message : String(err);
    return RETRYABLE_PATTERNS.some((re) => re.test(msg));
}
export function parseJsonText(text) {
    const safe = stringifyLargeInts(text);
    try {
        return JSON.parse(safe);
    }
    catch {
        return null;
    }
}
export function buildUrl(baseUrl, endpoint) {
    const base = baseUrl.replace(/\/$/, "");
    const ep = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    return `${base}${VENDOR_BASE_PATH}${ep}`;
}
export function resolveCallCtx(baseUrl, opts) {
    if (baseUrl && opts.tokenKey) {
        return { baseUrl, tokenKey: opts.tokenKey, authcode: opts.authcode };
    }
    warn(`[WPP v1.3.59] resolveCallCtx: 缺凭证 (baseUrl=${baseUrl ? "有" : "空"} tokenKey=${opts.tokenKey ? "有" : "空"}) — 回落 default 账号凭证, 多账号场景请显式传凭证`);
    try {
        const state = getDefaultAccountRegistry().get(DEFAULT_ACCOUNT_ID);
        if (state?.config) {
            const cfg = state.config;
            return {
                baseUrl: cfg.apiBaseUrl || baseUrl,
                tokenKey: cfg.tokenKey || opts.tokenKey,
                authcode: cfg.authcode || opts.authcode,
            };
        }
    }
    catch {
    }
    return { baseUrl, tokenKey: opts.tokenKey, authcode: opts.authcode };
}
export function withAuthcodeQuery(url, authcode) {
    if (!authcode || url.includes("authcode="))
        return url;
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}authcode=${encodeURIComponent(authcode)}`;
}
export async function postWppJson(baseUrl, endpoint, body, opts) {
    const rt = resolveCallCtx(baseUrl, opts);
    const url = opts.raw ? `${rt.baseUrl.replace(/\/$/, "")}${endpoint.startsWith("/") ? endpoint : "/" + endpoint}` : buildUrl(rt.baseUrl, endpoint);
    const finalUrl = withAuthcodeQuery(url, rt.authcode);
    const timeoutMs = opts.timeoutMs ?? API_TIMEOUT_MS;
    const maxRetries = opts.maxRetries ?? API_MAX_RETRIES;
    const finalBody = { ...body };
    const ADMIN_ENDPOINTS = ["/Admin/", "/User/GetAllOnline"];
    const isAdminEndpoint = ADMIN_ENDPOINTS.some((p) => endpoint.startsWith(p));
    if (rt.authcode && finalBody["authcode"] === undefined && !isAdminEndpoint) {
        finalBody["authcode"] = rt.authcode;
    }
    let lastErr = null;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        const start = Date.now();
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), timeoutMs);
        try {
            const res = await fetch(finalUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-TokenKey": rt.tokenKey,
                    "X-Request-Id": `wpp-${Date.now()}-${attempt}`,
                },
                body: JSON.stringify(finalBody),
                signal: ac.signal,
            });
            clearTimeout(timer);
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
            const obj = parseJsonText(text);
            const ok = obj && typeof obj === "object" ? obj : {};
            const Code = ok.Code ?? 0;
            return {
                Code,
                CodeValue: ok.CodeValue,
                Data: ok.Data,
                raw: obj,
            };
        }
        catch (e) {
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
                raw: e.message,
            };
        }
    }
    error(`postWppJson ${endpoint} exhausted retries`, lastErr);
    return {
        Code: -1,
        CodeValue: "RETRIES_EXHAUSTED",
        raw: lastErr instanceof Error ? lastErr.message : String(lastErr),
    };
}
async function backoff(attempt) {
    const delay = API_RETRY_BASE_MS * Math.pow(2, attempt - 1);
    const jitter = Math.floor(Math.random() * 100);
    await new Promise((r) => setTimeout(r, delay + jitter));
}
export async function getWppJson(baseUrl, endpoint, opts) {
    const rt = resolveCallCtx(baseUrl, opts);
    const url = withAuthcodeQuery(buildUrl(rt.baseUrl, endpoint), rt.authcode);
    const timeoutMs = opts.timeoutMs ?? API_TIMEOUT_MS;
    const maxRetries = opts.maxRetries ?? API_MAX_RETRIES;
    let lastErr = null;
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
            const obj = parseJsonText(text);
            const ok = obj && typeof obj === "object" ? obj : {};
            return { Code: ok.Code ?? 0, Data: ok.Data, raw: obj };
        }
        catch (e) {
            clearTimeout(timer);
            lastErr = e;
            if (isRetryable(0, e) && attempt <= maxRetries) {
                await backoff(attempt);
                continue;
            }
            return { Code: -1, CodeValue: "NETWORK_ERROR", raw: e.message };
        }
    }
    return {
        Code: -1,
        CodeValue: "RETRIES_EXHAUSTED",
        raw: lastErr instanceof Error ? lastErr.message : String(lastErr),
    };
}
