// src/setup-wizard.ts - Setup wizard 核心逻辑 (testable, 不依赖 readline)
// v1.1.0 (Phase WIZ-2)
//
// 设计: scripts/setup.ts 调这里的 pure functions + 顶层 readline
//       测试可 mock stdin/stdout, 不需要 spawn 子进程

import { readFile as readFileAsync, writeFile as writeFileAsync, access, unlink } from "node:fs/promises";
import { join } from "node:path";
import { isValidAccountId, listAccountIds, loadAccountConfig } from "./config.js";

/** accounts 目录 (相对 cwd, 可被 WPP_ACCOUNTS_DIR env 覆盖)
 * 用 function (不是 const) 保证每次读 env, 避免 module load 时 env 未设
 */
export function getAccountsDir(): string {
  return process.env.WPP_ACCOUNTS_DIR
    ? process.env.WPP_ACCOUNTS_DIR
    : join(process.cwd(), "accounts");
}

// ============ list ============

export interface ListEntry {
  id: string;
  nickname: string;
  configured: boolean;
  envHints: string[];
}

export async function listAccountsDetailed(): Promise<ListEntry[]> {
  const ids = await listAccountIds();
  const out: ListEntry[] = [];
  for (const id of ids) {
    try {
      const cfg = await loadAccountConfig(id);
      const envToken = cfg.tokenKeyEnv ? process.env[cfg.tokenKeyEnv] : null;
      const envAuth = cfg.authcodeEnv ? process.env[cfg.authcodeEnv] : null;
      const envHints: string[] = [];
      if (!envToken && cfg.tokenKeyEnv) envHints.push(cfg.tokenKeyEnv);
      if (!envAuth && cfg.authcodeEnv) envHints.push(cfg.authcodeEnv);
      out.push({
        id,
        nickname: cfg.nickname || "(无)",
        configured: !!(envToken && cfg.apiBaseUrl),
        envHints,
      });
    } catch {
      out.push({ id, nickname: "(加载失败)", configured: false, envHints: [] });
    }
  }
  return out;
}

// ============ validate ============

export type CheckLevel = "pass" | "warn" | "fail";

export interface CheckResult {
  label: string;
  level: CheckLevel;
  detail?: string;
}

export async function validateAccount(accountId: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  function check(label: string, ok: boolean, level?: CheckLevel, detail?: string): void {
    // 默认 level 由 ok 决定 (true=pass, false=fail)
    if (level === undefined) level = ok ? "pass" : "fail";
    results.push({ label, level, detail });
  }

  check("accountId 合法", isValidAccountId(accountId));

  const filePath = join(getAccountsDir(), `${accountId}.json`);
  try {
    await access(filePath);
  } catch {
    check("accounts file 存在", false, "fail", filePath);
    return results;
  }
  check("accounts file 存在", true, "pass", filePath);

  let cfg;
  try {
    cfg = await loadAccountConfig(accountId);
    check("JSON 解析", true);
  } catch (e) {
    check("JSON 解析", false, "fail", e instanceof Error ? e.message : String(e));
    return results;
  }

  check("enabled", cfg.enabled, cfg.enabled ? "pass" : "warn", cfg.enabled ? "true" : "false (账号禁用)");

  if (cfg.tokenKeyEnv) {
    const envVal = process.env[cfg.tokenKeyEnv];
    if (envVal) {
      check(`env ${cfg.tokenKeyEnv}`, true, "pass", `${envVal.length} chars`);
    } else {
      check(`env ${cfg.tokenKeyEnv}`, false, "fail", "未设");
    }
  } else {
    check("tokenKeyEnv 配置", false, "fail", "accounts file 缺 tokenKeyEnv 字段");
  }

  if (cfg.authcodeEnv) {
    const envVal = process.env[cfg.authcodeEnv];
    if (envVal) {
      check(`env ${cfg.authcodeEnv}`, true, "pass", `${envVal.length} chars`);
    } else {
      check(`env ${cfg.authcodeEnv}`, false, "warn", "未设 (扫码登录前可空)");
    }
  } else {
    check("authcodeEnv 配置", false, "warn", "未设 (扫码登录需先有)");
  }

  check("apiBaseUrl", !!cfg.apiBaseUrl, cfg.apiBaseUrl ? "pass" : "fail", cfg.apiBaseUrl || "空");

  if (cfg.webhookPort >= 1024 && cfg.webhookPort <= 65535) {
    check(`webhook port ${cfg.webhookPort}`, true, "pass", "范围有效");
  } else {
    check(`webhook port ${cfg.webhookPort}`, false, "fail", "应 1024-65535");
  }

  if (cfg.webhookSecretEnv && process.env[cfg.webhookSecretEnv]) {
    check("webhookSecret (HMAC 验签)", true, "pass", "启用");
  } else if (cfg.webhookSecret) {
    check("webhookSecret (HMAC 验签)", true, "warn", "明文存 file, 建议改用 *Env 字段");
  } else {
    check("webhookSecret (HMAC 验签)", false, "warn", "未配 (vendor 公开算法后启用)");
  }

  const validPolicies = ["open", "disabled", "allowlist", "closed"];
  check(
    `groupPolicy '${cfg.groupPolicy}'`,
    validPolicies.includes(cfg.groupPolicy),
    validPolicies.includes(cfg.groupPolicy) ? "pass" : "fail",
  );

  return results;
}

// ============ add / remove (sync 操作) ============

export interface AddAccountInput {
  id: string;
  enabled: boolean;
  apiBaseUrl: string;
  wsUrl: string;
  tokenKeyEnv: string;
  authcodeEnv: string;
  webhookHost: string;
  webhookPort: number;
  webhookPath: string;
  webhookSecretEnv?: string;
  allowFrom: string[];
  groupPolicy: "open" | "disabled" | "allowlist" | "closed";
  nickname: string;
  requireAtMention: boolean;
  debounceMs: number;
  /** v1.1.17 FULL-FIX (P1-h): agent 必填, 默认 wpp-wechat (防 startAccountById throw) */
  agent?: string;
}

/** 校验输入 + 写 accounts/<id>.json. 抛错 if 失败. */
export async function writeAccountFile(input: AddAccountInput): Promise<{ filePath: string; json: string }> {
  if (!isValidAccountId(input.id)) {
    throw new Error(`invalid accountId: '${input.id}' (must match /^[a-zA-Z0-9_-]{1,64}$/)`);
  }
  const filePath = join(getAccountsDir(), `${input.id}.json`);
  try {
    await access(filePath);
    throw new Error(`accounts/${input.id}.json already exists, run 'remove' first`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("accounts/")) throw e;
    // file 不存在, 继续
  }
  const cfg = {
    enabled: input.enabled,
    tokenKey: "",
    tokenKeyEnv: input.tokenKeyEnv,
    apiBaseUrl: input.apiBaseUrl,
    wsUrl: input.wsUrl,
    authcode: "",
    authcodeEnv: input.authcodeEnv,
    webhookHost: input.webhookHost,
    webhookPort: input.webhookPort,
    webhookPath: input.webhookPath,
    webhookSecret: "",
    ...(input.webhookSecretEnv ? { webhookSecretEnv: input.webhookSecretEnv } : {}),
    allowFrom: input.allowFrom,
    groupPolicy: input.groupPolicy,
    groupAllowFrom: [],
    selfWxid: "",
    nickname: input.nickname,
    requireAtMention: input.requireAtMention,
    debounceMs: input.debounceMs,
    // v1.1.17 FULL-FIX (P1-h): agent 必填, 否则 startAccountById 强制校验 throw 导致新账号启不来
    // 默认 wpp-wechat (专用 agent), 禁止 "main" (P0 污染防护)
    agent: input.agent ?? "wpp-wechat",
  };
  const json = JSON.stringify(cfg, null, 2) + "\n";
  await writeFileAsync(filePath, json, "utf8");
  return { filePath, json };
}

export async function removeAccountFile(accountId: string): Promise<{ filePath: string }> {
  if (!isValidAccountId(accountId)) {
    throw new Error(`invalid accountId: '${accountId}'`);
  }
  const filePath = join(getAccountsDir(), `${accountId}.json`);
  try {
    await access(filePath);
  } catch {
    throw new Error(`accounts/${accountId}.json does not exist`);
  }
  await unlink(filePath);
  return { filePath };
}

// ============ helpers (also exported for tests) ============

/** 校验 add 字段合法性 (UI 层先调一次, writeAccountFile 再校验一次) */
export function validateAddInput(input: Partial<AddAccountInput>): string[] {
  const errors: string[] = [];
  if (!input.id || !isValidAccountId(input.id)) errors.push("id 必填且匹配 /^[a-zA-Z0-9_-]{1,64}$/");
  if (!input.apiBaseUrl) errors.push("apiBaseUrl 必填");
  if (!input.wsUrl) errors.push("wsUrl 必填");
  if (!input.tokenKeyEnv) errors.push("tokenKeyEnv 必填");
  if (!input.authcodeEnv) errors.push("authcodeEnv 必填");
  if (!input.webhookHost) errors.push("webhookHost 必填");
  if (!input.webhookPath) errors.push("webhookPath 必填");
  if (!input.webhookPort || input.webhookPort < 1024 || input.webhookPort > 65535) {
    errors.push("webhookPort 必填且 1024-65535");
  }
  if (input.debounceMs === undefined || input.debounceMs < 0) {
    errors.push("debounceMs 必填且 >= 0");
  }
  return errors;
}

// ============ v1.1.7 migrate (v0.1.0 → v1.1 单账号 → 多账号) ============

/** 老 config.json 单账号 inline 模式 (v0.1.0 era) */
export interface OldAccountConfig {
  enabled: boolean;
  tokenKey: string;
  authcode: string;
  apiBaseUrl: string;
  wsUrl: string;
  webhookHost: string;
  webhookPort: number;
  webhookPath: string;
  webhookSecret: string;
  allowFrom: string[];
  groupPolicy: "open" | "disabled" | "allowlist" | "closed";
  groupAllowFrom: string[];
  selfWxid: string;
  nickname: string;
  requireAtMention: boolean;
  debounceMs: number;
}

/** v1.1.7 migrate 结果 */
export interface MigrateResult {
  accountId: string;            // 默认 "default"
  oldFile: string;              // 备份文件路径
  newFile: string;              // 新 accounts/<id>.json 路径
  tokenKeyEnv: string;          // 生成的 env var 名
  authcodeEnv: string;
  webhookSecretEnv?: string;
  warnings: string[];           // 迁移时需要注意的项
}

/**
 * v1.1.7: 从 v0.1.0 config.json (单账号 inline) 迁到 v1.1 accounts/<id>.json
 *
 * 转换:
 *   - tokenKey → tokenKeyEnv (= "WECHATPRO_<ID>_TOKEN_KEY")
 *   - authcode → authcodeEnv (= "WECHATPRO_<ID>_AUTHCODE")
 *   - tokenKey="" (强制 env)
 *   - webhookSecret → webhookSecretEnv (if non-empty)
 *
 * 备份老 config.json 到 config.json.migrate-backup.<ts>
 *
 * @param configJsonPath 老 config.json 路径 (默认 ./config.json)
 * @param accountId 目标 accountId (默认 "default")
 * @param envPrefix token/authcode env var 前缀 (默认 "WECHATPRO")
 */
export async function migrateFromV0Config(
  configJsonPath: string,
  accountId: string = "default",
  envPrefix: string = "WECHATPRO",
): Promise<MigrateResult> {
  if (!isValidAccountId(accountId)) {
    throw new Error(`invalid accountId: '${accountId}'`);
  }
  try {
    await access(configJsonPath);
  } catch {
    throw new Error(`config.json not found: ${configJsonPath}`);
  }

  // 1. 备份老 config.json
  const backupPath = `${configJsonPath}.migrate-backup.${Date.now()}`;
  const raw = await readFileAsync(configJsonPath, "utf8");
  await writeFileAsync(backupPath, raw, "utf8");

  // 2. 解析老格式
  const oldCfg = JSON.parse(raw) as { account?: Partial<OldAccountConfig> };
  if (!oldCfg.account) {
    throw new Error(`old config.json missing "account" field, not v0.1.0 format`);
  }
  const warnings: string[] = [];
  const acc = oldCfg.account;

  // 3. 验证必填字段
  const required: (keyof OldAccountConfig)[] = [
    "apiBaseUrl", "wsUrl", "webhookHost", "webhookPort", "webhookPath",
    "allowFrom", "groupPolicy", "groupAllowFrom", "nickname",
    "requireAtMention", "debounceMs",
  ];
  for (const k of required) {
    if (acc[k] === undefined) {
      warnings.push(`missing field: ${k} (using default)`);
    }
  }

  // 4. 转换 token/authcode (cleartext → env var name)
  const tokenKeyEnv = `${envPrefix}_${accountId.toUpperCase().replace(/-/g, "_")}_TOKEN_KEY`;
  const authcodeEnv = `${envPrefix}_${accountId.toUpperCase().replace(/-/g, "_")}_AUTHCODE`;
  const webhookSecretEnv = acc.webhookSecret
    ? `${envPrefix}_${accountId.toUpperCase().replace(/-/g, "_")}_WEBHOOK_SECRET`
    : undefined;

  if (!acc.tokenKey) warnings.push("old config has empty tokenKey (需在 env 设真值)");
  if (!acc.authcode) warnings.push("old config has empty authcode (需在 env 设真值, 扫码确认后)");

  // 5. 写 accounts/<id>.json
  const newCfg = {
    enabled: acc.enabled ?? true,
    tokenKey: "",  // 强制 env
    tokenKeyEnv,
    apiBaseUrl: acc.apiBaseUrl ?? "https://wx.juhe.chat",
    wsUrl: acc.wsUrl ?? "wss://wx.juhe.chat/ws/sync",
    authcode: "",  // 强制 env
    authcodeEnv,
    webhookHost: acc.webhookHost ?? "0.0.0.0",
    webhookPort: acc.webhookPort ?? 4398,
    webhookPath: acc.webhookPath ?? "/wechatpadpro/webhook",
    webhookSecret: "",
    ...(webhookSecretEnv ? { webhookSecretEnv } : {}),
    allowFrom: acc.allowFrom ?? [],
    groupPolicy: acc.groupPolicy ?? "closed", // v1.1.17 FULL-FIX: 默认 closed (fail-closed, 防 P0 污染)
    groupAllowFrom: acc.groupAllowFrom ?? [],
    selfWxid: acc.selfWxid ?? "",
    nickname: acc.nickname ?? accountId,
    requireAtMention: acc.requireAtMention ?? true,
    debounceMs: acc.debounceMs ?? 1500,
  };

  const accountsDir = getAccountsDir();
  const newFile = join(accountsDir, `${accountId}.json`);
  try {
    await access(newFile);
    throw new Error(`accounts/${accountId}.json already exists, remove first or use different id`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("accounts/")) throw e;
    // file 不存在, 继续
  }
  await writeFileAsync(newFile, JSON.stringify(newCfg, null, 2) + "\n", "utf8");

  return {
    accountId,
    oldFile: backupPath,
    newFile,
    tokenKeyEnv,
    authcodeEnv,
    webhookSecretEnv,
    warnings,
  };
}
