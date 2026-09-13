// channel-ui-bridge.ts — OpenClaw「Channel」页 ⇄ 插件账号文件桥
// v1.5.5 (2026-09-10 老板: 新 Web UI Channel 页应能体现 wechatpadpro 真实配置并在此可配置 + 即时热生效不掉线)
//
// 唯一真值不变 = accounts/<id>.json; Channel 页存 openclaw.json#channels.wechatpadpro[.accounts.<id>]。
// 本模块做「单向桥」: fs.watch openclaw.json → 读 channels.wechatpadpro 子树 → 对**核心字段集**
// diff → 只 merge 命中键写回 accounts/<id>.json (一次读改写原子写, 绝不触碰未暴露字段) →
// 触发既有 watchAccountConfigs 热载引擎 apply 到运行中 AccountContext (零重连)。
//
// 网关侧 no-op 由 wppChannelPlugin.reload.noopPrefixes 声明 (见 index.ts), 本 watcher 是唯一 applier。
//
// 敏感红线 (老板铁律): 本模块**永不读写明文凭证**。schema 只暴露 *Env 变量名 (tokenKeyEnv/
// authcodeEnv/webhookSecretEnv/webhookPublicUrlEnv) + 凭证状态; tokenKey/authcode/webhookSecret/
// webhookPathToken 只活于 0600 文件与 .env, 不进 openclaw.json。
//
// 写回字段集必须与 openclaw.plugin.json#channelConfigs.wechatpadpro.schema.properties 保持一致
// (页面字段若不在本集内 → 静默无效, 是最大的坑)。同步时两边都要改。
import { readFile, writeFile, rename } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { logObj as log } from "./core/logger.js";
import { findPluginRoot } from "./core/paths.js";
import { DEFAULT_ACCOUNT_ID } from "./core/constants.js";
import { isValidAccountId, invalidateConfigCache } from "./config.js";
import { stringifyLargeInts } from "./util/bigint.js";
export const CHANNEL_UI_LOG_TAG = "[channel-ui]";
// 写回字段集**由 manifest schema 派生** (channelConfigs.wechatpadpro.schema 是账号配置全量契约,
// 部署完整性测试锁死 → 派生保证页面显示的字段 100% 有真写回, 永不静默无效)。
// 明文 secret 属性已在 schema 移除 → 派生结果天然无 secret。
// manifest 读取失败 → 退显式精简清单 (仍保核心可编辑 + 零 secret)。
const CORE_FIELDS_FALLBACK = [
    { key: "enabled", path: "enabled", kind: "boolean" },
    { key: "nickname", path: "nickname", kind: "string" },
    { key: "apiBaseUrl", path: "apiBaseUrl", kind: "string" },
    { key: "wsUrl", path: "wsUrl", kind: "string" },
    { key: "agent", path: "agent", kind: "string" },
    { key: "tokenKeyEnv", path: "tokenKeyEnv", kind: "string" },
    { key: "authcodeEnv", path: "authcodeEnv", kind: "string" },
    { key: "webhookSecretEnv", path: "webhookSecretEnv", kind: "string" },
    { key: "webhookPublicUrlEnv", path: "webhookPublicUrlEnv", kind: "string" },
    { key: "allowFrom", path: "allowFrom", kind: "stringArray" },
    { key: "groupPolicy", path: "groupPolicy", kind: "enum", enumValues: ["open", "disabled", "allowlist", "closed"] },
    { key: "groupAllowFrom", path: "groupAllowFrom", kind: "stringArray" },
    { key: "blacklistGroups", path: "blacklistGroups", kind: "stringArray" },
    { key: "adminUsers", path: "adminUsers", kind: "stringArray" },
    { key: "requireAtMention", path: "requireAtMention", kind: "boolean" },
    { key: "dmPairingEnabled", path: "dmPairingEnabled", kind: "boolean" },
    { key: "autoSetWebhook", path: "autoSetWebhook", kind: "boolean" },
    { key: "friendCirclePublishEnabled", path: "friendCirclePublishEnabled", kind: "boolean" },
    { key: "friendCirclePublishAllowFrom", path: "friendCirclePublishAllowFrom", kind: "stringArray" },
    { key: "heartflow.enabled", path: "heartflow.enabled", kind: "boolean" },
    { key: "heartflow.whitelistGroups", path: "heartflow.whitelistGroups", kind: "stringArray" },
    { key: "affection.enabled", path: "affection.enabled", kind: "boolean" },
    { key: "jargon.enabled", path: "jargon.enabled", kind: "boolean" },
];
// 防 schema 未来误引入明文 secret 属性 (双保险; schema 现已无)
const SECRET_KEY_RE = /^(tokenKey|authcode|webhookSecret|webhookPathToken)$/;
/** manifest 所在插件根 (dist/ 的上一级; src 下同理向上找含 openclaw.plugin.json 的目录) */
function resolveManifestRoot() {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 8; i++) {
        try {
            if (readFileSync(join(dir, "openclaw.plugin.json"), "utf8").length >= 0)
                return dir;
        }
        catch {
            /* keep walking up */
        }
        const parent = dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return dir;
}
function schemaNodeToKind(node) {
    const t = node.type;
    if (t === "boolean")
        return { kind: "boolean" };
    if (t === "number" || t === "integer")
        return { kind: "number" };
    if (t === "array")
        return { kind: "stringArray" };
    if (Array.isArray(node.enum) && node.enum.every((x) => typeof x === "string")) {
        return { kind: "enum", enumValues: node.enum };
    }
    return { kind: "string" };
}
function deriveCoreFields(props, prefix = "", out = []) {
    for (const [key, raw] of Object.entries(props)) {
        if (SECRET_KEY_RE.test(key))
            continue; // 明文 secret 永不进写回集
        if (!isPlainRecord(raw))
            continue;
        const dot = prefix ? `${prefix}.${key}` : key;
        if (raw.type === "object") {
            const children = raw.properties;
            if (isPlainRecord(children) && Object.keys(children).length > 0) {
                deriveCoreFields(children, dot, out);
            }
            continue; // 空容器无叶子 → 无字段
        }
        out.push({ key: dot, path: dot, ...schemaNodeToKind(raw), ...(raw.readOnly === true ? { readOnly: true } : {}) });
    }
    return out;
}
let _derivedCoreFields = null;
function loadChannelUiCoreFields() {
    if (_derivedCoreFields)
        return _derivedCoreFields;
    try {
        const m = JSON.parse(readFileSync(join(resolveManifestRoot(), "openclaw.plugin.json"), "utf8"));
        const props = m.channelConfigs?.wechatpadpro?.schema?.properties;
        if (isPlainRecord(props)) {
            const out = deriveCoreFields(props);
            if (out.length > 0) {
                _derivedCoreFields = out;
                log.info(`${CHANNEL_UI_LOG_TAG} core fields derived from manifest schema: ${out.length}`);
                return out;
            }
        }
    }
    catch {
        /* manifest 缺失/损坏 → fallback */
    }
    _derivedCoreFields = CORE_FIELDS_FALLBACK;
    return _derivedCoreFields;
}
export const CHANNEL_UI_CORE_FIELDS = loadChannelUiCoreFields();
// agent/main 守卫: startAccountById 强拒 agent==="main", 页面若写回 main 会使账号下次启动失败
const FORBIDDEN_AGENT = "main";
// ---------------------------------------------------------------------------
// openclaw.json 定位 (优先级与 gateway 运行时一致: OPENCLAW_STATE_DIR 先行)
// ---------------------------------------------------------------------------
export function resolveOpenClawStateDir() {
    return (process.env.OPENCLAW_STATE_DIR ||
        process.env.OPENCLAW_ROOT ||
        (process.env.HOME ? join(process.env.HOME, ".openclaw") : "/root/.openclaw"));
}
export function openClawJsonPath() {
    return join(resolveOpenClawStateDir(), "openclaw.json");
}
/** 读 openclaw.json (损坏/缺失 → null, 不阻塞插件) */
export function readOpenClawJson() {
    try {
        return JSON.parse(readFileSync(openClawJsonPath(), "utf8"));
    }
    catch {
        return null;
    }
}
function isPlainRecord(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
// ---------------------------------------------------------------------------
// 值归一化 (页面 JSON 形态 → 账号文件形态)
// ---------------------------------------------------------------------------
function normalizeSpecValue(spec, raw) {
    switch (spec.kind) {
        case "boolean": {
            if (typeof raw === "boolean")
                return { ok: true, value: raw };
            if (raw === "true")
                return { ok: true, value: true };
            if (raw === "false")
                return { ok: true, value: false };
            return { ok: false, reason: `expected boolean, got ${JSON.stringify(raw)}` };
        }
        case "string": {
            if (typeof raw !== "string")
                return { ok: false, reason: `expected string, got ${JSON.stringify(raw)}` };
            const v = raw.trim();
            if (spec.key === "agent" && v === FORBIDDEN_AGENT) {
                return { ok: false, reason: `agent cannot be "${FORBIDDEN_AGENT}"` };
            }
            return { ok: true, value: v };
        }
        case "enum": {
            if (typeof raw !== "string")
                return { ok: false, reason: `expected string enum, got ${JSON.stringify(raw)}` };
            const v = raw.trim();
            if (spec.enumValues && !spec.enumValues.includes(v)) {
                return { ok: false, reason: `invalid enum ${v} (allowed: ${spec.enumValues.join("/")})` };
            }
            return { ok: true, value: v };
        }
        case "number": {
            const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
            if (!Number.isFinite(n))
                return { ok: false, reason: `expected number, got ${JSON.stringify(raw)}` };
            return { ok: true, value: n };
        }
        case "stringArray": {
            // 页面 JSON 数组; 兼容历史逗号串形态
            let arr = [];
            if (Array.isArray(raw))
                arr = raw;
            else if (typeof raw === "string" && raw.trim())
                arr = raw.split(",");
            else
                return { ok: false, reason: `expected string array, got ${JSON.stringify(raw)}` };
            const out = arr.filter((x) => typeof x === "string").map((s) => s.trim()).filter(Boolean);
            return { ok: true, value: out };
        }
        default:
            return { ok: false, reason: `unknown kind ${spec.kind}` };
    }
}
// ---------------------------------------------------------------------------
// 深层读写 (仅叶子, 保留兄弟键)
// ---------------------------------------------------------------------------
function readDeepPath(obj, dot) {
    let node = obj;
    for (const part of dot.split(".")) {
        if (!isPlainRecord(node))
            return undefined;
        node = node[part];
    }
    return node;
}
function setDeepPathMut(obj, dot, value) {
    const parts = dot.split(".");
    let node = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (!isPlainRecord(node[key]))
            node[key] = {};
        node = node[key];
    }
    node[parts[parts.length - 1]] = value;
}
function leafEquals(a, b) {
    if (Array.isArray(a) && Array.isArray(b))
        return JSON.stringify(a) === JSON.stringify(b);
    return a === b;
}
// ---------------------------------------------------------------------------
// channels.wechatpadpro 子树 → 账号配置映射
//   支持两种存储形状:
//     A) 单账号(默认)平铺: channels.wechatpadpro.<field>
//     B) 原生多账号: channels.wechatpadpro.accounts.<accountId>.<field>
//   .accounts 里有 default 键时优先于平铺。
// ---------------------------------------------------------------------------
export function extractChannelAccountsBlock(block) {
    const out = new Map();
    if (!isPlainRecord(block))
        return out;
    // 平铺字段 → default 账号 (仅当块内含核心键或任意明文标量; 排除纯容器 accounts)
    const topScalar = {};
    let hasTopField = false;
    for (const k of Object.keys(block)) {
        if (k === "accounts")
            continue;
        topScalar[k] = block[k];
        hasTopField = true;
    }
    const accounts = isPlainRecord(block.accounts) ? block.accounts : {};
    // 收集有效账号 id (同时平铺默认兜底)
    const ids = new Set();
    for (const id of Object.keys(accounts))
        if (isValidAccountId(id))
            ids.add(id);
    if (hasTopField)
        ids.add(DEFAULT_ACCOUNT_ID);
    if (hasTopField) {
        const merged = { ...topScalar };
        const nested = accounts[DEFAULT_ACCOUNT_ID];
        if (isPlainRecord(nested))
            Object.assign(merged, nested);
        out.set(DEFAULT_ACCOUNT_ID, merged);
    }
    for (const id of ids) {
        if (id === DEFAULT_ACCOUNT_ID)
            continue;
        const nested = accounts[id];
        if (isPlainRecord(nested))
            out.set(id, { ...nested });
    }
    return out;
}
/** 对单个账号应用 Channel 配置块中的核心字段 (跳过缺省键, 绝不清理缺失字段) */
export async function applyChannelBlockToAccount(accountId, valueBlock) {
    const res = { ok: false, accountId, created: false, changedFields: [], skipped: [] };
    if (!isValidAccountId(accountId)) {
        res.reason = `invalid accountId ${JSON.stringify(accountId)}`;
        return res;
    }
    const dir = join(await findPluginRoot(), "accounts");
    const filePath = join(dir, `${accountId}.json`);
    // 读当前 (缺 → 视为 bootstrap 新账号: 只写页面上给的字段, 不造默认)
    let raw;
    let created = false;
    try {
        raw = JSON.parse(await readFile(filePath, "utf8"));
    }
    catch (e) {
        const err = e;
        if (err.code !== "ENOENT") {
            res.reason = `read ${accountId}.json failed: ${err.message ?? String(e)}`;
            return res;
        }
        raw = {};
        created = true;
    }
    // diff: 只在真变时改 (防写 openclaw.json 侧无意义循环)。配置纯 JSON, JSON 往返克隆足够。
    const work = JSON.parse(JSON.stringify(raw));
    for (const spec of CHANNEL_UI_CORE_FIELDS) {
        if (spec.readOnly)
            continue; // 只读身份字段 (selfWxid): 页面展示用, 永不 block→file
        const rawValue = readDeepPath(valueBlock, spec.key);
        if (rawValue === undefined)
            continue; // 键缺席 → 不动 (不清空)
        // v1.5.5: schema 已收敛为核心配置集 (老板拍板: 只要核心在 UI, 其余手动改文件)。
        // 页面核心字段直接写回账号文件 — 文件缺顶层键也补写 (语义=老板在页面显式管理的核心项)。
        // 未暴露字段 / 明文 secret / _note 不在派生集 → 永不触碰。
        const norm = normalizeSpecValue(spec, rawValue);
        if (!norm.ok) {
            res.skipped.push(`${spec.key} (${norm.reason})`);
            log.warn(`${CHANNEL_UI_LOG_TAG} account=${accountId} skip ${spec.key}: ${norm.reason}`);
            continue;
        }
        if (leafEquals(readDeepPath(raw, spec.path), norm.value))
            continue; // 值未变
        setDeepPathMut(work, spec.path, norm.value);
        res.changedFields.push(spec.path);
    }
    if (res.changedFields.length === 0) {
        res.ok = true;
        if (created)
            res.reason = "no core fields to bootstrap"; // 空块新建 → 不落空文件
        return res;
    }
    if (created && Object.keys(work).length === 0) {
        res.ok = true;
        return res;
    }
    try {
        const tmpPath = `${filePath}.tmp`;
        await writeFile(tmpPath, stringifyLargeInts(JSON.stringify(work, null, 2)) + "\n", "utf8");
        await rename(tmpPath, filePath);
    }
    catch (e) {
        res.reason = `write ${accountId}.json failed: ${e.message}`;
        return res;
    }
    invalidateConfigCache(accountId);
    res.ok = true;
    res.created = created;
    log.info(`${CHANNEL_UI_LOG_TAG} account=${accountId}${created ? " (created from channel config)" : ""} synced fields: ${res.changedFields.join(", ")}`);
    return res;
}
// ---------------------------------------------------------------------------
// 单次全量同步 (页面保存 → watcher 调)
// ---------------------------------------------------------------------------
export async function syncAccountsFromChannelConfig(opts = {}) {
    const root = readOpenClawJson();
    const block = root?.channels?.wechatpadpro;
    const results = [];
    if (!isPlainRecord(block))
        return results; // 无 channels.wechatpadpro 块 → 无可同步 (不误写)
    const accounts = extractChannelAccountsBlock(block);
    for (const [accountId, valueBlock] of accounts) {
        const beforeEnabled = await readAccountEnabled(accountId);
        const r = await applyChannelBlockToAccount(accountId, valueBlock);
        results.push(r);
        if (r.ok && r.changedFields.includes("enabled") && beforeEnabled === false && valueBlock.enabled === true) {
            // 停用 → 启用: 尽力拉起 (running 账号本就是 enabled, 不会走到这)
            try {
                await opts.onAccountEnabled?.(accountId);
            }
            catch {
                /* 拉起失败由调用方日志, 不阻断 */
            }
        }
    }
    return results;
}
async function readAccountEnabled(accountId) {
    if (!isValidAccountId(accountId))
        return undefined;
    try {
        const raw = JSON.parse(await readFile(join(await findPluginRoot(), "accounts", `${accountId}.json`), "utf8"));
        return raw.enabled === true;
    }
    catch {
        return undefined;
    }
}
// ---------------------------------------------------------------------------
// P2 展示镜像 (反向): accounts/<id>.json 被外部改动(CLI/文件) → 把核心字段 publish 回
//   openclaw.json#channels.wechatpadpro, 让 Channel 页显示真实当前值 (老板验收: 手动改文件 → 页面同步)。
//   安全护栏 (对齐定案):
//     - 只动 channels.wechatpadpro 子树 (read 全文件 → 改子树 → 原子 rename 整文件写回)
//     - 值没变 → 跳过零写 (防 openclaw↔account 双向环)
//     - openclaw.json 无 channels.wechatpadpro 块 → 不新建 (P3 一次性铺位才建; 删块不复活)
//     - 用 env WPP_CHANNEL_CFG_MIRROR (默认 "1") 门控, "0" 关 (紧急逃生)
//     - 明文凭证永不被 publish (spec 白名单无任何 secret 字段)
// ---------------------------------------------------------------------------
function mirrorEnabled() {
    const v = process.env.WPP_CHANNEL_CFG_MIRROR;
    return v === undefined || v === "" || v === "1" || v === "true";
}
let publishInFlight = false;
function stringifyConfigFile(cfg) {
    return JSON.stringify(cfg, null, 2) + "\n";
}
/** 读账号文件原始核心字段 (只取白名单; 不含任何注入的明文凭证) */
async function readCoreFieldsFromAccountFile(accountId) {
    if (!isValidAccountId(accountId))
        return {};
    try {
        const raw = JSON.parse(await readFile(join(await findPluginRoot(), "accounts", `${accountId}.json`), "utf8"));
        const out = {};
        for (const spec of CHANNEL_UI_CORE_FIELDS) {
            const v = readDeepPath(raw, spec.path);
            if (v !== undefined)
                setDeepPathMut(out, spec.key, v);
        }
        return out;
    }
    catch {
        return {}; // 文件缺失/损坏 → 不 publish (删账号不复活)
    }
}
/**
 * 把单个账号的核心字段 publish 回 openclaw.json#channels.wechatpadpro。
 * 返回 changedFields = 本次真正改写的键 (空 → 零写)。
 */
export async function publishAccountCoreFieldsToChannelConfig(accountId) {
    const res = { ok: false, changedFields: [], reason: "" };
    if (!mirrorEnabled()) {
        res.reason = "mirror disabled (WPP_CHANNEL_CFG_MIRROR=0)";
        return res;
    }
    if (!isValidAccountId(accountId)) {
        res.reason = `invalid accountId ${JSON.stringify(accountId)}`;
        return res;
    }
    if (publishInFlight) {
        res.reason = "publish in-flight, skip";
        return res;
    }
    publishInFlight = true;
    try {
        const filePath = openClawJsonPath();
        const exists = await readFile(filePath, "utf8").catch(() => null);
        if (exists === null) {
            res.reason = "openclaw.json missing";
            return res;
        }
        const cfg = JSON.parse(exists);
        const channelBlock = cfg.channels && typeof cfg.channels === "object" ? cfg.channels.wechatpadpro : undefined;
        if (typeof channelBlock !== "object" || channelBlock === null || Array.isArray(channelBlock)) {
            res.reason = "channels.wechatpadpro absent (P3 seed creates it)";
            return res; // 不新建块 (删块不复活)
        }
        const block = channelBlock;
        const fileCore = await readCoreFieldsFromAccountFile(accountId);
        // 决定目标容器: 沿用既有形状 (flat=default / accounts.<id>)
        let target;
        const hasAccounts = block.accounts !== undefined && typeof block.accounts === "object" && !Array.isArray(block.accounts);
        if (accountId === DEFAULT_ACCOUNT_ID) {
            if (hasAccounts) {
                if (typeof block.accounts[DEFAULT_ACCOUNT_ID] !== "object")
                    block.accounts[DEFAULT_ACCOUNT_ID] = {};
                target = block.accounts[DEFAULT_ACCOUNT_ID];
            }
            else {
                target = block;
            }
        }
        else {
            if (!hasAccounts) {
                res.reason = `account=${accountId} non-default but channels block has no accounts container`;
                return res;
            }
            if (typeof block.accounts[accountId] !== "object")
                block.accounts[accountId] = {};
            target = block.accounts[accountId];
        }
        // diff: 只写真正变化的叶子 (值相等 → 零写, 打断双向环)
        const changed = [];
        for (const spec of CHANNEL_UI_CORE_FIELDS) {
            const fileValue = readDeepPath(fileCore, spec.key);
            if (fileValue === undefined)
                continue; // 文件没这键 → 不动
            const cur = readDeepPath(target, spec.key);
            if (leafEquals(cur, fileValue))
                continue;
            setDeepPathMut(target, spec.key, fileValue);
            changed.push(spec.key);
        }
        if (changed.length === 0) {
            res.ok = true;
            return res;
        }
        if (!cfg.channels)
            cfg.channels = {};
        cfg.channels.wechatpadpro = block;
        // 原子写回 (整文件; 网关并发窗口窄 + 频度低, 定案接受)
        const tmpPath = `${filePath}.tmp`;
        await writeFile(tmpPath, stringifyConfigFile(cfg), "utf8");
        await rename(tmpPath, filePath);
        res.ok = true;
        res.changedFields = changed;
        log.info(`${CHANNEL_UI_LOG_TAG} mirror: account=${accountId} core fields → openclaw.json#channels.wechatpadpro: ${changed.join(", ")}`);
        return res;
    }
    catch (e) {
        res.reason = `publish failed: ${e.message}`;
        log.warn(`${CHANNEL_UI_LOG_TAG} ${res.reason}`);
        return res;
    }
    finally {
        publishInFlight = false;
    }
}
// ---------------------------------------------------------------------------
// fs.watch openclaw.json (watch 目录, 兼容原子 rename 替换) → 防抖 → 全量同步
// 返回 unwatch. 幂等: 重复调用只保留 1 个 watcher。
// ---------------------------------------------------------------------------
let bridgeWatchTimer = null;
let bridgeWatchDebounceMs = 400;
let bridgeWatchActive = false;
let bridgeSyncing = false;
/** 测试用: 调整防抖间隔 */
export function setBridgeWatchDebounceMs(ms) {
    bridgeWatchDebounceMs = ms;
}
export function isWatchingOpenClawChannelConfig() {
    return bridgeWatchActive;
}
export async function watchOpenClawChannelConfig(opts = {}) {
    const dir = resolveOpenClawStateDir();
    let watcher = null;
    const syncOnce = async (reason) => {
        if (bridgeSyncing)
            return;
        bridgeSyncing = true;
        try {
            const results = await syncAccountsFromChannelConfig(opts);
            if (results.length) {
                const changed = results.filter((r) => r.changedFields.length);
                if (changed.length) {
                    log.info(`${CHANNEL_UI_LOG_TAG} openclaw.json change (${reason}) → ${changed.map((r) => `${r.accountId}[${r.changedFields.join(",")}]`).join(" ")}`);
                }
            }
        }
        catch (e) {
            log.warn(`${CHANNEL_UI_LOG_TAG} sync failed (${reason}): ${e.message}`);
        }
        finally {
            bridgeSyncing = false;
        }
    };
    const handleChange = (eventType, filename) => {
        if (filename && filename !== "openclaw.json")
            return;
        if (bridgeWatchTimer)
            clearTimeout(bridgeWatchTimer);
        bridgeWatchTimer = setTimeout(() => {
            void syncOnce(`${eventType}${filename ? ":" + filename : ""}`);
        }, bridgeWatchDebounceMs);
    };
    if (bridgeWatchActive) {
        log.debug(`${CHANNEL_UI_LOG_TAG} already watching openclaw.json, returning no-op unwatch`);
        return () => { };
    }
    try {
        watcher = await import("node:fs").then((fs) => fs.watch(dir, handleChange));
        bridgeWatchActive = true;
        log.info(`${CHANNEL_UI_LOG_TAG} watching openclaw.json: ${openClawJsonPath()} (Channel 页配置热同步 enabled)`);
    }
    catch (e) {
        const err = e;
        log.warn(`${CHANNEL_UI_LOG_TAG} fs.watch openclaw.json failed (${err.message ?? String(e)}), Channel 页配置热同步 disabled`);
        bridgeWatchActive = false;
        return () => { };
    }
    // 启动即同步一次 (块已存在时让文件先追上)
    void syncOnce("initial");
    return () => {
        try {
            watcher?.close();
        }
        catch {
            /* ignore */
        }
        bridgeWatchActive = false;
        if (bridgeWatchTimer)
            clearTimeout(bridgeWatchTimer);
        log.info(`${CHANNEL_UI_LOG_TAG} stopped watching openclaw.json`);
    };
}
/** 测试/诊断用: 描述当前同步生效字段 (用于 P4 断言) */
export function channelUiStatus() {
    const root = readOpenClawJson();
    const block = root?.channels?.wechatpadpro;
    return {
        watching: bridgeWatchActive,
        coreFields: CHANNEL_UI_CORE_FIELDS.length,
        blockPresent: isPlainRecord(block) && (Object.keys(block).length > 0),
    };
}
//# sourceMappingURL=channel-ui-bridge.js.map