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
import { findPluginRootSync } from "./core/paths.js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ChannelAccountSnapshot } from "openclaw/plugin-sdk/core";
import type { WppAccountConfig } from "./types.js";

/**
 * resolveAccount 的返回形状: 账号配置 + **盖章的 accountId** (2026-09-28 E6 方案(1))。
 *
 * 契约 `ChannelAccountSnapshot.accountId` 是**必填**, 而 `WppAccountConfig` 没有 id 字段。
 * accountId 唯一已知的地方就是 resolveAccount 的入参 (id 已解析出默认值), 故在那里盖章,
 * 使下游 describeAccount 能诚实地填出要求必填的 accountId, 而不是编一个空串。
 *
 * 运行时影响: 返回值**新增一个只读字段** `accountId` (spread 后覆写同名字段)。
 *   - 框架侧 `projectSafeChannelAccountSnapshotFields` 的白名单**不含** accountId,
 *     两个消费点 (status-CnU4iCHm / account-summary) 也都显式用入参 accountId 覆盖,
 *     故状态/summary 输出逐位不变。
 *   - 仓内对 resolveAccount 返回值无其它消费者 (grep 证实只有 index.ts 的 config 接线)。
 */
export type WppResolvedAccount = WppAccountConfig & { accountId: string };

/**
 * v1.6.7 (2026-09-26): 不再自己 inline walk —— 改用 core/paths.ts 的共享 findPluginRootSync。
 *
 * 原因: 旧实现是**第二份**独立 walk, 与 core/paths.ts 的 findPluginRoot 逻辑漂移风险高。
 *       2026.9.6 的 plugin source capture 让「walk 停在临时副本」这个坑同时命中两份实现,
 *       集中到 core/paths.ts 才能一次修好 (capture → 稳定根映射只在那一处)。
 * 保留 sync 语义 (OpenClaw 有些调用点不 await, 见下方 P0 记录), cache 与 async 版共享。
 */


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
export function resolveAccount(_cfg: unknown, accountId?: string | null): WppResolvedAccount | null {
  // 契约 ChannelConfigAdapter.resolveAccount 的 accountId 为 `string | null`;
  // `??` 已把 null 与 undefined 一并兜到 DEFAULT_ACCOUNT_ID, 故纯类型加宽, 运行时不变。
  const id = accountId ?? DEFAULT_ACCOUNT_ID;
  if (!isValidAccountId(id)) return null;

  const pluginRoot = findPluginRootSync();
  if (!pluginRoot) return null;
  // v1.6.7: sync/async 共用一个 cache (core/paths.ts), 不再需要 "清 cache + 踢一次 async" 的握手

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
  // 2026-09-28 M5 fix: env-wins (去掉 `&& !raw.webhookSecret`), 与 config.ts disk/cache 两层一致
  if (typeof raw.webhookSecretEnv === "string" && raw.webhookSecretEnv) {
    const envSecret = process.env[raw.webhookSecretEnv];
    if (envSecret) raw.webhookSecret = envSecret;
  }
  // 2026-09-28 E6 方案(1): 盖章 accountId (见 WppResolvedAccount 说明)
  return { ...raw, accountId: id };
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
 * 返空串表示已配置 (OpenClaw 的消费点全部有 `??` 兜底, 见下).
 *
 * 2026-09-28 契约对齐 (E5): 返回类型 `string | null` → `string`。
 *   契约: `unconfiguredReason?: (account, cfg) => string` (types.adapters:312)。
 *   实测三个消费点, 空串与 null 逐位等价:
 *     - status-CnU4iCHm.mjs:36 → account-state-C8XRII9P.mjs:56-60
 *       该值仅在 `if (!input.configured)` 分支被读 (`?? "not configured"`);
 *       已配置分支根本不会读它。而"已配置"正是旧代码唯一返回 null 的路径。
 *     - read-only-DeZS8AKt.mjs:243 `... ?? ""` → null 与 "" 结果同为 ""。
 *     - status.scan.runtime-BSfxBJrs.mjs:397 `... ?? "not configured"`
 *       该行在 `configuredAccounts.length === 0` 时才可达 → 账号必未配置
 *       → 本函数返回的仍是同样的原因串 (非 null 路径), 值不变。
 */
export function unconfiguredReason(account: WppAccountConfig | null | undefined): string {
  if (!account) return "account not found";
  if (!account.enabled) return "account disabled (set enabled=true)";
  if (!account.tokenKey) {
    return `tokenKey missing (set ${account.tokenKeyEnv ?? "env var"} + set in accounts/${account.nickname ?? "default"}.json)`;
  }
  if (!account.apiBaseUrl) return "apiBaseUrl missing";
  return ""; // 已配置: 空串 (旧实现返回 null)
}

/**
 * 账号描述 (契约: `ChannelConfigAdapter.describeAccount` → `ChannelAccountSnapshot`)。
 *
 * 2026-09-28 契约对齐 (E6): 返回类型 `string` → `ChannelAccountSnapshot`。
 *
 * 旧实现返回**字符串**, 而契约与全部 6 个消费点都按**对象**消费 →
 *   - status-CnU4iCHm.mjs:26-33 读 `described?.enabled/configured/linked` 全是 undefined
 *     (回落到框架自算值), 属"无效但无害";
 *   - 🔴 account-summary-do7uk4cE.mjs:61-70 `{ ...described }` 把字符串展开成
 *     字符索引键 (`{0:'头',1:'像',…}`) 污染快照对象 —— 这是**真 bug**。
 *   ⇒ 改成对象后, 该污染消失。
 *
 * ⚠️ 刻意只填两个字段 (最小且**可证明零行为变化**):
 *   - `accountId`: 契约必填。取自 resolveAccount 盖的章 (见 WppResolvedAccount)。
 *   - `configured`: 用与 `config.isConfigured` **同一个** `_isConfigured` 谓词取值,
 *     故与框架自己调用 isConfigured 得到的布尔值**完全相同** (消费点 `described?.configured ?? await isConfigured(...)`
 *     在此只是短路, 值不变)。
 *   未填 `enabled`/`name`/`linked`/`running`... : 这些字段在消费点**优先于**框架自算值
 *   (如 status-CnU4iCHm:26 `described?.enabled ?? snapshot.enabled ?? …`, account-summary `...described` 覆盖
 *   `enabled`/`configured`)。填了就会改变 openclaw status / account summary 的**既有输出** ——
 *   超出本次"仅对齐类型、不改运行时"的范围。如需更丰富的快照, 应作为独立改动评估
 *   (现有富快照在 `status.buildAccountSnapshot`, 见 index.ts)。
 */
export function describeAccount(account: WppResolvedAccount | null | undefined): ChannelAccountSnapshot {
  if (!account) return { accountId: "" }; // 未解析到账号: accountId 必填, 空串是诚实的"未知"
  return {
    accountId: account.accountId,
    configured: _isConfigured(account),
  };
}
