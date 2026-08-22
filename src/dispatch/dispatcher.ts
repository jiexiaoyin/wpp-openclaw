// src/dispatch/dispatcher.ts - inbound → OpenClaw runtime dispatch
// 仿 gewe v1.4.4 dispatcher 范式: recordInboundSession + dispatchReplyWithBufferedBlockDispatcher

import { createHash } from "node:crypto";
import { info, warn, debug, formatErr } from "../core/logger.js";
// 文件消息 (v1 schema 无内容) → 固定回复纯函数, 供 dispatcher + 测试用
export function buildFileAutoReply(
  content: string | undefined,
): { isFileMsg: boolean; replyText?: string } | null {
  if (!content) return null;
  const isFileMsg =
    content.includes("[文件]") && content.includes("[系统提示-文件限制]");
  if (!isFileMsg) return { isFileMsg: false };
  const fileLine = content.match(/\[文件\]\s*(.+?)(?:\n|$)/)?.[1] ?? "文件";
  return {
    isFileMsg: true,
    replyText: `收到「${fileLine}」📎 但我当前无法读取文件内容。你可以把文件内容转成文本或图片发给我，或直接告诉我你想让我做什么～`,
  };
}
import { buildSessionKey } from "../session-key.js";
import { getDefaultAccountRegistry } from "../account-state.js";
import { accountContext } from "./account-context.js";
import { sendText } from "./outbound.js";
import { quoteReply } from "../send/quote-reply.js";
import { buildQuoteContext } from "./reply-helpers.js";
import type { WppInboundMessage } from "../types.js";
import { CHANNEL_ID, GROUP_CONTEXT_WINDOW, GROUP_CONTEXT_MAX_IMAGES } from "../core/constants.js";
import { getMessages, getMessageByMsgIdOrNewId } from "../storage/db/messages.js";
import { waitForPendingEnrich } from "../inbound/handler.js";
import { extractReferencedFromReplyContext, extractReferencedFromApp } from "../inbound/parser/quote.js";
import { classifyGroupIntent, decideIntentWithLlm, needsLlm, normalizeTriggerText, toIntentCandidate } from "./intent-llm.js";
import { isCommandIntent, selectTopNByEmbedding } from "./intent-embed.js";
import { rememberReply, rememberLastGroupMention } from "./pending-reply.js";
import { recordRawMessage, type HeartflowConfig } from "../inbound/heartflow.js";
// re-export (兼容旧测试/外部引用) — classifyGroupIntent/GroupIntent 定义在 intent-llm.ts
export { classifyGroupIntent, type GroupIntent } from "./intent-llm.js";
// 写内存 chat info cache, outbound 路径读 (见 state.ts setSessionChatInfo)
import { setSessionChatInfo } from "../state.js";

/**
 * OpenClaw channelRuntime 接口 (wpp 期望的子集)
 * 真实 runtime 会有这些方法, 测试用 mock 实现
 */
export interface WppChannelRuntime {
  session: {
    /** framework 真实签名: recordInboundSession({ storePath, sessionKey, ctx }) */
    recordInboundSession(opts: { storePath: string; sessionKey: string; ctx: unknown }): Promise<void>;
    /** framework 真实签名: resolveStorePath(store, opts) */
    resolveStorePath?(store: string, opts?: { accountId?: string; agentId?: string; env?: NodeJS.ProcessEnv }): string;
  };
  reply: {
    /**
     * framework 真实签名: dispatchReplyWithBufferedBlockDispatcher({ ctx, cfg, dispatcherOptions, ... })
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
 * 保存 OpenClaw 完整配置供 dispatch 时传给 framework。
 * 若不传 (ctx.cfg ?? {}) 空对象 → framework resolveConfiguredModelRef 解析失败 → fallback gpt-5.5 → 401。
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
 * 解析消息对应的 agentId (registry 优先, 兜底 "main") + 构造 sessionKey。
 * dispatchInboundToOpenClaw / dispatchOne / recordGroupContext 共用, 保证 3 处 sessionKey 一致。
 */
function buildSessionKeyForMsg(msg: WppInboundMessage): string {
  const registry = getDefaultAccountRegistry();
  const accountCtx = registry.get(msg.accountId);
  let agentId: string = "main"; // 兜底 fallback (正常不会走这里)
  if (!accountCtx) {
    warn(`dispatch: account not found in registry: ${msg.accountId} — fallback to "main" (startAccountById 应已拦截, 如看到这条说明走了别的路径, 立即查!)`);
  } else if (accountCtx.config.agent) {
    agentId = accountCtx.config.agent;
  } else {
    warn(`dispatch: account.agent missing for ${msg.accountId} — fallback to "main" (startAccountById 应已拦截)`);
  }
  return buildSessionKey({
    agentId,
    accountId: msg.accountId,
    peerKind: msg.peerKind,
    peerId: msg.peerId,
  });
}

/**
 * v2026-08-14 15:13 C-fix (老板 query 15:02 拍板 C+D): 拿 accountCtx.config.agent 真值。
 * 只有真配置了 agent (accounts/<id>.json 的 agent 字段) 才返回, 没配置返回 undefined。
 * 用于 cfg.agentId 注入, 防止把 fallback "main" 当有效 agentId 注入 cfg (会改变测试期望 + 干扰 framework).
 */
function resolveAccountAgentId(msg: WppInboundMessage): string | undefined {
  const registry = getDefaultAccountRegistry();
  const accountCtx = registry.get(msg.accountId);
  if (!accountCtx) return undefined;
  return accountCtx.config.agent;
}

/**
 * v1.2.4 GROUP-CONTEXT-DB (老板拍板): 不内存缓冲, 触发时从 DB 查触发人最近消息注入。
 *
 * 为什么改 DB: 所有消息已全量落库 (enrichBatch 在 handler Step 2), DB 数据全、可按人查、
 * 不受内存窗口限制。删掉内存缓冲 → 触发时查 wpp_messages (from_wxid 列)。
 */

/** 读账号 groupContextEnabled (默认 false, 显式 true 才注入群聊上下文) */
function resolveGroupContextEnabled(msg: WppInboundMessage): boolean {
  try {
    return getDefaultAccountRegistry().get(msg.accountId)?.config.groupContextEnabled === true;
  } catch {
    return false;
  }
}

function resolveLlmIntentEnabled(msg: WppInboundMessage): boolean {
  try {
    const cfg = getDefaultAccountRegistry().get(msg.accountId)?.config;
    return cfg?.llmIntentEnabled !== false;
  } catch {
    return true;
  }
}
function resolveLlmModel(msg: WppInboundMessage): string {
  try {
    return getDefaultAccountRegistry().get(msg.accountId)?.config.llmIntentModel ?? "MiniMax-M2.5";
  } catch {
    return "MiniMax-M2.5";
  }
}
function resolveLlmTimeoutMs(msg: WppInboundMessage): number {
  try {
    return getDefaultAccountRegistry().get(msg.accountId)?.config.llmIntentTimeoutMs ?? 5000;
  } catch {
    return 5000;
  }
}
function resolveMinimaxApiKey(): string {
  return process.env.MINIMAX_API_KEY ?? "";
}

function resolveEmbedIntentEnabled(msg: WppInboundMessage): boolean {
  try {
    return getDefaultAccountRegistry().get(msg.accountId)?.config.embedIntentEnabled !== false;
  } catch {
    return true;
  }
}
function resolveEmbedTopN(msg: WppInboundMessage): number {
  try {
    return getDefaultAccountRegistry().get(msg.accountId)?.config.embedIntentTopN ?? 5;
  } catch {
    return 5;
  }
}
function resolveEmbedThreshold(msg: WppInboundMessage): number {
  try {
    return getDefaultAccountRegistry().get(msg.accountId)?.config.embedIntentThreshold ?? 0.3;
  } catch {
    return 0.3;
  }
}
function resolveBailianEmbeddingKey(): string {
  return process.env.BAILIAN_EMBEDDING_API_KEY ?? "";
}

/** 读账号的 groupContextWindow 配置 (per-account, 默认 GROUP_CONTEXT_WINDOW) */
function resolveGroupWindow(msg: WppInboundMessage): number {
  try {
    const ctx = getDefaultAccountRegistry().get(msg.accountId);
    const w = ctx?.config.groupContextWindow;
    if (typeof w === "number" && w >= 1 && w <= 100) return w;
  } catch {
    /* registry 异常 → 默认 */
  }
  return GROUP_CONTEXT_WINDOW;
}

/**
 * v1.3.5 QUOTE-REFERENCED: 触发消息引用时, 多种方式定位被引用消息 (优先注入 AI 上下文)。
 * v1.3.6: 新增 app.reference (category=quote) — 被引用信息在这里, 不在 reply_context!
 * 尝试: app.reference.new_msg_id/svr_id → reply_context.svr_id/new_msg_id → local_id 匹配 DB; 查不到返回 null。
 */
async function resolveReferencedMessage(
  msg: WppInboundMessage,
): Promise<import("../storage/db/types.js").MessageRecord | null> {
  const appRef = extractReferencedFromApp(msg.raw);
  if (appRef) {
    try {
      if (appRef.newMsgId) {
        // v1.3.18 P1-核心2: 引用解析查全部方向 (被引用消息可能是 bot  outbound)
        const byNew = await getMessageByMsgIdOrNewId(undefined, appRef.newMsgId, msg.accountId, { direction: "any" });
        if (byNew) return byNew;
      }
      if (appRef.svrId) {
        const bySvr = await getMessageByMsgIdOrNewId(appRef.svrId, undefined, msg.accountId, { direction: "any" });
        if (bySvr) return bySvr;
      }
    } catch {
      /* app.reference 查询失败 → 继续试其它 */
    }
  }

  const rc = extractReferencedFromReplyContext(msg.raw);
  if (!rc) return null;
  try {
    if (rc.svrId) {
      const bySvr = await getMessageByMsgIdOrNewId(rc.svrId, undefined, msg.accountId, { direction: "any" });
      if (bySvr) return bySvr;
    }
    if (rc.newMsgId) {
      const byNew = await getMessageByMsgIdOrNewId(undefined, rc.newMsgId, msg.accountId, { direction: "any" });
      if (byNew) return byNew;
    }
    if (rc.msgId) {
      // 查群内消息找 local_id = rc.msgId 的
      const recent = await getMessages({
        accountId: msg.accountId,
        peerKind: "group",
        peerId: msg.peerId,
        limit: 30,
        beforeTs: msg.ts,
      });
      const byLocalId = recent.find((m) => {
        const raw = m.raw_payload as Record<string, unknown> | undefined;
        return raw?.local_id === rc.msgId;
      });
      if (byLocalId) return byLocalId;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * v1.3.4: 从 DB 查群内最近消息 → 注入 AI 上下文 (老板拍板: 群内最近 10 条, 不限发送人, 媒体优先)。
 *   v1.2.4 原为"只看 @ 人上下文", v1.3.4 改"群内最近媒体权重最高" (老板新要求)。
 *
 * - DB 查 `wpp_messages` (peer_id=群ID, from_wxid=触发人) 最近 GROUP_CONTEXT_WINDOW 条
 * - 图片 ≤3 张直接塞 MediaUrls 看图, 超过丢最旧
 * - v1.3.4: 查询群内最近 window 条 (不限发送人, 媒体优先)
 * - v1.3.5: 引用消息优先注入被引用消息
 * - DB 查询失败 → 返回 null (不阻塞 AI 回复)
 *
 * 返回上下文块字符串 (或 null), 由 buildCtxPayload 前置进 Body — 不 mutate msg.content。
 */
async function buildGroupContextFromDb(msg: WppInboundMessage): Promise<string | null> {
  if (msg.peerKind !== "group") return null;
  const window = resolveGroupWindow(msg);
  try {
    //   群聊触发消息中使用了引用消息 = 明确指定被引用消息加入上下文 → 只注入被引用消息,
    //   不再看其它上下文 (跳过窗口查询 + embedding/LLM 选择)。
    //   根因: v1.3.5 把被引用消息 prepend 进 msgs 后, 后续 embedding/LLM filter 可能把
    //   它再过滤掉 (老板实测 "AI 依然去找其它的图") — 引用即指定, 必须短路其它逻辑。
    const referencedMsg = await resolveReferencedMessage(msg);
    if (referencedMsg) {
      return buildReferencedContextLines(msg, referencedMsg);
    }

    const intent = classifyGroupIntent(msg.content);
    if (intent === "no-op") {
      debug(`[WPP v1.3.0 INTENT] no-op: 不注入上下文 msgId=${msg.msgId} content="${msg.content.slice(0, 30)}"`);
      return null;
    }
    //   (v1.2.8: beforeTs 排除触发消息自身, 避免空 @ 混入上下文)
    let msgs = await getMessages({
      accountId: msg.accountId,
      peerKind: "group",
      peerId: msg.peerId,
      limit: window,
      beforeTs: msg.ts,
    });
    if (msgs.length === 0) return null;

    //   规则预筛 (已在上方 no-op 拦截) → 命令类走 LLM → 非命令 embedding 快路径 → 降级 LLM → 降级注入全部
    const llmEnabled = resolveLlmIntentEnabled(msg) && !!resolveMinimaxApiKey();
    const embedEnabled = resolveEmbedIntentEnabled(msg) && !!resolveBailianEmbeddingKey();
    const triggerText = normalizeTriggerText(msg.content);
    if (llmEnabled && needsLlm(msg.content)) {
      let decision: Awaited<ReturnType<typeof decideIntentWithLlm>> = null;
      //   用 embedSelected 区分"embedding 已选好"与"LLM 失败需保守降级"
      let embedSelected = false;

      if (isCommandIntent(triggerText)) {
        // 命令类意图 (删/发/转/帮) → embedding 判断不了 → LLM
        debug(`[WPP v1.3.2 EMBED-INTENT] command intent → LLM: "${triggerText.slice(0, 20)}"`);
        decision = await decideIntentWithLlm(
          { triggerText, candidates: msgs.map(toIntentCandidate) },
          { apiKey: resolveMinimaxApiKey(), model: resolveLlmModel(msg), timeoutMs: resolveLlmTimeoutMs(msg) },
        );
      } else if (embedEnabled) {
        // 非命令 → embedding 快路径 (ms 级)
        const relevantIds = await selectTopNByEmbedding(
          triggerText,
          msgs.map(toIntentCandidate),
          {
            apiKey: resolveBailianEmbeddingKey(),
            topN: resolveEmbedTopN(msg),
            threshold: resolveEmbedThreshold(msg),
          },
        );
        if (relevantIds !== null && relevantIds.length > 0) {
          const idSet = new Set(relevantIds);
          const filtered = msgs.filter((m) => idSet.has(m.msg_id ?? "") || idSet.has(m.new_msg_id ?? ""));
          if (filtered.length > 0) {
            debug(`[WPP v1.3.2 EMBED-INTENT] embedding selected ${filtered.length}: ${relevantIds.join(",")}`);
            msgs = filtered;
            embedSelected = true;
          }
        } else if (relevantIds !== null && relevantIds.length === 0) {
          // 相似度全低于阈值 → LLM 兜底
          debug(`[WPP v1.3.2 EMBED-INTENT] embedding 无相关 → LLM 兜底`);
          decision = await decideIntentWithLlm(
            { triggerText, candidates: msgs.map(toIntentCandidate) },
            { apiKey: resolveMinimaxApiKey(), model: resolveLlmModel(msg), timeoutMs: resolveLlmTimeoutMs(msg) },
          );
        }
        if (relevantIds === null) {
          debug(`[WPP v1.3.2 EMBED-INTENT] embedding 失败 → LLM 兜底`);
          decision = await decideIntentWithLlm(
            { triggerText, candidates: msgs.map(toIntentCandidate) },
            { apiKey: resolveMinimaxApiKey(), model: resolveLlmModel(msg), timeoutMs: resolveLlmTimeoutMs(msg) },
          );
        }
      } else {
        decision = await decideIntentWithLlm(
          { triggerText, candidates: msgs.map(toIntentCandidate) },
          { apiKey: resolveMinimaxApiKey(), model: resolveLlmModel(msg), timeoutMs: resolveLlmTimeoutMs(msg) },
        );
      }

      // 处理 LLM decision (no-op → 不注入; inject → filter 相关)
      if (decision?.action === "no-op") {
        debug(`[WPP v1.3.2 LLM-INTENT] no-op: 不注入 msgId=${msg.msgId}`);
        return null;
      }
      if (decision?.action === "inject") {
        const idSet = new Set(decision.relevantIds);
        const filtered = msgs.filter((m) => idSet.has(m.msg_id ?? "") || idSet.has(m.new_msg_id ?? ""));
        if (filtered.length === 0) {
          debug(`[WPP v1.3.2 LLM-INTENT] inject 但无匹配候选, 不注入 msgId=${msg.msgId}`);
          return null;
        }
        msgs = filtered;
      }
      //     media 意图 → 兜底只注入媒体 (用户明确在看媒体, 该带媒体)
      //     topic 意图 → 不注入 (宁可 AI 只看触发消息本身, 也不塞一堆无关上下文)
      //   (embedSelected=true → embedding 已选好相关, decision null 是正常完成, 走下方图片≤3)
      if (!decision && !embedSelected) {
        if (intent === "media") {
          const mediaOnly = msgs.filter((m) => /\[(图片|文件|语音|视频)\]/.test(m.content ?? ""));
          if (mediaOnly.length === 0) {
            debug(`[WPP v1.3.15 INTENT] LLM null + media 但无媒体消息, 不注入 msgId=${msg.msgId}`);
            return null;
          }
          msgs = mediaOnly;
          debug(`[WPP v1.3.15 INTENT] LLM null + media → 兜底只注入媒体 ${mediaOnly.length} 条 msgId=${msg.msgId}`);
        } else {
          debug(`[WPP v1.3.15 INTENT] LLM null + topic → 不注入 (不强拉) msgId=${msg.msgId}`);
          return null;
        }
      }
    } else if (intent === "media") {
      // 规则兜底 (llmIntentEnabled=false 或无 key): 只注入含媒体标记的消息
      // 语音带 [转写] 也当文本注入 (老板观点: 语音当文本)
      msgs = msgs.filter((m) => /\[(图片|文件|语音|视频)\]/.test(m.content ?? ""));
      if (msgs.length === 0) {
        debug(`[WPP v1.3.0 INTENT] media 意图但无媒体消息, 不注入 msgId=${msg.msgId}`);
        return null;
      }
    } else {
      //   (原行为: msgs 保持全量 = 强制拉上下文, AI 被无关文本带偏)
      debug(`[WPP v1.3.15 INTENT] topic + 无 LLM/embedding key → 不注入 (不强拉) msgId=${msg.msgId} content="${msg.content.slice(0, 20)}"`);
      return null;
    }

    // 图片 ≤3 张: 保留最近 3 张含 [图片] 的, 更旧含图消息剔除
    // DB 返回 ts DESC (最新在前) → 前 N 个含图的 = 最近的
    const imageIndexes: number[] = [];
    for (let i = 0; i < msgs.length; i++) {
      if (msgs[i]?.content?.includes("[图片]")) imageIndexes.push(i);
    }
    if (imageIndexes.length > GROUP_CONTEXT_MAX_IMAGES) {
      const keep = new Set(imageIndexes.slice(0, GROUP_CONTEXT_MAX_IMAGES));
      msgs = msgs.filter((_, idx) => !(msgs[idx]?.content?.includes("[图片]") && !keep.has(idx)));
    }
    if (msgs.length === 0) return null;

    const lines: string[] = [
      `[系统提示-群聊上下文] 以下是群聊中相关成员最近 ${msgs.length} 条消息 (仅作背景, 不要回复它们)。用户@了你, 你的回复针对下方最新消息, 必须回复 (禁止输出 NO_REPLY 或静默不回复):`,
    ];
    for (const gm of msgs) {
      const sender = gm.from_wxid ?? "?";
      const text = (gm.content ?? "").replace(/\n+/g, " ").trim() || "(无文本内容)";
      lines.push(`${sender}: ${text}`);
    }
    lines.push("[系统提示-群聊上下文结束]");

    // 否则 AI 只看到文件 URL, 不知道要读内容 (实测只调 image 看图, 不读 xls)
    const hasFile = msgs.some((m) => m.content?.includes("[文件]"));
    if (hasFile) {
      lines.push(
        "\n[系统提示-文件读取] 上方群聊上下文中有用户发送的文件 ([文件] 后是公网 URL)。\n" +
        "用户@你是为了处理这个文件。请用文件读取工具 (如 document-extract / clawpdf) 下载并读取文件内容, 基于文件内容回复用户。\n" +
        "禁止: 用 find/ls 搜索本地文件、猜测文件路径。只用上方提供的 URL 读取。",
      );
    }
    info(`[WPP v1.2.4 GROUP-CONTEXT-DB] injected ${msgs.length} ctx msgs (limit=${window}) → session=${buildSessionKeyForMsg(msg)} msgId=${msg.msgId} (触发人+@指定)`);
    return lines.join("\n");
  } catch (e) {
    warn(`[WPP v1.2.4 GROUP-CONTEXT-DB] query failed (non-fatal, skip ctx): ${formatErr(e)}`, { msgId: msg.msgId });
    return null;
  }
}

/**
 * v1.3.14 QUOTE-FORCE-CONTEXT: 引用消息 = 明确指定上下文 (老板拍板)。
 * 触发消息用了引用 → 只注入被引用消息, 不看其它上下文。
 * 复用 buildGroupContextFromDb 的 lines 构建 + [文件] 读取引导。
 */
function buildReferencedContextLines(
  msg: WppInboundMessage,
  referencedMsg: import("../storage/db/types.js").MessageRecord,
): string {
  const lines: string[] = [
    `[系统提示-群聊上下文] 用户明确引用了以下 1 条消息 (引用 = 明确指定)。你针对被引用的这条消息回复, 必须回复 (禁止输出 NO_REPLY 或静默不回复):`,
  ];
  const sender = referencedMsg.from_wxid ?? "?";
  const text = (referencedMsg.content ?? "").replace(/\n+/g, " ").trim() || "(无文本内容)";
  lines.push(`${sender}: ${text}`);
  lines.push("[系统提示-群聊上下文结束]");

  if (referencedMsg.content?.includes("[文件]")) {
    lines.push(
      "\n[系统提示-文件读取] 用户引用的被引用消息是文件 ([文件] 后是公网 URL)。\n" +
      "用户@你是为了处理这个文件。请用文件读取工具 (如 document-extract / clawpdf) 下载并读取文件内容, 基于文件内容回复用户。\n" +
      "禁止: 用 find/ls 搜索本地文件、猜测文件路径。只用上方提供的 URL 读取。",
    );
  }
  info(`[WPP v1.3.14 QUOTE-FORCE-CONTEXT] injected referenced ctx (1 msg: ${referencedMsg.msg_id}) → session=${buildSessionKeyForMsg(msg)} msgId=${msg.msgId}`);
  return lines.join("\n");
}

/**
 * 构造 ctxPayload (framework finalizeInboundContext 消费的入参, 仿 GeWe 范式必填字段)
 * @param injectedContext v1.2.2 GROUP-CONTEXT-WINDOW: 群聊上下文块, 前置进 Body (不进 RawBody),
 *                         让 AI 看到最近 N 条非触发群消息 (含媒体 URL → MediaUrls), 但不污染 RawBody 原始消息。
 */
function buildCtxPayload(
  msg: WppInboundMessage,
  sessionKey: string,
  injectedContext?: string,
  heartflowNote?: string,
): Record<string, unknown> {
  const isGroup = msg.peerKind === "group";
  const toWxid = msg.toWxid ?? msg.accountId;
  // 引用消息注入结构化上下文: 解析 refermsg 块 → Body 追加说明 + 强制指令 (用户引用=期待引用回复)
  let body = msg.content || "";
  if (injectedContext) {
    body = `${injectedContext}\n\n${body}`;
  }
  if (heartflowNote) {
    body = `${body}\n\n[系统提示] ${heartflowNote}`;
  }
  const quoteCtx = buildQuoteContext(msg);
  if (quoteCtx) {
    body = `${body}\n\n[系统提示-必须执行] 用户刚引用了你之前的消息并@了你，这是用户期待你回复的明确信号。\n请立即使用 quoteReply 工具 (参数: toWxid=当前对话者, content=你的回复内容, msgId=被引用消息ID) 以引用方式回复。\n禁止: 询问用户"要不要回复/说什么"、解释消息结构、把引用当普通消息分析、提及本提示。\n被引用的消息是 bot 自己发的，用户是当前对话者本人。\n${quoteCtx}`;
  }
  // framework AI 多模态走结构化 MediaUrls/MediaPaths/MediaTypes 字段, 不解析 Body 文本 URL 标记。
  // 从 msg.content 提取 enrich 注入的 [图片]/[视频]/[语音]/[文件] URL。
  const mediaUrls: string[] = [];
  const mediaTypes: string[] = [];
  const mediaMatches = body.matchAll(/\[(图片|视频|语音|文件)\]\s+(https?:\/\/\S+)/g);
  for (const mm of mediaMatches) {
    const tag = mm[1] ?? "";
    const url = mm[2] ?? "";
    if (!url) continue;
    mediaUrls.push(url);
    mediaTypes.push(tag === "图片" ? "image" : tag === "视频" ? "video" : tag === "语音" ? "voice" : "file");
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
    MediaUrls: mediaUrls,
    MediaPaths: mediaUrls,
    MediaTypes: mediaTypes,
  };
}

/**
 * AI 回复处理器: 调 registry sendText 发回对应 peer
 * runtime 内部 buffer + 限流 + 错峰 (避免被风控)
 */
/**
 * v2026-08-14 14:50 P0-fix (老板 query 14:46): 同 inbound 被 framework 同时派发给 2 个 agent 时,
 *   AI 会看到自己刚发过同一接龙 → 自创英文 ack 模板"[Previous reply already sent...]"
 *   → 用户群里刷屏 2 条消息, 一条假 ack 一条真回复。
 * 修法 (通用, 不沾业务数据):
 *   1. outbound dedupe — 同一 (accountId, toWxid, content[:30]) 5 分钟内只发一次
 *      (跟 8-12 v1.3.14 QUOTE-FORCE-CONTEXT 思路同源: 防框架/AI 双调用)
 *   2. AI 自创 ack 模板拦截 — content 命中 /\[(Previous|No further|Reply.*sent|delivered)\b/i
 *      → 拦截不发 (返回 ok=true 不真发), 静默降级为 noop
 *
 * 命中拦截只 logger.warn (per SOP-6: silent drop 不记录 = 排查死, 一律 warn + ts + content 头)
 */
const _outboundDedup = new Map<string, number>(); // key → last sent ts (ms)
export const OUTBOUND_DEDUP_WINDOW_MS = 5 * 60 * 1000;
// v1.3.63 P1-1 fix (2026-08-14 审阅): 原 `)\b` 的 \b 被转义成字面 0x08 退格字节 → 正则恒 false,
//   4 个真实 ack 模板全不匹配, 拦截半边生产失效。改为 word boundary `\b`。
//   导出常量供测试 import 真值 (禁止手抄副本, per P1-1 教训)。
// v1.3.63 P3 (2026-08-14 审阅): 收窄 — 只匹配完整 `[...]` 方括号块 (AI 自创 ack 模板形态),
//   防正常回复正文里散落 "delivered"/"No further action" 被误伤静默 drop.
export const ACK_TEMPLATE_RE = /\[[^\]]*(Previous reply already sent|No further action|Reply.*delivered|reply delivered successfully)[^\]]*\]/i;

/** P1-4: 写时清扫 OUTBOUND_DEDUP_WINDOW_MS 之前的过期 key (照 webhook-receiver SeenTracker 范式) */
export function sweepOutboundDedup(now: number): void {
  if (_outboundDedup.size < 1024) return; // 小规模不扫, 避免每次发送都 O(n)
  for (const [k, ts] of _outboundDedup) {
    if (now - ts > OUTBOUND_DEDUP_WINDOW_MS) _outboundDedup.delete(k);
  }
}

/** P1-3 fix: content[:30] 前缀作 key 会误吞同 peer 5 分钟内不同回复 (如"收到"/短中文模板).
 *  改完整内容 hash (sha1 32 字节) — 不同回复永不冲突, 仅同内容才命中 dedupe (防双派发刷屏).
 *  导出供测试验证 P1-3 行为. */
export function dedupKeyFor(accountId: string, toWxid: string, text: string): string {
  const h = createHash("sha1").update(text).digest("hex");
  return `${accountId}|${toWxid}|${h}`;
}

async function sendAiReply(
  accountId: string,
  toWxid: string,
  text: string,
  replyTo?: {
    msgId: string;
    newMsgId?: string;
    ossImgUrl?: string;
    /** 透传被引用消息元数据 (供 refermsg 全字段) */
    fromWxid?: string;
    chatroomId?: string;
    fromNickname?: string;
    originalContent?: string;
    createtime?: number;
    innerType?: number;
  },
): Promise<{ ok: boolean; msgId?: string; error?: string }> {
  // P0-fix 14:50: AI 自创 ack 模板拦截 (v1.3.63 P1-1: 正则已修 0x08 字节)
  if (ACK_TEMPLATE_RE.test(text)) {
    warn(`[WPP v1.3.63 ACK-TEMPLATE-DROP] suppressed AI self-generated ack template: textLen=${text.length} head="${text.slice(0, 60).replace(/\n/g, " ")}" account=${accountId} to=${toWxid}`);
    return { ok: true, msgId: "ack-template-dropped" }; // 静默降级, 不真发
  }
  // P0-fix 14:50: outbound dedupe (5 分钟内同内容同 peer 不重发)
  const now = Date.now();
  const dedupKey = dedupKeyFor(accountId, toWxid, text);
  sweepOutboundDedup(now); // P1-4: 写前清扫过期 key, 防 Map 无限增长
  const lastAt = _outboundDedup.get(dedupKey);
  if (lastAt !== undefined && (now - lastAt) < OUTBOUND_DEDUP_WINDOW_MS) {
    warn(`[WPP v1.3.63 OUTBOUND-DEDUPE] suppressed duplicate within ${Math.round((now - lastAt) / 1000)}s: account=${accountId} to=${toWxid} len=${text.length}`);
    return { ok: true, msgId: "dedup-suppressed" };
  }
  const registry = getDefaultAccountRegistry();
  const ctx = registry.get(accountId);
  if (!ctx) {
    return { ok: false, error: `account not found: ${accountId}` };
  }
  try {
    // 有被回复消息 → 走引用回复 (quoteReply 自动构造 refermsg); 无 replyTo 才退普通 sendText
    if (replyTo?.msgId) {
      const qr = await quoteReply({
        toWxid,
        content: text,
        msgId: replyTo.msgId,
        newMsgId: replyTo.newMsgId,
        accountId,
        // 透传被引用消息全字段 → 完整 refermsg 渲染
        fromWxid: replyTo.fromWxid,
        chatroomId: replyTo.chatroomId,
        fromNickname: replyTo.fromNickname,
        originalContent: replyTo.originalContent,
        createtime: replyTo.createtime,
        innerType: replyTo.innerType,
      });
      if (qr.ok) {
        _outboundDedup.set(dedupKey, now); // 成功发送后才记 dedup ts
        recordHeartflowBotReply(accountId, toWxid, text, now);
        return { ok: true, msgId: (qr.data as { msgId?: string } | undefined)?.msgId };
      }
      return { ok: false, error: qr.msg };
    }
    // 无被回复消息 → 普通文本 (兼容手动调用/工具场景)
    const r = await sendText(accountId, toWxid, text);
    if (r.ok) {
      _outboundDedup.set(dedupKey, now); // 成功发送后才记 dedup ts
      recordHeartflowBotReply(accountId, toWxid, text, now);
    }
    return r.ok ? { ok: true, msgId: r.msgId } : { ok: false, error: r.error };
  } catch (e) {
    return { ok: false, error: formatErr(e) };
  }
}

/**
 * v1.3.75 HEARTFLOW: 记录 bot 发出的群聊回复进心流缓冲 (供后续判断小模型看"上次回复")。
 * 仅当账号启用 heartflow 且目标是群 (含 @chatroom) 时记录; 私聊不记。
 */
function recordHeartflowBotReply(accountId: string, toWxid: string, text: string, nowMs: number): void {
  try {
    const acct = getDefaultAccountRegistry().get(accountId);
    const hf: HeartflowConfig | undefined = acct?.config.heartflow;
    if (!hf?.enabled) return;
    if (!toWxid.endsWith("@chatroom") && !toWxid.includes("@chatroom")) return; // 仅群
    recordRawMessage(toWxid, {
      senderName: "bot",
      senderId: "bot",
      content: text,
      timestamp: nowMs / 1000,
      isBot: true,
    });
  } catch {
    /* 记录失败不阻塞发送 */
  }
}

/**
 * 接收已 trigger 入队消息, 转换为 OpenClaw runtime 调用。
 * - agentId 从 account state 读 (不能硬编码 main, 防多账号串号)
 * - 按 sessionKey 排队串行执行, 防同 session 并发丢回复 (framework foregroundReplyFence 会静默丢弃 stale turn)
 * - v1.2.2 GROUP-CONTEXT-WINDOW: 触发时 injectGroupContext 把最近 N 条非触发群消息注入上下文
 *   (群聊发图无 @ → 缓冲, 后续 @ 文本 dispatch 时 AI 能看到图; 上限 GROUP_CONTEXT_WINDOW=10)
 */
export async function dispatchInboundToOpenClaw(
  msg: WppInboundMessage,
  ctx: DispatchCtx = {},
): Promise<void> {
  const sessionKey = buildSessionKeyForMsg(msg);

  // 写内存 chat info cache (outbound 路径读), msg.peerId 即 chatId
  setSessionChatInfo(sessionKey, {
    chatId: msg.peerId,
    chatType: msg.peerKind === "group" ? "group" : "single",
    peerId: msg.peerId,
    accountId: msg.accountId,
  });

  // v1.3.56 MULTI-ACCOUNT: 队列键并入 accountId — 群 session key 不含 accountId,
  //   跨账号同群消息会撞同一队列串行阻塞; 加账号后缀隔离
  const queueKey = `${sessionKey}|${msg.accountId}`;
  // 队列串行: 同 session 的 dispatch 排队, 前一个完成再跑下一个
  const q = dispatchQueues.get(queueKey) ?? [];
  q.push({ msg, ctx });
  dispatchQueues.set(queueKey, q);
  if (dispatchRunning.has(queueKey)) {
    debug(`dispatch queued: session=${sessionKey} queueDepth=${q.length} (concurrency guard)`);
    return;
  }
  dispatchRunning.add(queueKey);
  try {
    while ((dispatchQueues.get(queueKey) ?? []).length > 0) {
      const job = dispatchQueues.get(queueKey)!.shift()!;
      try {
        await dispatchOne(job.msg, job.ctx);
      } catch (e) {
        warn(`dispatch: job failed (continue queue): ${formatErr(e)}`, { sessionKey, msgId: job.msg.msgId });
      }
    }
  } finally {
    dispatchRunning.delete(queueKey);
    // 仅删空队列; 若有残留 (理论不会, 因 while 消费完) 保留防泄漏
    if ((dispatchQueues.get(queueKey) ?? []).length === 0) {
      dispatchQueues.delete(queueKey);
    }
  }
}

/** per-session 队列状态 */
/** dispatch 调用上下文 */
export interface DispatchCtx {
  channelRuntime?: WppChannelRuntime;
}

const dispatchQueues = new Map<string, Array<{ msg: WppInboundMessage; ctx: DispatchCtx }>>();
const dispatchRunning = new Set<string>();

/** 实际执行一次 dispatch (从 dispatchInboundToOpenClaw 抽出的函数体) */
async function dispatchOne(
  msg: WppInboundMessage,
  ctx: DispatchCtx = {},
): Promise<void> {
  // 从 registry 读 account.config.agent (单账号 demo 必填)
  const sessionKey = buildSessionKeyForMsg(msg);
  // (否则群聊发文件+@ 时文件还没入库, buildGroupContextFromDb 查不到 → AI 看不到文件)
  await waitForPendingEnrich(msg.accountId, msg.fromWxid);
  info(`dispatch: account=${msg.accountId} session=${sessionKey} trigger=${msg.trigger}`);

  // v1.3.38 PENDING-REPLY (借鉴 gewe): 记录 msgId → 路由上下文, 供 AI 回复工具兜底还原目标
  //   (防 AI 回复误用 sender wxid 发到 DM, 群@应回群)
  const isGroupMsg = msg.peerKind === "group";
  const roomId = msg.chatroomId ?? msg.peerId;
  const senderId = msg.fromWxid ?? "";
  const replyKey = msg.newMsgId || msg.msgId;
  if (replyKey) {
    rememberReply(replyKey, {
      isGroup: isGroupMsg,
      roomId: isGroupMsg ? (roomId ?? "") : senderId,
      senderId,
      accountId: msg.accountId,
    });
    if (isGroupMsg && roomId) rememberLastGroupMention(msg.accountId, roomId, replyKey);
  }

  const runtime = ctx.channelRuntime ?? getChannelRuntime();
  const isNoop = runtime === NOOP_RUNTIME;

  // 仿 GeWe 解析 storePath (漏传会导致 gateway 崩溃): resolveStorePath("", { accountId }) → session storage path
  let storePath = "";
  try {
    storePath = runtime.session.resolveStorePath?.("", { accountId: msg.accountId } as Parameters<NonNullable<typeof runtime.session.resolveStorePath>>[1]) ?? "";
  } catch (e) {
    warn(`dispatch: resolveStorePath failed: ${formatErr(e)}`);
  }

  // (群聊同 session, 只看 @ 人自己的上下文; 图片≤3 直接 MediaUrls 看图)
  // groupContextEnabled 开关 (默认 false, 显式 true 才注入群聊上下文, 从 registry 读)
  const groupCtxEnabled = resolveGroupContextEnabled(msg);
  const injectedGroupContext = groupCtxEnabled
    ? await buildGroupContextFromDb(msg)
    : null;

  // v1.3.75 HEARTFLOW: 心流主动回复 → 注入"主动参与"提示 (让主 LLM 知道是自己主动插话,
  //   不是用户叫的, 回复应自然随意像普通群成员 — 移植自 Heartflow on_llm_request)
  //   仅在 heartflow 触发且未被引用/@ 覆盖时注入
  let heartflowNote: string | null = null;
  if (msg.trigger === "heartflow") {
    heartflowNote =
      "（注意：本次是你主动参与群聊的，不是用户叫你。回复应自然随意，像普通群成员一样加入话题。不要提\"我是机器人\"或解释你的机制。）";
  }

  // Step 1: 记录入站消息 (AI 上下文), ctx 必填
  const ctxPayload = buildCtxPayload(
    msg,
    sessionKey,
    injectedGroupContext ?? undefined,
    heartflowNote ?? undefined,
  );
  try {
    await runtime.session.recordInboundSession({ storePath, sessionKey, ctx: ctxPayload });
  } catch (e) {
    warn(`dispatch: recordInboundSession failed: ${formatErr(e)}`);
    if (!isNoop) throw e;
  }

  // 文件消息 (v1 schema, handler 已注入 [文件] + [系统提示-文件限制]) → 绕过 AI 直接回固定模板:
  // 文件内容读不了, AI 自由发挥无价值; 固定模板 100% 不出错、零模型调用、响应最快
  if (msg.msgType === 49) {
    const autoReply = buildFileAutoReply(msg.content);
    if (autoReply?.isFileMsg && autoReply.replyText) {
      try {
        const r = await sendAiReply(msg.accountId, msg.peerId, autoReply.replyText);
        info(`[WPP v1.2.0 FILE-DETERMINISTIC] file auto-reply done: msgId=${msg.msgId} ok=${r.ok} error=${r.error ?? "none"}`);
      } catch (e) {
        warn(`[WPP v1.2.0 FILE-DETERMINISTIC] file auto-reply failed: ${formatErr(e)}`, { msgId: msg.msgId });
      }
      return;
    }
  }

  // Step 2: 调 AI 生成回复, deliver 回调负责把 AI reply 发到 vendor
  // v1.3.56 MULTI-ACCOUNT: 用 ALS 把当前账号注入上下文 — AI 回复生成期间调用的
  //   agent-tools (execute 拿不到 accountId) 通过 getCurrentAccountId() 取当前账号
  // v2026-08-14 15:13 C-fix (老板 query 15:02 拍板 C+D): framework 内部 1 inbound → 2 dispatch 时,
  //   第二条路径 (monitor/preview/heartbeat watcher) 不传 sessionKey → 用 default agent (main) 模型
  //   → 群里刷屏 2 条 + AI 自创英文 ack 模板。
  // 修法 (plugin 范围, 不改 framework): 在 cfg 显式注入 agentId 字段, 让 framework 的 model resolver
  //   知道当前是 wpp-wechat session (从 accounts/default.json 的 agent 真值)。
  // 副作用: framework 内部第二条路径 model resolver 也会用 cfg.agentId 解析 → 选 wpp-wechat 模型 → M2.7。
  // 不沾业务数据: agentId 从 registry 真值拿 (已是 plugin 现有路径), 不硬编码 main/wpp-wechat。
  //   只有真配置了 agent 才注入, 没配置的 (测试场景) 保持 cfg 原样不动。
  const accountAgentId = resolveAccountAgentId(msg);
  const cfgBase = ((ctx as { cfg?: unknown }).cfg ?? getOpenClawConfig() ?? {}) as Record<string, unknown>;
  const cfgWithAgent = (accountAgentId && !cfgBase.agentId)
    ? { ...cfgBase, agentId: accountAgentId }
    : cfgBase;
  try {
    await accountContext.run(msg.accountId, async () => {
      await runtime.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg: cfgWithAgent,
      replyOptions: {},
      dispatcherOptions: {
        deliver: async (payload: { text?: string; mediaUrls?: string[]; mediaUrl?: string }, _info: unknown) => {
          const text = payload?.text ?? "";
          // 从 inbound msg.content 提取 enrich 注入的图片 OSS URL (AI 回复若有图时, deliver 结构化 mediaUrl 兜底)
          const imgUrlMatch = msg.content?.match(/\[图片\]\s+(https?:\/\/\S+)/);
          const ossImgUrl = imgUrlMatch?.[1] ?? payload?.mediaUrls?.[0] ?? payload?.mediaUrl ?? "";
          // 当前全 msgType 引用回复 (老板 v1.1.50 拍板放开)
          const shouldQuote = true;
          info(`deliver called: textLen=${text.length} hasOssImg=${!!ossImgUrl} msgType=${msg.msgType} shouldQuote=${shouldQuote} replyTo=${msg.msgId}/${msg.newMsgId ?? ""}`);
          if (!text && !ossImgUrl) return { ok: true, msgId: "" };
          // 把被引用消息的元数据传透给 quoteReply (构建完整 refermsg)
          const result = await sendAiReply(msg.accountId, msg.peerId, text, {
            msgId: shouldQuote ? msg.msgId : "",
            newMsgId: shouldQuote ? msg.newMsgId : "",
            ossImgUrl: ossImgUrl || undefined,
            fromWxid: shouldQuote ? msg.fromWxid : undefined,
            chatroomId: shouldQuote ? msg.chatroomId : undefined,
            fromNickname: shouldQuote ? msg.fromNickname : undefined,
            originalContent: shouldQuote ? msg.content : undefined,
            createtime: shouldQuote ? msg.ts : undefined,
            innerType: shouldQuote ? msg.msgType : undefined,
          });
          info(`[WPP DEBUG-DELIVER] sendAiReply done: ok=${result.ok} error=${result.error ?? "none"} msgId=${result.msgId ?? ""}`);
          return result;
        },
      },
      });
    });
  } catch (e) {
    warn(`dispatch: dispatchReply failed: ${formatErr(e)}`);
    if (!isNoop) throw e;
  }
}
