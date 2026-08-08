// config.ts - B 方案配置加载器
// 单账号: accounts/default.json, 多账号: accounts/<id>.json
// 2026-08-04 init, 2026-08-04 v1.0.4 FIX-B1: 加 LRU cache (P2-1 sync I/O 优化)

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { logObj as log } from "./core/logger.js";
import { DEFAULT_ACCOUNT_ID } from "./core/constants.js";
import { findPluginRoot } from "./core/paths.js";
import { LruCache } from "./core/lru.js";
import type { WppAccountConfig, WppGlobalConfig } from "./types.js";

// 仿 模式: 不再硬编码 PLUGIN_ROOT, 走 findPluginRoot walks 6 levels
// 避免 import.meta.dirname 在 dist/ 被打包时偏移导致 silent file-not-found

// v1.0.4 FIX-B1: LRU cache 避免每次 startAccountById 重读 disk
// maxSize=8 (1 global + 7 accounts), ttlMs=60s (credential rotation 60s 内能感知)
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
  } catch (e: any) {
    if (e?.code === "ENOENT") throw new Error(`config.json not found: ${p}`);
    throw e;
  }
  // 密码从环境变量取 (B 方案 + 老板 2026-08-01 铁律: token/password 单一来源)
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
 * v1.1.8 FIX-S1: 异步版本 loadGlobalConfig
 * 用 fs/promises readFile, 不阻塞 event loop
 * 同步版本保留 (兼容 CLI tools / tests)
 */
/**
 * @deprecated v1.1.9 P1-3: 异步迁移完成, loadGlobalConfig() 本身就是 async
 * 保留此别名仅为向后兼容 (CLI tools / tests 可能仍 import 此名)
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

export async function loadAccountConfig(accountId: string = DEFAULT_ACCOUNT_ID): Promise<WppAccountConfig> {
  if (!isValidAccountId(accountId)) {
    throw new Error(`invalid accountId (must match /^[a-zA-Z0-9_-]{1,64}$/): ${JSON.stringify(accountId)}`);
  }
  // v1.0.4 FIX-B1: 查 cache (但 env credential 注入不能用 cache, 永远重读)
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
    return raw;
  }
  const p = join(await findPluginRoot(), "accounts", `${accountId}.json`);
  let raw: WppAccountConfig;
  try {
    const text = await readFile(p, "utf8");
    raw = JSON.parse(text) as WppAccountConfig;
  } catch (e: any) {
    if (e?.code === "ENOENT") throw new Error(`account config not found: ${p}`);
    throw e;
  }
  // 凭证优先从环境变量取
  if (raw.tokenKeyEnv) {
    const envToken = process.env[raw.tokenKeyEnv];
    if (envToken) raw.tokenKey = envToken;
  }
  if (raw.authcodeEnv) {
    const envAuth = process.env[raw.authcodeEnv];
    if (envAuth) raw.authcode = envAuth;
  }
  // v1.1.12 (2026-08-08): webhookPublicUrl env var fallback (跟 tokenKey/authcode 同模式)
  if (raw.webhookPublicUrlEnv) {
    const envUrl = process.env[raw.webhookPublicUrlEnv];
    if (envUrl) raw.webhookPublicUrl = envUrl;
  }
  // v1.1.12: autoSetWebhook 默认 true (跟其他 boolean 配置一致的 falsy fallback)
  if (raw.autoSetWebhook === undefined) raw.autoSetWebhook = true;
  if (!raw.setWebhookRetries || raw.setWebhookRetries < 1) raw.setWebhookRetries = 3;
  log.info(`loaded account config: ${accountId} (apiBase=${raw.apiBaseUrl}, ws=${raw.wsUrl})`);
  configCache.set(accountId, raw);
  return raw;
}

/**
 * @deprecated v1.1.9 P1-3: 异步迁移完成, loadAccountConfig() 本身就是 async
 * 保留此别名仅为向后兼容 (CLI tools / tests 可能仍 import 此名)
 */
export const loadAccountConfigAsync = loadAccountConfig;

export async function listAccountIds(): Promise<string[]> {
  const dir = join(await findPluginRoot(), "accounts");
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (e: any) {
    if (e?.code === "ENOENT") return [];
    throw e;
  }
  return entries
    .filter((f) => f.endsWith(".json"))
    .filter((f) => !f.startsWith("."))
    .map((f) => f.replace(/\.json$/, ""));
}

/**
 * v1.1.10 P0-1 (2026-08-05 修复): isConfigured 必须支持 env var fallback
 *
 * 根因:老板 21:00 拍 '缺 channel + agent 绑定' → 启 gateway restart 后 OpenClaw 调
 *      plugin.config.isConfigured(account, cfg) 验证才能 startAccount.
 *      原实现只检查 raw cfg.tokenKey (空字符串),没用 env var (tokenKeyEnv/authcodeEnv).
 *      → OpenClaw 标记 account 为 unconfigured, 永远不调 gateway.startAccount, webhook server 永远不起.
 *
 * 修复: env var fallback — 如果 raw tokenKey/authcode 为空, 但有 tokenKeyEnv/authcodeEnv,
 *      从 process.env 读值. 跟 loadAccountConfig 一样逻辑.
 *
 * 测试: 用 accounts/default.json (tokenKey="" + tokenKeyEnv="WECHATPRO_TOKEN_KEY",
 *        env var 已配) → 返回 true.
 */
export function isConfigured(cfg: WppAccountConfig): boolean {
  // env var fallback (跟 loadAccountConfig 缓存层逻辑一致)
  const tokenKey = cfg.tokenKey || (cfg.tokenKeyEnv ? process.env[cfg.tokenKeyEnv] ?? "" : "");
  const authcode = cfg.authcode || (cfg.authcodeEnv ? process.env[cfg.authcodeEnv] ?? "" : "");
  return !!(cfg.enabled && tokenKey && cfg.apiBaseUrl && authcode);
}

// ===================== HOT-RELOAD (v1.1.15 方案 A, 2026-08-08 接总立) =====================
// 目标: 改 accounts/<id>.json 运行时字段 (allowFrom/groupPolicy/requireAtMention/debounce 等)
//      零重启生效. 机制: fs.watch(accounts/) → 防抖 → 清 cache → 重读 → 回调.
// 注意: fs.watch 在不同平台事件语义不同 (Linux inotify: rename/change 都触发),
//     编辑器保存常先 rename (tmp file) 再 change → 防抖 + 重读磁盘双保险.

let watchTimer: NodeJS.Timeout | null = null;
let watchDebounceMs = 300;
let watchActive = false;

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
      } catch (e: any) {
        log.warn(`config hot-reload failed: ${accountId}: ${e?.message ?? e}`);
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
  } catch (e: any) {
    log.warn(`watchAccountConfigs: fs.watch failed (${e?.message ?? e}), hot-reload disabled`);
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
