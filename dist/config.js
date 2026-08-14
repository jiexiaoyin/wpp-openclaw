import { readFile, readdir, rename, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { logObj as log, formatErr } from "./core/logger.js";
import { DEFAULT_ACCOUNT_ID } from "./core/constants.js";
import { findPluginRoot } from "./core/paths.js";
import { LruCache } from "./core/lru.js";
import { stringifyLargeInts } from "./util/bigint.js";
const configCache = new LruCache({
    maxSize: 8,
    ttlMs: 60_000,
});
export async function loadGlobalConfig() {
    const p = join(await findPluginRoot(), "config.json");
    const cached = configCache.get("__global__");
    if (cached && "storage" in cached) {
        const raw = { ...cached };
        if (raw.storage?.db?.mariadb?.passwordEnv) {
            const envPwd = process.env[raw.storage.db.mariadb.passwordEnv];
            if (envPwd)
                raw.storage.db.mariadb.password = envPwd;
        }
        return raw;
    }
    let raw;
    try {
        const text = await readFile(p, "utf8");
        raw = JSON.parse(text);
    }
    catch (e) {
        const err = e;
        if (err.code === "ENOENT")
            throw new Error(`config.json not found: ${p}`);
        throw e;
    }
    if (raw.storage?.db?.mariadb?.passwordEnv) {
        const envPwd = process.env[raw.storage.db.mariadb.passwordEnv];
        if (envPwd) {
            raw.storage.db.mariadb.password = envPwd;
        }
        else if (!raw.storage.db.mariadb.password) {
            throw new Error(`mariadb password missing: set ${raw.storage.db.mariadb.passwordEnv} env var`);
        }
    }
    configCache.set("__global__", raw);
    return raw;
}
export const loadGlobalConfigAsync = loadGlobalConfig;
export function isValidAccountId(accountId) {
    return typeof accountId === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(accountId);
}
export function readGuidedPluginConfig() {
    const root = process.env.OPENCLAW_ROOT || (process.env.HOME ? `${process.env.HOME}/.openclaw` : "/root/.openclaw");
    try {
        const raw = readFileSync(join(root, "openclaw.json"), "utf8");
        const cfg = JSON.parse(raw);
        const guided = cfg?.plugins?.entries?.wechatpadpro?.config;
        return guided && Object.keys(guided).length > 0 ? guided : null;
    }
    catch {
        return null;
    }
}
export function mergeGuidedConfig(raw, guided) {
    const out = { ...raw };
    const stringField = (key) => {
        const v = guided[key];
        if (typeof v === "string" && v && !out[key]) {
            out[key] = v;
        }
    };
    const stringArrayField = (key) => {
        const v = guided[key];
        if (typeof v === "string" && v && (!Array.isArray(out[key]) || out[key].length === 0)) {
            out[key] = v.split(",").map((s) => s.trim()).filter(Boolean);
        }
    };
    stringField("tokenKey");
    stringField("apiBaseUrl");
    stringField("wsUrl");
    stringField("groupPolicy");
    stringField("agent");
    stringField("webhookPath");
    stringField("webhookPathToken");
    stringField("nickname");
    stringField("selfWxid");
    const port = guided.webhookPort;
    if (typeof port === "number" && port > 0 && !out.webhookPort)
        out.webhookPort = port;
    stringArrayField("allowFrom");
    stringArrayField("groupAllowFrom");
    return out;
}
export async function loadAccountConfig(accountId = DEFAULT_ACCOUNT_ID) {
    if (!isValidAccountId(accountId)) {
        throw new Error(`invalid accountId (must match /^[a-zA-Z0-9_-]{1,64}$/): ${JSON.stringify(accountId)}`);
    }
    const cached = configCache.get(accountId);
    if (cached && "nickname" in cached) {
        const raw = { ...cached };
        if (raw.tokenKeyEnv) {
            const envToken = process.env[raw.tokenKeyEnv];
            if (envToken)
                raw.tokenKey = envToken;
        }
        if (raw.authcodeEnv) {
            const envAuth = process.env[raw.authcodeEnv];
            if (envAuth)
                raw.authcode = envAuth;
        }
        if (typeof raw.webhookSecretEnv === "string" && raw.webhookSecretEnv && !raw.webhookSecret) {
            const envSecret = process.env[raw.webhookSecretEnv];
            if (envSecret)
                raw.webhookSecret = envSecret;
        }
        return raw;
    }
    const p = join(await findPluginRoot(), "accounts", `${accountId}.json`);
    let raw;
    try {
        const text = await readFile(p, "utf8");
        raw = JSON.parse(text);
    }
    catch (e) {
        const err = e;
        if (err.code === "ENOENT")
            throw new Error(`account config not found: ${p}`);
        throw e;
    }
    if (accountId === DEFAULT_ACCOUNT_ID) {
        try {
            const guided = readGuidedPluginConfig();
            if (guided) {
                raw = mergeGuidedConfig(raw, guided);
                log.info(`account=${accountId}: merged guided config from openclaw.json plugins.entries.wechatpadpro.config (OpenClaw 引导)`);
            }
        }
        catch (e) {
            log.warn(`account=${accountId}: read guided plugin config failed (non-fatal): ${formatErr(e)}`);
        }
    }
    if (raw.tokenKeyEnv) {
        if (raw.tokenKey) {
            log.warn(`account=${accountId}: both tokenKey and tokenKeyEnv set, env wins (tokenKey ignored for security)`);
        }
        const envToken = process.env[raw.tokenKeyEnv];
        if (envToken) {
            raw.tokenKey = envToken;
            log.info(`account=${accountId}: tokenKey loaded from env ${raw.tokenKeyEnv}`);
        }
        else if (!raw.tokenKey) {
            log.warn(`account=${accountId}: tokenKeyEnv=${raw.tokenKeyEnv} but env empty AND tokenKey empty — plugin will fail to start`);
        }
    }
    else if (raw.tokenKey) {
        log.info(`account=${accountId}: tokenKey loaded (plaintext, recommend tokenKeyEnv)`);
    }
    if (raw.authcodeEnv) {
        const envAuth = process.env[raw.authcodeEnv];
        if (envAuth)
            raw.authcode = envAuth;
    }
    if (typeof raw.webhookSecretEnv === "string" && raw.webhookSecretEnv && !raw.webhookSecret) {
        const envSecret = process.env[raw.webhookSecretEnv];
        if (envSecret) {
            raw.webhookSecret = envSecret;
            log.info(`account=${accountId}: webhookSecret loaded from env ${raw.webhookSecretEnv}`);
        }
        else {
            log.warn(`account=${accountId}: webhookSecretEnv=${raw.webhookSecretEnv} but env empty — HMAC verification OFF`);
        }
    }
    if (raw.webhookPublicUrlEnv) {
        const envUrl = process.env[raw.webhookPublicUrlEnv];
        if (envUrl)
            raw.webhookPublicUrl = envUrl;
    }
    if (raw.autoSetWebhook === undefined)
        raw.autoSetWebhook = true;
    if (!raw.setWebhookRetries || raw.setWebhookRetries < 1)
        raw.setWebhookRetries = 3;
    log.info(`loaded account config: ${accountId} (apiBase=${raw.apiBaseUrl}, ws=${raw.wsUrl})`);
    configCache.set(accountId, raw);
    return raw;
}
export const loadAccountConfigAsync = loadAccountConfig;
export async function listAccountIds() {
    const dir = join(await findPluginRoot(), "accounts");
    let entries;
    try {
        entries = await readdir(dir);
    }
    catch (e) {
        const err = e;
        if (err.code === "ENOENT")
            return [];
        throw e;
    }
    return entries
        .filter((f) => f.endsWith(".json"))
        .filter((f) => !f.startsWith("."))
        .map((f) => f.replace(/\.json$/, ""));
}
export function isConfigured(cfg) {
    const tokenKey = cfg.tokenKey || (cfg.tokenKeyEnv ? process.env[cfg.tokenKeyEnv] ?? "" : "");
    const authcode = cfg.authcode || (cfg.authcodeEnv ? process.env[cfg.authcodeEnv] ?? "" : "");
    return !!(cfg.enabled && tokenKey && cfg.apiBaseUrl && authcode);
}
let watchTimer = null;
let watchDebounceMs = 300;
let watchActive = false;
let globalWatchTimer = null;
let globalWatchActive = false;
export function invalidateConfigCache(accountId) {
    if (accountId)
        configCache.delete(accountId);
    else
        configCache.clear();
}
export function setWatchDebounceMs(ms) {
    watchDebounceMs = ms;
}
export function isWatchingAccounts() {
    return watchActive;
}
export function isWatchingGlobalConfig() {
    return globalWatchActive;
}
export async function watchAccountConfigs(onChange) {
    const dir = join(await findPluginRoot(), "accounts");
    let watcher = null;
    const handleChange = (eventType, filename) => {
        if (!filename || !filename.endsWith(".json") || filename.startsWith("."))
            return;
        const accountId = filename.replace(/\.json$/, "");
        if (watchTimer)
            clearTimeout(watchTimer);
        watchTimer = setTimeout(async () => {
            try {
                invalidateConfigCache(accountId);
                const cfg = await loadAccountConfig(accountId);
                log.info(`config hot-reload detected: ${accountId} (${eventType})`);
                await onChange(accountId, cfg);
            }
            catch (e) {
                const err = e;
                log.warn(`config hot-reload failed: ${accountId}: ${err.message ?? String(e)}`);
            }
        }, watchDebounceMs);
    };
    if (watchActive) {
        log.warn(`watchAccountConfigs: already watching, returning no-op unwatch`);
        return () => { };
    }
    try {
        watcher = await import("node:fs").then((fs) => fs.watch(dir, handleChange));
        watchActive = true;
        log.info(`watching accounts dir: ${dir} (hot-reload enabled)`);
    }
    catch (e) {
        const err = e;
        log.warn(`watchAccountConfigs: fs.watch failed (${err.message ?? String(e)}), hot-reload disabled`);
        watchActive = false;
        return () => { };
    }
    return () => {
        try {
            watcher?.close();
        }
        catch {
        }
        watchActive = false;
        if (watchTimer)
            clearTimeout(watchTimer);
        log.info(`stopped watching accounts dir`);
    };
}
export async function watchGlobalConfig(onChange) {
    const path = join(await findPluginRoot(), "config.json");
    let watcher = null;
    const handleChange = () => {
        if (globalWatchTimer)
            clearTimeout(globalWatchTimer);
        globalWatchTimer = setTimeout(async () => {
            try {
                invalidateConfigCache("__global__");
                const cfg = await loadGlobalConfig();
                log.info(`config.json hot-reload detected`);
                await onChange(cfg);
            }
            catch (e) {
                log.warn(`config.json hot-reload failed: ${e.message ?? String(e)}`);
            }
        }, watchDebounceMs);
    };
    if (globalWatchActive) {
        log.warn(`watchGlobalConfig: already watching, returning no-op unwatch`);
        return () => { };
    }
    try {
        watcher = await import("node:fs").then((fs) => fs.watch(path, handleChange));
        globalWatchActive = true;
        log.info(`watching config.json: ${path} (hot-reload enabled)`);
    }
    catch (e) {
        log.warn(`watchGlobalConfig: fs.watch failed (${e.message}), hot-reload disabled`);
        globalWatchActive = false;
        return () => { };
    }
    return () => {
        try {
            watcher?.close();
        }
        catch {
        }
        globalWatchActive = false;
        if (globalWatchTimer)
            clearTimeout(globalWatchTimer);
        log.info(`stopped watching config.json`);
    };
}
export async function appendAllowFrom(accountId, wxid) {
    const dir = join(await findPluginRoot(), "accounts");
    const filePath = join(dir, `${accountId}.json`);
    let raw;
    try {
        const text = await readFile(filePath, "utf8");
        raw = JSON.parse(text);
    }
    catch (e) {
        const err = e;
        log.warn(`appendAllowFrom: read ${accountId}.json failed: ${err.code ?? String(e)}`);
        return { ok: false, allowFrom: [], filePath, reason: err.code === "ENOENT" ? "account-not-found" : "read-failed" };
    }
    const allowFrom = Array.isArray(raw.allowFrom) ? raw.allowFrom : [];
    if (allowFrom.includes(wxid)) {
        return { ok: true, allowFrom, filePath };
    }
    allowFrom.push(wxid);
    raw.allowFrom = allowFrom;
    try {
        const tmpPath = `${filePath}.tmp`;
        await writeFile(tmpPath, stringifyLargeInts(JSON.stringify(raw, null, 2)) + "\n", "utf8");
        await rename(tmpPath, filePath);
    }
    catch (e) {
        log.warn(`appendAllowFrom: write ${accountId}.json failed: ${e.message}`);
        return { ok: false, allowFrom, filePath, reason: "write-failed" };
    }
    invalidateConfigCache(accountId);
    log.info(`appendAllowFrom: account=${accountId} allowFrom=${allowFrom.length} (+${wxid})`);
    return { ok: true, allowFrom, filePath };
}
export async function appendGroupAllowFrom(accountId, chatroomId) {
    const dir = join(await findPluginRoot(), "accounts");
    const filePath = join(dir, `${accountId}.json`);
    let raw;
    try {
        const text = await readFile(filePath, "utf8");
        raw = JSON.parse(text);
    }
    catch (e) {
        const err = e;
        log.warn(`appendGroupAllowFrom: read ${accountId}.json failed: ${err.code ?? String(e)}`);
        return { ok: false, groupAllowFrom: [], filePath, reason: err.code === "ENOENT" ? "account-not-found" : "read-failed" };
    }
    const groupAllowFrom = Array.isArray(raw.groupAllowFrom) ? raw.groupAllowFrom : [];
    if (groupAllowFrom.includes(chatroomId)) {
        return { ok: true, groupAllowFrom, filePath };
    }
    groupAllowFrom.push(chatroomId);
    raw.groupAllowFrom = groupAllowFrom;
    try {
        const tmpPath = `${filePath}.tmp`;
        await writeFile(tmpPath, stringifyLargeInts(JSON.stringify(raw, null, 2)) + "\n", "utf8");
        await rename(tmpPath, filePath);
    }
    catch (e) {
        log.warn(`appendGroupAllowFrom: write ${accountId}.json failed: ${e.message}`);
        return { ok: false, groupAllowFrom, filePath, reason: "write-failed" };
    }
    invalidateConfigCache(accountId);
    log.info(`appendGroupAllowFrom: account=${accountId} groupAllowFrom=${groupAllowFrom.length} (+${chatroomId})`);
    return { ok: true, groupAllowFrom, filePath };
}
export async function removeAllowFrom(accountId, wxid) {
    const dir = join(await findPluginRoot(), "accounts");
    const filePath = join(dir, `${accountId}.json`);
    let raw;
    try {
        const text = await readFile(filePath, "utf8");
        raw = JSON.parse(text);
    }
    catch (e) {
        const err = e;
        log.warn(`removeAllowFrom: read ${accountId}.json failed: ${err.code ?? String(e)}`);
        return { ok: false, allowFrom: [], filePath, reason: err.code === "ENOENT" ? "account-not-found" : "read-failed" };
    }
    const allowFrom = Array.isArray(raw.allowFrom) ? raw.allowFrom : [];
    const idx = allowFrom.indexOf(wxid);
    if (idx === -1) {
        return { ok: true, allowFrom, filePath };
    }
    allowFrom.splice(idx, 1);
    raw.allowFrom = allowFrom;
    try {
        const tmpPath = `${filePath}.tmp`;
        await writeFile(tmpPath, stringifyLargeInts(JSON.stringify(raw, null, 2)) + "\n", "utf8");
        await rename(tmpPath, filePath);
    }
    catch (e) {
        log.warn(`removeAllowFrom: write ${accountId}.json failed: ${e.message}`);
        return { ok: false, allowFrom, filePath, reason: "write-failed" };
    }
    invalidateConfigCache(accountId);
    log.info(`removeAllowFrom: account=${accountId} allowFrom=${allowFrom.length} (-${wxid})`);
    return { ok: true, allowFrom, filePath };
}
export async function removeGroupAllowFrom(accountId, chatroomId) {
    const dir = join(await findPluginRoot(), "accounts");
    const filePath = join(dir, `${accountId}.json`);
    let raw;
    try {
        const text = await readFile(filePath, "utf8");
        raw = JSON.parse(text);
    }
    catch (e) {
        const err = e;
        log.warn(`removeGroupAllowFrom: read ${accountId}.json failed: ${err.code ?? String(e)}`);
        return { ok: false, groupAllowFrom: [], filePath, reason: err.code === "ENOENT" ? "account-not-found" : "read-failed" };
    }
    const groupAllowFrom = Array.isArray(raw.groupAllowFrom) ? raw.groupAllowFrom : [];
    const idx = groupAllowFrom.indexOf(chatroomId);
    if (idx === -1) {
        return { ok: true, groupAllowFrom, filePath };
    }
    groupAllowFrom.splice(idx, 1);
    raw.groupAllowFrom = groupAllowFrom;
    try {
        const tmpPath = `${filePath}.tmp`;
        await writeFile(tmpPath, stringifyLargeInts(JSON.stringify(raw, null, 2)) + "\n", "utf8");
        await rename(tmpPath, filePath);
    }
    catch (e) {
        log.warn(`removeGroupAllowFrom: write ${accountId}.json failed: ${e.message}`);
        return { ok: false, groupAllowFrom, filePath, reason: "write-failed" };
    }
    invalidateConfigCache(accountId);
    log.info(`removeGroupAllowFrom: account=${accountId} groupAllowFrom=${groupAllowFrom.length} (-${chatroomId})`);
    return { ok: true, groupAllowFrom, filePath };
}
