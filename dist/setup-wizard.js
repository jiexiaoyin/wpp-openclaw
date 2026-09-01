// src/setup-wizard.ts - Setup wizard 核心逻辑 (testable, 不依赖 readline)
//
// 设计: scripts/setup.ts 调这里的 pure functions + 顶层 readline
//       测试可 mock stdin/stdout, 不需要 spawn 子进程
// v1.3.18 P2-D-1 (2026-08-10): prod 误跑防护 — setup-wizard 改 prod 配置是高危动作
//   默认拒绝在 NODE_ENV=production 模式运行；显式设 WPP_ALLOW_SETUP_PROD=1 才能强制绕过 (老板手动确认)
const _IS_PROD = process.env.NODE_ENV === "production" && process.env.WPP_ALLOW_SETUP_PROD !== "1";
if (_IS_PROD && process.env.WPP_SETUP_GUARD_SKIP !== "1") {
    // console.error 是有意的 (引导用户, 不走 logger 避免 init 副作用)
    console.error("\n🚫 setup-wizard 不允许在 production 模式运行 (会改 accounts/<id>.json + webhook 凭证)");
    console.error("   若确认是 dev/调试, 设 WPP_ALLOW_SETUP_PROD=1 强制绕过\n");
    process.exit(2);
}
import { readFile as readFileAsync, writeFile as writeFileAsync, access, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createConnection } from "node:net";
import { isValidAccountId, listAccountIds, loadAccountConfig } from "./config.js";
import { stringifyLargeInts } from "./util/bigint.js";
import { postWppJson } from "./api/client.js";
import { ctxToCallOpts } from "./send/factory.js";
/** accounts 目录 (相对 cwd, 可被 WPP_ACCOUNTS_DIR env 覆盖)
 * 用 function (不是 const) 保证每次读 env, 避免 module load 时 env 未设
 */
export function getAccountsDir() {
    return process.env.WPP_ACCOUNTS_DIR
        ? process.env.WPP_ACCOUNTS_DIR
        : join(process.cwd(), "accounts");
}
export async function listAccountsDetailed() {
    const ids = await listAccountIds();
    // P3-2 (2026-08-13 修复): 串行 for...of → Promise.all 并发 (loadAccountConfig 是 IO 操作, 可并发)
    // 注意: 单个失败用 catch 兜底 (不阻塞其它账号), 顺序保持与 ids 一致
    const results = await Promise.all(ids.map(async (id) => {
        try {
            const cfg = await loadAccountConfig(id);
            const envToken = cfg.tokenKeyEnv ? process.env[cfg.tokenKeyEnv] : null;
            const envAuth = cfg.authcodeEnv ? process.env[cfg.authcodeEnv] : null;
            const envHints = [];
            if (!envToken && cfg.tokenKeyEnv)
                envHints.push(cfg.tokenKeyEnv);
            if (!envAuth && cfg.authcodeEnv)
                envHints.push(cfg.authcodeEnv);
            return {
                id,
                nickname: cfg.nickname || "(无)",
                configured: !!(envToken && cfg.apiBaseUrl),
                envHints,
            };
        }
        catch {
            return { id, nickname: "(加载失败)", configured: false, envHints: [] };
        }
    }));
    return results;
}
export async function validateAccount(accountId) {
    const results = [];
    function check(label, ok, level, detail) {
        // 默认 level 由 ok 决定 (true=pass, false=fail)
        if (level === undefined)
            level = ok ? "pass" : "fail";
        results.push({ label, level, detail });
    }
    check("accountId 合法", isValidAccountId(accountId));
    const filePath = join(getAccountsDir(), `${accountId}.json`);
    try {
        await access(filePath);
    }
    catch {
        check("accounts file 存在", false, "fail", filePath);
        return results;
    }
    check("accounts file 存在", true, "pass", filePath);
    let cfg;
    try {
        cfg = await loadAccountConfig(accountId);
        check("JSON 解析", true);
    }
    catch (e) {
        check("JSON 解析", false, "fail", e instanceof Error ? e.message : String(e));
        return results;
    }
    check("enabled", cfg.enabled, cfg.enabled ? "pass" : "warn", cfg.enabled ? "true" : "false (账号禁用)");
    if (cfg.tokenKeyEnv) {
        const envVal = process.env[cfg.tokenKeyEnv];
        if (envVal) {
            check(`env ${cfg.tokenKeyEnv}`, true, "pass", `${envVal.length} chars`);
        }
        else {
            check(`env ${cfg.tokenKeyEnv}`, false, "fail", "未设");
        }
    }
    else {
        check("tokenKeyEnv 配置", false, "fail", "accounts file 缺 tokenKeyEnv 字段");
    }
    if (cfg.authcodeEnv) {
        const envVal = process.env[cfg.authcodeEnv];
        if (envVal) {
            check(`env ${cfg.authcodeEnv}`, true, "pass", `${envVal.length} chars`);
        }
        else {
            check(`env ${cfg.authcodeEnv}`, false, "warn", "未设 (扫码登录前可空)");
        }
    }
    else {
        check("authcodeEnv 配置", false, "warn", "未设 (扫码登录需先有)");
    }
    check("apiBaseUrl", !!cfg.apiBaseUrl, cfg.apiBaseUrl ? "pass" : "fail", cfg.apiBaseUrl || "空");
    if (cfg.webhookPort >= 1024 && cfg.webhookPort <= 65535) {
        check(`webhook port ${cfg.webhookPort}`, true, "pass", "范围有效");
    }
    else {
        check(`webhook port ${cfg.webhookPort}`, false, "fail", "应 1024-65535");
    }
    if (cfg.webhookSecretEnv && process.env[cfg.webhookSecretEnv]) {
        check("webhookSecret (HMAC 验签)", true, "pass", "启用");
    }
    else if (cfg.webhookSecret) {
        check("webhookSecret (HMAC 验签)", true, "warn", "明文存 file, 建议改用 *Env 字段");
    }
    else {
        check("webhookSecret (HMAC 验签)", false, "warn", "未配 (vendor 公开算法后启用)");
    }
    const validPolicies = ["open", "disabled", "allowlist", "closed"];
    check(`groupPolicy '${cfg.groupPolicy}'`, validPolicies.includes(cfg.groupPolicy), validPolicies.includes(cfg.groupPolicy) ? "pass" : "fail");
    return results;
}
// ============ v1.3.30 DIAGNOSE (2026-08-11 老板拍板): 运行时诊断 ============
/**
 * 一键诊断账号运行时健康度: 在 validateAccount (配置静态检查) 之上,
 * 补 env 凭证 / vendor 连通性 / webhook 端口 / agent 绑定 的动态检查.
 * 返回 CheckResult[] (pass/warn/fail), 复用 validateAccount 的检查 + 新增运行时项.
 */
export async function diagnoseAccount(accountId) {
    const results = await validateAccount(accountId);
    function check(label, ok, level, detail) {
        if (level === undefined)
            level = ok ? "pass" : "fail";
        results.push({ label, level, detail });
    }
    let cfg = null;
    try {
        cfg = await loadAccountConfig(accountId);
    }
    catch {
        return results; // validateAccount 已报配置加载失败
    }
    // ---- env 凭证实际值 ----
    const token = cfg.tokenKeyEnv ? process.env[cfg.tokenKeyEnv] : null;
    const auth = cfg.authcodeEnv ? process.env[cfg.authcodeEnv] : null;
    check(`env ${cfg.tokenKeyEnv ?? "tokenKeyEnv"} 有值`, !!token, token ? "pass" : "fail");
    check(`env ${cfg.authcodeEnv ?? "authcodeEnv"} 有值`, !!auth, auth ? "pass" : "warn", auth ? `${auth.length} chars` : "扫码登录前可空, 但已登录场景应有值");
    // ---- vendor API 连通性 (HeartBeat, 无副作用) ----
    try {
        const opts = ctxToCallOpts({
            baseUrl: cfg.apiBaseUrl,
            tokenKey: token ?? "",
            authcode: auth ?? "",
            accountId,
        });
        const r = await postWppJson(cfg.apiBaseUrl, "/Login/HeartBeat", {}, opts);
        check("vendor API 连通 (HeartBeat)", r.Code === 0, r.Code === 0 ? "pass" : "warn", r.Code === 0 ? "OK" : `Code=${r.Code} ${r.CodeValue ?? ""}`);
    }
    catch (e) {
        check("vendor API 连通 (HeartBeat)", false, "fail", e instanceof Error ? e.message : String(e));
    }
    // ---- webhook 端口监听 ----
    await new Promise((resolve) => {
        const sock = createConnection({ host: cfg.webhookHost, port: cfg.webhookPort }, () => {
            check(`webhook ${cfg.webhookHost}:${cfg.webhookPort} 监听中`, true, "pass");
            sock.destroy();
            resolve();
        });
        sock.on("error", () => {
            check(`webhook ${cfg.webhookHost}:${cfg.webhookPort} 监听中`, false, "fail", "端口未监听 (gateway 未启动?)");
            resolve();
        });
        sock.setTimeout(3000, () => {
            sock.destroy();
            check("webhook 端口探测", false, "fail", "连接超时");
            resolve();
        });
    });
    // ---- agent 绑定 ----
    if (cfg.agent) {
        try {
            const raw = await readFileAsync(`${process.env.OPENCLAW_ROOT || "/root/.openclaw"}/openclaw.json`, "utf8");
            const ocfg = JSON.parse(raw);
            const exists = (ocfg.agents?.list ?? []).some((a) => a.id === cfg.agent);
            check(`agent '${cfg.agent}' 在 openclaw.json`, exists, exists ? "pass" : "fail", exists ? "OK" : "未找到, 需 npm run setup add 时同步创建");
        }
        catch {
            check("agent 绑定检查", false, "warn", "读 openclaw.json 失败");
        }
    }
    return results;
}
/** 校验输入 + 写 accounts/<id>.json. 抛错 if 失败. */
export async function writeAccountFile(input) {
    if (!isValidAccountId(input.id)) {
        throw new Error(`invalid accountId: '${input.id}' (must match /^[a-zA-Z0-9_-]{1,64}$/)`);
    }
    const filePath = join(getAccountsDir(), `${input.id}.json`);
    try {
        await access(filePath);
        throw new Error(`accounts/${input.id}.json already exists, run 'remove' first`);
    }
    catch (e) {
        if (e instanceof Error && e.message.startsWith("accounts/"))
            throw e;
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
        ...(input.webhookBusinessPath ? { webhookBusinessPath: input.webhookBusinessPath } : {}),
        ...(input.webhookPathToken ? { webhookPathToken: input.webhookPathToken } : {}),
        ...(input.webhookPublicUrl ? { webhookPublicUrl: input.webhookPublicUrl } : {
            ...(input.webhookPublicUrlEnv ? { webhookPublicUrlEnv: input.webhookPublicUrlEnv } : {}),
        }),
        ...(input.autoSetWebhook !== undefined ? { autoSetWebhook: input.autoSetWebhook } : {}),
        ...(input.setWebhookRetries !== undefined ? { setWebhookRetries: input.setWebhookRetries } : {}),
        ...(input.adminUsers && input.adminUsers.length > 0 ? { adminUsers: input.adminUsers } : {}),
        ...(input.commandAllowlist ? { commandAllowlist: input.commandAllowlist } : {}),
        ...(input.sync ? { sync: input.sync } : {}),
        allowFrom: input.allowFrom,
        groupPolicy: input.groupPolicy,
        ...(input.groupAllowFrom && input.groupAllowFrom.length > 0 ? { groupAllowFrom: input.groupAllowFrom } : {}),
        ...(input.selfWxid ? { selfWxid: input.selfWxid } : {}),
        ...(input.keywordTrigger ? { keywordTrigger: input.keywordTrigger } : {}),
        ...(input.msgTypeTrigger ? { msgTypeTrigger: input.msgTypeTrigger } : {}),
        ...(input.quoteBotTrigger ? { quoteBotTrigger: input.quoteBotTrigger } : {}),
        ...(input.blacklistGroups && input.blacklistGroups.length > 0 ? { blacklistGroups: input.blacklistGroups } : {}),
        ...(input.chatroomDebug !== undefined ? { chatroomDebug: input.chatroomDebug } : {}),
        ...(input.dmPairingEnabled !== undefined ? { dmPairingEnabled: input.dmPairingEnabled } : {}),
        // v1.3.63 (2026-08-13): mcpEnabled 默认 false — 之前不写该字段 → 插件默认 true (vendor realtime 未开通白耗),
        //   与 default.json 一致。显式 input.mcpEnabled === true 才开。
        mcpEnabled: input.mcpEnabled ?? false,
        ...(input.groupContextEnabled !== undefined ? { groupContextEnabled: input.groupContextEnabled } : {}),
        ...(input.groupContextWindow !== undefined ? { groupContextWindow: input.groupContextWindow } : {}),
        ...(input.groupContextMaxImages !== undefined ? { groupContextMaxImages: input.groupContextMaxImages } : {}),
        ...(input.llmIntentEnabled !== undefined ? { llmIntentEnabled: input.llmIntentEnabled } : {}),
        ...(input.llmIntentTimeoutMs !== undefined ? { llmIntentTimeoutMs: input.llmIntentTimeoutMs } : {}),
        ...(input.llmIntentModel !== undefined ? { llmIntentModel: input.llmIntentModel } : {}),
        ...(input.embedIntentEnabled !== undefined ? { embedIntentEnabled: input.embedIntentEnabled } : {}),
        ...(input.embedIntentTopN !== undefined ? { embedIntentTopN: input.embedIntentTopN } : {}),
        ...(input.embedIntentThreshold !== undefined ? { embedIntentThreshold: input.embedIntentThreshold } : {}),
        // v1.3.75 HEARTFLOW: 心流配置 (默认 undefined → 插件默认 {enabled:false})
        ...(input.heartflow ? { heartflow: input.heartflow } : {}),
        // v1.3.76 JARGON: 黑话挖掘配置 (默认 undefined → 插件默认 {enabled:false})
        ...(input.jargon ? { jargon: input.jargon } : {}),
        // v1.3.77 AFFECTION: 好感度配置 (默认 undefined → 插件默认 {enabled:false})
        ...(input.affection ? { affection: input.affection } : {}),
        nickname: input.nickname,
        requireAtMention: input.requireAtMention,
        debounceMs: input.debounceMs,
        // 默认 wpp-wechat (专用 agent), 禁止 "main" (P0 污染防护)
        agent: input.agent ?? "wpp-wechat",
    };
    const json = stringifyLargeInts(JSON.stringify(cfg, null, 2)) + "\n";
    await writeFileAsync(filePath, json, "utf8");
    return { filePath, json };
}
export async function removeAccountFile(accountId) {
    if (!isValidAccountId(accountId)) {
        throw new Error(`invalid accountId: '${accountId}'`);
    }
    const filePath = join(getAccountsDir(), `${accountId}.json`);
    try {
        await access(filePath);
    }
    catch {
        throw new Error(`accounts/${accountId}.json does not exist`);
    }
    await unlink(filePath);
    return { filePath };
}
// ============ v1.3.56 MULTI-ACCOUNT: 读/改账号 + openclaw.json 登记 ============
/** 读取现有账号配置 (modify 用) */
export async function readAccountFile(accountId) {
    if (!isValidAccountId(accountId))
        throw new Error(`invalid accountId: '${accountId}'`);
    const filePath = join(getAccountsDir(), `${accountId}.json`);
    try {
        await access(filePath);
    }
    catch {
        throw new Error(`accounts/${accountId}.json does not exist`);
    }
    const raw = await readFileAsync(filePath, "utf8");
    return JSON.parse(raw);
}
/** merge 写回账号配置 (modify 用, 保留未改字段) */
export async function updateAccountFile(accountId, patch) {
    if (!isValidAccountId(accountId))
        throw new Error(`invalid accountId: '${accountId}'`);
    const existing = await readAccountFile(accountId);
    const merged = { ...existing, ...patch };
    const filePath = join(getAccountsDir(), `${accountId}.json`);
    const json = stringifyLargeInts(JSON.stringify(merged, null, 2)) + "\n";
    await writeFileAsync(filePath, json, "utf8");
    return { filePath, json };
}
/** 解析 openclaw.json 根目录 (OPENCLAW_ROOT env 覆盖, 默认 $HOME/.openclaw) */
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
/**
 * v1.3.56 MULTI-ACCOUNT: 在 openclaw.json 登记新账号 (一账号一 agent 路由)。
 * 两处:
 *   1. channels.wechatpadpro.accounts.<id> = { enabled, configFile: "accounts/<id>.json" }
 *   2. bindings 加 { type:"route", agentId, match:{ channel:"wechatpadpro", accountId:"<id>" } }
 * 幂等: 已存在同 accountId binding / accounts 登记则跳过。
 */
export async function registerAccountInOpenclaw(accountId, agentId) {
    const root = resolveOpenclawRoot();
    const cfg = await loadOpenclawJson();
    // 1. channels.wechatpadpro.accounts.<id>
    const channels = (cfg.channels ?? {});
    const wpp = (channels.wechatpadpro ?? {});
    const accounts = (wpp.accounts ?? {});
    let registered = false;
    if (!accounts[accountId]) {
        accounts[accountId] = { enabled: true, configFile: `accounts/${accountId}.json` };
        wpp.accounts = accounts;
        channels.wechatpadpro = wpp;
        cfg.channels = channels;
        registered = true;
    }
    // 2. bindings route (per-account 精确匹配)
    const bindings = (cfg.bindings ?? []);
    const existing = bindings.some((b) => b.match?.channel === "wechatpadpro" &&
        b.match?.accountId === accountId);
    let bindingAdded = false;
    if (!existing) {
        // 2026-08-13 FIX: 曾注入 bindId 字段 → OpenClaw binding schema 校验失败 (bindings.N: Invalid input)
        //   gateway 启动失败 (status=78/CONFIG)。OpenClaw route binding 只认 type/agentId/comment/match。
        //   (真实踩坑: 启用 xieyin 第二账号时 prod openclaw.json 被注入 bindId:1 → gateway 崩, 已手动移除)
        bindings.push({
            type: "route",
            agentId,
            comment: `WeChatPadPro account ${accountId} routes to ${agentId}`,
            match: { channel: "wechatpadpro", accountId },
        });
        cfg.bindings = bindings;
        bindingAdded = true;
    }
    if (registered || bindingAdded)
        await saveOpenclawJson(cfg);
    return { registered, bindingAdded, openclawRoot: root };
}
/** 从 openclaw.json 删除账号登记 + binding (remove --clean 用) */
export async function unregisterAccountFromOpenclaw(accountId, agentId) {
    const root = resolveOpenclawRoot();
    const cfg = await loadOpenclawJson();
    let removed = false;
    // 1. 删 channels.wechatpadpro.accounts.<id>
    const channels = (cfg.channels ?? {});
    const wpp = (channels.wechatpadpro ?? {});
    const accounts = (wpp.accounts ?? {});
    if (accounts[accountId]) {
        delete accounts[accountId];
        wpp.accounts = accounts;
        channels.wechatpadpro = wpp;
        cfg.channels = channels;
        removed = true;
    }
    // 2. 删对应 binding
    const bindings = (cfg.bindings ?? []);
    const before = bindings.length;
    const kept = bindings.filter((b) => !(b.match?.channel === "wechatpadpro" &&
        b.match?.accountId === accountId));
    if (kept.length !== before) {
        cfg.bindings = kept;
        removed = true;
    }
    // 3. 删 agents.list 里的 agent 条目 (2026-08-13: remove --clean 曾遗漏, 需手动删)
    //    ensureAgentWorkspace add 时注入 agents.list; unregister 若收到 agentId 则同步清掉
    //    v1.3.63 P1-6 (2026-08-14 审阅): 两个保护 —
    //      a) 共享默认 agent (wpp-wechat/main) 不删 (removeCmd step2 已保护目录, 这里对齐 agents.list)
    //      b) 其它账号 binding 仍引用该 agentId → 不删 (避免路由断裂)
    const SHARED_AGENTS = new Set(["wpp-wechat", "main"]);
    if (agentId && !SHARED_AGENTS.has(agentId)) {
        const keptBindings = (cfg.bindings ?? []);
        const stillReferenced = keptBindings.some((b) => b.agentId === agentId);
        if (!stillReferenced) {
            const agentsCfg = (cfg.agents ?? {});
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
    if (removed)
        await saveOpenclawJson(cfg);
    return { removed, openclawRoot: root };
}
/** 解析 openclaw.json 根目录 (供 setup.ts 复用, 处理 agent workspace 删除) */
export function getOpenclawRoot() {
    return resolveOpenclawRoot();
}
// ============ helpers (also exported for tests) ============
/** 校验 add 字段合法性 (UI 层先调一次, writeAccountFile 再校验一次) */
export function validateAddInput(input) {
    const errors = [];
    if (!input.id || !isValidAccountId(input.id))
        errors.push("id 必填且匹配 /^[a-zA-Z0-9_-]{1,64}$/");
    if (!input.apiBaseUrl)
        errors.push("apiBaseUrl 必填");
    if (!input.wsUrl)
        errors.push("wsUrl 必填");
    if (!input.tokenKeyEnv)
        errors.push("tokenKeyEnv 必填");
    if (!input.authcodeEnv)
        errors.push("authcodeEnv 必填");
    if (!input.webhookHost)
        errors.push("webhookHost 必填");
    if (!input.webhookPath)
        errors.push("webhookPath 必填");
    if (!input.webhookPort || input.webhookPort < 1024 || input.webhookPort > 65535) {
        errors.push("webhookPort 必填且 1024-65535");
    }
    if (input.debounceMs === undefined || input.debounceMs < 0) {
        errors.push("debounceMs 必填且 >= 0");
    }
    return errors;
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
export async function migrateFromV0Config(configJsonPath, accountId = "default", envPrefix = "WECHATPRO") {
    if (!isValidAccountId(accountId)) {
        throw new Error(`invalid accountId: '${accountId}'`);
    }
    try {
        await access(configJsonPath);
    }
    catch {
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
        "apiBaseUrl", "wsUrl", "webhookHost", "webhookPort", "webhookPath",
        "allowFrom", "groupPolicy", "groupAllowFrom", "nickname",
        "requireAtMention", "debounceMs",
    ];
    for (const k of required) {
        if (acc[k] === undefined) {
            warnings.push(`missing field: ${k} (using default)`);
        }
    }
    const tokenKeyEnv = `${envPrefix}_${accountId.toUpperCase().replace(/-/g, "_")}_TOKEN_KEY`;
    const authcodeEnv = `${envPrefix}_${accountId.toUpperCase().replace(/-/g, "_")}_AUTHCODE`;
    const webhookSecretEnv = acc.webhookSecret
        ? `${envPrefix}_${accountId.toUpperCase().replace(/-/g, "_")}_WEBHOOK_SECRET`
        : undefined;
    if (!acc.tokenKey)
        warnings.push("old config has empty tokenKey (需在 env 设真值)");
    if (!acc.authcode)
        warnings.push("old config has empty authcode (需在 env 设真值, 扫码确认后)");
    const newCfg = {
        enabled: acc.enabled ?? true,
        tokenKey: "", // 强制 env
        tokenKeyEnv,
        apiBaseUrl: acc.apiBaseUrl ?? "http://127.0.0.1:8062",
        wsUrl: acc.wsUrl ?? "ws://127.0.0.1:8062/ws/sync",
        authcode: "", // 强制 env
        authcodeEnv,
        webhookHost: acc.webhookHost ?? "127.0.0.1",
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
        debounceMs: acc.debounceMs ?? 500, // v1.3.74 PERF: 与 DEFAULT_DEBOUNCE_MS 对齐
    };
    const accountsDir = getAccountsDir();
    const newFile = join(accountsDir, `${accountId}.json`);
    try {
        await access(newFile);
        throw new Error(`accounts/${accountId}.json already exists, remove first or use different id`);
    }
    catch (e) {
        if (e instanceof Error && e.message.startsWith("accounts/"))
            throw e;
        // file 不存在, 继续
    }
    await writeFileAsync(newFile, stringifyLargeInts(JSON.stringify(newCfg, null, 2)) + "\n", "utf8");
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
/**
 * v1.1.42 SETUP-MERGE: 一键创建 agent workspace + agentDir + openclaw.json 注入
 *
 * 步骤 (idempotent):
 *   1. 防呆: agentId 格式 [a-z0-9-]+
 *   2. 防呆: workspace / agents 不冲突
 *   3. 备份 openclaw.json (如需 patch)
 *   4. mkdir workspace/<id>/ + 7 个核心文件 (clone-from or minimal)
 *   5. mkdir workspace/<id>/.openclaw/
 *   6. mkdir agents/<id>/{agent/{plugins},sessions}/
 *   7. cp/写 models.json + touch sqlite
 *   8. 注入 openclaw.json agents.list + bindings
 *   9. 校验
 *
 * @param opts - 配置选项
 * @returns EnsureAgentWorkspaceResult (新建的路径 + 备份)
 * @throws if 防呆失败 (id 格式 / 冲突)
 */
export async function ensureAgentWorkspace(opts) {
    const { agentId, accountId, cloneFrom, patchOpenclawJson = true, 
    // v1.3.55 RELEASE-GENERIC: OpenClaw 根目录可 env 覆盖 (接收方用自己的 OpenClaw)
    openclawRoot = process.env.OPENCLAW_ROOT || "/root/.openclaw", backupDir = `${process.env.BACKUP_ROOT || "/data"}/openclaw-create-agent-${Date.now()}`, } = opts;
    const workspaceDir = `${openclawRoot}/workspace/${agentId}`;
    const agentDir = `${openclawRoot}/agents/${agentId}/agent`;
    const sessionsDir = `${openclawRoot}/agents/${agentId}/sessions`;
    const modelsJsonPath = `${agentDir}/models.json`;
    const sqlitePath = `${agentDir}/openclaw-agent.sqlite`;
    const configJsonPath = `${openclawRoot}/openclaw.json`;
    if (!/^[a-z0-9-]+$/.test(agentId)) {
        throw new Error(`agentId 不合法: '${agentId}' (must match /^[a-z0-9-]+$/)`);
    }
    const { access } = await import("node:fs/promises");
    try {
        await access(workspaceDir);
        throw new Error(`workspace 已存在: ${workspaceDir}`);
    }
    catch (e) {
        if (e instanceof Error && e.message.startsWith("workspace"))
            throw e;
    }
    try {
        await access(`${openclawRoot}/agents/${agentId}`);
        throw new Error(`agents 目录已存在: /root/.openclaw/agents/${agentId}`);
    }
    catch (e) {
        if (e instanceof Error && e.message.startsWith("agents"))
            throw e;
    }
    let openclawJsonBackedUp;
    if (patchOpenclawJson) {
        await import("node:fs/promises").then((m) => m.mkdir(backupDir, { recursive: true }));
        const { readFile, writeFile } = await import("node:fs/promises");
        openclawJsonBackedUp = `${backupDir}/openclaw.json.bak`;
        const raw = await readFile(configJsonPath, "utf8");
        await writeFile(openclawJsonBackedUp, raw, "utf8");
    }
    const filesWritten = [];
    await import("node:fs/promises").then((m) => m.mkdir(workspaceDir, { recursive: true }));
    filesWritten.push(workspaceDir);
    if (cloneFrom) {
        const source = `${openclawRoot}/workspace/${cloneFrom}`;
        const cores = ["AGENTS.md", "SOUL.md", "USER.md", "IDENTITY.md", "TOOLS.md", "HEARTBEAT.md", "BOOTSTRAP.md"];
        const { copyFile } = await import("node:fs/promises");
        for (const f of cores) {
            try {
                await copyFile(`${source}/${f}`, `${workspaceDir}/${f}`);
            }
            catch {
                // 源文件不存在, 跳过 (单文件缺失不阻塞)
            }
        }
    }
    else {
        // minimal 模板 (7 核心文件)
        const { writeFile } = await import("node:fs/promises");
        const templates = {
            "AGENTS.md": `# AGENTS.md - ${agentId} Agent\n\n${agentId} 专用 Agent workspace。\n\n## 职责\n- 处理来自 ${agentId} 插件的所有消息\n- 自动路由到 agent:${agentId}\n\n## 会话启动\n1. 读取 SOUL.md\n2. 读取 USER.md\n3. 读取 SKILL.md\n\n## 消息处理\n按插件流程处理 (debouncer + trigger + dispatch)\n`,
            "SOUL.md": `# SOUL.md - ${agentId} 角色\n\n## 核心价值观\n- 按插件 router 接收的 inbound message 处理\n- 谨边接 OpenClaw 热重载设计, 全面隔离\n`,
            "USER.md": `# USER.md - 使用者\n\n- Name: (待填)\n- Timezone: Asia/Shanghai (GMT+8)\n`,
            "IDENTITY.md": `# IDENTITY.md - ${agentId}\n\n- Name: ${agentId}\n- Creature: 数字助手\n- Vibe: 直接\n`,
            "TOOLS.md": `# TOOLS.md - ${agentId} 工具笔记\n\n(待填: 插件专属路径 / 凭证 / SOP 脚本)\n`,
            "HEARTBEAT.md": `# HEARTBEAT.md\n\n# Keep this file empty (or with only comments) to skip heartbeat API calls.\n`,
            "BOOTSTRAP.md": `# BOOTSTRAP.md - ${agentId} 启动卡\n\n如果 BOOTSTRAP.md 存在, 这是 birth certificate. 严格遵循后删除。\n`,
        };
        for (const [name, content] of Object.entries(templates)) {
            await writeFile(`${workspaceDir}/${name}`, content, "utf8");
        }
    }
    await import("node:fs/promises").then((m) => m.mkdir(`${workspaceDir}/.openclaw`, { recursive: true }));
    await import("node:fs/promises").then((m) => m.mkdir(`${agentDir}/plugins`, { recursive: true }));
    await import("node:fs/promises").then((m) => m.mkdir(sessionsDir, { recursive: true }));
    const { writeFile, copyFile } = await import("node:fs/promises");
    if (cloneFrom) {
        try {
            await copyFile(`${openclawRoot}/agents/${cloneFrom}/agent/models.json`, modelsJsonPath);
        }
        catch {
            await writeFile(modelsJsonPath, '{"providers":{}}', "utf8");
        }
    }
    else {
        // 优先 cp gewe-wechat/agent/models.json (有 embedding)
        try {
            await copyFile(`${openclawRoot}/agents/gewe-wechat/agent/models.json`, modelsJsonPath);
        }
        catch {
            await writeFile(modelsJsonPath, '{"providers":{}}', "utf8");
        }
    }
    await writeFile(sqlitePath, "", "utf8"); // touch
    if (patchOpenclawJson) {
        const { readFile } = await import("node:fs/promises");
        const raw = await readFile(configJsonPath, "utf8");
        const cfg = JSON.parse(raw);
        const agents = (cfg.agents ?? {});
        const list = (agents.list ?? []);
        // v1.3.57 P2-6 (2026-08-13 交付审阅): agents.list 去重 (重复调用会写重复 agent 条目)
        if (!list.some((a) => a.id === agentId)) {
            list.push({
                id: agentId,
                workspace: workspaceDir,
                agentDir: agentDir,
            });
        }
        const bindings = (cfg.bindings ?? []);
        // v1.3.56 MULTI-ACCOUNT binding 修复: channel "last" 是占位符(不命中任何流量),
        //   accountId "*" 是通配(路由到同一 agent) — 都错。
        //   现在: channel="wechatpadpro" + accountId 精确匹配 (per-account 一账号一 agent)。
        //   幂等: 同 accountId 已存在 binding 则跳过 (防重复 add)。
        if (accountId) {
            const hasBinding = bindings.some((b) => b.match?.channel === "wechatpadpro" &&
                b.match?.accountId === accountId);
            if (!hasBinding) {
                // v1.3.63 P1-5 (2026-08-14 审阅): 不再注入 bindId — OpenClaw binding schema 只认
                //   type/agentId/comment/match (与 registerAccountInOpenclaw 对齐; 曾注入 bindId → gateway status=78 崩)
                bindings.push({
                    type: "route",
                    agentId,
                    comment: `WeChatPadPro account ${accountId} routes to ${agentId}`,
                    match: { channel: "wechatpadpro", accountId },
                });
            }
        }
        else {
            // 无 accountId (旧调用): 保持旧行为但修 channel (agent 级 binding, 不绑具体账号)
            bindings.push({
                type: "route",
                agentId,
                match: { channel: "wechatpadpro" },
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
        filesWritten,
    };
}
//# sourceMappingURL=setup-wizard.js.map