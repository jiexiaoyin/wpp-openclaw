import { logObj as log, formatErr } from "./core/logger.js";
import { SetWebhookMetrics } from "./monitor/metrics.js";
import { CHANNEL_ID, PLUGIN_NAME, PLUGIN_VERSION, DEFAULT_BOT_NICKNAME } from "./core/constants.js";
import { loadGlobalConfigAsync, loadAccountConfigAsync, listAccountIds, isConfigured } from "./config.js";
import { listAccountIds as helperListAccountIds, resolveAccount, defaultAccountId, isConfigured as helperIsConfigured, unconfiguredReason, describeAccount, } from "./config-helpers.js";
import { getDefaultAccountRegistry } from "./account-state.js";
import { closeDb, initDbPool, getSynckey, saveSynckey } from "./db.js";
import { WechatpadproWsClient } from "./ws-client.js";
import { WechatpadproWebhookServer } from "./webhook-receiver.js";
import { createWppInboundHandler } from "./inbound/handler.js";
import { dispatchInboundToOpenClaw, getChannelRuntime, setChannelRuntime, setOpenClawConfig, } from "./dispatch/dispatcher.js";
import { defaultTriggerConfig } from "./inbound/triggers.js";
import { buildSessionKey } from "./session-key.js";
import { sendText as dispatchSendText, sendImage as dispatchSendImage } from "./dispatch/outbound.js";
import { AGENT_TOOLS } from "./dispatch/agent-tools/index.js";
import { getCurrentAccountId } from "./dispatch/account-context.js";
import { watchAccountConfigs, watchGlobalConfig, appendAllowFrom, appendGroupAllowFrom, removeAllowFrom, removeGroupAllowFrom, setAccountFlag } from "./config.js";
import { redeemPairingCode, generatePairingCode, readPairingCode } from "./pairing-store.js";
import { resolveGlobalConfig, resolveSyncConfig } from "./core/runtime-config.js";
const runtimeTriggerConfigs = new Map();
const runtimeTriggerCtxs = new Map();
const runtimeInboundHandlers = new Map();
let sharedWebhookServer = null;
let sharedWebhookServerPort = null;
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
let _resolvedGlobalConfig = null;
export function getResolvedGlobalConfig() {
    if (!_resolvedGlobalConfig) {
        return resolveGlobalConfig(undefined);
    }
    return _resolvedGlobalConfig;
}
export function setGlobalRuntimeConfig(cfg) {
    _resolvedGlobalConfig = cfg;
}
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
        name: "/adduser",
        desc: "授权私聊白名单",
        example: "/adduser wxid_abc123",
        handler: async ({ accountId, toWxid, args }) => {
            const target = args[0]?.trim();
            if (!target) {
                await sendToFileHelper(accountId, toWxid, "用法: /adduser <wxid>\n示例: /adduser wxid_abc123");
                return;
            }
            const r = await appendAllowFrom(accountId, target);
            await sendToFileHelper(accountId, toWxid, r.ok
                ? `✅ 已授权私聊白名单: ${target}\n当前私聊白名单 (${r.allowFrom.length}): ${r.allowFrom.join(", ")}`
                : `❌ 添加失败: ${r.reason ?? "unknown"}`);
        },
    },
    {
        name: "/deluser",
        desc: "移除私聊白名单",
        example: "/deluser wxid_abc123",
        handler: async ({ accountId, toWxid, args }) => {
            const target = args[0]?.trim();
            if (!target) {
                await sendToFileHelper(accountId, toWxid, "用法: /deluser <wxid>\n示例: /deluser wxid_abc123");
                return;
            }
            const r = await removeAllowFrom(accountId, target);
            await sendToFileHelper(accountId, toWxid, r.ok
                ? `✅ 已移除私聊白名单: ${target}\n当前私聊白名单 (${r.allowFrom.length}): ${r.allowFrom.join(", ") || "(空)"}`
                : `❌ 移除失败: ${r.reason ?? "unknown"}`);
        },
    },
    {
        name: "/addgroup",
        desc: "授权群聊白名单",
        example: "/addgroup xxxxxxxx@chatroom",
        handler: async ({ accountId, toWxid, args }) => {
            const target = args[0]?.trim();
            if (!target) {
                await sendToFileHelper(accountId, toWxid, "用法: /addgroup <群ID>\n示例: /addgroup xxxxxxxx@chatroom");
                return;
            }
            const r = await appendGroupAllowFrom(accountId, target);
            await sendToFileHelper(accountId, toWxid, r.ok
                ? `✅ 已授权群聊白名单: ${target}\n当前群聊白名单 (${r.groupAllowFrom.length}): ${r.groupAllowFrom.join(", ")}`
                : `❌ 添加失败: ${r.reason ?? "unknown"}`);
        },
    },
    {
        name: "/delgroup",
        desc: "移除群聊白名单",
        example: "/delgroup xxxxxxxx@chatroom",
        handler: async ({ accountId, toWxid, args }) => {
            const target = args[0]?.trim();
            if (!target) {
                await sendToFileHelper(accountId, toWxid, "用法: /delgroup <群ID>\n示例: /delgroup xxxxxxxx@chatroom");
                return;
            }
            const r = await removeGroupAllowFrom(accountId, target);
            await sendToFileHelper(accountId, toWxid, r.ok
                ? `✅ 已移除群聊白名单: ${target}\n当前群聊白名单 (${r.groupAllowFrom.length}): ${r.groupAllowFrom.join(", ") || "(空)"}`
                : `❌ 移除失败: ${r.reason ?? "unknown"}`);
        },
    },
    {
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
];
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
    const toWxid = "filehelper";
    const parts = command.trim().split(/\s+/);
    const cmd = (parts[0] ?? "").toLowerCase();
    const args = parts.slice(1);
    if (cmd === "/help") {
        await dispatchSendText(accountId, toWxid, buildHelpText());
        return;
    }
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
export async function startAccountById(accountId, _agentId = "main") {
    const globalCfg = await loadGlobalConfigAsync();
    setGlobalRuntimeConfig(resolveGlobalConfig(globalCfg));
    const cfg = await loadAccountConfigAsync(accountId);
    if (!isConfigured(cfg)) {
        log.warn(`account not configured: ${accountId} (tokenKey empty)`);
    }
    if (!cfg.agent || typeof cfg.agent !== "string" || cfg.agent === "main") {
        throw new Error(`account.agent missing or invalid for ${accountId}: got "${cfg.agent}". 必须配置 agent 字段 (e.g. "wpp-wechat"), 禁止 "main"`);
    }
    await initDbPool(globalCfg);
    const registry = getDefaultAccountRegistry();
    const state = await registry.start(accountId, cfg);
    const VALID_GROUP_POLICIES = ["open", "disabled", "allowlist", "closed"];
    if (cfg.groupPolicy && !VALID_GROUP_POLICIES.includes(cfg.groupPolicy)) {
        throw new Error(`account.groupPolicy invalid for ${accountId}: "${cfg.groupPolicy}" (must be one of ${VALID_GROUP_POLICIES.join(",")})`);
    }
    if (!runtimeTriggerConfigs.has(accountId)) {
        runtimeTriggerConfigs.set(accountId, {
            ...defaultTriggerConfig(),
            requireAtMention: cfg.requireAtMention,
            groupPolicy: cfg.groupPolicy ?? "closed",
            groupAllowFrom: cfg.groupAllowFrom ?? [],
            heartflow: cfg.heartflow,
        });
    }
    const triggerConfig = runtimeTriggerConfigs.get(accountId);
    if (!runtimeTriggerCtxs.has(accountId)) {
        runtimeTriggerCtxs.set(accountId, {
            botWxid: cfg.selfWxid || null,
            botNickname: cfg.nickname || DEFAULT_BOT_NICKNAME,
            allowFrom: cfg.allowFrom ?? [],
            dmPairingEnabled: cfg.dmPairingEnabled === true,
            groupContextEnabled: cfg.groupContextEnabled === true,
            groupContextWindow: cfg.groupContextWindow,
        });
    }
    const triggerCtx = runtimeTriggerCtxs.get(accountId);
    if (!runtimeInboundHandlers.has(accountId)) {
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
            onFileHelperCommand: async ({ msg, command }) => {
                await handleFileHelperCommand(accountId, msg, command);
            },
            groupContextEnabled: cfg.groupContextEnabled === true,
            heartflow: cfg.heartflow,
            botNickname: cfg.nickname,
        }));
    }
    const inboundHandler = runtimeInboundHandlers.get(accountId);
    state.attachInboundFlush(() => inboundHandler.flushAll());
    if (state.wsClient || state.webhookServer) {
        log.info(`account partially/fully started (in-flight race safe return): ${accountId} ws=${!!state.wsClient} webhook=${!!state.webhookServer}`);
        return state;
    }
    const syncConfig = resolveSyncConfig(cfg);
    if (cfg.authcode && !state.wsClient) {
        if (!syncConfig.enableWsClient) {
            log.info(`ws client disabled by config (v1.1.41 WS-DEGRADE): accountId=${accountId}`);
        }
        else {
            const ws = new WechatpadproWsClient(cfg.wsUrl, cfg.authcode, {
                apiClient: state.apiClient,
                accountId,
                onInboundMessage: async (msg) => {
                    await inboundHandler.handle(msg.raw);
                },
            });
            await ws.start();
            state.attachWsClient(ws);
        }
    }
    else if (!cfg.authcode) {
        log.warn(`ws client skipped (no authcode): ${accountId}`);
    }
    const { webhookPath, businessPath } = deriveWebhookPaths(cfg);
    if (!state.webhookServer) {
        const srv = sharedWebhookServer ?? new WechatpadproWebhookServer(cfg.webhookHost, cfg.webhookPort, [], cfg.webhookSecret);
        if (!sharedWebhookServer) {
            sharedWebhookServer = srv;
            sharedWebhookServerPort = cfg.webhookPort;
            await srv.start();
        }
        else {
            log.info(`[WPP v1.3.61] reuse shared webhook server port=${sharedWebhookServerPort} (account=${accountId} shares port)`);
        }
        srv.addPath(webhookPath, async (payload) => {
            const raw = payload;
            if (raw.MessageType === "sync_message") {
                try {
                    const prevSynckey = await getSynckey(accountId);
                    const sync = await state.apiClient.call("/Msg/Sync", { Scene: 0, Synckey: prevSynckey ?? "" });
                    const newKey = sync?.Data?.KeyBuf?.buffer;
                    if (newKey) {
                        await saveSynckey(accountId, newKey);
                    }
                    const list = sync?.Data?.CmdList?.List ?? [];
                    log.info(`webhook sync_message: /Msg/Sync pulled ${list.length} message(s) synckey=${prevSynckey ? "incremental" : "full"}`);
                    for (const item of list) {
                        await inboundHandler.handle(item);
                    }
                }
                catch (e) {
                    log.warn(`webhook sync_message /Msg/Sync failed: ${formatErr(e)}`);
                }
                return;
            }
            await inboundHandler.handle(payload);
        });
        srv.addPath(businessPath, async (payload) => {
            log.info(`business callback: received payload (top keys=${Object.keys(payload ?? {}).join(",")})`);
            await inboundHandler.handle(payload);
        });
        state.attachWebhookServer(srv, [webhookPath, businessPath]);
    }
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
                const delayMs = 1000 * Math.pow(3, attempt - 1);
                await new Promise((r) => setTimeout(r, delayMs));
            }
        }
        if (!ok) {
            log.warn(`setWebhook failed after ${maxAttempts} attempts: account=${accountId} url=${url} lastErr=${formatErr(lastErr)} (plugin continues, vendor 不会 push webhook, 但 /Msg/Sync polling 仍可用)`);
            SetWebhookMetrics.incSetWebhookFail();
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
    if (cfg.autoSetWebhook && cfg.webhookPublicUrl && cfg.authcode) {
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
export function inferFileNameForMedia(mediaUrl, explicitFileName) {
    const urlForBasename = (mediaUrl ?? "").split("?")[0] ?? "";
    const inferredFileName = urlForBasename.split("/").pop() ?? "";
    return explicitFileName ?? inferredFileName;
}
export const wppChannelPlugin = {
    id: CHANNEL_ID,
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    kind: "channel",
    async start(opts = {}) {
        log.info(`wppChannelPlugin.start: agent=${opts.agentId ?? "main"}`);
        try {
            await startAllAccounts(opts.agentId ?? "main");
            log.info(`wppChannelPlugin.started: ${getDefaultAccountRegistry().size()} account(s)`);
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
    agentTools: AGENT_TOOLS,
    async stop() {
        await shutdown();
    },
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
    async sendMessage(params) {
        const { sendMessage: dispatchSendMessage } = await import("./dispatch/send-message.js");
        return dispatchSendMessage(params);
    },
    outbound: {
        deliveryMode: "direct",
        async sendText(opts) {
            const r = await dispatchSendText(resolveOutboundAccount(opts.accountId, "sendText"), opts.to, opts.text, opts.ats);
            return {
                ok: r.ok, error: r.error,
                msgId: r.msgId, newMsgId: r.newMsgId, createTime: r.createTime,
                messageId: r.newMsgId ?? (r.msgId != null ? String(r.msgId) : undefined),
                chatId: opts.to,
                roomId: opts.to.includes("@chatroom") ? opts.to : undefined,
            };
        },
        async sendImage(opts) {
            const r = await dispatchSendImage(resolveOutboundAccount(opts.accountId, "sendImage"), opts.to, opts.imageUrl);
            return {
                ok: r.ok, error: r.error,
                msgId: r.msgId, newMsgId: r.newMsgId, createTime: r.createTime,
                messageId: r.newMsgId ?? (r.msgId != null ? String(r.msgId) : undefined),
                chatId: opts.to,
                roomId: opts.to.includes("@chatroom") ? opts.to : undefined,
            };
        },
        async sendMedia(opts) {
            const { sendMessage: dispatchSendMessage } = await import("./dispatch/send-message.js");
            const accountId = resolveOutboundAccount(opts.accountId, "sendMedia");
            const urlNoQuery = (opts.mediaUrl.split("?")[0] ?? "").toLowerCase();
            const inferred = /\.(jpg|jpeg|png|gif|webp|bmp|ico|tiff)$/i.test(urlNoQuery) ? "image" :
                /\.(mp4|mov|avi|mkv|webm|3gp)$/i.test(urlNoQuery) ? "video" :
                    /\.(mp3|wav|ogg|flac|m4a|silk|amr)$/i.test(urlNoQuery) ? "voice" :
                        "file";
            const type = opts.mediaType ?? inferred;
            const fileName = inferFileNameForMedia(opts.mediaUrl, opts.fileName);
            const r = await dispatchSendMessage({
                accountId,
                toWxid: opts.to,
                type,
                content: opts.mediaUrl,
                fileName,
            });
            return {
                ok: r.ok, error: r.error,
                msgId: r.msgId, newMsgId: r.newMsgId, createTime: r.createTime,
                messageId: r.newMsgId ?? (r.msgId != null ? String(r.msgId) : undefined),
                chatId: opts.to,
                roomId: opts.to.includes("@chatroom") ? opts.to : undefined,
            };
        },
    },
    messaging: {
        targetResolver: {
            hint: "WeChat wxid (e.g. wxid_xxx / xxxxxxxx@chatroom)",
            async resolveTarget({ input }) {
                const trimmed = String(input ?? "").trim();
                if (!trimmed)
                    return null;
                return { to: trimmed, kind: "channel", source: "normalized" };
            },
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
    config: {
        listAccountIds: helperListAccountIds,
        resolveAccount,
        defaultAccountId,
        isConfigured: helperIsConfigured,
        unconfiguredReason,
        describeAccount,
    },
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
    capabilities: {
        chatTypes: ["direct", "group"],
        reactions: false,
        threads: false,
        media: true,
        nativeCommands: false,
        blockStreaming: false,
    },
    gateway: {
        async startAccount(ctx) {
            log.info(`gateway.startAccount: accountId=${ctx.accountId}`);
            if (ctx.channelRuntime) {
                setChannelRuntime(ctx.channelRuntime);
                log.info(`gateway.startAccount: channel runtime injected (accountId=${ctx.accountId})`);
            }
            else {
                log.warn(`gateway.startAccount: no channelRuntime provided (accountId=${ctx.accountId}) — AI replies will be NOOP`);
            }
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
            if (ctx.abortSignal) {
                const abortSignal = ctx.abortSignal;
                if (abortSignal.aborted) {
                    return { ok: true };
                }
                await new Promise((resolve) => {
                    abortSignal.addEventListener("abort", () => {
                        log.info(`gateway.startAccount: abort signal received (accountId=${ctx.accountId}) — cleaning up`);
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
        async stopAccount(ctx) {
            log.info(`gateway.stopAccount: accountId=${ctx.accountId}`);
            const reg = getDefaultAccountRegistry();
            if (!reg.has(ctx.accountId)) {
                return { ok: false, error: `account not found: ${ctx.accountId}` };
            }
            try {
                await reg.stop(ctx.accountId);
                log.info(`gateway.stopAccount: stopped ${ctx.accountId}`);
                return { ok: true };
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                log.error(`gateway.stopAccount: failed ${ctx.accountId}: ${msg}`);
                return { ok: false, error: msg };
            }
        },
    },
    buildSessionKey,
};
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
    configUiHints: {
        tokenKey: { label: "WeChatPadPro TokenKey", sensitive: true, help: "vendor 后台获取; 也可用 WECHATPRO_TOKEN_KEY env" },
        authcode: { label: "授权码 authcode", sensitive: true, help: "vendor 启动时生成; 也可用 WECHATPRO_AUTHCODE env" },
        apiBaseUrl: { label: "API Base URL", placeholder: "https://YOUR_VENDOR_HOST", help: "vendor HTTP API 地址" },
        wsUrl: { label: "WebSocket URL", placeholder: "wss://YOUR_VENDOR_HOST/ws/sync", help: "vendor WS 推送地址" },
        allowFrom: { label: "私聊白名单 (逗号分隔)", help: "空 = 拒绝所有 DM (fail-closed)" },
        groupPolicy: { label: "群聊策略", help: "open/disabled/allowlist/closed" },
        groupAllowFrom: { label: "群白名单 (逗号分隔, @chatroom)", help: "groupPolicy=allowlist 时用" },
        agent: { label: "OpenClaw agent id", help: "绑定 agent (如 wpp-wechat), 禁止 main" },
        webhookPort: { label: "webhook 端口", help: "默认 4398 (多账号共享)" },
    },
    register(api) {
        log.info(`plugin.register: registering wppChannelPlugin (v${PLUGIN_VERSION})`);
        api.registerChannel({ plugin: wppChannelPlugin });
        log.info(`plugin.register: wppChannelPlugin registered`);
        void watchAccountConfigs(async (accountId, newCfg) => {
            const registry = getDefaultAccountRegistry();
            const state = registry.get(accountId);
            if (!state) {
                log.info(`hot-reload: account ${accountId} not running, config cache refreshed only`);
                return;
            }
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
            log.info(`hot-reload: account ${accountId} runtime config updated`);
        });
    },
};
export default plugin;
