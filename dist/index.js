// index.ts - WeChatPadPro OpenClaw Plugin 入口
// v2026.7.1+ OpenClaw API 契约:
//   - default export = plugin manifest (含 register(api), 内部调 api.registerChannel)
//   - named export wppChannelPlugin = 实际 channel 实现 (start/stop/sendText/sendImage)
// 多账号管理走 AccountRegistry class
import { logObj as log, formatErr } from "./core/logger.js";
import { SetWebhookMetrics } from "./monitor/metrics.js";
import { CHANNEL_ID, PLUGIN_NAME, PLUGIN_VERSION, DEFAULT_BOT_NICKNAME } from "./core/constants.js";
import { loadGlobalConfigAsync, loadAccountConfigAsync, listAccountIds, isConfigured } from "./config.js";
import { getDefaultAccountRegistry } from "./account-state.js";
import { closeDb, initDbPool, getSynckey, saveSynckey, } from "./db.js";
import { getHeartflowRuntime } from "./inbound/heartflow-runtime.js";
import { handleFeatureCommand } from "./inbound/filehelper-features.js";
import { WechatpadproWsClient } from "./ws-client.js";
import { WechatpadproWebhookServer } from "./webhook-receiver.js";
import { createWppInboundHandler } from "./inbound/handler.js";
import { dispatchInboundToOpenClaw, getChannelRuntime, } from "./dispatch/dispatcher.js";
import { defaultTriggerConfig } from "./inbound/triggers.js";
import { buildSessionKey } from "./session-key.js";
import { sendText as dispatchSendText, sendImage as dispatchSendImage } from "./dispatch/outbound.js";
import { getCurrentAccountId } from "./dispatch/account-context.js";
import { watchAccountConfigs, watchGlobalConfig, appendAllowFrom, appendGroupAllowFrom, removeAllowFrom, removeGroupAllowFrom, setAccountFlag, updateBlacklistGroups, ensureWebhookPathToken } from "./config.js";
import { watchOpenClawChannelConfig, publishAccountCoreFieldsToChannelConfig } from "./channel-ui-bridge.js";
import { redeemPairingCode, generatePairingCode, readPairingCode } from "./pairing-store.js";
import { resolveGlobalConfig, resolveSyncConfig } from "./core/runtime-config.js";
import { resolveAiConfig } from "./config-ai.js";
import { resolveJudgeCreds, describeJudgeEndpoint, resolveJudgeFallback, describeJudgeFallback, JUDGE_FALLBACK_VARS, JUDGE_MAIN_VARS, lingeringLegacyJudgeVars, } from "./llm-judge.js";
import { defaultHeartflowConfig } from "./inbound/heartflow.js";
import { loadLearnedThresholds, loadHfBudgetSeed, startHeartflowSweep, } from "./inbound/heartflow-learn.js";
import { loadHfLayerStats, } from "./inbound/heartflow-layer.js";
import { defaultJargonConfig } from "./inbound/jargon.js";
import { defaultAffectionConfig } from "./inbound/affection.js";
import { createChannelContract } from "./channel-contract.js";
// 每账号 triggerConfig/triggerCtx 可变容器: handler 闭包持有对象引用, 热重载 update 字段即刻生效
const runtimeTriggerConfigs = new Map();
const runtimeTriggerCtxs = new Map();
const runtimeInboundHandlers = new Map();
// v1.3.79 AI-COMMAND: 三个新功能 (heartflow/jargon/affection) 的可变配置容器 —
//   handler opts 持有引用, 热重载/命令更新容器属性即刻生效 (不用重建 handler)。
// v1.9.2: 提取到 heartflow-runtime.js (与新模块共用同一实例, 勿复制)
const runtimeHeartflow = getHeartflowRuntime();
const runtimeJargon = new Map();
const runtimeAffection = new Map();
// P1 (2026-08-23): 每账号 /Msg/Sync 全局锁 — webhook sync_message 与 ws-client triggerSync
//   并发双拉 → vendor 被同时拉两次 + 游标竞争。webhook 路径用此锁串行 (ws 有自己 syncInFlight)。
const accountSyncLocks = new Map();
// v1.3.61 WEBHOOK-SHARED-PORT: 多账号共享单个 webhook server (单端口 + path 区分, 贴合 vendor 设计)
//   vendor 按 authcode 区分账号 (Webhook/* 接口 URL query 带 authcode), 回调 URL 用 path 区分 (含 accountId)。
//   首个账号创建 server, 后续账号复用 + addPath (幂等)。port 用首个账号的 cfg.webhookPort。
let sharedWebhookServer = null;
let sharedWebhookServerPort = null;
/** v1.3.63 P1-7: 派生 webhook path (webhookPathToken 存在时插入 token 段). 纯函数供测试. */
export function deriveWebhookPaths(cfg) {
    const webhookPath = cfg.webhookPathToken
        ? cfg.webhookPath.replace(/\/wechatpadpro\//, `/wechatpadpro/${cfg.webhookPathToken}/`)
        : cfg.webhookPath;
    const businessPath = cfg.webhookPathToken
        ? `${webhookPath}/business`
        : (cfg.webhookBusinessPath ?? `${cfg.webhookPath}/business`);
    return { webhookPath, businessPath };
}
function maskSecret(secret) {
    if (!secret)
        return "(empty)";
    return secret.length <= 4 ? "****" : `${secret.slice(0, 4)}...${secret.slice(-2)}`;
}
// v1.3.77 AI-UNIFY: 统一 LLM 判断模型配置 (纯函数在 config-ai.ts)
/**
 * v1.3.56 MULTI-ACCOUNT: outbound 兜底账号解析。
 * 框架调 outbound.sendText/sendImage/sendMedia 时 accountId 缺失 → 用当前 dispatch 账号 (ALS),
 * 再兜底 "default" (单账号兼容)。
 */
// 2026-09-28 契约对齐: 形参加宽 `string | undefined` → `string | null | undefined`
//   (契约 ChannelOutboundContext.accountId 为 `string | null`);
//   函数体首行 `if (accountId)` 本就 falsy 兜底 null, 运行时零变化。
function resolveOutboundAccount(accountId, via) {
    if (accountId)
        return accountId;
    const ctx = getCurrentAccountId();
    if (ctx) {
        log.info(`[WPP v1.3.56 MULTI-ACCOUNT] outbound.${via} 缺 accountId, 用当前 dispatch 账号: ${ctx}`);
        return ctx;
    }
    log.warn(`[WPP v1.3.56 MULTI-ACCOUNT] outbound.${via} 缺 accountId 且无 dispatch 上下文, 兜底 default`);
    return "default";
}
// 全局解析后配置 (module-level 缓存, 避免重复 config.json I/O)
let _resolvedGlobalConfig = null;
/** 获取已解析的全局配置 (未初始化时用默认值) */
export function getResolvedGlobalConfig() {
    if (!_resolvedGlobalConfig) {
        return resolveGlobalConfig(undefined);
    }
    return _resolvedGlobalConfig;
}
/** 初始化全局配置 (startAccountById 时调, 也支持 reload) */
export function setGlobalRuntimeConfig(cfg) {
    _resolvedGlobalConfig = cfg;
}
// ============================================================
// index.ts 是唯一同时持有 registry + runtimeTriggerCtxs + sendText 的地方, 故在此 wire
// ============================================================
/**
 * 处理配对尝试: redeem → 写 allowFrom → 立即同步运行时 (不等 fs.watch debounce) → 回复。
 * 多账号安全: redeem 校验 accountId (per-account 文件); 写只落对应账号 json; 只同步该账号 runtime。
 */
async function handlePairingAttempt(accountId, msg, code) {
    const res = await redeemPairingCode(code, accountId);
    if (!res.ok) {
        log.warn(`[WPP v1.2.3 PAIRING] redeem failed: account=${accountId} reason=${res.reason ?? "unknown"} from=${msg.fromWxid}`);
        await dispatchSendText(accountId, msg.fromWxid, "配对码无效或已过期，请向管理员索要新的配对码。");
        return;
    }
    const added = await appendAllowFrom(accountId, msg.fromWxid);
    if (!added.ok) {
        log.warn(`[WPP v1.2.3 PAIRING] appendAllowFrom failed: account=${accountId} reason=${added.reason ?? "unknown"}`);
        await dispatchSendText(accountId, msg.fromWxid, "配对失败：白名单写入出错，请联系管理员。");
        return;
    }
    const state = getDefaultAccountRegistry().get(accountId);
    if (state) {
        state.updateConfig({ allowFrom: added.allowFrom });
    }
    const tctx = runtimeTriggerCtxs.get(accountId);
    if (tctx) {
        tctx.allowFrom = added.allowFrom;
    }
    log.info(`[WPP v1.2.3 PAIRING] success: account=${accountId} wxid=${msg.fromWxid} allowFrom=${added.allowFrom.length}`);
    await dispatchSendText(accountId, msg.fromWxid, "配对成功，你现在可以使用本账号的 AI 助手。");
}
async function sendToFileHelper(accountId, toWxid, text) {
    await dispatchSendText(accountId, toWxid, text);
}
// v1.3.40 导出供测试 (验证命令注册表 + /help 兼容性)
export const FILEHELPER_COMMANDS = [
    {
        name: "/genpair",
        desc: "生成新配对码",
        example: "/genpair",
        handler: async ({ accountId, toWxid }) => {
            const entry = await generatePairingCode(accountId);
            const msgText = `✅ 新配对码已生成 (account=${accountId}):\n\n配对码: ${entry.code}\n有效期至: ${new Date(entry.expiresAt).toLocaleString("zh-CN")}\n\n用法: 发给白名单外用户, 用户私聊机器人发 /pair ${entry.code} 自助加入。`;
            log.info(`[WPP FILEHELPER] /genpair → ${entry.code} (expires ${entry.expiresAt})`);
            await sendToFileHelper(accountId, toWxid, msgText);
        },
    },
    {
        name: "/pairs",
        desc: "查看当前配对码+有效期",
        example: "/pairs",
        handler: async ({ accountId, toWxid }) => {
            const entry = await readPairingCode(accountId);
            if (entry) {
                const msgText = `当前配对码 (account=${accountId}):\n\n配对码: ${entry.code}\n有效期至: ${new Date(entry.expiresAt).toLocaleString("zh-CN")}\n\n过期后 /genpair 重新生成。`;
                await sendToFileHelper(accountId, toWxid, msgText);
            }
            else {
                await sendToFileHelper(accountId, toWxid, "当前无配对码 (未生成或已过期)。用 /genpair 生成。");
            }
        },
    },
    {
        // v1.3.80 WHITELIST-UNIFY: 私聊白名单统一 (add/del/list, 批量)
        name: "/user",
        desc: "私聊白名单 add/del/list",
        example: "/user add wxid_abc123 wxid_xyz",
        handler: async ({ accountId, toWxid, args }) => {
            await handleWhitelistCommand("user", args, (t) => sendToFileHelper(accountId, toWxid, t), accountId);
        },
    },
    {
        name: "/group",
        desc: "群白名单 add/del/list",
        example: "/group add xxxxxxxx@chatroom",
        handler: async ({ accountId, toWxid, args }) => {
            await handleWhitelistCommand("group", args, (t) => sendToFileHelper(accountId, toWxid, t), accountId);
        },
    },
    {
        name: "/blacklist",
        desc: "黑名单群 add/del/list",
        example: "/blacklist add xxxxxxxx@chatroom",
        handler: async ({ accountId, toWxid, args }) => {
            await handleWhitelistCommand("blacklist", args, (t) => sendToFileHelper(accountId, toWxid, t), accountId);
        },
    },
    {
        // v1.3.71 FEATURE-FLAGS: 小微智能体能力开关 (预开发, 默认关闭, 用命令动态开/关)
        //   朋友圈发布用白名单机制 (friendCirclePublishAllowFrom) 已够, 不加开关 (老板 2026-08-20)
        name: "/xiaowei",
        desc: "小微智能体能力开关 (on/off/status)",
        example: "/xiaowei on",
        handler: async ({ accountId, toWxid, args }) => {
            const arg = (args[0] ?? "").toLowerCase();
            const cfg = await loadAccountConfigAsync(accountId);
            const current = Boolean(cfg?.xiaoweiEnabled);
            if (arg === "status") {
                await sendToFileHelper(accountId, toWxid, `小微智能体: ${current ? "✅ 开启" : "❌ 关闭"}`);
                return;
            }
            if (arg !== "on" && arg !== "off") {
                await sendToFileHelper(accountId, toWxid, "用法: /xiaowei on|off|status\n示例: /xiaowei on (开启小微智能体)");
                return;
            }
            const target = arg === "on";
            const r = await setAccountFlag(accountId, "xiaoweiEnabled", target);
            await sendToFileHelper(accountId, toWxid, r.ok
                ? `✅ 小微智能体已${target ? "开启" : "关闭"} (account=${accountId})`
                : `❌ 设置失败: ${r.reason ?? "unknown"}`);
        },
    },
    {
        // v1.3.79-80 AI-COMMAND: 三功能统一命令 (通用处理器 handleFeatureCommand)
        name: "/heartflow",
        // v1.9.0: 补 report/layers/veto —— 命令面板里看不见的子命令等于不存在
        desc: "心流 on/off/status/report [天数]/layers [群ID]/veto [群ID]/why <群ID>/profile <群ID>/threshold/group",
        example: "/heartflow on",
        handler: async ({ accountId, toWxid, args }) => {
            await handleFeatureCommand("heartflow", args, (t) => sendToFileHelper(accountId, toWxid, t), accountId);
        },
    },
    {
        name: "/affection",
        desc: "好感度 on/off/status",
        example: "/affection on",
        handler: async ({ accountId, toWxid, args }) => {
            await handleFeatureCommand("affection", args, (t) => sendToFileHelper(accountId, toWxid, t), accountId);
        },
    },
    {
        name: "/jargon",
        desc: "黑话 on/off/status",
        example: "/jargon on",
        handler: async ({ accountId, toWxid, args }) => {
            await handleFeatureCommand("jargon", args, (t) => sendToFileHelper(accountId, toWxid, t), accountId);
        },
    },
];
async function handleWhitelistCommand(domain, args, send, accountId) {
    const action = (args[0] ?? "").toLowerCase();
    const targets = args.slice(1).map((s) => s.trim()).filter(Boolean);
    const label = domain === "user" ? "私聊白名单" : domain === "group" ? "群白名单" : "黑名单群";
    const cfg = await loadAccountConfigAsync(accountId);
    // list (或缺 action 无目标): 查看当前列表
    if (action === "list" || (action === "" && targets.length === 0)) {
        let list;
        if (domain === "user")
            list = (cfg?.allowFrom ?? []).slice();
        else if (domain === "group")
            list = (cfg?.groupAllowFrom ?? []).slice();
        else
            list = (cfg?.blacklistGroups ?? []).slice();
        await send(`📋 ${label} (${list.length}):\n` + (list.length ? list.map((x) => `- ${x}`).join("\n") : "(空)"));
        return;
    }
    // add: 批量增加
    if (action === "add" && targets.length) {
        let added = [];
        if (domain === "user") {
            const cur = (cfg?.allowFrom ?? []).slice();
            added = targets.filter((t) => !cur.includes(t));
            for (const t of targets)
                await appendAllowFrom(accountId, t);
        }
        else if (domain === "group") {
            const cur = (cfg?.groupAllowFrom ?? []).slice();
            added = targets.filter((t) => !cur.includes(t));
            for (const t of targets)
                await appendGroupAllowFrom(accountId, t);
        }
        else {
            const cur = (cfg?.blacklistGroups ?? []).slice();
            added = targets.filter((t) => !cur.includes(t));
            await updateBlacklistGroups(accountId, "add", targets);
        }
        await send(`✅ 已加入${label}: ${added.join(", ") || "(均已存在)"}`);
        return;
    }
    // del: 批量删除
    if (action === "del" && targets.length) {
        let removed = [];
        if (domain === "user") {
            const cur = (cfg?.allowFrom ?? []).slice();
            removed = targets.filter((t) => cur.includes(t));
            for (const t of removed)
                await removeAllowFrom(accountId, t);
        }
        else if (domain === "group") {
            const cur = (cfg?.groupAllowFrom ?? []).slice();
            removed = targets.filter((t) => cur.includes(t));
            for (const t of removed)
                await removeGroupAllowFrom(accountId, t);
        }
        else {
            const cur = (cfg?.blacklistGroups ?? []).slice();
            removed = targets.filter((t) => cur.includes(t));
            await updateBlacklistGroups(accountId, "del", targets);
        }
        await send(`✅ 已移出${label}: ${removed.join(", ") || "(无)"}`);
        return;
    }
    await send(`用法: /${domain} add <ID> [ID...] | /${domain} del <ID> [ID...] | /${domain} list`);
}
/** /help 自动遍历命令注册表生成 (新增命令自动出现在帮助里) */
export function buildHelpText() {
    const lines = ["📋 可用命令 (在文件传输助手操作):", ""];
    for (const c of FILEHELPER_COMMANDS) {
        const ex = c.example ? ` (示例: ${c.example})` : "";
        lines.push(`  ${c.name.padEnd(12)} ${c.desc}${ex}`);
    }
    lines.push("", "❓ 其它:");
    lines.push("  /help          显示本帮助");
    return lines.join("\n");
}
async function handleFileHelperCommand(accountId, _msg, command) {
    const toWxid = "filehelper"; // 回发到 filehelper (机器人自己看)
    const parts = command.trim().split(/\s+/);
    const cmd = (parts[0] ?? "").toLowerCase();
    const args = parts.slice(1);
    // /help 特殊: 自动遍历注册表生成帮助 (兼容后续新增命令)
    if (cmd === "/help") {
        await dispatchSendText(accountId, toWxid, buildHelpText());
        return;
    }
    // 遍历注册表分发 (新增命令自动生效)
    const entry = FILEHELPER_COMMANDS.find((c) => c.name.toLowerCase() === cmd);
    if (entry) {
        try {
            await entry.handler({ accountId, toWxid, args });
            log.info(`[WPP FILEHELPER] command handled: ${cmd}`);
        }
        catch (e) {
            log.warn(`[WPP FILEHELPER] command failed: ${formatErr(e)}`);
            await dispatchSendText(accountId, toWxid, `命令 ${cmd} 执行失败: ${e instanceof Error ? e.message : String(e)}`);
        }
        return;
    }
    await dispatchSendText(accountId, toWxid, `未知命令: ${cmd}\n用 /help 查看全部命令。`);
}
// ============================================================
// Plugin lifecycle (startAccountById / startAllAccounts / shutdown)
// ============================================================
export async function startAccountById(accountId, 
// agentId 参数保留兼容 (调用方传), 实际 runtime 读 cfg.agent
_agentId = "main") {
    const globalCfg = await loadGlobalConfigAsync();
    setGlobalRuntimeConfig(resolveGlobalConfig(globalCfg));
    const cfg = await loadAccountConfigAsync(accountId);
    if (!isConfigured(cfg)) {
        log.warn(`account not configured: ${accountId} (tokenKey empty)`);
        // 不 throw, 返回 partial state
    }
    // cfg.agent 必填且禁止 "main" (防 fallback main 导致多账号串号)
    if (!cfg.agent || typeof cfg.agent !== "string" || cfg.agent === "main") {
        throw new Error(`account.agent missing or invalid for ${accountId}: got "${cfg.agent}". 必须配置 agent 字段 (e.g. "wpp-wechat"), 禁止 "main"`);
    }
    await initDbPool(globalCfg);
    const registry = getDefaultAccountRegistry();
    const state = await registry.start(accountId, cfg);
    // groupPolicy 非法值 fail-fast; triggerConfig/triggerCtx 存 module Map 复用 (热重载幂等)
    const VALID_GROUP_POLICIES = ["open", "disabled", "allowlist", "closed"];
    if (cfg.groupPolicy && !VALID_GROUP_POLICIES.includes(cfg.groupPolicy)) {
        throw new Error(`account.groupPolicy invalid for ${accountId}: "${cfg.groupPolicy}" (must be one of ${VALID_GROUP_POLICIES.join(",")})`);
    }
    // v1.3.79: 创建账号专属可变配置容器 (只创建一次, triggerConfig/handler/runtime Map 共享同一对象引用)
    //   热重载/命令更新容器 → triggers 和 handler 都立即生效, 且账号之间完全隔离
    if (!runtimeHeartflow.has(accountId)) {
        runtimeHeartflow.set(accountId, resolveAiConfig(cfg, "heartflow") ?? defaultHeartflowConfig());
    }
    if (!runtimeJargon.has(accountId)) {
        runtimeJargon.set(accountId, resolveAiConfig(cfg, "jargon") ?? defaultJargonConfig());
    }
    if (!runtimeAffection.has(accountId)) {
        runtimeAffection.set(accountId, resolveAiConfig(cfg, "affection") ?? defaultAffectionConfig());
    }
    const hfCfg = runtimeHeartflow.get(accountId);
    const jgCfg = runtimeJargon.get(accountId);
    const afCfg = runtimeAffection.get(accountId);
    if (!runtimeTriggerConfigs.has(accountId)) {
        runtimeTriggerConfigs.set(accountId, {
            ...defaultTriggerConfig(),
            requireAtMention: cfg.requireAtMention,
            groupPolicy: cfg.groupPolicy ?? "closed",
            groupAllowFrom: cfg.groupAllowFrom ?? [],
            heartflow: hfCfg, // 共享账号专属容器引用
        });
    }
    const triggerConfig = runtimeTriggerConfigs.get(accountId);
    if (!runtimeTriggerCtxs.has(accountId)) {
        runtimeTriggerCtxs.set(accountId, {
            botWxid: cfg.selfWxid || null,
            // 昵称供群 @ 检测 (配置驱动 + 默认兜底)
            botNickname: cfg.nickname || DEFAULT_BOT_NICKNAME,
            allowFrom: cfg.allowFrom ?? [],
            dmPairingEnabled: cfg.dmPairingEnabled === true,
            groupContextEnabled: cfg.groupContextEnabled === true,
            groupContextWindow: cfg.groupContextWindow,
        });
    }
    const triggerCtx = runtimeTriggerCtxs.get(accountId);
    // 首次创建, 后续复用同一实例 (ws/webhook 都喂同一 handler)
    if (!runtimeInboundHandlers.has(accountId)) {
        // v1.3.79: hfCfg/jgCfg/afCfg 已在上面创建 (账号专属容器), handler opts 持有同一引用
        runtimeInboundHandlers.set(accountId, createWppInboundHandler({
            accountId,
            triggerConfig,
            triggerCtx,
            enableDispatch: true,
            allowFrom: cfg.allowFrom ?? [],
            vendorCtx: {
                baseUrl: cfg.apiBaseUrl,
                tokenKey: cfg.tokenKey,
                authcode: cfg.authcode,
                accountId,
            },
            mcpEnabled: cfg.mcpEnabled !== false,
            onDispatch: async (msg) => {
                await dispatchInboundToOpenClaw(msg, { channelRuntime: getChannelRuntime() });
            },
            dmPairingEnabled: cfg.dmPairingEnabled === true,
            onPairingAttempt: async ({ msg, code }) => {
                await handlePairingAttempt(accountId, msg, code);
            },
            // v1.3.39 FILEHELPER: 文件传输助手命令处理 (老板 2026-08-11)
            onFileHelperCommand: async ({ msg, command }) => {
                await handleFileHelperCommand(accountId, msg, command);
            },
            groupContextEnabled: cfg.groupContextEnabled === true,
            // v1.3.75 HEARTFLOW: 心流配置 + 机器人昵称 (未@群消息主动参与判断)
            // v1.3.79: 传可变容器引用 — 热重载/命令更新容器即刻生效
            heartflow: hfCfg,
            botNickname: cfg.nickname,
            // v1.3.76 JARGON: 黑话挖掘配置 (旁路采集 + 定时挖掘)
            jargon: jgCfg,
            // v1.3.77 AFFECTION: 好感度/社交关系配置 (旁路处理)
            affection: afCfg,
        }));
    }
    const inboundHandler = runtimeInboundHandlers.get(accountId);
    // shutdown 时 flush 缓冲消息 (幂等: 只 attach 一次, 复用同 handler)
    state.attachInboundFlush(() => inboundHandler.flushAll());
    // v1.12.0 换 judge 端点: 启动即留一行"这次到底打哪个端点 + 用哪个模型"的自述 ——
    //   这是「judge 真的在打新端点」唯一的正面证据 (成功调用本身不写日志)。
    //   只打 format/host/路径/模型名 + key 有无, **绝不打 key 本身**。
    // v1.13.0: 同一行补兜底端点自述 (fallback=none / MISCONFIGURED(缺…) / 端点+模型);
    //   半配 (缺一两个 env) 另发一条 WARNING —— 半配的现场表现与"没配"完全一样,
    //   不吭声就等于让人以为兜底已经生效 (本文件反复在防的那种失败形态)。
    const fbState = resolveJudgeFallback();
    log.info(`[WPP v${PLUGIN_VERSION} JUDGE] ${describeJudgeEndpoint(resolveJudgeCreds())}` +
        ` models=heartflow:${hfCfg.model ?? "-"},affection:${afCfg.model ?? "-"},jargon:${jgCfg.model ?? "-"}` +
        ` fallback=${describeJudgeFallback(fbState)}`);
    if (fbState.kind === "partial") {
        log.warn(`[WPP JUDGE] 兜底端点配置不完整 (缺 ${fbState.missing.join(", ")}) ⇒ 兜底未启用; ` +
            `三项 (${JUDGE_FALLBACK_VARS.baseUrl} / ${JUDGE_FALLBACK_VARS.apiKey} / ${JUDGE_FALLBACK_VARS.model}) 都给全才生效`);
    }
    // v1.14.0 env 改名 (DEEPSEEK_BASE_URL/_API_KEY → JUDGE_BASE_URL/_API_KEY, 老板拍板「阿里的那个不能使用 deepseek*」):
    //   旧名**不再被读取**, 所以还留着旧名的环境会表现为"心流一条都不判分" —— 那种静默正是本文件反复在防的形态。
    //   这一行让根因在第一眼就写出来 (且不打印任何值, 只说名字)。
    const legacyJudgeVars = lingeringLegacyJudgeVars();
    if (legacyJudgeVars.length > 0) {
        log.warn(`[WPP JUDGE] 检测到已废弃的 env 名: ${legacyJudgeVars.join(", ")} —— v1.14.0 起**不再读取**; ` +
            `请改用 ${JUDGE_MAIN_VARS.baseUrl} / ${JUDGE_MAIN_VARS.apiKey} (改名原因: 它们装的是阿里云 token-plan 凭证, ` +
            `挂 DeepSeek 名会与框架自家 deepseek provider 的 env 兜底撞名)`);
    }
    // v1.6.x HEARTFLOW-FEEDBACK: 加载 per-群 learned 阈值进内存 + 启动每账号 sweep (幂等; stop 时 state 统一 clear)
    //   幂等性由 startHeartflowSweep 内部 clear-then-reschedule 保证 (含 in-flight race 已启动再进)
    void loadLearnedThresholds(accountId).then((n) => {
        if (n > 0)
            log.info(`[WPP HF] learned thresholds loaded: account=${accountId} groups=${n}`);
    });
    // v1.6.9 发言预算: 回填小时/天计数 (重启不清零额度, 否则"重启刷额度"成了后门)
    void loadHfBudgetSeed(accountId).then((n) => {
        if (n > 0)
            log.info(`[WPP HF] budget seed loaded: account=${accountId} groups=${n}`);
    });
    // v1.8.0 分层统计: 预热内存缓存 (judge 热路径零 DB 读的前提; 首个 sweep 在 300s 后才会重算)
    void loadHfLayerStats(accountId).then((n) => {
        if (n > 0)
            log.info(`[WPP HF] layer stats loaded: account=${accountId} rows=${n}`);
    });
    startHeartflowSweep(state, accountId, () => runtimeHeartflow.get(accountId) ?? defaultHeartflowConfig());
    // 幂等 early-return: 任一 ws/webhook 已 attach 即视为已启动 (防并发 start 双重连接/端口占用)
    if (state.wsClient || state.webhookServer) {
        log.info(`account partially/fully started (in-flight race safe return): ${accountId} ws=${!!state.wsClient} webhook=${!!state.webhookServer}`);
        return state;
    }
    // WS 客户端: 按 cfg.sync.enableWsClient 控制 (默认 true)
    const syncConfig = resolveSyncConfig(cfg);
    if (cfg.authcode && !state.wsClient) {
        if (!syncConfig.enableWsClient) {
            log.info(`ws client disabled by config (v1.1.41 WS-DEGRADE): accountId=${accountId}`);
        }
        else {
            const ws = new WechatpadproWsClient(cfg.wsUrl, cfg.authcode, {
                apiClient: state.apiClient,
                accountId,
                // P0-3: WS 直接传原始 raw, 由 handler 统一解析 (payloadToAllInboundMessages 认 v1)
                onInboundMessage: async (raw) => {
                    await inboundHandler.handle(raw);
                },
            });
            await ws.start();
            state.attachWsClient(ws);
        }
    }
    else if (!cfg.authcode) {
        log.warn(`ws client skipped (no authcode): ${accountId}`);
    }
    // v1.3.63 P1-7 webhook 加固 (2026-08-14 老板拍板): webhookPathToken 随机 token 插入 path
    //   → /wechatpadpro/<token>/webhook. 攻击者猜不到 token → 404 (webhook-receiver 精确 path 匹配天然拒绝).
    //   不影响 nginx catch-all ^~ /wechatpadpro/; vendor 注册 URL 由 autoSetWebhook 带 token 自动更新.
    // v1.3.78 P0-1: 确保 token 一定存在 (未配则生成写回) — 无 token 不可启动 webhook
    if (!cfg.webhookPathToken) {
        const tk = await ensureWebhookPathToken(accountId);
        if (tk.ok && tk.token) {
            cfg.webhookPathToken = tk.token;
            log.warn(`[WPP P0-1] account=${accountId} webhookPathToken 未配置, 已自动生成并写回 (token 尾部 ${tk.token.slice(-4)})`);
        }
        else {
            log.warn(`[WPP P0-1] account=${accountId} webhookPathToken 缺失且自动生成失败 (${tk.reason ?? "unknown"}) — webhook 无路径鉴权!`);
        }
    }
    const { webhookPath, businessPath } = deriveWebhookPaths(cfg);
    if (!state.webhookServer) {
        // v1.3.61 WEBHOOK-SHARED-PORT: 多账号共享单个 webhook server (单端口 + path 区分, 贴合 vendor 设计)
        //   vendor 按 authcode 区分账号, 回调 URL path 含 accountId → 一个端口足够。
        //   首个账号创建 server, 后续账号复用 + addPath (幂等)。port 用首个账号的 cfg.webhookPort。
        const srv = sharedWebhookServer ?? new WechatpadproWebhookServer(cfg.webhookHost, cfg.webhookPort, [], // 初始空 paths, 下方 addPath 逐个注册
        cfg.webhookSecret);
        if (!sharedWebhookServer) {
            sharedWebhookServer = srv;
            sharedWebhookServerPort = cfg.webhookPort;
            await srv.start();
        }
        else {
            log.info(`[WPP v1.3.61] reuse shared webhook server port=${sharedWebhookServerPort} (account=${accountId} shares port)`);
        }
        // 普通 webhook: sync_message 事件 → 主动 /Msg/Sync 拉取 (增量 Synckey 防全量重放)
        srv.addPath(webhookPath, async (payload) => {
            const raw = payload;
            if (raw.MessageType === "sync_message") {
                // P1: 每账号 /Msg/Sync 锁 — 与 ws-client triggerSync 串行, 防并发双拉 + 游标竞争
                const prev = accountSyncLocks.get(accountId) ?? Promise.resolve();
                const run = prev.then(async () => {
                    try {
                        const prevSynckey = await getSynckey(accountId);
                        const sync = await state.apiClient.call("/Msg/Sync", { Scene: 0, Synckey: prevSynckey ?? "" });
                        const newKey = sync?.Data?.KeyBuf?.buffer;
                        const list = sync?.Data?.CmdList?.List ?? [];
                        log.info(`webhook sync_message: /Msg/Sync pulled ${list.length} message(s) synckey=${prevSynckey ? "incremental" : "full"}`);
                        // P1: 先处理消息再保存 synckey (崩溃不丢消息; DB 幂等重拉安全)
                        for (const item of list) {
                            await inboundHandler.handle(item);
                        }
                        if (newKey) {
                            await saveSynckey(accountId, newKey);
                        }
                    }
                    catch (e) {
                        log.warn(`webhook sync_message /Msg/Sync failed: ${formatErr(e)}`);
                    }
                }).finally(() => {
                    // 清理锁 (仅当还是自己的 promise)
                    if (accountSyncLocks.get(accountId) === run)
                        accountSyncLocks.delete(accountId);
                });
                accountSyncLocks.set(accountId, run);
                await run;
                return;
            }
            // 其他 vendor webhook 事件 (如 logout) → 尝试 parse
            await inboundHandler.handle(payload);
        });
        // 业务回调: 完整消息 → 直接 handler
        srv.addPath(businessPath, async (payload) => {
            log.debug(`business callback: received payload (top keys=${Object.keys(payload ?? {}).join(",")})`);
            await inboundHandler.handle(payload);
        });
        // v1.3.63 P1: 每个账号都 attach 自己的 paths (stop 时 removePath 只摘自己).
        //   共享 server 单例由 sharedWebhookServer 管理, 真正 stop 在 shutdown(); 不再"只 attach 创建账号"
        //   (旧逻辑: 非创建账号不 attach → stop 时 path 残留 zombie handler).
        state.attachWebhookServer(srv, [webhookPath, businessPath]);
    }
    // 自动注册 webhook URL 给 vendor (每账号 authcode 不同, 手动 set 易漏; 3 次 backoff 覆盖临时 401/timeout)
    if (cfg.autoSetWebhook && cfg.webhookPublicUrl && cfg.authcode) {
        const url = `${cfg.webhookPublicUrl.replace(/\/$/, "")}${webhookPath}`;
        const maxAttempts = cfg.setWebhookRetries ?? 3;
        let lastErr;
        let ok = false;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const result = await state.apiClient.setWebhook(url, cfg.authcode);
                if (result.Code === 0) {
                    log.info(`setWebhook OK: account=${accountId} url=${url} authcode=${maskSecret(cfg.authcode)} attempt=${attempt}/${maxAttempts}`);
                    SetWebhookMetrics.incSetWebhookOk();
                    state.setVendorAuth(cfg.selfWxid, cfg.authcode); // vendor 鉴权通过 -> 消除 lastError 假告警
                    ok = true;
                    break;
                }
                lastErr = `${result.CodeValue ?? "unknown"} (Code=${result.Code})`;
                log.warn(`setWebhook vendor returned non-zero: account=${accountId} attempt=${attempt}/${maxAttempts} err=${lastErr}`);
                SetWebhookMetrics.incSetWebhookFail();
            }
            catch (e) {
                lastErr = e;
                log.warn(`setWebhook threw: account=${accountId} attempt=${attempt}/${maxAttempts} err=${formatErr(e)}`);
            }
            if (attempt < maxAttempts) {
                // backoff: 1s, 3s, 9s, ...
                const delayMs = 1000 * Math.pow(3, attempt - 1);
                await new Promise((r) => setTimeout(r, delayMs));
            }
        }
        if (!ok) {
            log.warn(`setWebhook failed after ${maxAttempts} attempts: account=${accountId} url=${url} lastErr=${formatErr(lastErr)} (plugin continues, vendor 不会 push webhook, 但 /Msg/Sync polling 仍可用)`);
            SetWebhookMetrics.incSetWebhookFail(); // 最后一次失败也 count
            // 启动失败后的后台周期性重试: 每 5 分钟 (匹配 vendor 心跳间隔), 成功即停
            const PERIODIC_RETRY_MS = 5 * 60 * 1000;
            // 注: void 箭头 + async IIFE (而非 setInterval(async () => {...}))。
            //   回调内已 try/catch 全包, Promise 不会 reject; 但 setInterval 签名期望 void 返回,
            //   传 async 函数等于隐式丢弃 Promise。改后 "无需等待" 成为代码事实。
            const timer = setInterval(() => {
                void (async () => {
                    try {
                        const r = await state.apiClient.setWebhook(url, cfg.authcode);
                        if (r.Code === 0) {
                            log.info(`periodic setWebhook OK: account=${accountId} url=${url} authcode=${maskSecret(cfg.authcode)} (timer stopped)`);
                            SetWebhookMetrics.incPeriodicOk();
                            state.setVendorAuth(cfg.selfWxid, cfg.authcode); // 周期重试成功同样标记已鉴权
                            state.clearRetryTimer(timer);
                        }
                        else {
                            log.warn(`periodic setWebhook failed: account=${accountId} Code=${r.Code} CodeValue=${r.CodeValue ?? "?"} (will retry in ${PERIODIC_RETRY_MS / 1000}s)`);
                            SetWebhookMetrics.incPeriodicFail();
                        }
                    }
                    catch (e) {
                        log.warn(`periodic setWebhook threw: account=${accountId} err=${formatErr(e)} (will retry in ${PERIODIC_RETRY_MS / 1000}s)`);
                        SetWebhookMetrics.incPeriodicFail();
                    }
                })();
            }, PERIODIC_RETRY_MS);
            // NodeJS.Timeout.unref() 防止 timer 阻止 process exit (shutdown 时 clear 仍然有效)
            timer.unref();
            state.setRetryTimer(timer);
            log.info(`periodic setWebhook scheduled: account=${accountId} url=${url} interval=${PERIODIC_RETRY_MS / 1000}s`);
        }
    }
    else if (cfg.autoSetWebhook && !cfg.webhookPublicUrl) {
        SetWebhookMetrics.incSkippedNoPublicUrl();
        log.warn(`autoSetWebhook enabled but webhookPublicUrl missing: account=${accountId} (跳过 setWebhook, vendor 不会 push webhook)`);
    }
    else if (cfg.autoSetWebhook && !cfg.authcode) {
        SetWebhookMetrics.incSkippedNoAuthcode();
        log.warn(`autoSetWebhook enabled but authcode missing: account=${accountId} (跳过 setWebhook)`);
    }
    // 自动配 vendor 业务回调 + StartAutoSync (完整消息推送; 只配 /Webhook/Set 只会推空 Data 的 sync_message)
    if (cfg.autoSetWebhook && cfg.webhookPublicUrl && cfg.authcode) {
        // v1.3.63 P1-7: 用派生 businessPath (带 webhookPathToken), 不重新从 cfg 拼 (否则 token 段丢失 →
        //   vendor 注册无 token URL → nginx 403)
        const syncMessageUrl = `${cfg.webhookPublicUrl.replace(/\/$/, "")}${businessPath}`;
        const logoutUrl = `${cfg.webhookPublicUrl.replace(/\/$/, "")}${businessPath}/logout`;
        try {
            const r = await state.apiClient.setBusinessWebhook(syncMessageUrl, logoutUrl);
            if (r.Code === 0) {
                log.info(`setBusinessWebhook OK: account=${accountId} syncMessageUrl=${syncMessageUrl}`);
            }
            else {
                log.warn(`setBusinessWebhook non-zero: account=${accountId} Code=${r.Code} CodeValue=${r.CodeValue ?? "?"}`);
            }
            // StartAutoSync 启动轮询
            const s = await state.apiClient.startAutoSync(syncMessageUrl);
            if (s.Code === 0) {
                log.info(`startAutoSync OK: account=${accountId} vendor 会推完整消息到 ${syncMessageUrl}`);
            }
            else {
                log.warn(`startAutoSync non-zero: account=${accountId} Code=${s.Code} CodeValue=${s.CodeValue ?? "?"}`);
            }
        }
        catch (e) {
            log.warn(`setBusinessWebhook/startAutoSync failed: account=${accountId} err=${formatErr(e)} (plugin continues, 消息可能不入库)`);
        }
    }
    // log 用 cfg.agent (运行时真正用的), 不用入参 agentId (避免 "default 为什么对应 main" 误解)
    log.info(`[WPP v${PLUGIN_VERSION} STARTUP] account=${accountId} ` +
        `webhook=${cfg.webhookHost}:${cfg.webhookPort}${webhookPath} ` +
        `autoSetWebhook=${cfg.autoSetWebhook !== false} ` +
        `mcpEnabled=${cfg.mcpEnabled !== false} ` +
        `groupContext=${cfg.groupContextEnabled === true ? "ON" : "OFF"} ` +
        `pairing=${cfg.dmPairingEnabled === true ? "ON" : "OFF"} ` +
        `agent=${cfg.agent} ` +
        `selfWxid=${cfg.selfWxid}`);
    return state;
}
export async function startAllAccounts(agentId = "main") {
    const ids = await listAccountIds();
    log.info(`discovered ${ids.length} account(s): ${ids.join(", ")}`);
    const out = [];
    for (const id of ids) {
        out.push(await startAccountById(id, agentId));
    }
    return out;
}
export async function shutdown() {
    await getDefaultAccountRegistry().stopAll();
    // v1.3.63 P1: 共享 webhook server 真正 stop + 置空 (否则下次 startAccount 复用已停 server 不 start)
    if (sharedWebhookServer) {
        try {
            await sharedWebhookServer.stop();
        }
        catch (e) {
            log.warn(`shared webhook server stop error (non-fatal): ${formatErr(e)}`);
        }
        sharedWebhookServer = null;
        sharedWebhookServerPort = null;
        log.info("shared webhook server stopped + cleared");
    }
    try {
        const { disconnectMcpClient } = await import("./vendor-mcp-client.js");
        await disconnectMcpClient();
    }
    catch (e) {
        log.warn(`mcp disconnect failed (non-fatal): ${formatErr(e)}`);
    }
    await closeDb();
    log.info("plugin shutdown complete");
}
// ============================================================
// wppChannelPlugin — 实际 channel 实现 (named export)
// OpenClaw runtime 通过 register(api) 拿这个对象, 调它的 start/stop/sendText/sendImage
// ============================================================
/**
 * v1.3.47 FILENAME-FALLBACK (2026-08-12 接总立 P1): 从 mediaUrl 推显示文件名兑底。
 *   framework deliver ctx 不传 fileName → 手机端显示空名 "file" (8-12 09:56 老板反馈)。
 *   优先级: explicitFileName > URL basename (剥离 query) > ""
 * 抽成纯函数供 sendMedia 复用 + 单测 (dynamic import 的 dispatchSendMessage 无法 mock)。
 */
export function inferFileNameForMedia(mediaUrl, explicitFileName) {
    const urlForBasename = (mediaUrl ?? "").split("?")[0] ?? "";
    const inferredFileName = urlForBasename.split("/").pop() ?? "";
    return explicitFileName ?? inferredFileName;
}
/**
 * wppChannelPlugin 的**历史 API 面** (非 ChannelPlugin 契约; 见 channel-contract.ts 顶部 S8 说明)。
 * 独立导出, 便于潜在调用方显式迁移; 同时由 Object.assign 合回 wppChannelPlugin,
 * 使运行时对象与改动前逐成员一致。
 */
export const wppChannelLegacyApi = {
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    kind: "channel", // channel 类型 (供 registerChannel 识别)
    async start(opts = {}) {
        log.info(`wppChannelPlugin.start: agent=${opts.agentId ?? "main"}`);
        try {
            await startAllAccounts(opts.agentId ?? "main");
            log.info(`wppChannelPlugin.started: ${getDefaultAccountRegistry().size()} account(s)`);
            //   - DB pool 已 init 不热重连 (mariadb host 变更需重启, 安全考虑)
            //   - runtime/defaults 字段 (apiTimeoutMs/dedupeTtlMs 等) 真生效
            watchGlobalConfig((cfg) => {
                const resolved = resolveGlobalConfig(cfg);
                setGlobalRuntimeConfig(resolved);
                log.info(`config.json hot-reload applied: mariadb=${cfg.storage.db.mariadb.host}/${cfg.storage.db.mariadb.database} (DB pool 已 init, 不热重连)`);
            }).catch((e) => log.warn(`watchGlobalConfig failed: ${formatErr(e)}`));
        }
        catch (e) {
            log.error(`wppChannelPlugin.start failed: ${formatErr(e)}`);
            throw e;
        }
    },
    async stop() {
        await shutdown();
    },
    // OpenClaw 调用入口: agent 要发消息时调用
    async sendText(accountId, toWxid, text, ats) {
        const ctx = getDefaultAccountRegistry().get(accountId);
        if (!ctx) {
            const known = getDefaultAccountRegistry().listIds();
            return {
                ok: false,
                error: `account not found: ${accountId} (known: ${known.join(", ") || "none"})`,
            };
        }
        return dispatchSendText(accountId, toWxid, text, ats);
    },
    async sendImage(accountId, toWxid, imageUrl) {
        const ctx = getDefaultAccountRegistry().get(accountId);
        if (!ctx) {
            const known = getDefaultAccountRegistry().listIds();
            return {
                ok: false,
                error: `account not found: ${accountId} (known: ${known.join(", ") || "none"})`,
            };
        }
        return dispatchSendImage(accountId, toWxid, imageUrl);
    },
    //   参数见 WppSendMessageParams; 内部按 type 路由 + 自动入库
    async sendMessage(params) {
        const { sendMessage: dispatchSendMessage } = await import("./dispatch/send-message.js");
        return dispatchSendMessage(params);
    },
    buildSessionKey,
};
/**
 * 契约对象本身已外提到 channel-contract.ts (S8 说明 + 循环依赖处理见该文件顶部)。
 * 此处只做**依赖注入**: 3 个本文件自有函数注进去, 其余依赖新文件直接 import。
 *
 * 放置位置: 这 3 个符号在 index.ts 都是 **`function` 声明** (resolveOutboundAccount /
 *   startAccountById / inferFileNameForMedia), 有提升; 且此处只**捕获引用**、
 *   不在模块求值期调用它们 —— 故位置安全。位置选在原契约块处, 以保持
 *   `Object.assign(wppChannelContract, wppChannelLegacyApi)` 的原有先后顺序不变。
 */
const wppChannelContract = createChannelContract({
    startAccountById,
    resolveOutboundAccount,
    inferFileNameForMedia,
});
/**
 * wppChannelPlugin = 契约对象 (受 satisfies 检查) **合并** 历史 API 面。
 * 合并后运行时对象与改动前成员集合一致 (含 name/version/kind/start/stop/sendText/sendImage/
 * sendMessage/buildSessionKey + outbound.sendImage); 详见 channel-contract.ts 顶部 S8 说明。
 */
export const wppChannelPlugin = Object.assign(wppChannelContract, wppChannelLegacyApi);
// ============================================================
// plugin — OpenClaw v2026.7.1+ 要求的 manifest wrapper (default export)
// 范式: 仿 OpenClaw v2026.7.1+ plugin 对象
// ============================================================
// 2026-09-28 契约对齐 (S9): 删除本地**自引用**的假接口
//   interface OpenClawPluginApi { registerChannel: (arg: { plugin: typeof wppChannelPlugin }) => void }
//   —— 它把契约检查完全绕过 (自己定义的目标类型引用自己, 任何形状都"满足")。
//   改用 openclaw/plugin-sdk/core 的**真** OpenClawPluginApi
//   (其 registerChannel 为 `(registration: OpenClawPluginChannelRegistration | ChannelPlugin) => void`,
//    见 agent-harness-runtime-wMciqZ6Z.d.ts:22305, 最终指向与 ChannelPlugin 同一份类型)。
export const plugin = {
    id: CHANNEL_ID,
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    description: "WeChatPadPro (微信 Pad 协议 HTTP API) OpenClaw channel plugin. AccountRegistry class 多账号管理. 语音 silk 自动转码 + 失败降级发文件; 群接龙自动触发 AI 应景回复. 共存模式与 GeWe 插件并行.",
    configSchema: {
        type: "object",
        additionalProperties: true,
        properties: {},
    },
    // v1.3.62 OPENCLAW-GUIDED-SETUP (2026-08-13 老板拍板): 让 OpenClaw `configure --section plugins` 能引导本插件配置。
    //   OpenClaw 引导写 plugins.entries.wechatpadpro.config, 插件 config.ts 读它兜底 (见 loadAccountConfig)。
    //   引导字段: tokenKey/authcode (敏感, env 优先) + apiBaseUrl/wsUrl + allowFrom/群策略 + agent。
    //   注意: 这是"单账号 default 兜底"; 多账号 (每账号独立 agent) 仍走 CLI `npm run setup add <id>`。
    configUiHints: {
        tokenKey: { label: "WeChatPadPro TokenKey", sensitive: true, help: "vendor 后台获取; 也可用 WECHATPRO_TOKEN_KEY env" },
        authcode: { label: "授权码 authcode", sensitive: true, help: "vendor 启动时生成; 也可用 WECHATPRO_AUTHCODE env" },
        apiBaseUrl: { label: "API Base URL", placeholder: "https://<vendor-host>", help: "vendor HTTP API 地址 (见 DEPLOY.md)" },
        wsUrl: { label: "WebSocket URL", placeholder: "wss://<vendor-host>/ws/sync", help: "vendor WS 推送地址 (见 DEPLOY.md)" },
        allowFrom: { label: "私聊白名单 (逗号分隔)", help: "空 = 拒绝所有 DM (fail-closed)" },
        groupPolicy: { label: "群聊策略", help: "open/disabled/allowlist/closed" },
        groupAllowFrom: { label: "群白名单 (逗号分隔, @chatroom)", help: "groupPolicy=allowlist 时用" },
        agent: { label: "OpenClaw agent id", help: "绑定 agent (如 wpp-wechat), 禁止 main" },
        webhookPort: { label: "webhook 端口", help: "默认 4398 (多账号共享)" },
    },
    /**
     * OpenClaw 启动时调 register(api), 我们用 api.registerChannel 注册 channel
     */
    register(api) {
        log.info(`plugin.register: registering wppChannelPlugin (v${PLUGIN_VERSION})`);
        api.registerChannel({ plugin: wppChannelPlugin });
        log.info(`plugin.register: wppChannelPlugin registered`);
        // v1.5.5 CHANNEL-UI-BRIDGE (2026-09-10): fs.watch openclaw.json#channels.wechatpadpro →
        //   diff 核心字段 → 写回 accounts/<id>.json → 既有 watchAccountConfigs 热载 apply (零重连)。
        //   openclaw.json 侧保存不会重启 channel (reload.noopPrefixes 声明), 本 watcher 是唯一 applier。
        //   onAccountEnabled: Channel 页把停用账号翻回启用 → 尽力拉起 (running 账号 enabled 恒 true 不触发)。
        void watchOpenClawChannelConfig({
            onAccountEnabled: async (accountId) => {
                try {
                    await startAccountById(accountId);
                    log.info(`[channel-ui] account=${accountId} enabled via Channel 页 → started`);
                }
                catch (e) {
                    log.warn(`[channel-ui] account=${accountId} enabled but start failed: ${formatErr(e)}`);
                }
            },
        });
        // watch accounts/ 目录: 改运行时字段 (allowFrom/groupPolicy/requireAtMention) 零重启生效
        void watchAccountConfigs(async (accountId, newCfg) => {
            // v1.5.5 CHANNEL-UI-MIRROR (P2): 账号文件被外部(CLI/手动)改动 → 核心字段 publish 回
            //   openclaw.json#channels.wechatpadpro, Channel 页显示真实值。值相等 → 零写 (双向环打断);
            //   页面发起的写 (经 bridge) 已是同值 → 天然 no-op。明文凭证永不 publish。
            void publishAccountCoreFieldsToChannelConfig(accountId).catch((e) => log.warn(`[channel-ui] mirror failed: ${e.message}`));
            const registry = getDefaultAccountRegistry();
            const state = registry.get(accountId);
            if (!state) {
                // 账号未启动 (enabled=false 或还没 start) → 只清 cache, 下次启动自动用新配置
                log.info(`hot-reload: account ${accountId} not running, config cache refreshed only`);
                return;
            }
            // 更新运行时 config + triggerConfig/triggerCtx (闭包持有对象引用, 即刻生效)
            state.updateConfig(newCfg);
            const tc = runtimeTriggerConfigs.get(accountId);
            if (tc) {
                tc.requireAtMention = newCfg.requireAtMention ?? tc.requireAtMention;
                tc.groupPolicy = newCfg.groupPolicy ?? tc.groupPolicy;
                tc.groupAllowFrom = newCfg.groupAllowFrom ?? tc.groupAllowFrom;
                if (newCfg.keywordTrigger !== undefined)
                    tc.keywordTrigger = newCfg.keywordTrigger;
                if (newCfg.msgTypeTrigger !== undefined)
                    tc.msgTypeTrigger = newCfg.msgTypeTrigger;
                if (newCfg.quoteBotTrigger !== undefined)
                    tc.quoteBotTrigger = newCfg.quoteBotTrigger;
                if (newCfg.blacklistGroups !== undefined)
                    tc.blacklistGroups = newCfg.blacklistGroups;
                if (newCfg.chatroomDebug !== undefined)
                    tc.chatroomDebug = newCfg.chatroomDebug;
            }
            const tctx = runtimeTriggerCtxs.get(accountId);
            if (tctx) {
                tctx.botWxid = newCfg.selfWxid || null;
                tctx.botNickname = newCfg.nickname || DEFAULT_BOT_NICKNAME;
                tctx.allowFrom = newCfg.allowFrom ?? [];
                tctx.dmPairingEnabled = newCfg.dmPairingEnabled === true;
                tctx.groupContextEnabled = newCfg.groupContextEnabled === true;
                if (newCfg.groupContextWindow !== undefined)
                    tctx.groupContextWindow = newCfg.groupContextWindow;
            }
            // v1.3.79: 更新三个新功能的可变配置容器 (handler 持有引用 → 立即生效)
            const hf = runtimeHeartflow.get(accountId);
            const jg = runtimeJargon.get(accountId);
            const af = runtimeAffection.get(accountId);
            // 泛型: target 可变对象, 逐键覆盖 (handler 持有同一引用 → 立即生效)
            const applyMutable = (target, src) => {
                if (!target || !src)
                    return;
                for (const k of Object.keys(src)) {
                    const v = src[k];
                    if (v !== undefined)
                        target[k] = v;
                }
            };
            applyMutable(hf, resolveAiConfig(newCfg, "heartflow") ?? defaultHeartflowConfig());
            applyMutable(jg, resolveAiConfig(newCfg, "jargon") ?? defaultJargonConfig());
            applyMutable(af, resolveAiConfig(newCfg, "affection") ?? defaultAffectionConfig());
            log.info(`hot-reload: account ${accountId} runtime config updated`);
        });
    },
};
// 默认导出 = plugin manifest (OpenClaw 加载入口)
export default plugin;
//# sourceMappingURL=index.js.map