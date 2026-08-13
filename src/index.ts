// index.ts - WeChatPadPro OpenClaw Plugin 入口
// v2026.7.1+ OpenClaw API 契约:
//   - default export = plugin manifest (含 register(api), 内部调 api.registerChannel)
//   - named export wppChannelPlugin = 实际 channel 实现 (start/stop/sendText/sendImage)
// 多账号管理走 AccountRegistry class

import { logObj as log, formatErr } from "./core/logger.js";
import { SetWebhookMetrics } from "./monitor/metrics.js";
import { CHANNEL_ID, PLUGIN_NAME, PLUGIN_VERSION, DEFAULT_BOT_NICKNAME } from "./core/constants.js";
import { loadGlobalConfigAsync, loadAccountConfigAsync, listAccountIds, isConfigured } from "./config.js";
import {
  listAccountIds as helperListAccountIds,
  resolveAccount,
  defaultAccountId,
  isConfigured as helperIsConfigured,
  unconfiguredReason,
  describeAccount,
} from "./config-helpers.js";
import { getDefaultAccountRegistry } from "./account-state.js";
import { closeDb, initDbPool, getSynckey, saveSynckey } from "./db.js";
import { WechatpadproWsClient } from "./ws-client.js";
import { WechatpadproWebhookServer } from "./webhook-receiver.js";
import { createWppInboundHandler } from "./inbound/handler.js";
import {
  dispatchInboundToOpenClaw,
  getChannelRuntime,
  setChannelRuntime,
  setOpenClawConfig,
} from "./dispatch/dispatcher.js";
import { defaultTriggerConfig } from "./inbound/triggers.js";
import { buildSessionKey } from "./session-key.js";
import { sendText as dispatchSendText, sendImage as dispatchSendImage } from "./dispatch/outbound.js";
import { AGENT_TOOLS } from "./dispatch/agent-tools/index.js";
import { watchAccountConfigs, watchGlobalConfig, appendAllowFrom, appendGroupAllowFrom, removeAllowFrom, removeGroupAllowFrom } from "./config.js";
import { redeemPairingCode, generatePairingCode, readPairingCode } from "./pairing-store.js";
import { resolveGlobalConfig, resolveSyncConfig, type ResolvedGlobalConfig } from "./core/runtime-config.js";
import type { WppTriggerConfig, WppAccountTriggerCtx } from "./inbound/triggers.js";
import type { WppInboundMessage } from "./types.js";
import type { WppSendMessageParams, WppSendType } from "./dispatch/send-message.js";

// 每账号 triggerConfig/triggerCtx 可变容器: handler 闭包持有对象引用, 热重载 update 字段即刻生效
const runtimeTriggerConfigs = new Map<string, WppTriggerConfig>();
const runtimeTriggerCtxs = new Map<string, WppAccountTriggerCtx>();
const runtimeInboundHandlers = new Map<string, ReturnType<typeof createWppInboundHandler>>();

function maskSecret(secret: string): string {
  if (!secret) return "(empty)";
  return secret.length <= 4 ? "****" : `${secret.slice(0, 4)}...${secret.slice(-2)}`;
}

// 全局解析后配置 (module-level 缓存, 避免重复 config.json I/O)
let _resolvedGlobalConfig: ResolvedGlobalConfig | null = null;

/** 获取已解析的全局配置 (未初始化时用默认值) */
export function getResolvedGlobalConfig(): ResolvedGlobalConfig {
  if (!_resolvedGlobalConfig) {
    return resolveGlobalConfig(undefined);
  }
  return _resolvedGlobalConfig;
}

/** 初始化全局配置 (startAccountById 时调, 也支持 reload) */
export function setGlobalRuntimeConfig(cfg: ResolvedGlobalConfig): void {
  _resolvedGlobalConfig = cfg;
}
import type {
  WppAccountState,
} from "./types.js";

// ============================================================
// index.ts 是唯一同时持有 registry + runtimeTriggerCtxs + sendText 的地方, 故在此 wire
// ============================================================

/**
 * 处理配对尝试: redeem → 写 allowFrom → 立即同步运行时 (不等 fs.watch debounce) → 回复。
 * 多账号安全: redeem 校验 accountId (per-account 文件); 写只落对应账号 json; 只同步该账号 runtime。
 */
async function handlePairingAttempt(
  accountId: string,
  msg: WppInboundMessage,
  code: string,
): Promise<void> {
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

/**
 * v1.3.40 FILEHELPER-COMMANDS (老板 2026-08-11): 文件传输助手命令注册表.
 *
 * 设计: 集中定义命令 (name/desc/example/handler), 新增命令只需加一条数组条目:
 *   - handleFileHelperCommand 遍历分发 (自动)
 *   - /help 自动遍历生成帮助列表 (自动兼容后续新增)
 * 非命令消息不处理 (parser 已过滤, 命令才进这里)
 */
interface FileHelperCommand {
  name: string;
  desc: string;
  example?: string;
  handler: (ctx: { accountId: string; toWxid: string; args: string[] }) => Promise<void>;
}

async function sendToFileHelper(accountId: string, toWxid: string, text: string): Promise<void> {
  await dispatchSendText(accountId, toWxid, text);
}

// v1.3.40 导出供测试 (验证命令注册表 + /help 兼容性)
export const FILEHELPER_COMMANDS: FileHelperCommand[] = [
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
      } else {
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
    example: "/addgroup 19908568237@chatroom",
    handler: async ({ accountId, toWxid, args }) => {
      const target = args[0]?.trim();
      if (!target) {
        await sendToFileHelper(accountId, toWxid, "用法: /addgroup <群ID>\n示例: /addgroup 19908568237@chatroom");
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
    example: "/delgroup 19908568237@chatroom",
    handler: async ({ accountId, toWxid, args }) => {
      const target = args[0]?.trim();
      if (!target) {
        await sendToFileHelper(accountId, toWxid, "用法: /delgroup <群ID>\n示例: /delgroup 19908568237@chatroom");
        return;
      }
      const r = await removeGroupAllowFrom(accountId, target);
      await sendToFileHelper(accountId, toWxid, r.ok
        ? `✅ 已移除群聊白名单: ${target}\n当前群聊白名单 (${r.groupAllowFrom.length}): ${r.groupAllowFrom.join(", ") || "(空)"}`
        : `❌ 移除失败: ${r.reason ?? "unknown"}`);
    },
  },
];

/** /help 自动遍历命令注册表生成 (新增命令自动出现在帮助里) */
export function buildHelpText(): string {
  const lines: string[] = ["📋 可用命令 (在文件传输助手操作):", ""];
  for (const c of FILEHELPER_COMMANDS) {
    const ex = c.example ? ` (示例: ${c.example})` : "";
    lines.push(`  ${c.name.padEnd(12)} ${c.desc}${ex}`);
  }
  lines.push("", "❓ 其它:");
  lines.push("  /help          显示本帮助");
  return lines.join("\n");
}

async function handleFileHelperCommand(
  accountId: string,
  _msg: WppInboundMessage,
  command: string,
): Promise<void> {
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
    } catch (e) {
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

export async function startAccountById(
  accountId: string,
  // agentId 参数保留兼容 (调用方传), 实际 runtime 读 cfg.agent
  _agentId: string = "main",
): Promise<WppAccountState> {
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
  if (!runtimeTriggerConfigs.has(accountId)) {
    runtimeTriggerConfigs.set(accountId, {
      ...defaultTriggerConfig(),
      requireAtMention: cfg.requireAtMention,
      groupPolicy: cfg.groupPolicy ?? "closed",
      groupAllowFrom: cfg.groupAllowFrom ?? [],
    });
  }
  const triggerConfig = runtimeTriggerConfigs.get(accountId)!;
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
  const triggerCtx = runtimeTriggerCtxs.get(accountId)!;
  // 首次创建, 后续复用同一实例 (ws/webhook 都喂同一 handler)
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
      // v1.3.39 FILEHELPER: 文件传输助手命令处理 (老板 2026-08-11)
      onFileHelperCommand: async ({ msg, command }) => {
        await handleFileHelperCommand(accountId, msg, command);
      },
      groupContextEnabled: cfg.groupContextEnabled === true,
    }));
  }
  const inboundHandler = runtimeInboundHandlers.get(accountId)!;

  // shutdown 时 flush 缓冲消息 (幂等: 只 attach 一次, 复用同 handler)
  state.attachInboundFlush(() => inboundHandler.flushAll());

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
    } else {
      const ws = new WechatpadproWsClient(cfg.wsUrl, cfg.authcode, {
        apiClient: state.apiClient,
        accountId,
        onInboundMessage: async (msg) => {
          await inboundHandler.handle(msg.raw as Record<string, unknown>);
        },
      });
      await ws.start();
      state.attachWsClient(ws);
    }
  } else if (!cfg.authcode) {
    log.warn(`ws client skipped (no authcode): ${accountId}`);
  }

  if (!state.webhookServer) {
    // 双 path: 普通 webhook (sync_message → /Msg/Sync 拉取) + 业务回调 (完整消息)
    const webhookPath = cfg.webhookPath;
    const businessPath = cfg.webhookBusinessPath ?? `${cfg.webhookPath}/business`;
    const srv = new WechatpadproWebhookServer(
      cfg.webhookHost,
      cfg.webhookPort,
      [
        // 普通 webhook: sync_message 事件 → 主动 /Msg/Sync 拉取 (增量 Synckey 防全量重放)
        {
          path: webhookPath,
          onMessage: async (payload) => {
            const raw = payload as Record<string, unknown>;
            if (raw.MessageType === "sync_message") {
              try {
                const prevSynckey = await getSynckey(accountId);
                const sync = await state.apiClient.call<{
                  CmdList?: { Count?: number; List?: unknown[] };
                  KeyBuf?: { buffer?: string; iLen?: number };
                }>("/Msg/Sync", { Scene: 0, Synckey: prevSynckey ?? "" });
                const newKey = sync?.Data?.KeyBuf?.buffer;
                if (newKey) {
                  await saveSynckey(accountId, newKey);
                }
                const list = sync?.Data?.CmdList?.List ?? [];
                log.info(`webhook sync_message: /Msg/Sync pulled ${list.length} message(s) synckey=${prevSynckey ? "incremental" : "full"}`);
                for (const item of list) {
                  await inboundHandler.handle(item as Record<string, unknown>);
                }
              } catch (e) {
                log.warn(`webhook sync_message /Msg/Sync failed: ${formatErr(e)}`);
              }
              return;
            }
            // 其他 vendor webhook 事件 (如 logout) → 尝试 parse
            await inboundHandler.handle(payload);
          },
        },
        // 业务回调: 完整消息 → 直接 handler
        {
          path: businessPath,
          onMessage: async (payload) => {
            log.info(`business callback: received payload (top keys=${Object.keys(payload ?? {}).join(",")})`);
            await inboundHandler.handle(payload);
          },
        },
      ],
      cfg.webhookSecret, // 可选 secret, 配了则启用 signature 验证
    );
    await srv.start();
    state.attachWebhookServer(srv);
  }

  // 自动注册 webhook URL 给 vendor (每账号 authcode 不同, 手动 set 易漏; 3 次 backoff 覆盖临时 401/timeout)
  if (cfg.autoSetWebhook && cfg.webhookPublicUrl && cfg.authcode) {
    const url = `${cfg.webhookPublicUrl.replace(/\/$/, "")}${cfg.webhookPath}`;
    const maxAttempts = cfg.setWebhookRetries ?? 3;
    let lastErr: unknown;
    let ok = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await state.apiClient.setWebhook(url, cfg.authcode);
        if (result.Code === 0) {
          log.info(
            `setWebhook OK: account=${accountId} url=${url} authcode=${maskSecret(cfg.authcode)} attempt=${attempt}/${maxAttempts}`,
          );
          SetWebhookMetrics.incSetWebhookOk();
          ok = true;
          break;
        }
        lastErr = `${result.CodeValue ?? "unknown"} (Code=${result.Code})`;
        log.warn(
          `setWebhook vendor returned non-zero: account=${accountId} attempt=${attempt}/${maxAttempts} err=${lastErr}`,
        );
        SetWebhookMetrics.incSetWebhookFail();
      } catch (e) {
        lastErr = e;
        log.warn(
          `setWebhook threw: account=${accountId} attempt=${attempt}/${maxAttempts} err=${formatErr(e)}`,
        );
      }
      if (attempt < maxAttempts) {
        // backoff: 1s, 3s, 9s, ...
        const delayMs = 1000 * Math.pow(3, attempt - 1);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    if (!ok) {
      log.warn(
        `setWebhook failed after ${maxAttempts} attempts: account=${accountId} url=${url} lastErr=${formatErr(lastErr)} (plugin continues, vendor 不会 push webhook, 但 /Msg/Sync polling 仍可用)`,
      );
      SetWebhookMetrics.incSetWebhookFail(); // 最后一次失败也 count
      // 启动失败后的后台周期性重试: 每 5 分钟 (匹配 vendor 心跳间隔), 成功即停
      const PERIODIC_RETRY_MS = 5 * 60 * 1000;
      const timer = setInterval(async () => {
        try {
          const r = await state.apiClient.setWebhook(url, cfg.authcode);
          if (r.Code === 0) {
            log.info(
              `periodic setWebhook OK: account=${accountId} url=${url} authcode=${maskSecret(cfg.authcode)} (timer stopped)`,
            );
            SetWebhookMetrics.incPeriodicOk();
            state.clearRetryTimer(timer);
          } else {
            log.warn(
              `periodic setWebhook failed: account=${accountId} Code=${r.Code} CodeValue=${r.CodeValue ?? "?"} (will retry in ${PERIODIC_RETRY_MS / 1000}s)`,
            );
            SetWebhookMetrics.incPeriodicFail();
          }
        } catch (e) {
          log.warn(
            `periodic setWebhook threw: account=${accountId} err=${formatErr(e)} (will retry in ${PERIODIC_RETRY_MS / 1000}s)`,
          );
          SetWebhookMetrics.incPeriodicFail();
        }
      }, PERIODIC_RETRY_MS);
      // NodeJS.Timeout.unref() 防止 timer 阻止 process exit (shutdown 时 clear 仍然有效)
      timer.unref();
      state.setRetryTimer(timer);
      log.info(
        `periodic setWebhook scheduled: account=${accountId} url=${url} interval=${PERIODIC_RETRY_MS / 1000}s`,
      );
    }
  } else if (cfg.autoSetWebhook && !cfg.webhookPublicUrl) {
    SetWebhookMetrics.incSkippedNoPublicUrl();
    log.warn(`autoSetWebhook enabled but webhookPublicUrl missing: account=${accountId} (跳过 setWebhook, vendor 不会 push webhook)`);
  } else if (cfg.autoSetWebhook && !cfg.authcode) {
    SetWebhookMetrics.incSkippedNoAuthcode();
    log.warn(`autoSetWebhook enabled but authcode missing: account=${accountId} (跳过 setWebhook)`);
  }

  // 自动配 vendor 业务回调 + StartAutoSync (完整消息推送; 只配 /Webhook/Set 只会推空 Data 的 sync_message)
  if (cfg.autoSetWebhook && cfg.webhookPublicUrl && cfg.authcode) {
    const businessPath = cfg.webhookBusinessPath ?? `${cfg.webhookPath}/business`;
    const syncMessageUrl = `${cfg.webhookPublicUrl.replace(/\/$/, "")}${businessPath}`;
    const logoutUrl = `${cfg.webhookPublicUrl.replace(/\/$/, "")}${businessPath}/logout`;
    try {
      const r = await state.apiClient.setBusinessWebhook(syncMessageUrl, logoutUrl);
      if (r.Code === 0) {
        log.info(`setBusinessWebhook OK: account=${accountId} syncMessageUrl=${syncMessageUrl}`);
      } else {
        log.warn(
          `setBusinessWebhook non-zero: account=${accountId} Code=${r.Code} CodeValue=${r.CodeValue ?? "?"}`,
        );
      }
      // StartAutoSync 启动轮询
      const s = await state.apiClient.startAutoSync(syncMessageUrl);
      if (s.Code === 0) {
        log.info(`startAutoSync OK: account=${accountId} vendor 会推完整消息到 ${syncMessageUrl}`);
      } else {
        log.warn(
          `startAutoSync non-zero: account=${accountId} Code=${s.Code} CodeValue=${s.CodeValue ?? "?"}`,
        );
      }
    } catch (e) {
      log.warn(`setBusinessWebhook/startAutoSync failed: account=${accountId} err=${formatErr(e)} (plugin continues, 消息可能不入库)`);
    }
  }

  // log 用 cfg.agent (运行时真正用的), 不用入参 agentId (避免 "default 为什么对应 main" 误解)
  log.info(
    `[WPP v${PLUGIN_VERSION} STARTUP] account=${accountId} ` +
    `webhook=${cfg.webhookHost}:${cfg.webhookPort}${cfg.webhookPath} ` +
    `autoSetWebhook=${cfg.autoSetWebhook !== false} ` +
    `mcpEnabled=${cfg.mcpEnabled !== false} ` +
    `groupContext=${cfg.groupContextEnabled === true ? "ON" : "OFF"} ` +
    `pairing=${cfg.dmPairingEnabled === true ? "ON" : "OFF"} ` +
    `agent=${cfg.agent} ` +
    `selfWxid=${cfg.selfWxid}`,
  );
  return state;
}

export async function startAllAccounts(agentId: string = "main"): Promise<WppAccountState[]> {
  const ids = await listAccountIds();
  log.info(`discovered ${ids.length} account(s): ${ids.join(", ")}`);
  const out: WppAccountState[] = [];
  for (const id of ids) {
    out.push(await startAccountById(id, agentId));
  }
  return out;
}

export async function shutdown(): Promise<void> {
  await getDefaultAccountRegistry().stopAll();
  try {
    const { disconnectMcpClient } = await import("./vendor-mcp-client.js");
    await disconnectMcpClient();
  } catch (e) {
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
export function inferFileNameForMedia(mediaUrl: string, explicitFileName?: string): string {
  const urlForBasename = (mediaUrl ?? "").split("?")[0] ?? "";
  const inferredFileName = urlForBasename.split("/").pop() ?? "";
  return explicitFileName ?? inferredFileName;
}

export const wppChannelPlugin = {
  id: CHANNEL_ID,
  name: PLUGIN_NAME,
  version: PLUGIN_VERSION,
  kind: "channel" as const, // channel 类型 (供 registerChannel 识别)

  async start(opts: { agentId?: string } = {}): Promise<void> {
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
    } catch (e) {
      log.error(`wppChannelPlugin.start failed: ${formatErr(e)}`);
      throw e;
    }
  },

  // 注入 agentTools 供 OpenClaw 框架读取 (配合 api/client.ts 空凭证兑底 → 工具真正可调)
  agentTools: AGENT_TOOLS,

  async stop(): Promise<void> {
    await shutdown();
  },

  // OpenClaw 调用入口: agent 要发消息时调用
  async sendText(accountId: string, toWxid: string, text: string, ats?: string[]) {
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

  async sendImage(accountId: string, toWxid: string, imageUrl: string) {
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
  async sendMessage(params: WppSendMessageParams) {
    const { sendMessage: dispatchSendMessage } = await import("./dispatch/send-message.js");
    return dispatchSendMessage(params);
  },

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
  outbound: {
    deliveryMode: "direct" as const,
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
    async sendText(opts: { accountId?: string; to: string; text: string; ats?: string[] }) {
      const r = await dispatchSendText(opts.accountId ?? "default", opts.to, opts.text, opts.ats);
      return {
        ok: r.ok, error: r.error,
        msgId: r.msgId, newMsgId: r.newMsgId, createTime: r.createTime,
        // v1.3.46 identity 字段:
        messageId: r.newMsgId ?? (r.msgId != null ? String(r.msgId) : undefined),
        chatId: opts.to,
        roomId: opts.to.includes("@chatroom") ? opts.to : undefined,
      };
    },
    async sendImage(opts: { accountId?: string; to: string; imageUrl: string }) {
      const r = await dispatchSendImage(opts.accountId ?? "default", opts.to, opts.imageUrl);
      return {
        ok: r.ok, error: r.error,
        msgId: r.msgId, newMsgId: r.newMsgId, createTime: r.createTime,
        messageId: r.newMsgId ?? (r.msgId != null ? String(r.msgId) : undefined),
        chatId: opts.to,
        roomId: opts.to.includes("@chatroom") ? opts.to : undefined,
      };
    },
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
    async sendMedia(opts: {
      cfg?: unknown;
      to: string;
      accountId?: string;
      text?: string;          // caption
      mediaUrl: string;
      mediaType?: string;
      fileName?: string;      // v1.3.47: 调用方可显式传 fileName (framework 当前不传, 仅 plugin internal 可传)
      mimeType?: string;
      replyToId?: string;
      threadId?: string;
      formatting?: unknown;
      audioAsVoice?: boolean;
      silent?: boolean;
    }) {
      const { sendMessage: dispatchSendMessage } = await import("./dispatch/send-message.js");
      const accountId = opts.accountId ?? "default";
      // 按 mediaType 优先; 没传则按 url 后缀推断
      const urlNoQuery = (opts.mediaUrl.split("?")[0] ?? "").toLowerCase();
      const inferred: WppSendType =
        /\.(jpg|jpeg|png|gif|webp|bmp|ico|tiff)$/i.test(urlNoQuery) ? "image" :
        /\.(mp4|mov|avi|mkv|webm|3gp)$/i.test(urlNoQuery) ? "video" :
        /\.(mp3|wav|ogg|flac|m4a|silk|amr)$/i.test(urlNoQuery) ? "voice" :
        "file";
      const type: WppSendType = (opts.mediaType as WppSendType | undefined) ?? inferred;
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
      const fileName = inferFileNameForMedia(opts.mediaUrl, opts.fileName);
      // 走 WPP 统一 sendMessage 入口 (v1.3.17 MESSAGE-UNIFY 已统一所有 type 路由 + persist + oss)
      const r = await dispatchSendMessage({
        accountId,
        toWxid: opts.to,
        type,
        content: opts.mediaUrl,
        fileName,  // v1.3.47: 传 fileName 给 dispatchSendMessage → vendor sendFile(toWxid, mediaUrl, fileName)
      });
      return {
        ok: r.ok, error: r.error,
        msgId: r.msgId, newMsgId: r.newMsgId, createTime: r.createTime,
        // v1.3.46 identity 字段 (仿 framework hasDeliveryResultIdentity 期望):
        messageId: r.newMsgId ?? (r.msgId != null ? String(r.msgId) : undefined),
        chatId: opts.to,
        roomId: opts.to.includes("@chatroom") ? opts.to : undefined,
      };
    },
  },

  // ============================================================
  // v1.3.45 MESSAGING-TARGET-RESOLVER (2026-08-12 接总立 P1,
  //   修复 cron/AI 调 message 工具 + attachments type=image → framework 报
  //   "Unknown target 53889526119@chatroom for WeChatPadPro")
  //
  // 根因 SSOT (framework target-normalization-Cp3RZ0Yv.js):
  //   1. framework resolveNormalizedTargetInput 调 plugin.messaging?.normalizeTarget
  //      → WPP 没定义 → fallback 到 normalizeOptionalString (trim)
  //   2. framework looksLikeTargetId 默认规则: 只识别 channel:/group:/user: 前缀,
  //      @开头 但仅 @thread 格式 (e.g. 123@thread), +86xxx 数字 ID
  //      → "53889526119@chatroom" 不命中任何一条 (chatroom 后缀不在框架默认白名单)
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
  //     - targetResolver.looksLikeId: 识别 @chatroom 后缀 / wxid_xxx / q139198824 / 数字+@chatroom
  //
  // 不动现有 outbound (v1.3.43 + v1.3.44 保持)
  // 不动现有 gateway/config/meta/capabilities (历史路径)
  messaging: {
    targetResolver: {
      hint: "WeChat wxid (e.g. q139198824 / wxid_xxx / 53889526119@chatroom)",
      /**
       * 接收任意微信目标格式, 直接返回 (后续 plugin.outbound 知道怎么发).
       * 框架会调 resolveTarget 后再用返回值 (.to) 去调 outbound.sendText / sendImage / sendMedia.
       */
      async resolveTarget({ input }: { input: string }) {
        const trimmed = String(input ?? "").trim();
        if (!trimmed) return null;
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
      looksLikeId(rawInput: string, normalizedInput?: string): boolean {
        const s = (normalizedInput ?? rawInput ?? "").trim();
        if (!s) return false;
        if (s.includes("@chatroom")) return true;
        if (s.includes("@thread")) return true;
        if (s.startsWith("wxid_")) return true;
        if (/^q\d{6,}$/.test(s)) return true;
        if (/^[a-z][a-z0-9_]{5,}$/i.test(s)) return true;
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

  // OpenClaw channel gateway (start/stop 细粒度入口, 委托 startAccountById/registry.stop)
  gateway: {
    async startAccount(ctx: {
      accountId: string;
      abortSignal?: AbortSignal;
      account?: unknown;
      channelRuntime?: unknown;
      cfg?: unknown;
    }): Promise<{ ok: boolean; error?: string }> {
      log.info(`gateway.startAccount: accountId=${ctx.accountId}`);
      // 注入 channel runtime (否则 getChannelRuntime 返 NOOP → AI reply 链路断裂)
      if (ctx.channelRuntime) {
        setChannelRuntime(ctx.channelRuntime as Parameters<typeof setChannelRuntime>[0]);
        log.info(`gateway.startAccount: channel runtime injected (accountId=${ctx.accountId})`);
      } else {
        log.warn(`gateway.startAccount: no channelRuntime provided (accountId=${ctx.accountId}) — AI replies will be NOOP`);
      }
      // 注入 OpenClaw 完整配置 (否则 dispatcher cfg:{} → model 解析失败 → gpt-5.5 → 401)
      if (ctx.cfg) {
        setOpenClawConfig(ctx.cfg);
        log.info(`gateway.startAccount: openclaw config injected (accountId=${ctx.accountId})`);
      } else {
        log.warn(`gateway.startAccount: no cfg provided (accountId=${ctx.accountId}) — model resolution may fallback to default`);
      }
      try {
        await startAccountById(ctx.accountId);
        log.info(`gateway.startAccount: started ${ctx.accountId}`);
      } catch (e) {
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
        await new Promise<void>((resolve) => {
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
    async stopAccount(ctx: { accountId: string }): Promise<{ ok: boolean; error?: string }> {
      log.info(`gateway.stopAccount: accountId=${ctx.accountId}`);
      const reg = getDefaultAccountRegistry();
      // 显式检查 — registry.stop 对未知账号是 no-op + warn, OpenClaw gateway
      // 需要明确知道 stop 是 no-op 还是真停了
      if (!reg.has(ctx.accountId)) {
        return { ok: false, error: `account not found: ${ctx.accountId}` };
      }
      try {
        await reg.stop(ctx.accountId);
        log.info(`gateway.stopAccount: stopped ${ctx.accountId}`);
        return { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.error(`gateway.stopAccount: failed ${ctx.accountId}: ${msg}`);
        return { ok: false, error: msg };
      }
    },
  },

  buildSessionKey,
};

// ============================================================
// plugin — OpenClaw v2026.7.1+ 要求的 manifest wrapper (default export)
// 范式: 仿 OpenClaw v2026.7.1+ plugin 对象
// ============================================================

/** OpenClaw runtime 提供的 API (最少需要 registerChannel) */
interface OpenClawPluginApi {
  registerChannel: (arg: { plugin: typeof wppChannelPlugin }) => void;
}

export const plugin = {
  id: CHANNEL_ID,
  name: PLUGIN_NAME,
  version: PLUGIN_VERSION,
  description:
    "WeChatPadPro (微信 Pad 协议 HTTP API) OpenClaw channel plugin. AccountRegistry class 多账号管理. 语音 silk 自动转码 + 失败降级发文件; 群接龙自动触发 AI 应景回复. 共存模式与 GeWe 插件并行.",
  configSchema: {
    type: "object",
    additionalProperties: true,
    properties: {},
  },

  /**
   * OpenClaw 启动时调 register(api), 我们用 api.registerChannel 注册 channel
   */
  register(api: OpenClawPluginApi): void {
    log.info(`plugin.register: registering wppChannelPlugin (v${PLUGIN_VERSION})`);
    api.registerChannel({ plugin: wppChannelPlugin });
    log.info(`plugin.register: wppChannelPlugin registered`);

    // watch accounts/ 目录: 改运行时字段 (allowFrom/groupPolicy/requireAtMention) 零重启生效
    void watchAccountConfigs(async (accountId, newCfg) => {
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
        if (newCfg.keywordTrigger !== undefined) tc.keywordTrigger = newCfg.keywordTrigger;
        if (newCfg.msgTypeTrigger !== undefined) tc.msgTypeTrigger = newCfg.msgTypeTrigger;
        if (newCfg.quoteBotTrigger !== undefined) tc.quoteBotTrigger = newCfg.quoteBotTrigger;
        if (newCfg.blacklistGroups !== undefined) tc.blacklistGroups = newCfg.blacklistGroups;
        if (newCfg.chatroomDebug !== undefined) tc.chatroomDebug = newCfg.chatroomDebug;
      }
      const tctx = runtimeTriggerCtxs.get(accountId);
      if (tctx) {
        tctx.botWxid = newCfg.selfWxid || null;
        tctx.botNickname = newCfg.nickname || DEFAULT_BOT_NICKNAME;
        tctx.allowFrom = newCfg.allowFrom ?? [];
        tctx.dmPairingEnabled = newCfg.dmPairingEnabled === true;
        tctx.groupContextEnabled = newCfg.groupContextEnabled === true;
        if (newCfg.groupContextWindow !== undefined) tctx.groupContextWindow = newCfg.groupContextWindow;
      }
      log.info(`hot-reload: account ${accountId} runtime config updated`);
    });
  },
};

// 默认导出 = plugin manifest (OpenClaw 加载入口)
export default plugin;
