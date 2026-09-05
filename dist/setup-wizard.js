import { readFile as readFileAsync, writeFile as writeFileAsync, access, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createConnection } from "node:net";
import { isValidAccountId, listAccountIds, loadAccountConfig } from "../dist/config.js";
import { stringifyLargeInts } from "../dist/util/bigint.js";
import { postWppJson } from "../dist/api/client.js";
import { ctxToCallOpts } from "../dist/send/factory.js";
function getAccountsDir() {
  return process.env.WPP_ACCOUNTS_DIR ? process.env.WPP_ACCOUNTS_DIR : join(process.cwd(), "accounts");
}
async function listAccountsDetailed() {
  const ids = await listAccountIds();
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        const cfg = await loadAccountConfig(id);
        const envToken = cfg.tokenKeyEnv ? process.env[cfg.tokenKeyEnv] : null;
        const envAuth = cfg.authcodeEnv ? process.env[cfg.authcodeEnv] : null;
        const envHints = [];
        if (!envToken && cfg.tokenKeyEnv) envHints.push(cfg.tokenKeyEnv);
        if (!envAuth && cfg.authcodeEnv) envHints.push(cfg.authcodeEnv);
        return {
          id,
          nickname: cfg.nickname || "(\u65E0)",
          configured: !!(envToken && cfg.apiBaseUrl),
          envHints
        };
      } catch {
        return { id, nickname: "(\u52A0\u8F7D\u5931\u8D25)", configured: false, envHints: [] };
      }
    })
  );
  return results;
}
async function validateAccount(accountId) {
  const results = [];
  function check(label, ok, level, detail) {
    if (level === void 0) level = ok ? "pass" : "fail";
    results.push({ label, level, detail });
  }
  check("accountId \u5408\u6CD5", isValidAccountId(accountId));
  const filePath = join(getAccountsDir(), `${accountId}.json`);
  try {
    await access(filePath);
  } catch {
    check("accounts file \u5B58\u5728", false, "fail", filePath);
    return results;
  }
  check("accounts file \u5B58\u5728", true, "pass", filePath);
  let cfg;
  try {
    cfg = await loadAccountConfig(accountId);
    check("JSON \u89E3\u6790", true);
  } catch (e) {
    check("JSON \u89E3\u6790", false, "fail", e instanceof Error ? e.message : String(e));
    return results;
  }
  check("enabled", cfg.enabled, cfg.enabled ? "pass" : "warn", cfg.enabled ? "true" : "false (\u8D26\u53F7\u7981\u7528)");
  if (cfg.tokenKeyEnv) {
    const envVal = process.env[cfg.tokenKeyEnv];
    if (envVal) {
      check(`env ${cfg.tokenKeyEnv}`, true, "pass", `${envVal.length} chars`);
    } else {
      check(`env ${cfg.tokenKeyEnv}`, false, "fail", "\u672A\u8BBE");
    }
  } else {
    check("tokenKeyEnv \u914D\u7F6E", false, "fail", "accounts file \u7F3A tokenKeyEnv \u5B57\u6BB5");
  }
  if (cfg.authcodeEnv) {
    const envVal = process.env[cfg.authcodeEnv];
    if (envVal) {
      check(`env ${cfg.authcodeEnv}`, true, "pass", `${envVal.length} chars`);
    } else {
      check(`env ${cfg.authcodeEnv}`, false, "warn", "\u672A\u8BBE (\u626B\u7801\u767B\u5F55\u524D\u53EF\u7A7A)");
    }
  } else {
    check("authcodeEnv \u914D\u7F6E", false, "warn", "\u672A\u8BBE (\u626B\u7801\u767B\u5F55\u9700\u5148\u6709)");
  }
  check("apiBaseUrl", !!cfg.apiBaseUrl, cfg.apiBaseUrl ? "pass" : "fail", cfg.apiBaseUrl || "\u7A7A");
  if (cfg.webhookPort >= 1024 && cfg.webhookPort <= 65535) {
    check(`webhook port ${cfg.webhookPort}`, true, "pass", "\u8303\u56F4\u6709\u6548");
  } else {
    check(`webhook port ${cfg.webhookPort}`, false, "fail", "\u5E94 1024-65535");
  }
  if (cfg.webhookSecretEnv && process.env[cfg.webhookSecretEnv]) {
    check("webhookSecret (HMAC \u9A8C\u7B7E)", true, "pass", "\u542F\u7528");
  } else if (cfg.webhookSecret) {
    check("webhookSecret (HMAC \u9A8C\u7B7E)", true, "warn", "\u660E\u6587\u5B58 file, \u5EFA\u8BAE\u6539\u7528 *Env \u5B57\u6BB5");
  } else {
    check("webhookSecret (HMAC \u9A8C\u7B7E)", false, "warn", "\u672A\u914D (vendor \u516C\u5F00\u7B97\u6CD5\u540E\u542F\u7528)");
  }
  const validPolicies = ["open", "disabled", "allowlist", "closed"];
  check(
    `groupPolicy '${cfg.groupPolicy}'`,
    validPolicies.includes(cfg.groupPolicy),
    validPolicies.includes(cfg.groupPolicy) ? "pass" : "fail"
  );
  return results;
}
async function diagnoseAccount(accountId) {
  const results = await validateAccount(accountId);
  function check(label, ok, level, detail) {
    if (level === void 0) level = ok ? "pass" : "fail";
    results.push({ label, level, detail });
  }
  let cfg = null;
  try {
    cfg = await loadAccountConfig(accountId);
  } catch {
    return results;
  }
  const token = cfg.tokenKeyEnv ? process.env[cfg.tokenKeyEnv] : null;
  const auth = cfg.authcodeEnv ? process.env[cfg.authcodeEnv] : null;
  check(`env ${cfg.tokenKeyEnv ?? "tokenKeyEnv"} \u6709\u503C`, !!token, token ? "pass" : "fail");
  check(`env ${cfg.authcodeEnv ?? "authcodeEnv"} \u6709\u503C`, !!auth, auth ? "pass" : "warn", auth ? `${auth.length} chars` : "\u626B\u7801\u767B\u5F55\u524D\u53EF\u7A7A, \u4F46\u5DF2\u767B\u5F55\u573A\u666F\u5E94\u6709\u503C");
  try {
    const opts = ctxToCallOpts({
      baseUrl: cfg.apiBaseUrl,
      tokenKey: token ?? "",
      authcode: auth ?? "",
      accountId
    });
    const r = await postWppJson(cfg.apiBaseUrl, "/Login/HeartBeat", {}, opts);
    check(
      "vendor API \u8FDE\u901A (HeartBeat)",
      r.Code === 0,
      r.Code === 0 ? "pass" : "warn",
      r.Code === 0 ? "OK" : `Code=${r.Code} ${r.CodeValue ?? ""}`
    );
  } catch (e) {
    check("vendor API \u8FDE\u901A (HeartBeat)", false, "fail", e instanceof Error ? e.message : String(e));
  }
  await new Promise((resolve) => {
    const sock = createConnection({ host: cfg.webhookHost, port: cfg.webhookPort }, () => {
      check(`webhook ${cfg.webhookHost}:${cfg.webhookPort} \u76D1\u542C\u4E2D`, true, "pass");
      sock.destroy();
      resolve();
    });
    sock.on("error", () => {
      check(`webhook ${cfg.webhookHost}:${cfg.webhookPort} \u76D1\u542C\u4E2D`, false, "fail", "\u7AEF\u53E3\u672A\u76D1\u542C (gateway \u672A\u542F\u52A8?)");
      resolve();
    });
    sock.setTimeout(3e3, () => {
      sock.destroy();
      check("webhook \u7AEF\u53E3\u63A2\u6D4B", false, "fail", "\u8FDE\u63A5\u8D85\u65F6");
      resolve();
    });
  });
  if (cfg.agent) {
    try {
      const raw = await readFileAsync(`${process.env.OPENCLAW_ROOT || "/root/.openclaw"}/openclaw.json`, "utf8");
      const ocfg = JSON.parse(raw);
      const exists = (ocfg.agents?.list ?? []).some((a) => a.id === cfg.agent);
      check(`agent '${cfg.agent}' \u5728 openclaw.json`, exists, exists ? "pass" : "fail", exists ? "OK" : "\u672A\u627E\u5230, \u9700 npm run setup add \u65F6\u540C\u6B65\u521B\u5EFA");
    } catch {
      check("agent \u7ED1\u5B9A\u68C0\u67E5", false, "warn", "\u8BFB openclaw.json \u5931\u8D25");
    }
  }
  return results;
}
async function writeAccountFile(input) {
  if (!isValidAccountId(input.id)) {
    throw new Error(`invalid accountId: '${input.id}' (must match /^[a-zA-Z0-9_-]{1,64}$/)`);
  }
  const filePath = join(getAccountsDir(), `${input.id}.json`);
  try {
    await access(filePath);
    throw new Error(`accounts/${input.id}.json already exists, run 'remove' first`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("accounts/")) throw e;
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
    ...input.webhookSecretEnv ? { webhookSecretEnv: input.webhookSecretEnv } : {},
    ...input.webhookBusinessPath ? { webhookBusinessPath: input.webhookBusinessPath } : {},
    ...input.webhookPathToken ? { webhookPathToken: input.webhookPathToken } : {},
    ...input.webhookPublicUrl ? { webhookPublicUrl: input.webhookPublicUrl } : {
      ...input.webhookPublicUrlEnv ? { webhookPublicUrlEnv: input.webhookPublicUrlEnv } : {}
    },
    ...input.autoSetWebhook !== void 0 ? { autoSetWebhook: input.autoSetWebhook } : {},
    ...input.setWebhookRetries !== void 0 ? { setWebhookRetries: input.setWebhookRetries } : {},
    ...input.adminUsers && input.adminUsers.length > 0 ? { adminUsers: input.adminUsers } : {},
    ...input.commandAllowlist ? { commandAllowlist: input.commandAllowlist } : {},
    ...input.sync ? { sync: input.sync } : {},
    allowFrom: input.allowFrom,
    groupPolicy: input.groupPolicy,
    ...input.groupAllowFrom && input.groupAllowFrom.length > 0 ? { groupAllowFrom: input.groupAllowFrom } : {},
    ...input.selfWxid ? { selfWxid: input.selfWxid } : {},
    ...input.keywordTrigger ? { keywordTrigger: input.keywordTrigger } : {},
    ...input.msgTypeTrigger ? { msgTypeTrigger: input.msgTypeTrigger } : {},
    ...input.quoteBotTrigger ? { quoteBotTrigger: input.quoteBotTrigger } : {},
    ...input.blacklistGroups && input.blacklistGroups.length > 0 ? { blacklistGroups: input.blacklistGroups } : {},
    ...input.chatroomDebug !== void 0 ? { chatroomDebug: input.chatroomDebug } : {},
    ...input.dmPairingEnabled !== void 0 ? { dmPairingEnabled: input.dmPairingEnabled } : {},
    // v1.3.63 (2026-08-13): mcpEnabled 默认 false — 之前不写该字段 → 插件默认 true (vendor realtime 未开通白耗),
    //   与 default.json 一致。显式 input.mcpEnabled === true 才开。
    mcpEnabled: input.mcpEnabled ?? false,
    ...input.groupContextEnabled !== void 0 ? { groupContextEnabled: input.groupContextEnabled } : {},
    ...input.groupContextWindow !== void 0 ? { groupContextWindow: input.groupContextWindow } : {},
    ...input.groupContextMaxImages !== void 0 ? { groupContextMaxImages: input.groupContextMaxImages } : {},
    ...input.llmIntentEnabled !== void 0 ? { llmIntentEnabled: input.llmIntentEnabled } : {},
    ...input.llmIntentTimeoutMs !== void 0 ? { llmIntentTimeoutMs: input.llmIntentTimeoutMs } : {},
    ...input.llmIntentModel !== void 0 ? { llmIntentModel: input.llmIntentModel } : {},
    ...input.embedIntentEnabled !== void 0 ? { embedIntentEnabled: input.embedIntentEnabled } : {},
    ...input.embedIntentTopN !== void 0 ? { embedIntentTopN: input.embedIntentTopN } : {},
    ...input.embedIntentThreshold !== void 0 ? { embedIntentThreshold: input.embedIntentThreshold } : {},
    // v1.3.75 HEARTFLOW: 心流配置 (默认 undefined → 插件默认 {enabled:false})
    ...input.heartflow ? { heartflow: input.heartflow } : {},
    // v1.3.76 JARGON: 黑话挖掘配置 (默认 undefined → 插件默认 {enabled:false})
    ...input.jargon ? { jargon: input.jargon } : {},
    // v1.3.77 AFFECTION: 好感度配置 (默认 undefined → 插件默认 {enabled:false})
    ...input.affection ? { affection: input.affection } : {},
    nickname: input.nickname,
    requireAtMention: input.requireAtMention,
    debounceMs: input.debounceMs,
    // 默认 wpp-wechat (专用 agent), 禁止 "main" (P0 污染防护)
    agent: input.agent ?? "wpp-wechat"
  };
  const json = stringifyLargeInts(JSON.stringify(cfg, null, 2)) + "\n";
  await writeFileAsync(filePath, json, "utf8");
  return { filePath, json };
}
async function removeAccountFile(accountId) {
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
async function readAccountFile(accountId) {
  if (!isValidAccountId(accountId)) throw new Error(`invalid accountId: '${accountId}'`);
  const filePath = join(getAccountsDir(), `${accountId}.json`);
  try {
    await access(filePath);
  } catch {
    throw new Error(`accounts/${accountId}.json does not exist`);
  }
  const raw = await readFileAsync(filePath, "utf8");
  return JSON.parse(raw);
}
async function updateAccountFile(accountId, patch) {
  if (!isValidAccountId(accountId)) throw new Error(`invalid accountId: '${accountId}'`);
  const existing = await readAccountFile(accountId);
  const merged = { ...existing, ...patch };
  const filePath = join(getAccountsDir(), `${accountId}.json`);
  const json = stringifyLargeInts(JSON.stringify(merged, null, 2)) + "\n";
  await writeFileAsync(filePath, json, "utf8");
  return { filePath, json };
}
function resolveOpenclawRoot() {
  return process.env.OPENCLAW_ROOT || (process.env.HOME ? `${process.env.HOME}/.openclaw` : "/root/.openclaw");
}
async function loadOpenclawJson() {
  const raw = await readFileAsync(join(resolveOpenclawRoot(), "openclaw.json"), "utf8");
  return JSON.parse(raw);
}
async function saveOpenclawJson(cfg) {
  await writeFileAsync(join(resolveOpenclawRoot(), "openclaw.json"), stringifyLargeInts(JSON.stringify(cfg, null, 2)) + "\n", "utf8");
}
async function registerAccountInOpenclaw(accountId, agentId) {
  const root = resolveOpenclawRoot();
  const cfg = await loadOpenclawJson();
  const channels = cfg.channels ?? {};
  const wpp = channels.wechatpadpro ?? {};
  const accounts = wpp.accounts ?? {};
  let registered = false;
  if (!accounts[accountId]) {
    accounts[accountId] = { enabled: true, configFile: `accounts/${accountId}.json` };
    wpp.accounts = accounts;
    channels.wechatpadpro = wpp;
    cfg.channels = channels;
    registered = true;
  }
  const bindings = cfg.bindings ?? [];
  const existing = bindings.some(
    (b) => b.match?.channel === "wechatpadpro" && b.match?.accountId === accountId
  );
  let bindingAdded = false;
  if (!existing) {
    bindings.push({
      type: "route",
      agentId,
      comment: `WeChatPadPro account ${accountId} routes to ${agentId}`,
      match: { channel: "wechatpadpro", accountId }
    });
    cfg.bindings = bindings;
    bindingAdded = true;
  }
  if (registered || bindingAdded) await saveOpenclawJson(cfg);
  return { registered, bindingAdded, openclawRoot: root };
}
async function unregisterAccountFromOpenclaw(accountId, agentId) {
  const root = resolveOpenclawRoot();
  const cfg = await loadOpenclawJson();
  let removed = false;
  const channels = cfg.channels ?? {};
  const wpp = channels.wechatpadpro ?? {};
  const accounts = wpp.accounts ?? {};
  if (accounts[accountId]) {
    delete accounts[accountId];
    wpp.accounts = accounts;
    channels.wechatpadpro = wpp;
    cfg.channels = channels;
    removed = true;
  }
  const bindings = cfg.bindings ?? [];
  const before = bindings.length;
  const kept = bindings.filter(
    (b) => !(b.match?.channel === "wechatpadpro" && b.match?.accountId === accountId)
  );
  if (kept.length !== before) {
    cfg.bindings = kept;
    removed = true;
  }
  const SHARED_AGENTS = /* @__PURE__ */ new Set(["wpp-wechat", "main"]);
  if (agentId && !SHARED_AGENTS.has(agentId)) {
    const keptBindings = cfg.bindings ?? [];
    const stillReferenced = keptBindings.some((b) => b.agentId === agentId);
    if (!stillReferenced) {
      const agentsCfg = cfg.agents ?? {};
      const agentList = agentsCfg.list;
      if (Array.isArray(agentList)) {
        const listBefore = agentList.length;
        const keptList = agentList.filter((a) => a?.id !== agentId);
        if (keptList.length !== listBefore) {
          agentsCfg.list = keptList;
          cfg.agents = agentsCfg;
          removed = true;
        }
      }
    }
  }
  if (removed) await saveOpenclawJson(cfg);
  return { removed, openclawRoot: root };
}
function getOpenclawRoot() {
  return resolveOpenclawRoot();
}
function validateAddInput(input) {
  const errors = [];
  if (!input.id || !isValidAccountId(input.id)) errors.push("id \u5FC5\u586B\u4E14\u5339\u914D /^[a-zA-Z0-9_-]{1,64}$/");
  if (!input.apiBaseUrl) errors.push("apiBaseUrl \u5FC5\u586B");
  if (!input.wsUrl) errors.push("wsUrl \u5FC5\u586B");
  if (!input.tokenKeyEnv) errors.push("tokenKeyEnv \u5FC5\u586B");
  if (!input.authcodeEnv) errors.push("authcodeEnv \u5FC5\u586B");
  if (!input.webhookHost) errors.push("webhookHost \u5FC5\u586B");
  if (!input.webhookPath) errors.push("webhookPath \u5FC5\u586B");
  if (!input.webhookPort || input.webhookPort < 1024 || input.webhookPort > 65535) {
    errors.push("webhookPort \u5FC5\u586B\u4E14 1024-65535");
  }
  if (input.debounceMs === void 0 || input.debounceMs < 0) {
    errors.push("debounceMs \u5FC5\u586B\u4E14 >= 0");
  }
  return errors;
}
async function migrateFromV0Config(configJsonPath, accountId = "default", envPrefix = "WECHATPRO") {
  if (!isValidAccountId(accountId)) {
    throw new Error(`invalid accountId: '${accountId}'`);
  }
  try {
    await access(configJsonPath);
  } catch {
    throw new Error(`config.json not found: ${configJsonPath}`);
  }
  const backupPath = `${configJsonPath}.migrate-backup.${Date.now()}`;
  const raw = await readFileAsync(configJsonPath, "utf8");
  await writeFileAsync(backupPath, raw, "utf8");
  const oldCfg = JSON.parse(raw);
  if (!oldCfg.account) {
    throw new Error(`old config.json missing "account" field, not v0.1.0 format`);
  }
  const warnings = [];
  const acc = oldCfg.account;
  const required = [
    "apiBaseUrl",
    "wsUrl",
    "webhookHost",
    "webhookPort",
    "webhookPath",
    "allowFrom",
    "groupPolicy",
    "groupAllowFrom",
    "nickname",
    "requireAtMention",
    "debounceMs"
  ];
  for (const k of required) {
    if (acc[k] === void 0) {
      warnings.push(`missing field: ${k} (using default)`);
    }
  }
  const tokenKeyEnv = `${envPrefix}_${accountId.toUpperCase().replace(/-/g, "_")}_TOKEN_KEY`;
  const authcodeEnv = `${envPrefix}_${accountId.toUpperCase().replace(/-/g, "_")}_AUTHCODE`;
  const webhookSecretEnv = acc.webhookSecret ? `${envPrefix}_${accountId.toUpperCase().replace(/-/g, "_")}_WEBHOOK_SECRET` : void 0;
  if (!acc.tokenKey) warnings.push("old config has empty tokenKey (\u9700\u5728 env \u8BBE\u771F\u503C)");
  if (!acc.authcode) warnings.push("old config has empty authcode (\u9700\u5728 env \u8BBE\u771F\u503C, \u626B\u7801\u786E\u8BA4\u540E)");
  const newCfg = {
    enabled: acc.enabled ?? true,
    tokenKey: "",
    // 强制 env
    tokenKeyEnv,
    apiBaseUrl: acc.apiBaseUrl ?? "http://127.0.0.1:8062",
    wsUrl: acc.wsUrl ?? "ws://127.0.0.1:8062/ws/sync",
    authcode: "",
    // 强制 env
    authcodeEnv,
    webhookHost: acc.webhookHost ?? "127.0.0.1",
    webhookPort: acc.webhookPort ?? 4398,
    webhookPath: acc.webhookPath ?? "/wechatpadpro/webhook",
    webhookSecret: "",
    ...webhookSecretEnv ? { webhookSecretEnv } : {},
    allowFrom: acc.allowFrom ?? [],
    groupPolicy: acc.groupPolicy ?? "closed",
    // v1.1.17 FULL-FIX: 默认 closed (fail-closed, 防 P0 污染)
    groupAllowFrom: acc.groupAllowFrom ?? [],
    selfWxid: acc.selfWxid ?? "",
    nickname: acc.nickname ?? accountId,
    requireAtMention: acc.requireAtMention ?? true,
    debounceMs: acc.debounceMs ?? 500
    // v1.3.74 PERF: 与 DEFAULT_DEBOUNCE_MS 对齐
  };
  const accountsDir = getAccountsDir();
  const newFile = join(accountsDir, `${accountId}.json`);
  try {
    await access(newFile);
    throw new Error(`accounts/${accountId}.json already exists, remove first or use different id`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("accounts/")) throw e;
  }
  await writeFileAsync(newFile, stringifyLargeInts(JSON.stringify(newCfg, null, 2)) + "\n", "utf8");
  return {
    accountId,
    oldFile: backupPath,
    newFile,
    tokenKeyEnv,
    authcodeEnv,
    webhookSecretEnv,
    warnings
  };
}
async function ensureAgentWorkspace(opts) {
  const {
    agentId,
    accountId,
    cloneFrom,
    patchOpenclawJson = true,
    // v1.3.55 RELEASE-GENERIC: OpenClaw 根目录可 env 覆盖 (接收方用自己的 OpenClaw)
    openclawRoot = process.env.OPENCLAW_ROOT || "/root/.openclaw",
    backupDir = `${process.env.BACKUP_ROOT || "/data"}/openclaw-create-agent-${Date.now()}`
  } = opts;
  const workspaceDir = `${openclawRoot}/workspace/${agentId}`;
  const agentDir = `${openclawRoot}/agents/${agentId}/agent`;
  const sessionsDir = `${openclawRoot}/agents/${agentId}/sessions`;
  const modelsJsonPath = `${agentDir}/models.json`;
  const sqlitePath = `${agentDir}/openclaw-agent.sqlite`;
  const configJsonPath = `${openclawRoot}/openclaw.json`;
  if (!/^[a-z0-9-]+$/.test(agentId)) {
    throw new Error(`agentId \u4E0D\u5408\u6CD5: '${agentId}' (must match /^[a-z0-9-]+$/)`);
  }
  const { access: access2 } = await import("node:fs/promises");
  try {
    await access2(workspaceDir);
    throw new Error(`workspace \u5DF2\u5B58\u5728: ${workspaceDir}`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("workspace")) throw e;
  }
  try {
    await access2(`${openclawRoot}/agents/${agentId}`);
    throw new Error(`agents \u76EE\u5F55\u5DF2\u5B58\u5728: /root/.openclaw/agents/${agentId}`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("agents")) throw e;
  }
  let openclawJsonBackedUp;
  if (patchOpenclawJson) {
    await import("node:fs/promises").then((m) => m.mkdir(backupDir, { recursive: true }));
    const { readFile, writeFile: writeFile2 } = await import("node:fs/promises");
    openclawJsonBackedUp = `${backupDir}/openclaw.json.bak`;
    const raw = await readFile(configJsonPath, "utf8");
    await writeFile2(openclawJsonBackedUp, raw, "utf8");
  }
  const filesWritten = [];
  await import("node:fs/promises").then((m) => m.mkdir(workspaceDir, { recursive: true }));
  filesWritten.push(workspaceDir);
  if (cloneFrom) {
    const source = `${openclawRoot}/workspace/${cloneFrom}`;
    const cores = ["AGENTS.md", "SOUL.md", "USER.md", "IDENTITY.md", "TOOLS.md", "HEARTBEAT.md", "BOOTSTRAP.md"];
    const { copyFile: copyFile2 } = await import("node:fs/promises");
    for (const f of cores) {
      try {
        await copyFile2(`${source}/${f}`, `${workspaceDir}/${f}`);
      } catch {
      }
    }
  } else {
    const { writeFile: writeFile2 } = await import("node:fs/promises");
    const templates = {
      "AGENTS.md": `# AGENTS.md - ${agentId} Agent

${agentId} \u4E13\u7528 Agent workspace\u3002

## \u804C\u8D23
- \u5904\u7406\u6765\u81EA ${agentId} \u63D2\u4EF6\u7684\u6240\u6709\u6D88\u606F
- \u81EA\u52A8\u8DEF\u7531\u5230 agent:${agentId}

## \u4F1A\u8BDD\u542F\u52A8
1. \u8BFB\u53D6 SOUL.md
2. \u8BFB\u53D6 USER.md
3. \u8BFB\u53D6 SKILL.md

## \u6D88\u606F\u5904\u7406
\u6309\u63D2\u4EF6\u6D41\u7A0B\u5904\u7406 (debouncer + trigger + dispatch)
`,
      "SOUL.md": `# SOUL.md - ${agentId} \u89D2\u8272

## \u6838\u5FC3\u4EF7\u503C\u89C2
- \u6309\u63D2\u4EF6 router \u63A5\u6536\u7684 inbound message \u5904\u7406
- \u8C28\u8FB9\u63A5 OpenClaw \u70ED\u91CD\u8F7D\u8BBE\u8BA1, \u5168\u9762\u9694\u79BB
`,
      "USER.md": `# USER.md - \u4F7F\u7528\u8005

- Name: (\u5F85\u586B)
- Timezone: Asia/Shanghai (GMT+8)
`,
      "IDENTITY.md": `# IDENTITY.md - ${agentId}

- Name: ${agentId}
- Creature: \u6570\u5B57\u52A9\u624B
- Vibe: \u76F4\u63A5
`,
      "TOOLS.md": `# TOOLS.md - ${agentId} \u5DE5\u5177\u7B14\u8BB0

(\u5F85\u586B: \u63D2\u4EF6\u4E13\u5C5E\u8DEF\u5F84 / \u51ED\u8BC1 / SOP \u811A\u672C)
`,
      "HEARTBEAT.md": `# HEARTBEAT.md

# Keep this file empty (or with only comments) to skip heartbeat API calls.
`,
      "BOOTSTRAP.md": `# BOOTSTRAP.md - ${agentId} \u542F\u52A8\u5361

\u5982\u679C BOOTSTRAP.md \u5B58\u5728, \u8FD9\u662F birth certificate. \u4E25\u683C\u9075\u5FAA\u540E\u5220\u9664\u3002
`
    };
    for (const [name, content] of Object.entries(templates)) {
      await writeFile2(`${workspaceDir}/${name}`, content, "utf8");
    }
  }
  await import("node:fs/promises").then(
    (m) => m.mkdir(`${workspaceDir}/.openclaw`, { recursive: true })
  );
  await import("node:fs/promises").then((m) => m.mkdir(`${agentDir}/plugins`, { recursive: true }));
  await import("node:fs/promises").then((m) => m.mkdir(sessionsDir, { recursive: true }));
  const { writeFile, copyFile } = await import("node:fs/promises");
  if (cloneFrom) {
    try {
      await copyFile(`${openclawRoot}/agents/${cloneFrom}/agent/models.json`, modelsJsonPath);
    } catch {
      await writeFile(modelsJsonPath, '{"providers":{}}', "utf8");
    }
  } else {
    try {
      await copyFile(`${openclawRoot}/agents/gewe-wechat/agent/models.json`, modelsJsonPath);
    } catch {
      await writeFile(modelsJsonPath, '{"providers":{}}', "utf8");
    }
  }
  await writeFile(sqlitePath, "", "utf8");
  if (patchOpenclawJson) {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(configJsonPath, "utf8");
    const cfg = JSON.parse(raw);
    const agents = cfg.agents ?? {};
    const list = agents.list ?? [];
    if (!list.some((a) => a.id === agentId)) {
      list.push({
        id: agentId,
        workspace: workspaceDir,
        agentDir
      });
    }
    const bindings = cfg.bindings ?? [];
    if (accountId) {
      const hasBinding = bindings.some(
        (b) => b.match?.channel === "wechatpadpro" && b.match?.accountId === accountId
      );
      if (!hasBinding) {
        bindings.push({
          type: "route",
          agentId,
          comment: `WeChatPadPro account ${accountId} routes to ${agentId}`,
          match: { channel: "wechatpadpro", accountId }
        });
      }
    } else {
      bindings.push({
        type: "route",
        agentId,
        match: { channel: "wechatpadpro" }
      });
    }
    await writeFile(configJsonPath, stringifyLargeInts(JSON.stringify(cfg, null, 2)) + "\n", "utf8");
  }
  return {
    workspaceDir,
    agentDir,
    sessionsDir,
    modelsJsonPath,
    sqlitePath,
    openclawJsonBackedUp,
    filesWritten
  };
}
export {
  diagnoseAccount,
  ensureAgentWorkspace,
  getAccountsDir,
  getOpenclawRoot,
  listAccountsDetailed,
  migrateFromV0Config,
  readAccountFile,
  registerAccountInOpenclaw,
  removeAccountFile,
  unregisterAccountFromOpenclaw,
  updateAccountFile,
  validateAccount,
  validateAddInput,
  writeAccountFile
};
//# sourceMappingURL=setup-wizard.js.map
