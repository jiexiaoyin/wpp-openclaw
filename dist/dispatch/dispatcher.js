import { createHash } from "node:crypto";
import { info, warn, debug, formatErr } from "../core/logger.js";
export function buildFileAutoReply(content) {
    if (!content)
        return null;
    const isFileMsg = content.includes("[文件]") && content.includes("[系统提示-文件限制]");
    if (!isFileMsg)
        return { isFileMsg: false };
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
import { CHANNEL_ID, GROUP_CONTEXT_WINDOW, GROUP_CONTEXT_MAX_IMAGES } from "../core/constants.js";
import { getMessages, getMessageByMsgIdOrNewId } from "../storage/db/messages.js";
import { waitForPendingEnrich } from "../inbound/handler.js";
import { extractReferencedFromReplyContext, extractReferencedFromApp } from "../inbound/parser/quote.js";
import { classifyGroupIntent, decideIntentWithLlm, needsLlm, normalizeTriggerText, toIntentCandidate } from "./intent-llm.js";
import { isCommandIntent, selectTopNByEmbedding } from "./intent-embed.js";
import { rememberReply, rememberLastGroupMention } from "./pending-reply.js";
import { recordRawMessage } from "../inbound/heartflow.js";
import { getGroupMood, buildMoodSystemPrompt } from "../inbound/affection.js";
export { classifyGroupIntent } from "./intent-llm.js";
import { setSessionChatInfo } from "../state.js";
const NOOP_RUNTIME = {
    session: {
        recordInboundSession: async () => undefined,
        resolveStorePath: () => "",
    },
    reply: { dispatchReplyWithBufferedBlockDispatcher: async () => undefined },
};
let currentRuntime = null;
let openClawConfig = null;
export function setOpenClawConfig(cfg) {
    openClawConfig = cfg;
}
export function getOpenClawConfig() {
    return openClawConfig;
}
export function setChannelRuntime(runtime) {
    currentRuntime = runtime;
}
export function getChannelRuntime() {
    return currentRuntime ?? NOOP_RUNTIME;
}
function buildSessionKeyForMsg(msg) {
    const registry = getDefaultAccountRegistry();
    const accountCtx = registry.get(msg.accountId);
    let agentId = "main";
    if (!accountCtx) {
        warn(`dispatch: account not found in registry: ${msg.accountId} — fallback to "main" (startAccountById 应已拦截, 如看到这条说明走了别的路径, 立即查!)`);
    }
    else if (accountCtx.config.agent) {
        agentId = accountCtx.config.agent;
    }
    else {
        warn(`dispatch: account.agent missing for ${msg.accountId} — fallback to "main" (startAccountById 应已拦截)`);
    }
    return buildSessionKey({
        agentId,
        accountId: msg.accountId,
        peerKind: msg.peerKind,
        peerId: msg.peerId,
    });
}
function resolveAccountAgentId(msg) {
    const registry = getDefaultAccountRegistry();
    const accountCtx = registry.get(msg.accountId);
    if (!accountCtx)
        return undefined;
    return accountCtx.config.agent;
}
function resolveGroupContextEnabled(msg) {
    try {
        return getDefaultAccountRegistry().get(msg.accountId)?.config.groupContextEnabled === true;
    }
    catch {
        return false;
    }
}
function resolveLlmIntentEnabled(msg) {
    try {
        const cfg = getDefaultAccountRegistry().get(msg.accountId)?.config;
        return cfg?.llmIntentEnabled !== false;
    }
    catch {
        return true;
    }
}
function resolveLlmModel(msg) {
    try {
        return getDefaultAccountRegistry().get(msg.accountId)?.config.llmIntentModel ?? "MiniMax-M2.5";
    }
    catch {
        return "MiniMax-M2.5";
    }
}
function resolveLlmTimeoutMs(msg) {
    try {
        return getDefaultAccountRegistry().get(msg.accountId)?.config.llmIntentTimeoutMs ?? 5000;
    }
    catch {
        return 5000;
    }
}
function resolveMinimaxApiKey() {
    return process.env.MINIMAX_API_KEY ?? "";
}
function resolveEmbedIntentEnabled(msg) {
    try {
        return getDefaultAccountRegistry().get(msg.accountId)?.config.embedIntentEnabled !== false;
    }
    catch {
        return true;
    }
}
function resolveEmbedTopN(msg) {
    try {
        return getDefaultAccountRegistry().get(msg.accountId)?.config.embedIntentTopN ?? 5;
    }
    catch {
        return 5;
    }
}
function resolveEmbedThreshold(msg) {
    try {
        return getDefaultAccountRegistry().get(msg.accountId)?.config.embedIntentThreshold ?? 0.3;
    }
    catch {
        return 0.3;
    }
}
function resolveBailianEmbeddingKey() {
    return process.env.BAILIAN_EMBEDDING_API_KEY ?? "";
}
function resolveGroupWindow(msg) {
    try {
        const ctx = getDefaultAccountRegistry().get(msg.accountId);
        const w = ctx?.config.groupContextWindow;
        if (typeof w === "number" && w >= 1 && w <= 100)
            return w;
    }
    catch {
    }
    return GROUP_CONTEXT_WINDOW;
}
async function resolveReferencedMessage(msg) {
    const appRef = extractReferencedFromApp(msg.raw);
    if (appRef) {
        try {
            if (appRef.newMsgId) {
                const byNew = await getMessageByMsgIdOrNewId(undefined, appRef.newMsgId, msg.accountId, { direction: "any" });
                if (byNew)
                    return byNew;
            }
            if (appRef.svrId) {
                const bySvr = await getMessageByMsgIdOrNewId(appRef.svrId, undefined, msg.accountId, { direction: "any" });
                if (bySvr)
                    return bySvr;
            }
        }
        catch {
        }
    }
    const rc = extractReferencedFromReplyContext(msg.raw);
    if (!rc)
        return null;
    try {
        if (rc.svrId) {
            const bySvr = await getMessageByMsgIdOrNewId(rc.svrId, undefined, msg.accountId, { direction: "any" });
            if (bySvr)
                return bySvr;
        }
        if (rc.newMsgId) {
            const byNew = await getMessageByMsgIdOrNewId(undefined, rc.newMsgId, msg.accountId, { direction: "any" });
            if (byNew)
                return byNew;
        }
        if (rc.msgId) {
            const recent = await getMessages({
                accountId: msg.accountId,
                peerKind: "group",
                peerId: msg.peerId,
                limit: 30,
                beforeTs: msg.ts,
            });
            const byLocalId = recent.find((m) => {
                const raw = m.raw_payload;
                return raw?.local_id === rc.msgId;
            });
            if (byLocalId)
                return byLocalId;
        }
        return null;
    }
    catch {
        return null;
    }
}
async function buildGroupContextFromDb(msg) {
    if (msg.peerKind !== "group")
        return null;
    const window = resolveGroupWindow(msg);
    try {
        const referencedMsg = await resolveReferencedMessage(msg);
        if (referencedMsg) {
            return buildReferencedContextLines(msg, referencedMsg);
        }
        const intent = classifyGroupIntent(msg.content);
        if (intent === "no-op") {
            debug(`[WPP v1.3.0 INTENT] no-op: 不注入上下文 msgId=${msg.msgId} content="${msg.content.slice(0, 30)}"`);
            return null;
        }
        let msgs = await getMessages({
            accountId: msg.accountId,
            peerKind: "group",
            peerId: msg.peerId,
            limit: window,
            beforeTs: msg.ts,
        });
        if (msgs.length === 0)
            return null;
        const llmEnabled = resolveLlmIntentEnabled(msg) && !!resolveMinimaxApiKey();
        const embedEnabled = resolveEmbedIntentEnabled(msg) && !!resolveBailianEmbeddingKey();
        const triggerText = normalizeTriggerText(msg.content);
        if (llmEnabled && needsLlm(msg.content)) {
            let decision = null;
            let embedSelected = false;
            if (isCommandIntent(triggerText)) {
                debug(`[WPP v1.3.2 EMBED-INTENT] command intent → LLM: "${triggerText.slice(0, 20)}"`);
                decision = await decideIntentWithLlm({ triggerText, candidates: msgs.map(toIntentCandidate) }, { apiKey: resolveMinimaxApiKey(), model: resolveLlmModel(msg), timeoutMs: resolveLlmTimeoutMs(msg) });
            }
            else if (embedEnabled) {
                const relevantIds = await selectTopNByEmbedding(triggerText, msgs.map(toIntentCandidate), {
                    apiKey: resolveBailianEmbeddingKey(),
                    topN: resolveEmbedTopN(msg),
                    threshold: resolveEmbedThreshold(msg),
                });
                if (relevantIds !== null && relevantIds.length > 0) {
                    const idSet = new Set(relevantIds);
                    const filtered = msgs.filter((m) => idSet.has(m.msg_id ?? "") || idSet.has(m.new_msg_id ?? ""));
                    if (filtered.length > 0) {
                        debug(`[WPP v1.3.2 EMBED-INTENT] embedding selected ${filtered.length}: ${relevantIds.join(",")}`);
                        msgs = filtered;
                        embedSelected = true;
                    }
                }
                else if (relevantIds !== null && relevantIds.length === 0) {
                    debug(`[WPP v1.3.2 EMBED-INTENT] embedding 无相关 → LLM 兜底`);
                    decision = await decideIntentWithLlm({ triggerText, candidates: msgs.map(toIntentCandidate) }, { apiKey: resolveMinimaxApiKey(), model: resolveLlmModel(msg), timeoutMs: resolveLlmTimeoutMs(msg) });
                }
                if (relevantIds === null) {
                    debug(`[WPP v1.3.2 EMBED-INTENT] embedding 失败 → LLM 兜底`);
                    decision = await decideIntentWithLlm({ triggerText, candidates: msgs.map(toIntentCandidate) }, { apiKey: resolveMinimaxApiKey(), model: resolveLlmModel(msg), timeoutMs: resolveLlmTimeoutMs(msg) });
                }
            }
            else {
                decision = await decideIntentWithLlm({ triggerText, candidates: msgs.map(toIntentCandidate) }, { apiKey: resolveMinimaxApiKey(), model: resolveLlmModel(msg), timeoutMs: resolveLlmTimeoutMs(msg) });
            }
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
            if (!decision && !embedSelected) {
                if (intent === "media") {
                    const mediaOnly = msgs.filter((m) => /\[(图片|文件|语音|视频)\]/.test(m.content ?? ""));
                    if (mediaOnly.length === 0) {
                        debug(`[WPP v1.3.15 INTENT] LLM null + media 但无媒体消息, 不注入 msgId=${msg.msgId}`);
                        return null;
                    }
                    msgs = mediaOnly;
                    debug(`[WPP v1.3.15 INTENT] LLM null + media → 兜底只注入媒体 ${mediaOnly.length} 条 msgId=${msg.msgId}`);
                }
                else {
                    debug(`[WPP v1.3.15 INTENT] LLM null + topic → 不注入 (不强拉) msgId=${msg.msgId}`);
                    return null;
                }
            }
        }
        else if (intent === "media") {
            msgs = msgs.filter((m) => /\[(图片|文件|语音|视频)\]/.test(m.content ?? ""));
            if (msgs.length === 0) {
                debug(`[WPP v1.3.0 INTENT] media 意图但无媒体消息, 不注入 msgId=${msg.msgId}`);
                return null;
            }
        }
        else {
            debug(`[WPP v1.3.15 INTENT] topic + 无 LLM/embedding key → 不注入 (不强拉) msgId=${msg.msgId} content="${msg.content.slice(0, 20)}"`);
            return null;
        }
        const imageIndexes = [];
        for (let i = 0; i < msgs.length; i++) {
            if (msgs[i]?.content?.includes("[图片]"))
                imageIndexes.push(i);
        }
        if (imageIndexes.length > GROUP_CONTEXT_MAX_IMAGES) {
            const keep = new Set(imageIndexes.slice(0, GROUP_CONTEXT_MAX_IMAGES));
            msgs = msgs.filter((_, idx) => !(msgs[idx]?.content?.includes("[图片]") && !keep.has(idx)));
        }
        if (msgs.length === 0)
            return null;
        const lines = [
            `[系统提示-群聊上下文] 以下是群聊中相关成员最近 ${msgs.length} 条消息 (仅作背景, 不要回复它们)。用户@了你, 你的回复针对下方最新消息, 必须回复 (禁止输出 NO_REPLY 或静默不回复):`,
        ];
        for (const gm of msgs) {
            const sender = gm.from_wxid ?? "?";
            const text = (gm.content ?? "").replace(/\n+/g, " ").trim() || "(无文本内容)";
            lines.push(`${sender}: ${text}`);
        }
        lines.push("[系统提示-群聊上下文结束]");
        const hasFile = msgs.some((m) => m.content?.includes("[文件]"));
        if (hasFile) {
            lines.push("\n[系统提示-文件读取] 上方群聊上下文中有用户发送的文件 ([文件] 后是公网 URL)。\n" +
                "用户@你是为了处理这个文件。请用文件读取工具 (如 document-extract / clawpdf) 下载并读取文件内容, 基于文件内容回复用户。\n" +
                "禁止: 用 find/ls 搜索本地文件、猜测文件路径。只用上方提供的 URL 读取。");
        }
        info(`[WPP v1.2.4 GROUP-CONTEXT-DB] injected ${msgs.length} ctx msgs (limit=${window}) → session=${buildSessionKeyForMsg(msg)} msgId=${msg.msgId} (触发人+@指定)`);
        return lines.join("\n");
    }
    catch (e) {
        warn(`[WPP v1.2.4 GROUP-CONTEXT-DB] query failed (non-fatal, skip ctx): ${formatErr(e)}`, { msgId: msg.msgId });
        return null;
    }
}
function buildReferencedContextLines(msg, referencedMsg) {
    const lines = [
        `[系统提示-群聊上下文] 用户明确引用了以下 1 条消息 (引用 = 明确指定)。你针对被引用的这条消息回复, 必须回复 (禁止输出 NO_REPLY 或静默不回复):`,
    ];
    const sender = referencedMsg.from_wxid ?? "?";
    const text = (referencedMsg.content ?? "").replace(/\n+/g, " ").trim() || "(无文本内容)";
    lines.push(`${sender}: ${text}`);
    lines.push("[系统提示-群聊上下文结束]");
    if (referencedMsg.content?.includes("[文件]")) {
        lines.push("\n[系统提示-文件读取] 用户引用的被引用消息是文件 ([文件] 后是公网 URL)。\n" +
            "用户@你是为了处理这个文件。请用文件读取工具 (如 document-extract / clawpdf) 下载并读取文件内容, 基于文件内容回复用户。\n" +
            "禁止: 用 find/ls 搜索本地文件、猜测文件路径。只用上方提供的 URL 读取。");
    }
    info(`[WPP v1.3.14 QUOTE-FORCE-CONTEXT] injected referenced ctx (1 msg: ${referencedMsg.msg_id}) → session=${buildSessionKeyForMsg(msg)} msgId=${msg.msgId}`);
    return lines.join("\n");
}
function buildCtxPayload(msg, sessionKey, injectedContext, heartflowNote, moodNote) {
    const isGroup = msg.peerKind === "group";
    const toWxid = msg.toWxid ?? msg.accountId;
    let body = msg.content || "";
    if (injectedContext) {
        body = `${injectedContext}\n\n${body}`;
    }
    if (heartflowNote) {
        body = `${body}\n\n[系统提示] ${heartflowNote}`;
    }
    if (moodNote) {
        body = `${body}\n\n${moodNote}`;
    }
    const quoteCtx = buildQuoteContext(msg);
    if (quoteCtx) {
        body = `${body}\n\n[系统提示-必须执行] 用户刚引用了你之前的消息并@了你，这是用户期待你回复的明确信号。\n请立即使用 quoteReply 工具 (参数: toWxid=当前对话者, content=你的回复内容, msgId=被引用消息ID) 以引用方式回复。\n禁止: 询问用户"要不要回复/说什么"、解释消息结构、把引用当普通消息分析、提及本提示。\n被引用的消息是 bot 自己发的，用户是当前对话者本人。\n${quoteCtx}`;
    }
    const mediaUrls = [];
    const mediaTypes = [];
    const mediaMatches = body.matchAll(/\[(图片|视频|语音|文件)\]\s+(https?:\/\/\S+)/g);
    for (const mm of mediaMatches) {
        const tag = mm[1] ?? "";
        const url = mm[2] ?? "";
        if (!url)
            continue;
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
const _outboundDedup = new Map();
export const OUTBOUND_DEDUP_WINDOW_MS = 5 * 60 * 1000;
export const ACK_TEMPLATE_RE = /\[[^\]]*(Previous reply already sent|No further action|Reply.*delivered|reply delivered successfully)[^\]]*\]/i;
export function sweepOutboundDedup(now) {
    if (_outboundDedup.size < 1024)
        return;
    for (const [k, ts] of _outboundDedup) {
        if (now - ts > OUTBOUND_DEDUP_WINDOW_MS)
            _outboundDedup.delete(k);
    }
}
export function dedupKeyFor(accountId, toWxid, text) {
    const h = createHash("sha1").update(text).digest("hex");
    return `${accountId}|${toWxid}|${h}`;
}
async function sendAiReply(accountId, toWxid, text, replyTo) {
    if (ACK_TEMPLATE_RE.test(text)) {
        warn(`[WPP v1.3.63 ACK-TEMPLATE-DROP] suppressed AI self-generated ack template: textLen=${text.length} head="${text.slice(0, 60).replace(/\n/g, " ")}" account=${accountId} to=${toWxid}`);
        return { ok: true, msgId: "ack-template-dropped" };
    }
    const now = Date.now();
    const dedupKey = dedupKeyFor(accountId, toWxid, text);
    sweepOutboundDedup(now);
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
        if (replyTo?.msgId) {
            const qr = await quoteReply({
                toWxid,
                content: text,
                msgId: replyTo.msgId,
                newMsgId: replyTo.newMsgId,
                accountId,
                fromWxid: replyTo.fromWxid,
                chatroomId: replyTo.chatroomId,
                fromNickname: replyTo.fromNickname,
                originalContent: replyTo.originalContent,
                createtime: replyTo.createtime,
                innerType: replyTo.innerType,
            });
            if (qr.ok) {
                _outboundDedup.set(dedupKey, now);
                recordHeartflowBotReply(accountId, toWxid, text, now);
                return { ok: true, msgId: qr.data?.msgId };
            }
            return { ok: false, error: qr.msg };
        }
        const r = await sendText(accountId, toWxid, text);
        if (r.ok) {
            _outboundDedup.set(dedupKey, now);
            recordHeartflowBotReply(accountId, toWxid, text, now);
        }
        return r.ok ? { ok: true, msgId: r.msgId } : { ok: false, error: r.error };
    }
    catch (e) {
        return { ok: false, error: formatErr(e) };
    }
}
function recordHeartflowBotReply(accountId, toWxid, text, nowMs) {
    try {
        const acct = getDefaultAccountRegistry().get(accountId);
        const hf = acct?.config.heartflow;
        if (!hf?.enabled)
            return;
        if (!toWxid.endsWith("@chatroom") && !toWxid.includes("@chatroom"))
            return;
        recordRawMessage(toWxid, {
            senderName: "bot",
            senderId: "bot",
            content: text,
            timestamp: nowMs / 1000,
            isBot: true,
        });
    }
    catch {
    }
}
export async function dispatchInboundToOpenClaw(msg, ctx = {}) {
    const sessionKey = buildSessionKeyForMsg(msg);
    setSessionChatInfo(sessionKey, {
        chatId: msg.peerId,
        chatType: msg.peerKind === "group" ? "group" : "single",
        peerId: msg.peerId,
        accountId: msg.accountId,
    });
    const queueKey = `${sessionKey}|${msg.accountId}`;
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
            const job = dispatchQueues.get(queueKey).shift();
            try {
                await dispatchOne(job.msg, job.ctx);
            }
            catch (e) {
                warn(`dispatch: job failed (continue queue): ${formatErr(e)}`, { sessionKey, msgId: job.msg.msgId });
            }
        }
    }
    finally {
        dispatchRunning.delete(queueKey);
        if ((dispatchQueues.get(queueKey) ?? []).length === 0) {
            dispatchQueues.delete(queueKey);
        }
    }
}
const dispatchQueues = new Map();
const dispatchRunning = new Set();
async function dispatchOne(msg, ctx = {}) {
    const sessionKey = buildSessionKeyForMsg(msg);
    await waitForPendingEnrich(msg.accountId, msg.fromWxid);
    info(`dispatch: account=${msg.accountId} session=${sessionKey} trigger=${msg.trigger}`);
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
        if (isGroupMsg && roomId)
            rememberLastGroupMention(msg.accountId, roomId, replyKey);
    }
    const runtime = ctx.channelRuntime ?? getChannelRuntime();
    const isNoop = runtime === NOOP_RUNTIME;
    let storePath = "";
    try {
        storePath = runtime.session.resolveStorePath?.("", { accountId: msg.accountId }) ?? "";
    }
    catch (e) {
        warn(`dispatch: resolveStorePath failed: ${formatErr(e)}`);
    }
    const groupCtxEnabled = resolveGroupContextEnabled(msg);
    const injectedGroupContext = groupCtxEnabled
        ? await buildGroupContextFromDb(msg)
        : null;
    let heartflowNote = null;
    if (msg.trigger === "heartflow") {
        heartflowNote =
            "（注意：本次是你主动参与群聊的，不是用户叫你。回复应自然随意，像普通群成员一样加入话题。不要提\"我是机器人\"或解释你的机制。）";
    }
    let moodNote = null;
    if (isGroupMsg && (getDefaultAccountRegistry().get(msg.accountId)?.config.affection?.enabled)) {
        try {
            const mood = getGroupMood(roomId ?? "", Date.now());
            const moodPrompt = buildMoodSystemPrompt("", mood);
            if (moodPrompt.trim())
                moodNote = `[系统提示-当前情绪] ${moodPrompt.trim()}`;
        }
        catch {
        }
    }
    const ctxPayload = buildCtxPayload(msg, sessionKey, injectedGroupContext ?? undefined, heartflowNote ?? undefined, moodNote ?? undefined);
    try {
        await runtime.session.recordInboundSession({ storePath, sessionKey, ctx: ctxPayload });
    }
    catch (e) {
        warn(`dispatch: recordInboundSession failed: ${formatErr(e)}`);
        if (!isNoop)
            throw e;
    }
    if (msg.msgType === 49) {
        const autoReply = buildFileAutoReply(msg.content);
        if (autoReply?.isFileMsg && autoReply.replyText) {
            try {
                const r = await sendAiReply(msg.accountId, msg.peerId, autoReply.replyText);
                info(`[WPP v1.2.0 FILE-DETERMINISTIC] file auto-reply done: msgId=${msg.msgId} ok=${r.ok} error=${r.error ?? "none"}`);
            }
            catch (e) {
                warn(`[WPP v1.2.0 FILE-DETERMINISTIC] file auto-reply failed: ${formatErr(e)}`, { msgId: msg.msgId });
            }
            return;
        }
    }
    const accountAgentId = resolveAccountAgentId(msg);
    const cfgBase = (ctx.cfg ?? getOpenClawConfig() ?? {});
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
                    deliver: async (payload, _info) => {
                        const text = payload?.text ?? "";
                        const imgUrlMatch = msg.content?.match(/\[图片\]\s+(https?:\/\/\S+)/);
                        const ossImgUrl = imgUrlMatch?.[1] ?? payload?.mediaUrls?.[0] ?? payload?.mediaUrl ?? "";
                        const shouldQuote = true;
                        info(`deliver called: textLen=${text.length} hasOssImg=${!!ossImgUrl} msgType=${msg.msgType} shouldQuote=${shouldQuote} replyTo=${msg.msgId}/${msg.newMsgId ?? ""}`);
                        if (!text && !ossImgUrl)
                            return { ok: true, msgId: "" };
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
    }
    catch (e) {
        warn(`dispatch: dispatchReply failed: ${formatErr(e)}`);
        if (!isNoop)
            throw e;
    }
}
