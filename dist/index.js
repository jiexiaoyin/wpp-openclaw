// index.ts - WeChatPadPro OpenClaw Plugin 入口
// v2026.7.1+ OpenClaw API 契约:
//   - default export = plugin manifest (含 register(api), 内部调 api.registerChannel)
//   - named export wppChannelPlugin = 实际 channel 实现 (start/stop/sendText/sendImage)
// 多账号管理走 AccountRegistry class
import { logObj as log, formatErr } from "./core/logger.js";
import { SetWebhookMetrics } from "./monitor/metrics.js";
import { CHANNEL_ID, PLUGIN_NAME, PLUGIN_VERSION, DEFAULT_BOT_NICKNAME } from "./core/constants.js";
import { loadGlobalConfigAsync, loadAccountConfigAsync, listAccountIds, isConfigured } from "./config.js";
import { listAccountIds as helperListAccountIds, resolveAccount, defaultAccountId, isConfigured as helperIsConfigured, unconfiguredReason, describeAccount, } from "./config-helpers.js";
import { getDefaultAccountRegistry } from "./account-state.js";
import { closeDb, initDbPool, getSynckey, saveSynckey, } from "./db.js";
import { getHeartflowRuntime } from "./inbound/heartflow-runtime.js";
import { handleFeatureCommand } from "./inbound/filehelper-features.js";
import { WechatpadproWsClient } from "./ws-client.js";
import { WechatpadproWebhookServer } from "./webhook-receiver.js";
import { createWppInboundHandler } from "./inbound/handler.js";
import { dispatchInboundToOpenClaw, getChannelRuntime, setChannelRuntime, setOpenClawConfig, } from "./dispatch/dispatcher.js";
import { defaultTriggerConfig } from "./inbound/triggers.js";
import { buildSessionKey } from "./session-key.js";
import { sendText as dispatchSendText, sendImage as dispatchSendImage } from "./dispatch/outbound.js";
import { AGENT_TOOLS } from "./dispatch/agent-tools/index.js";
import { getCurrentAccountId } from "./dispatch/account-context.js";
import { watchAccountConfigs, watchGlobalConfig, appendAllowFrom, appendGroupAllowFrom, removeAllowFrom, removeGroupAllowFrom, setAccountFlag, updateBlacklistGroups, ensureWebhookPathToken } from "./config.js";
import { watchOpenClawChannelConfig, publishAccountCoreFieldsToChannelConfig } from "./channel-ui-bridge.js";
import { redeemPairingCode, generatePairingCode, readPairingCode } from "./pairing-store.js";
import { resolveGlobalConfig, resolveSyncConfig } from "./core/runtime-config.js";
import { resolveAiConfig } from "./config-ai.js";
import { defaultHeartflowConfig } from "./inbound/heartflow.js";
import { loadLearnedThresholds, loadHfBudgetSeed, startHeartflowSweep, } from "./inbound/heartflow-learn.js";
import { loadHfLayerStats, } from "./inbound/heartflow-layer.js";
import { defaultJargonConfig } from "./inbound/jargon.js";
import { defaultAffectionConfig } from "./inbound/affection.js";
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
            const timer = setInterval(async () => {
                try {
                    const r = await state.apiClient.setWebhook(url, cfg.authcode);
                    if (r.Code === 0) {
                        log.info(`periodic setWebhook OK: account=${accountId} url=${url} authcode=${maskSecret(cfg.authcode)} (timer stopped)`);
                        SetWebhookMetrics.incPeriodicOk();
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
// ============================================================
// 2026-09-28 契约对齐 (S8): 原对象字面量里混着 **9 个非契约成员**
//   (name / version / kind / start / stop / sendText / sendImage / sendMessage / buildSessionKey)
//   以及嵌套在 outbound 下的 1 个非契约成员 (sendImage)。
//   `satisfies ChannelPlugin` 对**新鲜对象字面量**做 excess-property 检查 ⇒ 这些成员必须先移出。
//
// 处置 = 方案 (a)+(c) 的组合: **移出为独立 export**, 再用 Object.assign 合并回去。
//   - 仓内对这 9 个成员**零调用点** (全仓 src/ + tests/ grep 命中均为注释/定义处);
//     openclaw 2026.9.6 也**完全不读不调** (证据见下)。
//   - 但「openclaw 2026.7.1 ~ 2026.9.5 是否调用 plugin.start/stop/sendText」**未经验证** ⇒
//     直接删除、或只移出不挂回, 都可能在更老框架上丢掉启动/收发入口 (与"不弱化连接/收发"冲突)。
//   - 故: 契约面走受检字面量, 历史面走独立 export, Object.assign 合回 →
//     **运行时对象成员集合与改动前完全一致** (零行为变化), 且全程无 as any / @ts-expect-error / 断言。
//   - 若确认部署目标只有 2026.9.6, 后续可把 wppChannelLegacyApi 从合并里摘掉 (纯减法)。
//
// 证据 (openclaw 2026.9.6 dist):
//   - 生命周期走 plugin.gateway.startAccount / stopAccount
//     (server-channels-D1JRZ19m.mjs:409-410, 590-595), **不调** plugin.start / plugin.stop。
//   - outbound 只调 sendText / sendMedia (channel-outbound-c-7621zH.mjs:161-176);
//     全 dist `sendImage` 仅 3 处且都是 Telegram 内部 sendImageAsPhoto,
//     契约 ChannelOutboundAdapter 亦无该成员。
//   - buildSessionKey 全 dist 0 命中。
// ============================================================
/** outbound 下的历史方法 (非契约; 保留运行时以兼容更老框架 —— 见上方 S8 说明) */
const wppOutboundLegacyApi = {
    async sendImage(opts) {
        const r = await dispatchSendImage(resolveOutboundAccount(opts.accountId, "sendImage"), opts.to, opts.imageUrl);
        return {
            ok: r.ok, error: r.error,
            msgId: r.msgId, newMsgId: r.newMsgId, createTime: r.createTime,
            messageId: r.newMsgId ?? (r.msgId != null ? String(r.msgId) : ""),
            chatId: opts.to,
            roomId: opts.to.includes("@chatroom") ? opts.to : undefined,
        };
    },
};
/**
 * wppChannelPlugin 的**历史 API 面** (非 ChannelPlugin 契约; 见上方 S8 说明)。
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
/** 受 `satisfies ChannelPlugin` 检查的契约对象 (excess 字段已全部移出, 见上方 S8 说明) */
const wppChannelContract = {
    id: CHANNEL_ID,
    // 注入 agentTools 供 OpenClaw 框架读取 (配合 api/client.ts 空凭证兑底 → 工具真正可调)
    agentTools: AGENT_TOOLS,
    // ============================================================
    // v1.3.43 OUTBOUND-RUNTIME (2026-08-12 接总立 P1, 修复 cron announce delivery 永久错误)
    //
    // 根因: framework 找 channel outbound adapter 的判定 (channel-resolution-7UuTfW1_.js:56)
    //   messageAdapterCanSendText: typeof plugin?.message?.send?.text === "function" → 否则 throw "Outbound not configured for channel: X"
    // WPP 之前没 register outbound, 监控层错报 permanent error → cron 累计失败通知 (例: 8-12 07:50 晨报任务失败 2 次)
    // 消息实际由 OUTBOUND-PERSIST (v1.3.16) 已真送达, 但 delivery-recovery 判 permanent error (跟 7-24 同类)
    //
    // 修复: 仿 GeWe v1.4.4 范式 (gewe-multi-agent/src/index.ts:231), 加 outbound 字段
    //   - deliveryMode: "direct" (framework 直接调 wppSendText, 跟 WPP 历史 inbound/outbound 路径一致)
    //   - sendText/sendImage 直接调 dispatch/outbound.ts (复用现成 sendText → 同一个 mediaPersist 路径)
    //
    // 不动 wppChannelPlugin.sendText/sendImage/sendMessage (历史 inbound/outbound 都在调, 不能破坏)
    // 不动 gateway.startAccount (v1.1.14 已修 inbound dispatcher 的 channelRuntime 注入)
    // 最小可行版: 只 sendText + sendImage + deliveryMode, 跑通再说; chunker/normalizePayload/resolveTarget 后补
    // Object.assign = 把非契约的 outbound.sendImage 合回 (运行时与改动前一致)。
    //   返回的是交叉类型 (非新鲜字面量) ⇒ 不触发 excess-property 检查; 无任何断言。
    outbound: Object.assign({
        deliveryMode: "direct",
        // v1.3.46 IDENTITY-RETURN (2026-08-12 接总立 P1, 修复 framework hasDeliveryResultIdentity 报
        //   "adapter_returned_no_identity" → payload outcome: suppressed → message 工具看似 ok 但实际没发)
        //
        // 根因 SSOT (framework deliver-BdKtkX_b.js:hasDeliveryResultIdentity):
        //   function hasDeliveryResultIdentity(result) {
        //     return Boolean(result.messageId || result.chatId || result.channelId || result.roomId
        //                  || result.conversationId || result.toJid || result.pollId);
        //   }
        // 8-12 09:37 实证 (v1.3.45 deploy 后): main agent 调 message 工具 → framework 走 plugin.outbound.sendMedia
        //   → WPP v1.3.45 sendMedia 返 { ok: false, error: 'account not found: default', msgId: undefined }
        //   → 没 messageId / chatId / roomId 任何 identity 字段 → 返 adapter_returned_no_identity
        //   → payload outcome: suppressed (老板群里实际看不到)
        //
        // 修复: 所有 outbound.* 函数返值统一加 framework 期望的 identity 字段:
        //   - messageId: 兼容 vendor 返的 msgId/newMsgId (任一存在即 OK, 仿 framework normalize 行为)
        //   - chatId / roomId: 群 ID (to 字段, 群时返, 私聊时也返 [同一字段])
        //   - ok/error: 保留 (调用方检测错误用)
        //   - msgId: 保留 (内部调用方兼容)
        //
        // 不动现有功能 (sendText/sendImage/sendMedia 行为保持)
        // 仿 GeWe v1.4.4 范式 (gewe-multi-agent/src/index.ts:231 完整 outbound 字段定义)
        // 2026-09-28 契约对齐 (E2): 契约签名 `(ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>`。
        //   - 入参 accountId 放宽为 `string | null` (契约如此; 实现走 resolveOutboundAccount 的 falsy 兜底)
        //   - 返回值补**必填** `channel`; `messageId` 由 `string | undefined` 收紧为 `string`
        //     (缺失时用 "" —— 空串在框架 hasDeliveryResultIdentity 里与 undefined 同为 falsy,
        //      故不会凭空制造投递身份; chatId/roomId 仍照旧兜底)
        async sendText(opts) {
            const r = await dispatchSendText(resolveOutboundAccount(opts.accountId, "sendText"), opts.to, opts.text, opts.ats);
            return {
                ok: r.ok, error: r.error,
                msgId: r.msgId, newMsgId: r.newMsgId, createTime: r.createTime,
                // v1.3.46 + 2026-09-28 identity 字段 (契约必填 channel/messageId):
                channel: CHANNEL_ID,
                messageId: r.newMsgId ?? (r.msgId != null ? String(r.msgId) : ""),
                chatId: opts.to,
                roomId: opts.to.includes("@chatroom") ? opts.to : undefined,
            };
        },
        // 注: 原 outbound.sendImage 是非契约成员, 已移出为 wppOutboundLegacyApi (见上方 S8 说明),
        //     并由本对象外层 Object.assign 在**运行时**合回 —— 行为与改动前一致。
        // ============================================================
        // v1.3.44 SENDMEDIA (2026-08-12 接总立 P1, 修复 cron 晨报图片降级为文件卡片)
        //
        // 根因: framework deliver.js:1471 检测 plugin.outbound.sendMedia 不存在 →
        //   "Plugin outbound adapter does not implement sendMedia; media URLs will be dropped and text fallback will be used"
        // 8-12 09:05 晨报任务实证: AI 调 message 工具带 attachments=[{type:image}] → framework 调 sendMedia → WPP v1.3.43 没实现
        //   → media dropped + AI 降级用 sendFile (变成文件下载卡片, 不是直接展示图片)
        //
        // 修复: 仿 GeWe v1.4.4 范式 (gewe-multi-agent/src/index.ts:231 + dispatch/outbound.ts:134),
        //   outbound 字段加 sendMedia, 按 mediaType/url 后缀路由到 WPP 统一 sendMessage 入口
        //   (v1.3.17 MESSAGE-UNIFY 已统一 image/video/voice/file/link/card/location/miniprogram/emoji)
        //
        // 不动现有 outbound.sendText/sendImage (v1.3.43 修复保持)
        // 不动 wppChannelPlugin.sendText/sendImage/sendMessage (历史 inbound/outbound 都在调)
        //
        // framework sendMedia ctx (deliver.js:1454):
        //   { kind: "media", text: caption, mediaUrl, cfg, to, accountId, replyToId, threadId, formatting, ... }
        // WPP 暂不支持 replyToId/threadId (WPP outbound.ts sendText/sendImage 不支持 replyTo, 后续 P3 补)
        // 2026-09-28 契约对齐 (E3):
        //   - accountId: `string` → `string | null` (契约 ChannelOutboundContext.accountId)
        //   - mediaUrl:   `string` → `string | undefined` (**契约里 mediaUrl 是可选的**, outbound.types:82)
        //   - 返回值补必填 `channel` + `messageId` 收紧为 `string` (同 E2)
        //   - 运行时防御: 旧实现 `opts.mediaUrl.split("?")` 在 mediaUrl 缺省时会抛 TypeError。
        //     契约既然允许缺省, 就**不能崩**: 空 mediaUrl 直接返回结构化失败 (不发空媒体)。
        //     这是把既有潜在崩溃改成显式失败, 正常路径 (mediaUrl 存在) 逐字不变。
        async sendMedia(opts) {
            const { sendMessage: dispatchSendMessage } = await import("./dispatch/send-message.js");
            const accountId = resolveOutboundAccount(opts.accountId, "sendMedia");
            const mediaUrl = opts.mediaUrl ?? "";
            if (!mediaUrl) {
                log.warn(`outbound.sendMedia: mediaUrl missing (to=${opts.to}) — 拒绝发送空媒体 (契约允许 mediaUrl 缺省)`);
                return {
                    ok: false,
                    error: "sendMedia: mediaUrl is required",
                    channel: CHANNEL_ID,
                    messageId: "",
                    chatId: opts.to,
                    roomId: opts.to.includes("@chatroom") ? opts.to : undefined,
                };
            }
            // 按 mediaType 优先; 没传则按 url 后缀推断
            const urlNoQuery = (mediaUrl.split("?")[0] ?? "").toLowerCase();
            const inferred = /\.(jpg|jpeg|png|gif|webp|bmp|ico|tiff)$/i.test(urlNoQuery) ? "image" :
                /\.(mp4|mov|avi|mkv|webm|3gp)$/i.test(urlNoQuery) ? "video" :
                    /\.(mp3|wav|ogg|flac|m4a|silk|amr)$/i.test(urlNoQuery) ? "voice" :
                        "file";
            const type = opts.mediaType ?? inferred;
            // ============================================================
            // v1.3.47 FILENAME-FALLBACK (2026-08-12 接总立 P1, 修复 framework ctx 不传 fileName → vendor sendFile 拿到空名 → 老板手机显示 "file" 无后缀)
            //
            // 根因: framework deliver.js:createChannelHandler 调 plugin.outbound.sendMedia(caption, mediaUrl, overrides),
            //   ctx 只含 { kind: "media", text, mediaUrl, ...baseCtx }, 没有 fileName / attachments 字段
            //   → WPP plugin v1.3.44 sendMedia 调 dispatchSendMessage({type, content: mediaUrl, fileName: undefined})
            //   → resolveMediaFromAttachments 拿不到 att.name (undefined) → attName = "" → vendor sendFile 拿空名
            //   → 老板手机看到“文件”卡片但文件名是空的 “file” (无后缀)
            // 8-12 09:56 实证: AI 调 message 工具 attachments=[{type:"file", name:"test-message-log.txt", media:"https://...test-message-log.txt"}]
            //   → 老板手机看不到 .txt 后缀
            //
            // 修复: 从 mediaUrl basename 推 fileName 兑底 (仿 gewe v1.4.4 resolveMediaFromAttachment 逻辑)。
            //   优先级: opts.fileName > URL basename > "" (保持兼容)
            //   仍然允许调用方传 fileName 覆盖 (未来 framework 支持 attachments 传递后可直接覆盖)
            //
            // 不动现有 framework ctx 接口 (让 plugin 兼容 framework 不传 fileName 的现状)。
            // 不动现有 sendMedia 类型推断 (v1.3.44 修复保持)。
            // ============================================================
            const fileName = inferFileNameForMedia(mediaUrl, opts.fileName);
            // 走 WPP 统一 sendMessage 入口 (v1.3.17 MESSAGE-UNIFY 已统一所有 type 路由 + persist + oss)
            const r = await dispatchSendMessage({
                accountId,
                toWxid: opts.to,
                type,
                content: mediaUrl,
                fileName, // v1.3.47: 传 fileName 给 dispatchSendMessage → vendor sendFile(toWxid, mediaUrl, fileName)
            });
            return {
                ok: r.ok, error: r.error,
                msgId: r.msgId, newMsgId: r.newMsgId, createTime: r.createTime,
                // v1.3.46 + 2026-09-28 identity 字段 (契约必填 channel/messageId):
                channel: CHANNEL_ID,
                messageId: r.newMsgId ?? (r.msgId != null ? String(r.msgId) : ""),
                chatId: opts.to,
                roomId: opts.to.includes("@chatroom") ? opts.to : undefined,
            };
        },
    }, wppOutboundLegacyApi), // ← 合回非契约的 outbound.sendImage (见上方 S8 说明)
    // ============================================================
    // v1.3.45 MESSAGING-TARGET-RESOLVER (2026-08-12 接总立 P1,
    //   修复 cron/AI 调 message 工具 + attachments type=image → framework 报
    //   "Unknown target xxxxxxxx@chatroom for WeChatPadPro")
    //
    // 根因 SSOT (framework target-normalization-Cp3RZ0Yv.js):
    //   1. framework resolveNormalizedTargetInput 调 plugin.messaging?.normalizeTarget
    //      → WPP 没定义 → fallback 到 normalizeOptionalString (trim)
    //   2. framework looksLikeTargetId 默认规则: 只识别 channel:/group:/user: 前缀,
    //      @开头 但仅 @thread 格式 (e.g. 123@thread), +86xxx 数字 ID
    //      → "xxxxxxxx@chatroom" 不命中任何一条 (chatroom 后缀不在框架默认白名单)
    //      → looksLikeTargetId 返 false → framework 不调 plugin resolver
    //      → framework 直接抛 unknownTargetError("Unknown target X for WeChatPadPro")
    //
    // 实证:
    //   - 8-12 09:05 09:05 cron session 调 message 工具带 attachments type=image
    //     → 同样错, AI 才降级用 sendFile (变成文件下载卡片)
    //   - 8-12 09:33 main agent 调 message 工具带 attachments type=image
    //     → 同样错, owner 上报 (本次会话)
    //
    // 修复: 仿 GeWe v1.4.4 范式 (gewe-multi-agent/src/index.ts:channelPlugin.messaging),
    //   在 wppChannelPlugin 加 messaging 字段:
    //     - targetResolver.resolveTarget: 接收任何微信 ID/wxid/groupID, 直接 to: input
    //     - targetResolver.looksLikeId: 识别 @chatroom 后缀 / wxid_xxx / 数字+@chatroom
    //
    // 不动现有 outbound (v1.3.43 + v1.3.44 保持)
    // 不动现有 gateway/config/meta/capabilities (历史路径)
    messaging: {
        targetResolver: {
            hint: "WeChat wxid (e.g. wxid_xxx / xxxxxxxx@chatroom)",
            /**
             * 接收任意微信目标格式, 直接返回 (后续 plugin.outbound 知道怎么发).
             * 框架会调 resolveTarget 后再用返回值 (.to) 去调 outbound.sendText / sendImage / sendMedia.
             */
            async resolveTarget({ input }) {
                const trimmed = String(input ?? "").trim();
                if (!trimmed)
                    return null;
                // 不解析 (转发给 plugin.outbound.* 统一处理)
                return { to: trimmed, kind: "channel", source: "normalized" };
            },
            /**
             * 识别 input 是不是像 wxid/群 ID:
             *   - 包含 @chatroom / @thread 后缀 → 群
             *   - wxid_ 开头 → wxid
             *   - q + 数字 (老板主号 / 营销号常见) → wxid
             *   - 纯字母数字 (>=6 位) → wxid
             */
            looksLikeId(rawInput, normalizedInput) {
                const s = (normalizedInput ?? rawInput ?? "").trim();
                if (!s)
                    return false;
                if (s.includes("@chatroom"))
                    return true;
                if (s.includes("@thread"))
                    return true;
                if (s.startsWith("wxid_"))
                    return true;
                if (/^q\d{6,}$/.test(s))
                    return true;
                if (/^[a-z][a-z0-9_]{5,}$/i.test(s))
                    return true;
                return false;
            },
        },
    },
    // OpenClaw channel config helpers (UI/诊断用; helper* 是 config-helpers.ts 版本, 避免与 config.ts 命名冲突)
    config: {
        listAccountIds: helperListAccountIds,
        resolveAccount,
        defaultAccountId,
        isConfigured: helperIsConfigured,
        unconfiguredReason,
        describeAccount,
    },
    // OpenClaw channel meta (UI / 文档 / 启动向导显示)
    meta: {
        id: CHANNEL_ID,
        label: "WeChatPadPro",
        selectionLabel: "WeChatPadPro (微信 Pad 协议 v1.0)",
        docsPath: `/channels/${CHANNEL_ID}`,
        docsLabel: "WeChatPadPro 文档",
        blurb: "WeChatPadPro (微信 Pad 协议 HTTP API) OpenClaw channel plugin. AccountRegistry class 多账号管理.",
        aliases: ["wpp", "wechatpadpro"],
        quickstartAllowFrom: true,
    },
    // OpenClaw channel capabilities (路由决策 feature flags)
    capabilities: {
        chatTypes: ["direct", "group"],
        reactions: false,
        threads: false,
        media: true, // 图片/语音/视频支持
        nativeCommands: false,
        blockStreaming: false,
    },
    // ============================================================
    // v1.5.5 CHANNEL-UI-RELOAD (2026-09-10 老板: Channel 页保存 → 即时热生效不掉线)
    //
    // 网关 config-reload-plan 按**插件自声明**的 reload 规则决定保存后重启范围:
    //   - 只声明 noopPrefixes(不声明 configPrefixes!) → channels.wechatpadpro 改动计划 kind="none"
    //     → 网关对该路径**完全不重启 channel runtime**, 微信连接不掉、网关不重启。
    //     唯一 applier = channel-ui-bridge 的 fs.watch openclaw.json → merge accounts/<id>.json
    //     → 既有 watchAccountConfigs 热载引擎 (零重连)。
    //   - 绝不可再叠加 configPrefixes: 同前缀时 configPrefixes(热=重启该 channel)排序在 noop 前获胜,
    //     会把编辑变回整 channel 重启 (=掉线)。
    //   - 不用 accountScopedRestart: extractAccountIdFromPath 对 accountId="default" 返回 null
    //     (特判整 channel 重启), default 账号无法被账号级重启隔离。
    // 2026-09-27 OPENCLAW-STATUS: 接入 OpenClaw 2026.9.6 的 status 契约
    //   背景: 审阅发现插件仅实现 ChannelPlugin 必填 4 项 + 8 个可选项 (共 35 可选;
    //         数字实测自 openclaw 2026.9.6 的 types.plugin-*.d.ts。已实现的 8 项:
    //         reload/outbound/status/gateway/doctor/messaging/directory/agentTools),
    //         status 缺失 -> openclaw status 看不到本 channel 的账号健康度。
    //   数据源: AccountRegistry (get/listIds) + WppAccountState (vendorAuthed/selfWxid/ws/webhook)。
    //   字段语义对齐 ChannelAccountSnapshot (见 OpenClaw types.core)。
    status: {
        defaultRuntime: {
            accountId: "default",
            configured: false,
            running: false,
            connected: false,
        },
        buildAccountSnapshot: ({ account }) => {
            const accountId = account?.accountId ?? "";
            const st = getDefaultAccountRegistry().get(accountId);
            if (!st) {
                return {
                    accountId,
                    configured: false,
                    running: false,
                    connected: false,
                    statusState: "stopped",
                };
            }
            const wsUp = Boolean(st.wsClient);
            const webhookUp = Boolean(st.webhookServer);
            const connected = wsUp && webhookUp;
            return {
                accountId,
                name: st.selfWxid || accountId,
                enabled: true,
                configured: true,
                running: true,
                connected,
                statusState: connected ? "connected" : "degraded",
                lifecycle: connected ? "ready" : "recovering",
                lastError: !st.vendorAuthed
                    ? "vendor authcode 未通过"
                    : connected ? null : "ws/webhook 未就绪",
            };
        },
        buildChannelSummary: () => {
            const reg = getDefaultAccountRegistry();
            const ids = reg.listIds();
            let connected = 0;
            for (const id of ids) {
                const st = reg.get(id);
                if (st && st.wsClient && st.webhookServer)
                    connected++;
            }
            return { accounts: ids.length, connected, degraded: ids.length - connected };
        },
    },
    // 2026-09-27 OPENCLAW-DIRECTORY: 接入 OpenClaw 2026.9.6 的 directory 契约
    //   背景: 承接 status/doctor 契约接入。directory 缺失 -> OpenClaw 无法识别
    //         本 channel 的身份(self)与群目录(listGroups), Agent 寻址/群枚举受限。
    //   数据源: AccountRegistry (selfWxid 由 setVendorAuth 写入) + 账号群配置 (groupAllowFrom/blacklistGroups)。
    //   本适配器为**只读** (仅 self / listGroups 两个方法), 不改任何状态。
    directory: {
        // 我是谁: 返回本账号的 wxid 身份。Agent 需要知道自己绑的是哪个微信号。
        self: async ({ accountId }) => {
            const reg = getDefaultAccountRegistry();
            const id = accountId || reg.listIds()[0];
            if (!id)
                return null;
            const st = reg.get(id);
            if (!st)
                return null;
            const wxid = st.selfWxid || "";
            if (!wxid)
                return null; // 未登录/vendor 未鉴权 -> 无身份可报, 返回 null 而非空条目
            return {
                kind: "user",
                id: wxid,
                name: st.config?.nickname || wxid,
                handle: wxid,
            };
        },
        // 群目录: 枚举本账号已知的群 (来源: 账号配置的群白名单 + 黑名单)。
        //   注意: 这是**配置已知**的群, 不是微信侧全量群列表
        //         (全量需 vendor API 拉取, 属运行期动作, 不放入只读目录适配器)。
        listGroups: async ({ accountId }) => {
            const reg = getDefaultAccountRegistry();
            const id = accountId || reg.listIds()[0];
            if (!id)
                return [];
            const st = reg.get(id);
            if (!st)
                return [];
            const cfg = st.config;
            if (!cfg)
                return [];
            const ids = new Set();
            for (const x of cfg.groupAllowFrom ?? [])
                if (x)
                    ids.add(x);
            for (const x of cfg.blacklistGroups ?? [])
                if (x)
                    ids.add(x);
            return [...ids].map((gid) => ({
                kind: "group",
                id: gid,
                name: gid, // 微信群名需 API 拉取; 此处用 id 保底, 不编造
            }));
        },
    },
    // 2026-09-27 OPENCLAW-DOCTOR: 接入 OpenClaw 2026.9.6 的 doctor 契约
    //   背景: 审阅发现插件只实现 ChannelPlugin 必填 4 项 + 8 个可选项 (共 35 可选;
    //         数字实测自 openclaw 2026.9.6 的 types.plugin-*.d.ts。已实现的 8 项:
    //         reload/outbound/status/gateway/doctor/messaging/directory/agentTools)。
    //         doctor 缺失 -> openclaw doctor 无法诊断本 channel 的配置问题,
    //         运维只能手写 ps/curl/grep 排查 (本会话调试时即如此)。
    //   本适配器是纯声明式的: 告诉框架「本 channel 的配置长什么样、边界在哪」,
    //   由框架自己的 doctor 引擎据此检查, 本插件不重复实现校验逻辑。
    doctor: {
        // 私聊白名单只认顶层 (channels.wechatpadpro.allowFrom)。
        //   本插件不读嵌套账号级 allowFrom 做 DM 准入 -> 声明 topOnly 让 doctor 不误报。
        dmAllowFromMode: "topOnly",
        // 群模型: 走 route (按 chatroom id 路由到群策略), 非 sender 粒度。
        groupModel: "route",
        // 顶层 allowFrom 为空时不回落到群白名单
        //   (本插件 DM 是 fail-closed: 空 = 拒绝所有, 见 configUiHints.allowFrom 说明)。
        groupAllowFromFallbackToAllowFrom: false,
        // 群白名单为空时给出警告 -- allowlist 策略下空名单 = 所有群被拒。
        warnOnEmptyGroupSenderAllowlist: true,
        // 历史配置迁移规则: 早期版本用过的旧键 -> 现行键。
        //   仅声明, 不自动修复 (repairConfig 才改配置); 由 openclaw doctor 提示用户。
        legacyConfigRules: [
            {
                path: ["channels", "wechatpadpro", "tokenKey"],
                message: "tokenKey 现应放 plugins.entries.wechatpadpro.config.tokenKey (或 WECHATPRO_TOKEN_KEY env); 顶层残留键不会被读取。",
            },
            {
                path: ["channels", "wechatpadpro", "groupPolicy"],
                message: "groupPolicy 现由 accounts/<id>.json 的 per-account 配置管理; openclaw.json 顶层值仅作 default 账号兜底。",
            },
        ],
        // 空白名单场景的补充警告 (在框架通用警告之外追加)。
        collectEmptyAllowlistExtraWarnings: (params) => {
            const out = [];
            if (params.dmPolicy === "allowlist") {
                out.push(params.prefix +
                    " wechatpadpro 私聊为 allowlist 且白名单为空 -> 所有 DM 将被拒绝 (fail-closed)。用 npm run setup 添加 allowFrom。");
            }
            return out;
        },
    },
    // 2026-09-28 契约对齐 (E7): 契约要求 `configPrefixes: string[]` 为**必填** (types.plugin-DWwKnMgs.d.ts:40-44)。
    //   补**空数组** = 不声明任何「热前缀」。framework 装配规则 (config-reload-plan-D9XO5ks7.mjs:308-322):
    //     prefixes: plugin.reload?.configPrefixes ?? []  → 空数组不产出任何 hot 规则
    //   ⇒ 与「完全不声明 configPrefixes」在 reload 计划上**逐位等价** (该 channel 只剩 noop 规则, kind: "none")
    //     → 网关对 channels.wechatpadpro 不重启 channel runtime, 微信连接不掉。
    //   ⚠️ 绝不可写成 ["channels.wechatpadpro"]: 等深同前缀时 hot 规则靠插入顺序排在 noop 前获胜
    //      → accountId===null ⇒ plan.restartChannels.add(plugin.id) ⇒ 整 channel 停启 ⇒ **微信掉线**。
    //   (复刻 config-reload-plan 的比较器 + 规则构造实测: absent / [] 均 kind:"none"; ["channels.wechatpadpro"] 为 kind:"hot")
    reload: {
        configPrefixes: [],
        noopPrefixes: ["channels.wechatpadpro"],
    },
    // OpenClaw channel gateway (start/stop 细粒度入口, 委托 startAccountById/registry.stop)
    gateway: {
        async startAccount(ctx) {
            log.info(`gateway.startAccount: accountId=${ctx.accountId}`);
            // 注入 channel runtime (否则 getChannelRuntime 返 NOOP → AI reply 链路断裂)
            if (ctx.channelRuntime) {
                setChannelRuntime(ctx.channelRuntime);
                log.info(`gateway.startAccount: channel runtime injected (accountId=${ctx.accountId})`);
            }
            else {
                log.warn(`gateway.startAccount: no channelRuntime provided (accountId=${ctx.accountId}) — AI replies will be NOOP`);
            }
            // 注入 OpenClaw 完整配置 (否则 dispatcher cfg:{} → model 解析失败 → gpt-5.5 → 401)
            if (ctx.cfg) {
                setOpenClawConfig(ctx.cfg);
                log.info(`gateway.startAccount: openclaw config injected (accountId=${ctx.accountId})`);
            }
            else {
                log.warn(`gateway.startAccount: no cfg provided (accountId=${ctx.accountId}) — model resolution may fallback to default`);
            }
            try {
                await startAccountById(ctx.accountId);
                log.info(`gateway.startAccount: started ${ctx.accountId}`);
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                log.error(`gateway.startAccount: failed ${ctx.accountId}: ${msg}`);
                return { ok: false, error: msg };
            }
            // keep-alive: 返回 pending promise 让 OpenClaw 认为 channel 一直运行 (否则误判 exited → restart-loop breaker)
            if (ctx.abortSignal) {
                const abortSignal = ctx.abortSignal;
                if (abortSignal.aborted) {
                    // 已 aborted: 直接返回, 不 keep-alive
                    return { ok: true };
                }
                await new Promise((resolve) => {
                    abortSignal.addEventListener("abort", () => {
                        log.info(`gateway.startAccount: abort signal received (accountId=${ctx.accountId}) — cleaning up`);
                        // 仿 stopAccount 语义: 单账号 stop (registry.stop)
                        const reg = getDefaultAccountRegistry();
                        if (reg.has(ctx.accountId)) {
                            reg.stop(ctx.accountId).catch((e) => {
                                log.warn(`gateway.startAccount: abort cleanup stop failed: ${formatErr(e)}`);
                            });
                        }
                        resolve();
                    });
                });
            }
            return { ok: true };
        },
        // 2026-09-28 契约对齐 (E8): 返回 `Promise<{ok,error?}>` → `Promise<void>`。
        //   依据: 契约 `stopAccount?: (ctx: ChannelGatewayContext) => Promise<void>` (types.adapters:503);
        //   框架唯一调用点 server-channels-D1JRZ19m.mjs:590-595 走
        //   `runPluginCleanup(stopAccount, …)`, 而 runPluginCleanup
        //   (plugin-instance-scope-C9hxyH_A.mjs:32-35) **丢弃返回值** —— 框架从不读 {ok,error}。
        //   故: 原来靠返回值传达的 "no-op / 失败" 改走 log (信息不减, 只是换成框架真会看的通道);
        //   且旧实现本就**不抛**(错误被 catch 后转成 {ok:false}), 新实现同样不抛 → 上层语义不变。
        async stopAccount(ctx) {
            log.info(`gateway.stopAccount: accountId=${ctx.accountId}`);
            const reg = getDefaultAccountRegistry();
            // registry.stop 对未知账号是 no-op + warn → 这里显式记录, 便于区分 "真停了" 与 "什么都没做"
            if (!reg.has(ctx.accountId)) {
                log.warn(`gateway.stopAccount: no-op — account not found: ${ctx.accountId}`);
                return;
            }
            try {
                await reg.stop(ctx.accountId);
                log.info(`gateway.stopAccount: stopped ${ctx.accountId}`);
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                log.error(`gateway.stopAccount: failed ${ctx.accountId}: ${msg}`);
            }
        },
    },
};
/**
 * wppChannelPlugin = 契约对象 (受 satisfies 检查) **合并** 历史 API 面。
 * 合并后运行时对象与改动前成员集合一致 (含 name/version/kind/start/stop/sendText/sendImage/
 * sendMessage/buildSessionKey + outbound.sendImage); 详见上方 S8 说明。
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