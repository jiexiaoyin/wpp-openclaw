// config.ts - B 方案配置加载器
// 单账号: accounts/default.json, 多账号: accounts/<id>.json
// src/config.ts - 配置加载 (带 LRU cache 减少 sync I/O)

import { readFile, readdir, rename, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { logObj as log, formatErr } from "./core/logger.js";
import { DEFAULT_ACCOUNT_ID } from "./core/constants.js";
import { findPluginRoot } from "./core/paths.js";
import { LruCache } from "./core/lru.js";
import type { WppAccountConfig, WppGlobalConfig } from "./types.js";
import { stringifyLargeInts } from "./util/bigint.js"; // v1.3.27 P2-1: 写配置防 16+ 位整数丢精度

// 仿 模式: 不再硬编码 PLUGIN_ROOT, 走 findPluginRoot walks 6 levels
// 避免 import.meta.dirname 在 dist/ 被打包时偏移导致 silent file-not-found

const configCache = new LruCache<WppAccountConfig | WppGlobalConfig>({
  maxSize: 8,
  ttlMs: 60_000,
});

export async function loadGlobalConfig(): Promise<WppGlobalConfig> {
  const p = join(await findPluginRoot(), "config.json");
  // 查 cache (但 password 注入不能用 cache, 永远重读以取最新 env)
  const cached = configCache.get("__global__");
  if (cached && "storage" in cached) {
    // 仍重读 env (env 可变, cache 只省 disk 解析)
    const raw = { ...cached };
    if (raw.storage?.db?.mariadb?.passwordEnv) {
      const envPwd = process.env[raw.storage.db.mariadb.passwordEnv];
      if (envPwd) raw.storage.db.mariadb.password = envPwd;
    }
    return raw;
  }
  let raw: WppGlobalConfig;
  try {
    const text = await readFile(p, "utf8");
    raw = JSON.parse(text) as WppGlobalConfig;
  } catch (e) {
    const err = e as NodeJS.ErrnoException; if (err.code === "ENOENT") throw new Error(`config.json not found: ${p}`);
    throw e;
  }
  // 密码从环境变量取 (token/password 单一来源铁律)
  if (raw.storage?.db?.mariadb?.passwordEnv) {
    const envPwd = process.env[raw.storage.db.mariadb.passwordEnv];
    if (envPwd) {
      raw.storage.db.mariadb.password = envPwd;
    } else if (!raw.storage.db.mariadb.password) {
      throw new Error(
        `mariadb password missing: set ${raw.storage.db.mariadb.passwordEnv} env var`,
      );
    }
  }
  configCache.set("__global__", raw);
  return raw;
}

/**
 * 异步版本 loadGlobalConfig (fs/promises readFile, 不阻塞 event loop)
 */
export const loadGlobalConfigAsync = loadGlobalConfig;

/**
 * v1.0.3 FIX-A2 (P3-2 路径穿越 sanitize):
 * 验证 accountId 是安全的 (仅 [a-zA-Z0-9_-], 长度 1-64)
 * 防止 path traversal: "..", "/", "\\", 绝对路径
 */
export function isValidAccountId(accountId: string): boolean {
  return typeof accountId === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(accountId);
}

// ============ v1.3.62 OPENCLAW-GUIDED-SETUP ============
// OpenClaw `configure --section plugins` 引导写 plugins.entries.wechatpadpro.config。
// 插件从该配置读兜底 (default 账号, 字段级 merge: OpenClaw 引导值优先, 文件已有值保留)。

/** 读 OpenClaw 引导的插件配置 (plugins.entries.wechatpadpro.config), 无则 null (导出供测试) */
export function readGuidedPluginConfig(): Record<string, unknown> | null {
  const root = process.env.OPENCLAW_ROOT || (process.env.HOME ? `${process.env.HOME}/.openclaw` : "/root/.openclaw");
  try {
    const raw = readFileSync(join(root, "openclaw.json"), "utf8");
    const cfg = JSON.parse(raw) as {
      plugins?: { entries?: { wechatpadpro?: { config?: Record<string, unknown> } } };
    };
    const guided = cfg?.plugins?.entries?.wechatpadpro?.config;
    return guided && Object.keys(guided).length > 0 ? guided : null;
  } catch {
    return null; // openclaw.json 缺失/损坏 → 无引导配置 (不阻塞)
  }
}

/** 字段级 merge: guided 值仅在 raw 为空/缺失时填充 (导出供测试) */
export function mergeGuidedConfig(raw: WppAccountConfig, guided: Record<string, unknown>): WppAccountConfig {
  const out = { ...raw };
  const stringField = (key: string): void => {
    const v = guided[key];
    if (typeof v === "string" && v && !(out as Record<string, unknown>)[key]) {
      (out as Record<string, unknown>)[key] = v;
    }
  };
  const stringArrayField = (key: string): void => {
    const v = guided[key];
    if (typeof v === "string" && v && (!Array.isArray((out as Record<string, unknown>)[key]) || ((out as Record<string, unknown>)[key] as unknown[]).length === 0)) {
      (out as Record<string, unknown>)[key] = v.split(",").map((s) => s.trim()).filter(Boolean);
    }
  };
  // 字符串字段
  stringField("tokenKey"); stringField("apiBaseUrl"); stringField("wsUrl");
  stringField("groupPolicy"); stringField("agent"); stringField("webhookPath"); stringField("nickname"); stringField("selfWxid");
  // 数字字段
  const port = guided.webhookPort;
  if (typeof port === "number" && port > 0 && !out.webhookPort) out.webhookPort = port;
  // 数组字段 (OpenClaw 引导用逗号串)
  stringArrayField("allowFrom"); stringArrayField("groupAllowFrom");
  return out;
}

export async function loadAccountConfig(accountId: string = DEFAULT_ACCOUNT_ID): Promise<WppAccountConfig> {
  if (!isValidAccountId(accountId)) {
    throw new Error(`invalid accountId (must match /^[a-zA-Z0-9_-]{1,64}$/): ${JSON.stringify(accountId)}`);
  }
  const cached = configCache.get(accountId);
  if (cached && "nickname" in cached) {
    const raw = { ...cached };
    if (raw.tokenKeyEnv) {
      const envToken = process.env[raw.tokenKeyEnv];
      if (envToken) raw.tokenKey = envToken;
    }
    if (raw.authcodeEnv) {
      const envAuth = process.env[raw.authcodeEnv];
      if (envAuth) raw.authcode = envAuth;
    }
    // v1.3.18 B-8 fix: cache 层也补 webhookSecret env 注入 (跟 disk 路径一致)
    if (typeof raw.webhookSecretEnv === "string" && raw.webhookSecretEnv && !raw.webhookSecret) {
      const envSecret = process.env[raw.webhookSecretEnv];
      if (envSecret) raw.webhookSecret = envSecret;
    }
    return raw;
  }
  const p = join(await findPluginRoot(), "accounts", `${accountId}.json`);
  let raw: WppAccountConfig;
  try {
    const text = await readFile(p, "utf8");
    raw = JSON.parse(text) as WppAccountConfig;
  } catch (e) {
    const err = e as NodeJS.ErrnoException; if (err.code === "ENOENT") throw new Error(`account config not found: ${p}`);
    throw e;
  }
  // v1.3.62 OPENCLAW-GUIDED-SETUP (2026-08-13 老板拍板): OpenClaw `configure --section plugins` 引导写
  //   plugins.entries.wechatpadpro.config。对 default 账号, 从该配置兜底填充缺失字段 (OpenClaw 引导优先, 文件已有值保留)。
  if (accountId === DEFAULT_ACCOUNT_ID) {
    try {
      const guided = readGuidedPluginConfig();
      if (guided) {
        raw = mergeGuidedConfig(raw, guided);
        log.info(`account=${accountId}: merged guided config from openclaw.json plugins.entries.wechatpadpro.config (OpenClaw 引导)`);
      }
    } catch (e) {
      log.warn(`account=${accountId}: read guided plugin config failed (non-fatal): ${formatErr(e)}`);
    }
  }
  // 凭证优先从环境变量取
  if (raw.tokenKeyEnv) {
    // v1.3.18 P3-D-2: tokenKeyEnv 优先级日志 - 明确告知用户哪个字段生效 (防止两个都填不知谁生效)
    if (raw.tokenKey) {
      log.warn(
        `account=${accountId}: both tokenKey and tokenKeyEnv set, env wins (tokenKey ignored for security)`,
      );
    }
    const envToken = process.env[raw.tokenKeyEnv];
    if (envToken) {
      raw.tokenKey = envToken;
      log.info(`account=${accountId}: tokenKey loaded from env ${raw.tokenKeyEnv}`);
    } else if (!raw.tokenKey) {
      log.warn(
        `account=${accountId}: tokenKeyEnv=${raw.tokenKeyEnv} but env empty AND tokenKey empty — plugin will fail to start`,
      );
    }
  } else if (raw.tokenKey) {
    log.info(`account=${accountId}: tokenKey loaded (plaintext, recommend tokenKeyEnv)`);
  }
  if (raw.authcodeEnv) {
    const envAuth = process.env[raw.authcodeEnv];
    if (envAuth) raw.authcode = envAuth;
  }
  // v1.3.18 B-8 fix (2026-08-10): webhookSecretEnv 真接入 — 不再死配, webhook HMAC 验签才能 ON
  //   (跟 tokenKeyEnv/authcodeEnv 同模式: raw.webhookSecret 优先, 缺失才从 env 取)
  if (typeof raw.webhookSecretEnv === "string" && raw.webhookSecretEnv && !raw.webhookSecret) {
    const envSecret = process.env[raw.webhookSecretEnv];
    if (envSecret) {
      raw.webhookSecret = envSecret;
      log.info(`account=${accountId}: webhookSecret loaded from env ${raw.webhookSecretEnv}`);
    } else {
      log.warn(`account=${accountId}: webhookSecretEnv=${raw.webhookSecretEnv} but env empty — HMAC verification OFF`);
    }
  }
  // webhookPublicUrl env var fallback (跟 tokenKey/authcode 同模式)
  if (raw.webhookPublicUrlEnv) {
    const envUrl = process.env[raw.webhookPublicUrlEnv];
    if (envUrl) raw.webhookPublicUrl = envUrl;
  }
  // autoSetWebhook 默认 true (跟其他 boolean 配置一致的 falsy fallback)
  if (raw.autoSetWebhook === undefined) raw.autoSetWebhook = true;
  if (!raw.setWebhookRetries || raw.setWebhookRetries < 1) raw.setWebhookRetries = 3;
  log.info(`loaded account config: ${accountId} (apiBase=${raw.apiBaseUrl}, ws=${raw.wsUrl})`);
  configCache.set(accountId, raw);
  return raw;
}

/**
 * 异步版本 loadAccountConfig
 */
export const loadAccountConfigAsync = loadAccountConfig;

export async function listAccountIds(): Promise<string[]> {
  const dir = join(await findPluginRoot(), "accounts");
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (e) {
    const err = e as NodeJS.ErrnoException; if (err.code === "ENOENT") return [];
    throw e;
  }
  return entries
    .filter((f) => f.endsWith(".json"))
    .filter((f) => !f.startsWith("."))
    .map((f) => f.replace(/\.json$/, ""));
}

/**
 * 判断账号是否已配置 (OpenClaw 验证通过才调 gateway.startAccount)
 * 必须支持 env var fallback (否则 tokenKey 为空字符串 → 误判 unconfigured → webhook 永不启动)
 */
export function isConfigured(cfg: WppAccountConfig): boolean {
  // env var fallback (跟 loadAccountConfig 缓存层逻辑一致)
  const tokenKey = cfg.tokenKey || (cfg.tokenKeyEnv ? process.env[cfg.tokenKeyEnv] ?? "" : "");
  const authcode = cfg.authcode || (cfg.authcodeEnv ? process.env[cfg.authcodeEnv] ?? "" : "");
  return !!(cfg.enabled && tokenKey && cfg.apiBaseUrl && authcode);
}

// ===================== HOT-RELOAD =====================
// 改 accounts/<id>.json 运行时字段零重启生效: fs.watch → 防抖 → 清 cache → 重读 → 回调。
// 注意: 编辑器保存常先 rename (tmp) 再 change → 防抖 + 重读磁盘双保险。

let watchTimer: NodeJS.Timeout | null = null;
let watchDebounceMs = 300;
let watchActive = false;
// v1.3.18 P2-B-6: 独立 timer/debounce/active (避免 watchGlobalConfig 与 watchAccountConfigs 共用状态互相干扰)
let globalWatchTimer: NodeJS.Timeout | null = null;
let globalWatchActive = false;

/** 测试用: 清缓存 (热重载后 loadAccountConfig 才读新文件) */
export function invalidateConfigCache(accountId?: string): void {
  if (accountId) configCache.delete(accountId);
  else configCache.clear();
}

/** 测试用: 调整 watch 防抖间隔 */
export function setWatchDebounceMs(ms: number): void {
  watchDebounceMs = ms;
}

/** 测试用: 当前是否在 watch */
export function isWatchingAccounts(): boolean {
  return watchActive;
}

/** v1.3.18 P2-B-6: 测试用 - 当前是否在 watch config.json */
export function isWatchingGlobalConfig(): boolean {
  return globalWatchActive;
}

/**
 * 监听 accounts/ 目录变化 → 重读变化账号配置 → 回调 (onChange(accountId, cfg))
 * 返回 unwatch 函数. 幂等: 重复调用只保留 1 个 watcher.
 */
export async function watchAccountConfigs(
  onChange: (accountId: string, cfg: WppAccountConfig) => void | Promise<void>,
): Promise<() => void> {
  const dir = join(await findPluginRoot(), "accounts");
  let watcher: import("node:fs").FSWatcher | null = null;

  const handleChange = (eventType: string, filename: string | null): void => {
    if (!filename || !filename.endsWith(".json") || filename.startsWith(".")) return;
    const accountId = filename.replace(/\.json$/, "");
    if (watchTimer) clearTimeout(watchTimer);
    watchTimer = setTimeout(async () => {
      try {
        invalidateConfigCache(accountId);
        const cfg = await loadAccountConfig(accountId);
        log.info(`config hot-reload detected: ${accountId} (${eventType})`);
        await onChange(accountId, cfg);
      } catch (e) {
        const err = e as NodeJS.ErrnoException; log.warn(`config hot-reload failed: ${accountId}: ${err.message ?? String(e)}`);
      }
    }, watchDebounceMs);
  };

  if (watchActive) {
    log.warn(`watchAccountConfigs: already watching, returning no-op unwatch`);
    return () => {};
  }

  try {
    watcher = await import("node:fs").then((fs) => fs.watch(dir, handleChange));
    watchActive = true;
    log.info(`watching accounts dir: ${dir} (hot-reload enabled)`);
  } catch (e) {
    const err = e as NodeJS.ErrnoException; log.warn(`watchAccountConfigs: fs.watch failed (${err.message ?? String(e)}), hot-reload disabled`);
    watchActive = false;
    return () => {};
  }

  return () => {
    try {
      watcher?.close();
    } catch {
      /* ignore */
    }
    watchActive = false;
    if (watchTimer) clearTimeout(watchTimer);
    log.info(`stopped watching accounts dir`);
  };
}

/**
 * v1.3.18 P2-B-6: 监听 config.json (WppGlobalConfig) 变化 → 重读 → 回调 (onChange(cfg))
 *
 * 与 watchAccountConfigs 的区别:
 * - watch 的是 config.json (单文件), 不是 accounts/ 目录
 * - 回调签名: (cfg: WppGlobalConfig) → 无 accountId (全局只有 1 个 global config)
 * - 独立 timer/active 状态 (避免与 watchAccountConfigs 互相干扰)
 * - 回调里典型动作: setGlobalRuntimeConfig(...) 立即生效 (但已 init 的 mariadb pool 不热重连)
 *
 * 返回 unwatch 函数. 失败 (fs.watch 不可用) 时返回 no-op unwatch.
 */
export async function watchGlobalConfig(
  onChange: (cfg: WppGlobalConfig) => void | Promise<void>,
): Promise<() => void> {
  const path = join(await findPluginRoot(), "config.json");
  let watcher: import("node:fs").FSWatcher | null = null;

  const handleChange = (): void => {
    if (globalWatchTimer) clearTimeout(globalWatchTimer);
    globalWatchTimer = setTimeout(async () => {
      try {
        invalidateConfigCache("__global__");
        const cfg = await loadGlobalConfig();
        log.info(`config.json hot-reload detected`);
        await onChange(cfg);
      } catch (e) {
        log.warn(`config.json hot-reload failed: ${(e as Error).message ?? String(e)}`);
      }
    }, watchDebounceMs);
  };

  if (globalWatchActive) {
    log.warn(`watchGlobalConfig: already watching, returning no-op unwatch`);
    return () => {};
  }

  try {
    watcher = await import("node:fs").then((fs) => fs.watch(path, handleChange));
    globalWatchActive = true;
    log.info(`watching config.json: ${path} (hot-reload enabled)`);
  } catch (e) {
    log.warn(`watchGlobalConfig: fs.watch failed (${(e as Error).message}), hot-reload disabled`);
    globalWatchActive = false;
    return () => {};
  }

  return () => {
    try {
      watcher?.close();
    } catch {
      /* ignore */
    }
    globalWatchActive = false;
    if (globalWatchTimer) clearTimeout(globalWatchTimer);
    log.info(`stopped watching config.json`);
  };
}

/**
 * v1.2.3 PAIRING: 把 wxid 追加进 accounts/<id>.json 的 allowFrom (配对成功落盘)。
 *
 * 关键 (多账号一致性):
 * - 目录用 findPluginRoot()/accounts (与 loadAccountConfig/watchAccountConfigs 同一解析 → watcher 热重载可见)
 * - 用 readFile 读原始 JSON round-trip 全字段, 不走 loadAccountConfig (60s LRU cache 会读到旧 allowFrom 冲掉并发写入)
 * - 原子写 (tmp+rename) + invalidateConfigCache 清缓存
 * - 账号文件不存在 → { ok:false } (不抛, 调用方决定回复文案)
 *
 * @returns { ok, allowFrom, filePath } ok=true 合并成功 (含 no-op: wxid 已存在)
 */
export async function appendAllowFrom(
  accountId: string,
  wxid: string,
): Promise<{ ok: boolean; allowFrom: string[]; filePath: string; reason?: string }> {
  const dir = join(await findPluginRoot(), "accounts");
  const filePath = join(dir, `${accountId}.json`);
  let raw: Record<string, unknown>;
  try {
    const text = await readFile(filePath, "utf8");
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    log.warn(`appendAllowFrom: read ${accountId}.json failed: ${err.code ?? String(e)}`);
    return { ok: false, allowFrom: [], filePath, reason: err.code === "ENOENT" ? "account-not-found" : "read-failed" };
  }

  // 合并 allowFrom (缺省 [], 已包含则 no-op)
  const allowFrom: string[] = Array.isArray(raw.allowFrom) ? (raw.allowFrom as string[]) : [];
  if (allowFrom.includes(wxid)) {
    return { ok: true, allowFrom, filePath }; // 已配对, 无变化
  }
  allowFrom.push(wxid);
  raw.allowFrom = allowFrom;

  // 原子写回
  try {
    const tmpPath = `${filePath}.tmp`;
    await writeFile(tmpPath, stringifyLargeInts(JSON.stringify(raw, null, 2)) + "\n", "utf8");
    await rename(tmpPath, filePath);
  } catch (e) {
    log.warn(`appendAllowFrom: write ${accountId}.json failed: ${(e as Error).message}`);
    return { ok: false, allowFrom, filePath, reason: "write-failed" };
  }
  // 清 LRU cache → 下次 loadAccountConfig 读到新 allowFrom (热重载 watcher 也会触发)
  invalidateConfigCache(accountId);
  log.info(`appendAllowFrom: account=${accountId} allowFrom=${allowFrom.length} (+${wxid})`);
  return { ok: true, allowFrom, filePath };
}

/**
 * v1.3.40 GROUP-ALLOW (老板 2026-08-11): 追加群聊白名单 groupAllowFrom.
 * 同 appendAllowFrom 范式 (原子写回 + 热重载).
 */
export async function appendGroupAllowFrom(
  accountId: string,
  chatroomId: string,
): Promise<{ ok: boolean; groupAllowFrom: string[]; filePath: string; reason?: string }> {
  const dir = join(await findPluginRoot(), "accounts");
  const filePath = join(dir, `${accountId}.json`);
  let raw: Record<string, unknown>;
  try {
    const text = await readFile(filePath, "utf8");
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    log.warn(`appendGroupAllowFrom: read ${accountId}.json failed: ${err.code ?? String(e)}`);
    return { ok: false, groupAllowFrom: [], filePath, reason: err.code === "ENOENT" ? "account-not-found" : "read-failed" };
  }

  // 合并 groupAllowFrom (缺省 [], 已包含则 no-op)
  const groupAllowFrom: string[] = Array.isArray(raw.groupAllowFrom) ? (raw.groupAllowFrom as string[]) : [];
  if (groupAllowFrom.includes(chatroomId)) {
    return { ok: true, groupAllowFrom, filePath }; // 已包含, 无变化
  }
  groupAllowFrom.push(chatroomId);
  raw.groupAllowFrom = groupAllowFrom;

  // 原子写回
  try {
    const tmpPath = `${filePath}.tmp`;
    await writeFile(tmpPath, stringifyLargeInts(JSON.stringify(raw, null, 2)) + "\n", "utf8");
    await rename(tmpPath, filePath);
  } catch (e) {
    log.warn(`appendGroupAllowFrom: write ${accountId}.json failed: ${(e as Error).message}`);
    return { ok: false, groupAllowFrom, filePath, reason: "write-failed" };
  }
  // 清 LRU cache → 热重载生效
  invalidateConfigCache(accountId);
  log.info(`appendGroupAllowFrom: account=${accountId} groupAllowFrom=${groupAllowFrom.length} (+${chatroomId})`);
  return { ok: true, groupAllowFrom, filePath };
}

/**
 * v1.3.40 GROUP-ALLOW (老板 2026-08-11): 移除私聊白名单 allowFrom.
 */
export async function removeAllowFrom(
  accountId: string,
  wxid: string,
): Promise<{ ok: boolean; allowFrom: string[]; filePath: string; reason?: string }> {
  const dir = join(await findPluginRoot(), "accounts");
  const filePath = join(dir, `${accountId}.json`);
  let raw: Record<string, unknown>;
  try {
    const text = await readFile(filePath, "utf8");
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    log.warn(`removeAllowFrom: read ${accountId}.json failed: ${err.code ?? String(e)}`);
    return { ok: false, allowFrom: [], filePath, reason: err.code === "ENOENT" ? "account-not-found" : "read-failed" };
  }
  const allowFrom: string[] = Array.isArray(raw.allowFrom) ? (raw.allowFrom as string[]) : [];
  const idx = allowFrom.indexOf(wxid);
  if (idx === -1) {
    return { ok: true, allowFrom, filePath }; // 不在白名单, 无变化
  }
  allowFrom.splice(idx, 1);
  raw.allowFrom = allowFrom;
  try {
    const tmpPath = `${filePath}.tmp`;
    await writeFile(tmpPath, stringifyLargeInts(JSON.stringify(raw, null, 2)) + "\n", "utf8");
    await rename(tmpPath, filePath);
  } catch (e) {
    log.warn(`removeAllowFrom: write ${accountId}.json failed: ${(e as Error).message}`);
    return { ok: false, allowFrom, filePath, reason: "write-failed" };
  }
  invalidateConfigCache(accountId);
  log.info(`removeAllowFrom: account=${accountId} allowFrom=${allowFrom.length} (-${wxid})`);
  return { ok: true, allowFrom, filePath };
}

/**
 * v1.3.40 GROUP-ALLOW (老板 2026-08-11): 移除群聊白名单 groupAllowFrom.
 */
export async function removeGroupAllowFrom(
  accountId: string,
  chatroomId: string,
): Promise<{ ok: boolean; groupAllowFrom: string[]; filePath: string; reason?: string }> {
  const dir = join(await findPluginRoot(), "accounts");
  const filePath = join(dir, `${accountId}.json`);
  let raw: Record<string, unknown>;
  try {
    const text = await readFile(filePath, "utf8");
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    log.warn(`removeGroupAllowFrom: read ${accountId}.json failed: ${err.code ?? String(e)}`);
    return { ok: false, groupAllowFrom: [], filePath, reason: err.code === "ENOENT" ? "account-not-found" : "read-failed" };
  }
  const groupAllowFrom: string[] = Array.isArray(raw.groupAllowFrom) ? (raw.groupAllowFrom as string[]) : [];
  const idx = groupAllowFrom.indexOf(chatroomId);
  if (idx === -1) {
    return { ok: true, groupAllowFrom, filePath }; // 不在白名单, 无变化
  }
  groupAllowFrom.splice(idx, 1);
  raw.groupAllowFrom = groupAllowFrom;
  try {
    const tmpPath = `${filePath}.tmp`;
    await writeFile(tmpPath, stringifyLargeInts(JSON.stringify(raw, null, 2)) + "\n", "utf8");
    await rename(tmpPath, filePath);
  } catch (e) {
    log.warn(`removeGroupAllowFrom: write ${accountId}.json failed: ${(e as Error).message}`);
    return { ok: false, groupAllowFrom, filePath, reason: "write-failed" };
  }
  invalidateConfigCache(accountId);
  log.info(`removeGroupAllowFrom: account=${accountId} groupAllowFrom=${groupAllowFrom.length} (-${chatroomId})`);
  return { ok: true, groupAllowFrom, filePath };
}
