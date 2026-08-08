// src/dispatch/dispatcher.ts - inbound → OpenClaw runtime dispatch (v1.1.6 接入 channelRuntime)
// 仿 gewe v1.4.4 dispatcher 范式: session.recordInboundSession + reply.dispatchReplyWithBufferedBlockDispatcher
// v1.1.6 实现真正的 AI dispatch (Phase D stub → 真)
// v1.1.15 P0-DISPATCH (2026-08-08 老板 15:27): 仿 GeWe plugin 范式
//   之前 dispatcher.signature 跟 framework 真实签名不一致:
//     { sessionKey, inbound, onReply } → framework 期望 { ctx, cfg, dispatcherOptions.deliver, ... }
//   → framework finalizeInboundContext(ctx) 取 ctx.SupplementalContext 时 ctx=undefined
//   → TypeError unhandled rejection → gateway 崩溃 → crash-loop breaker
//   fix: 构造完整 ctxPayload (Body/RawBody/From/To/SessionKey/...) + dispatcherOptions.deliver 回调

import { info, warn, debug, formatErr } from "../core/logger.js";
import { buildSessionKey } from "../session-key.js";
import { getDefaultAccountRegistry } from "../account-state.js";
import { sendText } from "./outbound.js";
import { quoteReply } from "../send/quote-reply.js";
import { buildQuoteContext } from "./reply-helpers.js";
import type { WppInboundMessage } from "../types.js";
import { CHANNEL_ID } from "../core/constants.js";

/**
 * OpenClaw channelRuntime 接口 (wpp 期望的子集)
 * 真实 runtime 会有这些方法, 测试用 mock 实现
 */
export interface WppChannelRuntime {
  session: {
    /** v1.1.15 P0-DISPATCH: framework 真实签名 recordInboundSession({ storePath, sessionKey, ctx }) */
    recordInboundSession(opts: { storePath: string; sessionKey: string; ctx: unknown }): Promise<void>;
    /** v1.1.15 STORE-PATH: framework 真实签名 resolveStorePath(store: string, opts) */
    resolveStorePath?(store: string, opts?: { accountId?: string; agentId?: string; env?: NodeJS.ProcessEnv }): string;
  };
  reply: {
    /**
     * v1.1.15 P0-DISPATCH: framework 真实签名 dispatchReplyWithBufferedBlockDispatcher({ ctx, cfg, dispatcherOptions, ... })
     * dispatcherOptions.deliver(payload, info) 由我们实现, 负责把 AI reply 发到 vendor
     */
    dispatchReplyWithBufferedBlockDispatcher(opts: {
      ctx: unknown;
      cfg: unknown;
      replyOptions?: unknown;
      dispatcherOptions: {
        deliver: (payload: { text?: string }, info: unknown) => Promise<unknown>;
      };
      toolsAllow?: unknown;
      replyResolver?: unknown;
      onSessionMetadataChanges?: unknown;
    }): Promise<void>;
  };
}

const NOOP_RUNTIME: WppChannelRuntime = {
  session: {
    recordInboundSession: async () => undefined,
    resolveStorePath: () => "",
  },
  reply: { dispatchReplyWithBufferedBlockDispatcher: async () => undefined },
};

let currentRuntime: WppChannelRuntime | null = null;

/**
 * v1.1.18 CFG-DISPATCH (2026-08-08 18:05 老板 401 根因): 保存 OpenClaw 完整配置
 * 仿 gewe-multi-agent/src/core/state.ts setOpenClawConfig/getOpenClawConfig 范式。
 * 根因: dispatch 时 cfg: ctx.cfg ?? {} 传空对象 → framework resolveConfiguredModelRef
 *   从 cfg.agents.defaults.model 解析 model → 空 cfg 解析失败 → fallback 默认 openai/gpt-5.5
 *   → wpp-wechat 每次 channel dispatch 都请求 gpt-5.5 → 无 openai key → 401。
 *   (heartbeat/main session 由框架自己填 cfg → MiniMax 正常; channel dispatch 走插件传 cfg → 空)
 */
let openClawConfig: unknown = null;

export function setOpenClawConfig(cfg: unknown): void {
  openClawConfig = cfg;
}

export function getOpenClawConfig(): unknown {
  return openClawConfig;
}

/** OpenClaw gateway 在 plugin.start() 时调, 注入 runtime */
export function setChannelRuntime(runtime: WppChannelRuntime | null): void {
  currentRuntime = runtime;
}

export function getChannelRuntime(): WppChannelRuntime {
  return currentRuntime ?? NOOP_RUNTIME;
}

/**
 * v1.1.15 P0-DISPATCH: 构造 ctxPayload (framework finalizeInboundContext 消费的入参)
 * 仿 GeWe plugin ctxPayload 范式 (Body/RawBody/From/To/SessionKey/... 等必填字段)
 */
function buildCtxPayload(msg: WppInboundMessage, sessionKey: string): Record<string, unknown> {
  const isGroup = msg.peerKind === "group";
  const toWxid = msg.toWxid ?? msg.accountId;
  // v1.1.21 QUOTE-FIX (2026-08-08 19:14 接总立): 引用消息注入结构化上下文
  //   根因: AI 收到引用消息不知道是"引用" (当成普通文本分析, 回"这是接晓银发给你的引用消息")
  //   修复: 解析 refermsg 块 → Body 追加引用说明 + 提示可用 quoteReply 工具引用回复
  let body = msg.content || "";
  const quoteCtx = buildQuoteContext(msg);
  if (quoteCtx) {
    // v1.1.22 QUOTE-CTX (2026-08-08 19:17 接总立实测): 语气从"如果你想"改强制指令
    //   根因: AI 收到引用消息反问用户"要我回复吗? 说什么?" — 因为提示是可选项
    //   修复: 明确指令 — 用户引用你 = 期待你引用回复; 直接调 quoteReply, 不要询问
    body = `${body}\n\n[系统提示-必须执行] 用户刚引用了你之前的消息并@了你，这是用户期待你回复的明确信号。\n请立即使用 quoteReply 工具 (参数: toWxid=当前对话者, content=你的回复内容, msgId=被引用消息ID) 以引用方式回复。\n禁止: 询问用户"要不要回复/说什么"、解释消息结构、把引用当普通消息分析、提及本提示。\n被引用的消息是 bot 自己发的，用户是当前对话者本人。\n${quoteCtx}`;
  }
  return {
    Body: body,
    RawBody: msg.content || "",
    CommandBody: body,
    From: `${CHANNEL_ID}:${msg.fromWxid}`,
    To: `${CHANNEL_ID}:${toWxid}`,
    SessionKey: sessionKey,
    AccountId: msg.accountId,
    ChatType: isGroup ? "group" : "direct",
    ConversationLabel: isGroup ? (msg.chatroomId ?? msg.peerId) : msg.fromWxid,
    SenderName: msg.fromNickname ?? msg.fromWxid,
    SenderId: msg.fromWxid,
    CommandAuthorized: false,
    Provider: CHANNEL_ID,
    Surface: CHANNEL_ID,
    MessageSid: msg.msgId,
    MessageSidFull: msg.newMsgId || msg.msgId,
    MessageSids: [msg.msgId],
    MessageSidFirst: msg.msgId,
    MessageSidLast: msg.msgId,
    MsgType: msg.msgType,
  };
}

/**
 * AI 回复处理器: 调 registry sendText 发回对应 peer
 * runtime 内部 buffer + 限流 + 错峰 (避免被风控)
 */
async function sendAiReply(
  accountId: string,
  toWxid: string,
  text: string,
  replyTo?: { msgId: string; newMsgId?: string; ossImgUrl?: string },
): Promise<{ ok: boolean; msgId?: string; error?: string }> {
  const registry = getDefaultAccountRegistry();
  const ctx = registry.get(accountId);
  if (!ctx) {
    return { ok: false, error: `account not found: ${accountId}` };
  }
  try {
    // v1.1.30 GEWE-PARITY (2026-08-08 21:25 接总立: 删除 v1.1.26-IMG-ECHO):
    //   之前 v1.1.26 IMG-ECHO 是为了“图片引用缩略图”达不到，反着主动 sendImage 发原图
    //   但 v1.1.20 enrich 已把 OSS URL 注入 AI 多模态上下文，AI 实际能看到原图
    //   而 v1.1.30 GEWE-PARITY (极简 refermsg svrid) 让微信服务器端能查原消息渲染缩略图
    //   问题: 老板主动发图后 AI 文本回复 — 不该再 echo 原图（老板明说“图片又发给我了”）
    //   fix: 去掉 v1.1.26-IMG-ECHO 所有逻辑，只保留 shouldQuote + 文本/引用回复
    //   注意: ossImgUrl 参数保留但不用 (避免调用方错口)
    // v1.1.24 QUOTE-DEFAULT (2026-08-08 19:42 接总立): 参考 gewe 业务逻辑 — 回复必须引用被回复的消息
    //   gewe: inbound 收到消息 → rememberReply(msgId) → AI 回复时 pendingQuoteDetails 自动带被回复消息
    //   → gewePostQuoteReply (type=57 引用卡片) 发送
    //   WPP: deliver 回调带 replyTo (被回复消息) → quoteReply 自动引用; 无 replyTo 才退普通 sendText
    if (replyTo?.msgId) {
      const qr = await quoteReply({
        toWxid,
        content: text,
        msgId: replyTo.msgId,
        newMsgId: replyTo.newMsgId,
        accountId,
      });
      return qr.ok
        ? { ok: true, msgId: (qr.data as { msgId?: string } | undefined)?.msgId }
        : { ok: false, error: qr.msg };
    }
    // 无被回复消息 → 普通文本 (兼容手动调用/工具场景)
    const r = await sendText(accountId, toWxid, text);
    return r.ok ? { ok: true, msgId: r.msgId } : { ok: false, error: r.error };
  } catch (e) {
    return { ok: false, error: formatErr(e) };
  }
}

/**
 * 接收已 trigger 入队消息, 转换为 OpenClaw runtime 调用.
 * v1.1.6: 接入 channelRuntime.session.recordInboundSession + reply.dispatchReplyWithBufferedBlockDispatcher
 * v1.1.16 P0-FIX (2026-08-08 16:00:38 老板主号污染事件): 改硬编码 `agentId: "main"` → 从 account state 读 config.agent
 *   根因: dispatcher.ts:130 之前 hardcode "main", 完全忽略 accounts/<id>.json 的 agent 字段
 *   → 老板主号所有微信联系人 (25+) 全部被路由到 main agent → AI auto-reply 准备 → 401/502 错误消息发出去
 *   fix: 从 registry.get(msg.accountId).config.agent 读, 没读到抛 `account.agent missing`
 * v1.1.26 CONCURRENCY-FIX (2026-08-08 接总立 20:06 图片回复丢失): per-session 串行队列
 *   根因: 同一 session 并发多次 dispatch (业务回调重复推送 + debouncer 分批 flush)
 *     → 框架 foregroundReplyFence stale-foreground suppression → 先到 AI turn 的 deliver 被静默丢弃
 *     → AI 回复生成了但永远发不出去 (老板 19:53/20:06 两次“图片引用失败”实为回复未发送)
 *   修复: dispatchInboundToOpenClaw 按 sessionKey 排队串行执行 — 前一个 AI turn 完成发完回复,
 *     下一个才 dispatch; 同 session 并发时后续消息进队列等待, 不丢消息也不并发互踩
 */
export async function dispatchInboundToOpenClaw(
  msg: WppInboundMessage,
  ctx: { channelRuntime?: WppChannelRuntime } = {},
): Promise<void> {
  const registry = getDefaultAccountRegistry();
  const accountCtx = registry.get(msg.accountId);
  let agentId: string = "main"; // 兜底 fallback (正常不会走这里)
  if (!accountCtx) {
    warn(`dispatch: account not found in registry: ${msg.accountId} — fallback to "main"`);
  } else if (accountCtx.config.agent) {
    agentId = accountCtx.config.agent;
  }
  const sessionKey = buildSessionKey({
    agentId,
    accountId: msg.accountId,
    peerKind: msg.peerKind,
    peerId: msg.peerId,
  });

  // v1.1.26: 队列串行 — 同 session 的 dispatch 排队, 前一个完成再跑下一个
  const q = dispatchQueues.get(sessionKey) ?? [];
  q.push({ msg, ctx });
  dispatchQueues.set(sessionKey, q);
  if (dispatchRunning.has(sessionKey)) {
    debug(`dispatch queued: session=${sessionKey} queueDepth=${q.length} (concurrency guard)`);
    return;
  }
  dispatchRunning.add(sessionKey);
  try {
    while ((dispatchQueues.get(sessionKey) ?? []).length > 0) {
      const job = dispatchQueues.get(sessionKey)!.shift()!;
      await dispatchOne(job.msg, job.ctx);
    }
  } finally {
    dispatchRunning.delete(sessionKey);
    dispatchQueues.delete(sessionKey);
  }
}

/** per-session 队列状态 (v1.1.26) */
const dispatchQueues = new Map<string, Array<{ msg: WppInboundMessage; ctx: { channelRuntime?: WppChannelRuntime } }>>();
const dispatchRunning = new Set<string>();

/** 实际执行一次 dispatch (v1.1.26 从 dispatchInboundToOpenClaw 抽出的原函数体) */
async function dispatchOne(
  msg: WppInboundMessage,
  ctx: { channelRuntime?: WppChannelRuntime } = {},
): Promise<void> {
  // v1.1.16 P0-FIX: 从 registry 读 account.config.agent (单账号 demo 必填)
  const registry = getDefaultAccountRegistry();
  const accountCtx = registry.get(msg.accountId);
  let agentId: string = "main"; // 兜底 fallback (正常不会走这里)
  if (!accountCtx) {
    // fallback "main" + warn log (兼容单元测试 + startAccountById 已 throw 拦截生产)
    warn(`dispatch: account not found in registry: ${msg.accountId} — fallback to "main" (startAccountById 应已拦截, 如看到这条说明走了别的路径, 立即查!)`);
  } else {
    if (accountCtx.config.agent) {
      agentId = accountCtx.config.agent;
    } else {
      warn(`dispatch: account.agent missing for ${msg.accountId} — fallback to "main" (startAccountById 应已拦截)`);
    }
  }

  const sessionKey = buildSessionKey({
    agentId,
    accountId: msg.accountId,
    peerKind: msg.peerKind,
    peerId: msg.peerId,
  });
  info(`dispatch: account=${msg.accountId} agent=${agentId} session=${sessionKey} trigger=${msg.trigger}`);

  const runtime = ctx.channelRuntime ?? getChannelRuntime();
  const isNoop = runtime === NOOP_RUNTIME;

  // v1.1.15 STORE-PATH (2026-08-08 老板 15:27): 仿 GeWe 范式解析 storePath
  // 根因: vendor 推完整消息触发 dispatcher → 框架需 storePath (session storage path)
  //   之前 v1.1.6 漏传 → runExclusiveSessionStoreWrite 抛 "storePath must be a non-empty string"
  //   → unhandled rejection → gateway 崩溃 → systemd Restart=always 循环
  //   → 3 次 unclean boot 触发 restart-loop breaker → 3 channel 全部抑制
  // fix: 仿 GeWe 调 resolveStorePath?.("", { accountId }) 拿 path → 传入 recordInboundSession + dispatchReply
  // v1.1.15 P0-fix (老板 15:45): framework resolveStorePath(store: string, opts) 参数顺序
  //   store 是会话存储路径字符串 (空字符串=让框架走 default), opts 含 accountId/agentId
  //   之前 v1.1.15 错传 ({ accountId }) 当第一个参数 → 框架 .includes("{agentId}") 抛 TypeError
  //   → 再次 unhandled rejection → 又崩一次
  let storePath = "";
  try {
    storePath = runtime.session.resolveStorePath?.("", { accountId: msg.accountId } as Parameters<NonNullable<typeof runtime.session.resolveStorePath>>[1]) ?? "";
  } catch (e) {
    warn(`dispatch: resolveStorePath failed: ${formatErr(e)}`);
  }

  // Step 1: 记录入站消息 (AI 上下文) — v1.1.15 P0-DISPATCH: ctx 必填 (仿 GeWe 范式)
  const ctxPayload = buildCtxPayload(msg, sessionKey);
  try {
    await runtime.session.recordInboundSession({ storePath, sessionKey, ctx: ctxPayload });
  } catch (e) {
    warn(`dispatch: recordInboundSession failed: ${formatErr(e)}`);
    if (!isNoop) throw e;
  }

  // Step 2: 调 AI 生成回复 — v1.1.15 P0-DISPATCH: framework 真实签名
  //   { ctx, cfg, dispatcherOptions.deliver, replyOptions, ... }
  //   deliver 回调负责把 AI reply 发到 vendor (仿 GeWe beforeDeliver+deliver 范式)
  try {
    await runtime.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg: (ctx as { cfg?: unknown }).cfg ?? getOpenClawConfig() ?? {},
      replyOptions: {},
      dispatcherOptions: {
        deliver: async (payload: { text?: string; mediaUrls?: string[]; mediaUrl?: string }, _info: unknown) => {
          const text = payload?.text ?? "";
          // v1.1.26-IMG-ECHO: 从 inbound msg.content 提取已被 enrich 的图片 OSS URL
          //   enrich (v1.1.20) 在 msg.content 追加 "[图片] https://...oss..."
          //   AI 多模态识别图但 deliver 没结构化拿到 url → 主动发原图给老板 (不依赖 svrid)
          const imgUrlMatch = msg.content?.match(/\[图片\]\s+(https?:\/\/\S+)/);
          const ossImgUrl = imgUrlMatch?.[1] ?? payload?.mediaUrls?.[0] ?? payload?.mediaUrl ?? "";
          // v1.1.28 NO-QUOTE-IMG (2026-08-08 20:56 接总立 preference: 图片不要引用):
          //   老板 20:56 preference: 图片消息以后不要引用 — 旧象: svrid 不准 → 缩略图不显示
          //   老板 21:19 反转 (v1.1.30 GEWE-PARITY): 分析 gewe 后以为极简 refermsg svrid 能行
          //   老板 21:30 撤销 20:56 决定 (v1.1.31 REVOKE): "图片我还是希望可以被引用回复"
          //   老板 21:38 恢复 20:56 决定 + 拓展 (v1.1.32 TEXT-ONLY-QUOTE): "除了文本消息，其它全部不需要引用回复了"
          //   根因: WPP vendor NewMsgId ≠ 微信 svrid → 21:32 老板实测 "该消息类型暂不能展示"
          //         即使极简 refermsg svrid 服务器端也查不到 (vendor 设计 vs gewe 设计不同)
          // v1.1.32 TEXT-ONLY-QUOTE (2026-08-08 21:38 接总立偏好):
          //   fix: shouldQuote 只对 msg.msgType === 1 (文本) 启用
          //         图片 (3) / 语音 (34) / 视频 (43) / 文件 (49) / 位置 (48) / 名片 (42) 全不引用
          //         AI 看到原图 (v1.1.20 enrich) 走文本回复即可
          const shouldQuote = msg.msgType === 1;
          info(`[WPP DEBUG-DELIVER] deliver called: textLen=${text.length} hasOssImg=${!!ossImgUrl} msgType=${msg.msgType} shouldQuote=${shouldQuote} replyTo=${msg.msgId}/${msg.newMsgId ?? ""}`);
          if (!text && !ossImgUrl) return { ok: true, msgId: "" };
          const result = await sendAiReply(msg.accountId, msg.peerId, text, {
            msgId: shouldQuote ? msg.msgId : "",
            newMsgId: shouldQuote ? msg.newMsgId : "",
            ossImgUrl: ossImgUrl || undefined,
          });
          info(`[WPP DEBUG-DELIVER] sendAiReply done: ok=${result.ok} error=${result.error ?? "none"} msgId=${result.msgId ?? ""}`);
          return result;
        },
      },
    });
  } catch (e) {
    warn(`dispatch: dispatchReply failed: ${formatErr(e)}`);
    if (!isNoop) throw e;
  }
}
