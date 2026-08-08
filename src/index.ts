// index.ts - WeChatPadPro OpenClaw Plugin v1.0 entry (Phase G 完工)
// 借鉴 本项目 v1.4.4: 拼装 channel plugin + plugin manifest + 用 AccountRegistry class 管理多账号
//
// v2026.7.1+ OpenClaw API 契约 (OpenClaw v2026.7.1+ 范式):
//   - default export = `plugin` manifest 对象
//     - 含 register(api) 方法
//     - register 内部调 api.registerChannel({ plugin: wppChannelPlugin })
//   - `wppChannelPlugin` 是 named export — 实际 channel 实现 (start/stop/sendText/sendImage)
//   - manifest 与 export 的 kind 不需一致; plugin manifest 无 kind 字段
//
// G3 重构: 所有内部代码走 AccountRegistry class API
//   - startAccountById 用 registry.start() 而非 startAccount()
//   - shutdown 用 registry.stopAll() 而非 stopAll()
//   - plugin.start 用 registry.listIds().length
//   - wppChannelPlugin.sendText/sendImage 静态 import dispatch/outbound + registry 校验

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
import { watchAccountConfigs } from "./config.js";
import type { WppTriggerConfig, WppAccountTriggerCtx } from "./inbound/triggers.js";

// v1.1.15 HOT-RELOAD (2026-08-08 接总立方案 A): 每账号 triggerConfig/triggerCtx 可变容器
// handler 闭包引用的是这里存的对象 (不是快照), 热重载时 update 字段 → 闭包自动读到新值
const runtimeTriggerConfigs = new Map<string, WppTriggerConfig>();
const runtimeTriggerCtxs = new Map<string, WppAccountTriggerCtx>();
import type {
  WppAccountState,
} from "./types.js";

// ============================================================
// Plugin lifecycle (startAccountById / startAllAccounts / shutdown)
// ============================================================

export async function startAccountById(
  accountId: string,
  agentId: string = "main",
): Promise<WppAccountState> {
  const globalCfg = await loadGlobalConfigAsync();
  const cfg = await loadAccountConfigAsync(accountId);
  if (!isConfigured(cfg)) {
    log.warn(`account not configured: ${accountId} (tokenKey empty)`);
    // 不 throw, 返回 partial state 让老板先看
  }

  // v1.1.16 P0-FIX (2026-08-08 16:00:38 老板主号污染事件): 强制 cfg.agent 必填
  // 根因: 之前 dispatcher.ts hardcode "main" + cfg.agent 没定义 → 25+ 联系人 fan-out
  // fix: cfg.agent 缺失 → throw (防 fallback 到 "main" 再次污染)
  if (!cfg.agent || typeof cfg.agent !== "string" || cfg.agent === "main") {
    throw new Error(`account.agent missing or invalid for ${accountId}: got "${cfg.agent}". v1.1.16 强制要求 accounts/<id>.json 必须有 agent 字段 (e.g. "wpp-wechat"), 且禁止 "main" (16:00:38 P0 污染事件后防护)`);
  }

  await initDbPool(globalCfg);

  const registry = getDefaultAccountRegistry();
  const state = await registry.start(accountId, cfg);

  // v1.1.13 P0-FIX-INBOUND (2026-08-08 13:35 接总立): createWppInboundHandler 接入 dispatcher
  // 根因: webhook-receiver / ws-client 老入口 handleWebhookPayload 不实际 dispatcher (Phase D stub)
  //   → vendor 推 webhook 200 OK 但没 create session, 没 AI reply
  // fix: 用 createWppInboundHandler 替代 handleWebhookPayload, 注入 dispatchInboundToOpenClaw onDispatch
  // v1.1.15 HOT-RELOAD: triggerConfig/triggerCtx 存 module 级 Map, 幂等复用同一对象引用
  //   → handler 闭包引用不变, 热重载 update 字段即刻生效 (不重建 handler)
  // v1.1.17 FULL-FIX: groupPolicy 非法值 fail-fast (防 "closed" 等非法值 silent accept)
  const VALID_GROUP_POLICIES = ["open", "disabled", "allowlist", "closed"];
  if (cfg.groupPolicy && !VALID_GROUP_POLICIES.includes(cfg.groupPolicy)) {
    throw new Error(`account.groupPolicy invalid for ${accountId}: "${cfg.groupPolicy}" (must be one of ${VALID_GROUP_POLICIES.join(",")})`);
  }
  if (!runtimeTriggerConfigs.has(accountId)) {
    runtimeTriggerConfigs.set(accountId, {
      ...defaultTriggerConfig(),
      requireAtMention: cfg.requireAtMention,
      // v1.1.17 FULL-FIX #2: groupPolicy 注入 triggerConfig (live 路径强制执行)
      groupPolicy: cfg.groupPolicy ?? "closed",
      groupAllowFrom: cfg.groupAllowFrom ?? [],
    });
  }
  const triggerConfig = runtimeTriggerConfigs.get(accountId)!;
  if (!runtimeTriggerCtxs.has(accountId)) {
    runtimeTriggerCtxs.set(accountId, {
      botWxid: cfg.selfWxid || null,
      // v1.1.18 NICKNAME-MENTION: 注入昵称供群 @ 检测 (e.g. @接晓银)
      // 配置驱动 + DEFAULT_BOT_NICKNAME 兜底 (仿 gewe, 不硬编码在代码)
      botNickname: cfg.nickname || DEFAULT_BOT_NICKNAME,
      // v1.1.16 P0-FIX: 注入 DM allowFrom 白名单 (从 accounts config 读)
      allowFrom: cfg.allowFrom ?? [],
    });
  }
  const triggerCtx = runtimeTriggerCtxs.get(accountId)!;
  const inboundHandler = createWppInboundHandler({
    accountId,
    triggerConfig,
    triggerCtx,
    enableDispatch: true,
    // v1.1.16 P0-FIX: allowFrom 从 cfg 传 (handler 透传给 trigger ctx)
    allowFrom: cfg.allowFrom ?? [],
    // v1.1.20 IMAGE-ENRICH: 图片下载+OSS 的 vendor ctx
    vendorCtx: {
      baseUrl: cfg.apiBaseUrl,
      tokenKey: cfg.tokenKey,
      authcode: cfg.authcode,
      accountId,
    },
    onDispatch: async (msg) => {
      await dispatchInboundToOpenClaw(msg, { channelRuntime: getChannelRuntime() });
    },
  });

  // v1.1.10 P0-5 (2026-08-05): idempotent early-return
  // 根因: registry.start 已 start 过 (ws + webhook 已 attached), 但 OpenClaw 健康监控 retry 时
  //   会再调 startAccountById. 老代码无视 state 状态继续 new WechatpadproWsClient + new WechatpadproWebhookServer
  //   → 第 2 个 WebhookServer 尝试 bind 同一端口 → EADDRINUSE.
  //   + 第 2 个 WsClient 创建 → 双重长连接, vendor 端用户连接数叠加.
  // fix: state.wsClient + state.webhookServer 都 attached → 完全幂等 early-return
  //
  // v1.1.10 P0-R1 (2026-08-08): race condition 修复
  // 根因: P0-5 只在 state.wsClient && state.webhookServer 都 attached 才 return.
  //   但 wsClient 是 `await ws.start()` 之后才 attach 的 (异步窗口期),
  //   第二次并发调用进来时 state.wsClient 还是 undefined → 跳过 early-return
  //   → 又 new 一个 WechatpadproWsClient (第 2 个 ws-client + 第 2 个 ws 连接).
  //   vendor 端观察到 用户连接数=2, openclaw journal 只有 1 个 ws connecting.
  // fix: 任一 attached 即视为已开始创建 (in-flight race safe early-return)
  if (state.wsClient || state.webhookServer) {
    log.info(`account partially/fully started (in-flight race safe return): ${accountId} ws=${!!state.wsClient} webhook=${!!state.webhookServer}`);
    return state;
  }

  if (cfg.authcode && !state.wsClient) {
    // v1.1.11 P0-N1: ws-client 现在持有 apiClient + accountId, vendor 推送时调 /Msg/Sync 拉消息
    const ws = new WechatpadproWsClient(cfg.wsUrl, cfg.authcode, {
      apiClient: state.apiClient,
      accountId,
      onInboundMessage: async (msg) => {
        // v1.1.13: 用共享 inboundHandler (debouncer + 4-way trigger + dispatch)
        await inboundHandler.handle(msg.raw as Record<string, unknown>);
      },
    });
    await ws.start();
    state.attachWsClient(ws);
  } else if (!cfg.authcode) {
    log.warn(`ws client skipped (no authcode): ${accountId}`);
  }

  if (!state.webhookServer) {
    // v1.1.15 BUSINESS-CB (2026-08-08 接总立方案 B): 双 path 分发
    //   1. webhookPath = 普通 /Webhook/Set 推送 (sync_message 事件, Data 空 → 触发 /Msg/Sync 拉取)
    //   2. webhookBusinessPath = 业务回调 /Webhook/Business/Set + StartAutoSync 推送 (完整消息, Data 含 Content/FromWxid/MsgId)
    // 根因: 老板 15:07 发消息, 只有 sync_message 被推, Data 空 → 消息永远不进来
    //   修了之后 vendor StartAutoSync 会推完整消息到 business path
    const webhookPath = cfg.webhookPath;
    const businessPath = cfg.webhookBusinessPath ?? `${cfg.webhookPath}/business`;
    const srv = new WechatpadproWebhookServer(
      cfg.webhookHost,
      cfg.webhookPort,
      [
        // 普通 webhook 路径: sync_message 事件 → 主动 /Msg/Sync 拉取
        {
          path: webhookPath,
          onMessage: async (payload) => {
            const raw = payload as Record<string, unknown>;
            if (raw.MessageType === "sync_message") {
              try {
                // v1.1.25 SYNC-STATE: webhook sync_message 同样用增量 Synckey (防全量重放)
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
            // 其他 vendor webhook 事件 (如 logout) → 走 handler 尝试 parse
            await inboundHandler.handle(payload);
          },
        },
        // 业务回调路径: 完整消息 (Data 内层) → 直接 handler (parser 已支持包装格式)
        {
          path: businessPath,
          onMessage: async (payload) => {
            log.info(`business callback: received payload (top keys=${Object.keys(payload ?? {}).join(",")})`);
            await inboundHandler.handle(payload);
          },
        },
      ],
      cfg.webhookSecret, // v1.0.1 P1-1: 可选 secret, 配了则启用 signature 验证
    );
    await srv.start();
    state.attachWebhookServer(srv);
  }

  // v1.1.12 (2026-08-08 接总立 P0 autoSetWebhook):
  // plugin 启动后, 自动调 vendor /Webhook/Set 把本账号 webhook URL 注册给 vendor
  // 失败 3 次 backoff (1s/3s/9s), warn 不阻塞 plugin 启动
  // 为什么要 auto: 多账号设计, 每账号 authcode 不同, 手动 set 容易漏
  // 为什么 3 次 backoff: vendor 心跳中, 短暂 401/timeout 常见, 3 次足够覆盖
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
            `setWebhook OK: account=${accountId} url=${url} authcode=${cfg.authcode} attempt=${attempt}/${maxAttempts}`,
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
      // v1.1.12 P1-1 (2026-08-08): periodic retry
      // 启动时 vendor 返 401/timeout 等临时错 → 每 5 分钟后台重试
      // 成功 → clearInterval; shutdown 时自动 clear
      // 为什么 5 分钟: vendor 心跳同间隔, 不过频不漏掉
      // 跟 startAccountById 现有的 3 次 backoff 不同: 那是启动紧接重试 (1s/3s/9s), 这里是后台每 5 分钟
      const PERIODIC_RETRY_MS = 5 * 60 * 1000;
      const timer = setInterval(async () => {
        try {
          const r = await state.apiClient.setWebhook(url, cfg.authcode);
          if (r.Code === 0) {
            log.info(
              `periodic setWebhook OK: account=${accountId} url=${url} authcode=${cfg.authcode} (timer stopped)`,
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

  // v1.1.15 BUSINESS-CB (2026-08-08 接总立): 自动配 vendor 业务回调 + StartAutoSync
  // 根因: /Webhook/Set 只推 sync_message 事件 (Data 空), 完整消息需 /Webhook/Business/Set + /Msg/StartAutoSync
  //   不设 Business 回调 → vendor 永不推完整消息, 老板发的消息永远是 sync_message 状态
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

  log.info(`account fully started: ${accountId} (agent=${agentId})`);
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
  await closeDb();
  log.info("plugin shutdown complete");
}

// ============================================================
// wppChannelPlugin — 实际 channel 实现 (named export)
// OpenClaw runtime 通过 register(api) 拿这个对象, 调它的 start/stop/sendText/sendImage
// ============================================================

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
    } catch (e) {
      log.error(`wppChannelPlugin.start failed: ${formatErr(e)}`);
      throw e;
    }
  },

  // v1.1.15 P0-1 complete-fix: 注入 agentTools (之前 162 工具从未暴露给 OpenClaw)
  // 范式: 仿 gewe-multi-agent/src/index.ts:251 agentTools: AGENT_TOOLS
  // OpenClaw 框架在 dist/agent-tools.before-tool-call-CDXSxqiL.js 读 plugin.agentTools
  // 配合 api/client.ts resolveCallCtx 空凭证兑底 → 工具真正可调
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

  // v3 OpenClaw channel config helpers (Phase G6 — 仿 OpenClaw v2026.7.1+)
  // 用途: OpenClaw 启动时 / UI / 诊断, 走这 6 helper 查账号状态
  // 注意: helperListAccountIds / helperIsConfigured 是 config-helpers.ts 的版本
  //       (与 config.ts 的 listAccountIds / isConfigured 功能相同, 但独立导出避免命名冲突)
  config: {
    listAccountIds: helperListAccountIds,
    resolveAccount,
    defaultAccountId,
    isConfigured: helperIsConfigured,
    unconfiguredReason,
    describeAccount,
  },

  // v3 OpenClaw channel meta (Phase G7 — UI display info)
  // 用途: OpenClaw 用这些字段在 UI / 文档 / 启动向导显示
  meta: {
    id: CHANNEL_ID,
    label: "WeChatPadPro",
    selectionLabel: "WeChatPadPro (微信 Pad 协议 v1.0)",
    docsPath: `/channels/${CHANNEL_ID}`,
    docsLabel: "WeChatPadPro 文档",
    blurb: "WeChatPadPro (微信 Pad 协议 HTTP API) OpenClaw channel plugin. v1.0 (Phase G 完工: 162 agent tools, 236 vendor endpoints, AccountRegistry class 多账号管理).",
    aliases: ["wpp", "wechatpadpro"],
    quickstartAllowFrom: true,
  },

  // v3 OpenClaw channel capabilities (Phase G7 — feature flags)
  // 用途: OpenClaw 路由决策 (能不能发图片/反应/thread 等)
  capabilities: {
    chatTypes: ["direct", "group"],
    reactions: false,
    threads: false,
    media: true, // 图片/语音/视频支持
    nativeCommands: false,
    blockStreaming: false,
  },

  // v3 OpenClaw channel gateway (Phase G7 — start/stop 入口)
  // 用途: OpenClaw 调 startAccount/stopAccount 走这里, 内部委托给 startAccountById/registry.stop
  // 注意: 比 start/stop 顶层方法更细粒度 (OpenClaw lifecycle 用), 顶层 start/stop 保留为整体生命周期
  gateway: {
    async startAccount(ctx: {
      accountId: string;
      abortSignal?: AbortSignal;
      account?: unknown;
      channelRuntime?: unknown;
      cfg?: unknown;
    }): Promise<{ ok: boolean; error?: string }> {
      log.info(`gateway.startAccount: accountId=${ctx.accountId}`);
      // P1-FIX-RUNTIME (2026-08-08 13:56): inject channel runtime so dispatcher.ts
      //   dispatchInboundToOpenClaw → onReply → sendAiReply 真正发出 AI reply
      //   之前 v1.1.13 修了 inbound dispatcher 但没 set runtime, getChannelRuntime() 返 NOOP_RUNTIME,
      //   AI reply 链路断裂, 老板主号手机看不到 AI reply.
      //   范式: 仿 gewe-multi-agent/src/index.ts:82 setGeweChannelRuntime(channelRuntime).
      if (ctx.channelRuntime) {
        setChannelRuntime(ctx.channelRuntime as Parameters<typeof setChannelRuntime>[0]);
        log.info(`gateway.startAccount: channel runtime injected (accountId=${ctx.accountId})`);
      } else {
        log.warn(`gateway.startAccount: no channelRuntime provided (accountId=${ctx.accountId}) — AI replies will be NOOP`);
      }
      // v1.1.18 CFG-DISPATCH (2026-08-08 18:05): inject OpenClaw full config so dispatcher
      //   dispatchReplyWithBufferedBlockDispatcher({ cfg }) 能解析 wpp-wechat 的 model 配置
      //   (minimax-portal/MiniMax-M2.7-highspeed)。之前 cfg: {} → model 解析失败 → gpt-5.5 → 401。
      //   范式: 仿 gewe-multi-agent/src/index.ts:61 setOpenClawConfig(cfg).
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

      // v1.1.17 P0-CRASHLOOP (2026-08-08 17:18 发现): keep-alive promise
      // 根因: startAccount resolve 后 OpenClaw 框架认为 channel 正常结束 → "channel exited without an error"
      //   → auto-restart 1/10 → 2/10 → ... 10/10 → restart-loop breaker 抑制 channel (插件停机)
      //   日志实证: 17:17:08-17:17:46 [wechatpadpro] [default] auto-restart attempt 4/10
      // 范式: 仿 gewe-multi-agent/dist/index.js:179 — 返回 new Promise, abort 时才 resolve + 清理
      //   保持 promise pending = channel 一直运行; abortSignal abort = OpenClaw 要停 → resolve + 清理
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
    "WeChatPadPro (微信 Pad 协议 HTTP API) OpenClaw channel plugin. v1.0 (Phase G 完工: 162 agent tools, 236 vendor endpoints 1:1 覆盖, AccountRegistry class 多账号管理). 共存模式与 本项目 并行.",
  configSchema: {
    type: "object",
    additionalProperties: true,
    properties: {},
  },

  /**
   * OpenClaw 启动时调 register(api), 我们用 api.registerChannel 注册 channel
   * v3 OpenClaw API (OpenClaw v2026.7.1+ 范式)
   */
  register(api: OpenClawPluginApi): void {
    log.info(`plugin.register: registering wppChannelPlugin (v${PLUGIN_VERSION})`);
    api.registerChannel({ plugin: wppChannelPlugin });
    log.info(`plugin.register: wppChannelPlugin registered (162 agent tools, 236 vendor endpoints)`);

    // v1.1.15 HOT-RELOAD (2026-08-08 接总立方案 A): 启动 watch accounts/ 目录
    // 改 accounts/<id>.json 运行时字段 (allowFrom/groupPolicy/requireAtMention) 零重启生效
    void watchAccountConfigs(async (accountId, newCfg) => {
      const registry = getDefaultAccountRegistry();
      const state = registry.get(accountId);
      if (!state) {
        // 账号未启动 (enabled=false 或还没 start) → 只清 cache, 下次启动自动用新配置
        log.info(`hot-reload: account ${accountId} not running, config cache refreshed only`);
        return;
      }
      // 1. 更新运行时 config (allowFrom/groupPolicy 等读点即刻生效)
      state.updateConfig(newCfg);
      // 2. 同步 triggerConfig (requireAtMention) — 闭包持有同一对象引用
      const tc = runtimeTriggerConfigs.get(accountId);
      if (tc) {
        tc.requireAtMention = newCfg.requireAtMention ?? tc.requireAtMention;
        // v1.1.17 FULL-FIX (P1-g): 热重载同步全部门禁字段 (之前只同步 3 个, keyword/msgType/quoteBot/blacklist 改后静默不生效)
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
        // v1.1.18 NICKNAME-MENTION: 热重载同步昵称 (配置驱动 + 默认兜底)
        tctx.botNickname = newCfg.nickname || DEFAULT_BOT_NICKNAME;
        // v1.1.16 P0-FIX: 热重载同步 allowFrom (防漏白名单改动后还在旧白名单)
        tctx.allowFrom = newCfg.allowFrom ?? [];
      }
      log.info(`hot-reload: account ${accountId} runtime config updated`);
    });
  },
};

// 默认导出 = plugin manifest (OpenClaw 加载入口)
export default plugin;
