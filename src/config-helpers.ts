// src/config-helpers.ts - v3 OpenClaw channel config 6 helpers (Phase G6)
// 范式: 仿 OpenClaw v2026.7.1+ src/core/plugin-config.ts (plugin.config 字段)
// 用途: OpenClaw runtime 通过这 6 helper 查账号列表/状态/默认账户 (UI + 路由 + 诊断)
//
// 设计: 极简版, 不实现 per-account configFile 缓存/嵌套复杂度
//       直接走 accounts/<id>.json (B 方案 老板 2026-08-01 拍板)
//       OpenClaw 传的 cfg 参数不使用 (wpp 不依赖 OpenClaw config schema)

import {
  isConfigured as _isConfigured,
  isValidAccountId,
} from "./config.js";
import { DEFAULT_ACCOUNT_ID } from "./core/constants.js";
import { _resetPluginRootCache, findPluginRoot } from "./core/paths.js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { WppAccountConfig } from "./types.js";

/**
 * v1.1.10 P0-2 helper: sync version of findPluginRoot.
 * Sync resolveAccount 不依赖 async findPluginRoot, 自己 inline 8-level walk.
 * 一旦解析到, 缓存到 _cachedPluginRoot 让 async 版也能复用.
 */
function findPluginRootSync(): string | null {
  let dir: string;
  if (typeof __dirname === "string") {
    dir = __dirname;
  } else {
    try {
      dir = dirname(fileURLToPath(import.meta.url));
    } catch {
      return null;
    }
  }
  for (let i = 0; i < 8; i++) {
    const pluginFile = resolve(dir, "openclaw.plugin.json");
    const pkgFile = resolve(dir, "package.json");
    if (existsSync(pluginFile) && existsSync(pkgFile)) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/**
 * v1.3.26 P0 (2026-08-10 修复): listAccountIds 必须 SYNC, 不能是 async
 *
 * 根因: OpenClaw health-p6SutBnt.js:364 以 `const accountIds = plugin.config.listAccountIds(cfg)`
 *      同步调用,**不 await**;下一行 `Array.from(new Set([...accountIds]))` 直接展开.
 *      旧实现 `async ... Promise<string[]>` → OpenClaw 拿到 Promise 对象
 *      → `...Promise` 抛 TypeError "accountIds is not iterable"
 *      → [health] refresh failed 每次 health snapshot 都报 (8/5 起 1650+ 次),
 *        accountSummaries 整个 channel 快照挂掉, OpenClaw UI/状态看不到 WPP 账号.
 *       (同 v1.1.10 P0-2 resolveAccount 同步化漏网的第 2 个函数)
 *
 * 修复: 改成 sync, 用 findPluginRootSync + readdirSync.
 *       async caller 也能 await (await on non-Promise returns value as-is).
 *
 * 测试: tests/config-helpers.test.ts 已加 "SYNC 回归" case (不 await, 直接展开)
 */
export function listAccountIds(_cfg?: unknown): string[] {
  const pluginRoot = findPluginRootSync();
  if (!pluginRoot) return [];
  try {
    const entries = readdirSync(join(pluginRoot, "accounts"));
    return entries
      .filter((f) => f.endsWith(".json"))
      .filter((f) => !f.startsWith("."))
      .map((f) => f.replace(/\.json$/, ""));
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return [];
    throw e;
  }
}

/**
 * v1.1.10 P0-2 (2026-08-05 修复): resolveAccount 必须 SYNC, 不能是 async
 *
 * 根因:OpenClaw server-channels-CJpFiZWS.js:418/659/750 都以
 *      `const account = plugin.config.resolveAccount(cfg, id)` 同步调用,**不 await**.
 *      旧实现 `async ... Promise<WppAccountConfig>` → OpenClaw 拿到 Promise 对象,
 *      → 下一行 `plugin.config.isConfigured(Promise)` 返 false
 *      → setRuntime lastError="not configured" → gateway.startAccount 永不调
 *      → webhook server 永远不起 → vendor 推送 502 Bad Gateway
 *
 * 修复: 改成 sync, 用 readFileSync + env var fallback.
 *       async caller 也能 await (await on non-Promise returns value as-is).
 *
 * 测试: tests/config-helpers.test.ts 已 verify `await resolveAccount(...)` 兼容.
 */
export function resolveAccount(_cfg: unknown, accountId?: string): WppAccountConfig | null {
  const id = accountId ?? DEFAULT_ACCOUNT_ID;
  if (!isValidAccountId(id)) return null;

  const pluginRoot = findPluginRootSync();
  if (!pluginRoot) return null;
  // 顺便 cache 到 async 版, 让后续 findPluginRoot() 命中缓存
  _resetPluginRootCache(); // 先清掉, 让 async 版能拿到同样结果
  void findPluginRoot().catch(() => {/* ignore */});

  const filePath = join(pluginRoot, "accounts", `${id}.json`);
  if (!existsSync(filePath)) return null;
  let raw: WppAccountConfig;
  try {
    raw = JSON.parse(readFileSync(filePath, "utf8")) as WppAccountConfig;
  } catch {
    return null;
  }
  // env var fallback (跟 config.ts loadAccountConfig 一致)
  if (raw.tokenKeyEnv) {
    const envToken = process.env[raw.tokenKeyEnv];
    if (envToken) raw.tokenKey = envToken;
  }
  if (raw.authcodeEnv) {
    const envAuth = process.env[raw.authcodeEnv];
    if (envAuth) raw.authcode = envAuth;
  }
  // v1.3.18 B-8 fix: webhookSecretEnv 真接入 (OpenClaw resolveAccount 是它取 secret 的路径)
  if (typeof raw.webhookSecretEnv === "string" && raw.webhookSecretEnv && !raw.webhookSecret) {
    const envSecret = process.env[raw.webhookSecretEnv];
    if (envSecret) raw.webhookSecret = envSecret;
  }
  return raw;
}

/**
 * 默认账号 ID.
 * 单账号 demo: 永远是 "default". 多账号场景可由 OpenClaw wizard 覆盖.
 */
export function defaultAccountId(): string {
  return DEFAULT_ACCOUNT_ID;
}

/**
 * 账号是否已配置 (tokenKey + apiBaseUrl + enabled).
 * OpenClaw 用这个决定是否在 UI 显示 "configured" 状态.
 */
export function isConfigured(account: WppAccountConfig | null | undefined): boolean {
  if (!account) return false;
  return _isConfigured(account);
}

/**
 * 未配置原因 (OpenClaw 诊断显示).
 * 返 null 表示已配置 (OpenClaw 据此隐藏提示).
 */
export function unconfiguredReason(account: WppAccountConfig | null | undefined): string | null {
  if (!account) return "account not found";
  if (!account.enabled) return "account disabled (set enabled=true)";
  if (!account.tokenKey) {
    return `tokenKey missing (set ${account.tokenKeyEnv ?? "env var"} + set in accounts/${account.nickname ?? "default"}.json)`;
  }
  if (!account.apiBaseUrl) return "apiBaseUrl missing";
  return null;
}

/**
 * 账号描述 (供日志/UI 显示).
 * 格式: `<nickname> (selfWxid=<selfWxid>, configured=<bool>)`
 */
export function describeAccount(account: WppAccountConfig | null | undefined): string {
  if (!account) return "(no account)";
  const nick = account.nickname || "(unnamed)";
  const self = account.selfWxid || "(unset)";
  const cfg = _isConfigured(account) ? "configured" : "unconfigured";
  return `${nick} (selfWxid=${self}, ${cfg})`;
}
