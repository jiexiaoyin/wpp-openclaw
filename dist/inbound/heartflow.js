import { warn } from "../core/logger.js";
import { safeFetch } from "../util/safe-fetch.js";
export function defaultHeartflowConfig() {
    return {
        enabled: false,
        model: "MiniMax-M2.5",
        timeoutMs: 5000,
        replyThreshold: 0.6,
        energyDecayRate: 0.1,
        energyRecoveryRate: 0.02,
        contextMessagesCount: 5,
        minReplyIntervalSec: 0,
        whitelistGroups: [],
        weights: { relevance: 0.25, willingness: 0.2, social: 0.2, timing: 0.15, continuity: 0.2 },
        includeReasoning: false,
        maxRetries: 2,
    };
}
export function extractHeartflowJson(text) {
    const s = String(text ?? "").trim();
    if (!s)
        return null;
    try {
        return JSON.parse(s);
    }
    catch {
    }
    const cleaned = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    try {
        return JSON.parse(cleaned);
    }
    catch {
    }
    const m = s.match(/\{[\s\S]*\}/);
    if (m) {
        try {
            return JSON.parse(m[0]);
        }
        catch {
            return null;
        }
    }
    return null;
}
export function clampScore(v) {
    if (typeof v === "number" && Number.isFinite(v)) {
        return Math.max(0, Math.min(10, v));
    }
    if (typeof v === "string") {
        const n = Number(v);
        if (Number.isFinite(n))
            return Math.max(0, Math.min(10, n));
    }
    return 0;
}
const chatStates = new Map();
export function resetHeartflowStates() {
    chatStates.clear();
}
export function getChatState(chatId, cfg, nowMs) {
    let st = chatStates.get(chatId);
    if (!st) {
        st = { energy: 1.0, lastReplyTime: 0, lastResetDate: "", totalMessages: 0, totalReplies: 0 };
        chatStates.set(chatId, st);
    }
    const today = new Date(nowMs).toISOString().slice(0, 10);
    if (st.lastResetDate !== today) {
        st.lastResetDate = today;
        st.energy = Math.min(1.0, st.energy + 0.2);
    }
    if (st.lastReplyTime > 0) {
        const elapsedMs = nowMs - st.lastReplyTime;
        const timeRecovery = (elapsedMs / (60 * 1000)) * ((cfg.energyRecoveryRate ?? 0.02) * 5);
        st.energy = Math.min(1.0, st.energy + timeRecovery);
        st.lastReplyTime = nowMs;
    }
    return st;
}
export function secondsSinceLastReply(chatId, nowMs) {
    const st = chatStates.get(chatId);
    if (!st || st.lastReplyTime === 0)
        return 0;
    return Math.max(0, (nowMs - st.lastReplyTime) / 1000);
}
export function recordActiveReply(chatId, cfg, nowMs) {
    const st = getChatState(chatId, cfg, nowMs);
    st.lastReplyTime = nowMs;
    st.totalReplies += 1;
    st.totalMessages += 1;
    st.energy = Math.max(0.1, st.energy - (cfg.energyDecayRate ?? 0.1));
}
export function recordPassiveMessage(chatId, cfg, nowMs) {
    const st = getChatState(chatId, cfg, nowMs);
    st.totalMessages += 1;
    st.energy = Math.min(1.0, st.energy + (cfg.energyRecoveryRate ?? 0.02));
}
const rawBuffers = new Map();
const RAW_BUFFER_MAX = 200;
export function resetHeartflowBuffers() {
    rawBuffers.clear();
}
export function recordRawMessage(chatId, msg) {
    let buf = rawBuffers.get(chatId);
    if (!buf) {
        buf = [];
        rawBuffers.set(chatId, buf);
    }
    buf.push(msg);
    if (buf.length > RAW_BUFFER_MAX)
        buf.splice(0, buf.length - RAW_BUFFER_MAX);
}
export function getRawBuffer(chatId, n) {
    const buf = rawBuffers.get(chatId) ?? [];
    return buf.slice(-n);
}
export function formatRawMessages(msgs) {
    if (!msgs.length)
        return "暂无对话历史";
    return msgs
        .map((m) => `${m.isBot ? "[机器人]" : `[${m.senderName}]`}: ${m.content}`)
        .join("\n");
}
export function rawMessagesToContexts(msgs) {
    return msgs.map((m) => ({ role: m.isBot ? "assistant" : "user", content: m.content }));
}
export function lastBotReply(chatId) {
    const buf = rawBuffers.get(chatId) ?? [];
    for (let i = buf.length - 1; i >= 0; i--) {
        const m = buf[i];
        if (m && m.isBot && m.content.trim())
            return m.content;
    }
    return null;
}
export function buildChatContextSummary(chatId, cfg, nowMs) {
    const st = getChatState(chatId, cfg, nowMs);
    const msgs = rawBuffers.get(chatId) ?? [];
    let postReplyEngagement = "";
    let foundBot = false;
    let userMsgsAfterBot = 0;
    for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (!m)
            break;
        if (m.isBot) {
            foundBot = true;
            break;
        }
        userMsgsAfterBot += 1;
    }
    if (foundBot) {
        if (userMsgsAfterBot >= 3)
            postReplyEngagement = "（上次回复后群里进行了热烈讨论）";
        else if (userMsgsAfterBot === 0)
            postReplyEngagement = "（上次回复后无人接话）";
    }
    const activity = st.totalMessages > 100 ? "高" : st.totalMessages > 20 ? "中" : "低";
    const replyRate = (st.totalReplies / Math.max(1, st.totalMessages)) * 100;
    const now = new Date(nowMs);
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    let info = `最近活跃度: ${activity}\n历史回复率: ${replyRate.toFixed(1)}%\n当前时间: ${hhmm}`;
    if (postReplyEngagement)
        info += `\n回复效果: ${postReplyEngagement}`;
    return info;
}
export function buildHeartflowPrompt(input, cfg) {
    const reasoningPart = cfg.includeReasoning
        ? ',\n    "reasoning": "详细分析原因，说明为什么应该或不应该回复，需要结合机器人角色特点进行分析，特别说明与上次回复的关联性"'
        : "";
    const lastReplyStr = input.lastBotReply || "暂无上次回复记录";
    const sinceMin = input.secondsSinceLastReply > 0 ? Math.round(input.secondsSinceLastReply / 60) : "从未回复";
    return `你是群聊机器人的决策系统，需要判断是否应该主动回复以下消息。

## 机器人角色设定
${input.botNickname ? `我是 ${input.botNickname}，一个群聊机器人助手。` : "默认角色：智能助手"}

## 当前群聊情况
- 群聊ID: ${input.chatId}
- 我的精力水平: ${input.energy.toFixed(1)}/1.0
- 上次发言: ${sinceMin}${typeof sinceMin === "number" ? "分钟前" : ""}

## 群聊基本信息
${input.chatContext}

## 最近${cfg.contextMessagesCount ?? 5}条对话历史
${input.recentMessages}

## 上次机器人回复
${lastReplyStr}

## 待判断消息
发送者: ${input.senderName}
内容: ${input.content}
时间: ${new Date().toTimeString().slice(0, 8)}

## 评估要求
请从以下5个维度评估（0-10分），**基于机器人角色设定来判断是否适合回复**：

1. **内容相关度**(0-10)：消息是否有趣、有价值、适合我回复
   - 考虑消息的质量、话题性、是否需要回应
   - 识别并过滤垃圾消息、无意义内容
   - **结合机器人角色特点，判断是否符合角色定位**

2. **回复意愿**(0-10)：基于当前状态，我回复此消息的意愿
   - 考虑当前精力水平和心情状态
   - 考虑今日回复频率控制
   - **基于机器人角色设定，判断是否应该主动参与此话题**

3. **社交适宜性**(0-10)：在当前群聊氛围下回复是否合适
   - 考虑群聊活跃度和讨论氛围
   - **考虑机器人角色在群中的定位和表现方式**

4. **时机恰当性**(0-10)：回复时机是否恰当
   - 考虑距离上次回复的时间间隔
   - 考虑消息的紧急性和时效性

5. **对话连贯性**(0-10)：当前消息与上次机器人回复的关联程度
   - 如果当前消息是对上次回复的回应或延续，应给高分
   - 如果当前消息与上次回复完全无关，给中等分数
   - 如果没有上次回复记录，给默认分数5分

**回复阈值**: ${cfg.replyThreshold ?? 0.6} (综合评分达到此分数才回复)

**重要！！！请严格按照以下JSON格式回复，不要添加任何其他内容：**

{
    "relevance": 分数,
    "willingness": 分数,
    "social": 分数,
    "timing": 分数,
    "continuity": 分数${reasoningPart}
}
`;
}
export function parseHeartflowResponse(text, cfg) {
    const data = extractHeartflowJson(text);
    if (!data)
        return null;
    const dims = {
        relevance: clampScore(data.relevance),
        willingness: clampScore(data.willingness),
        social: clampScore(data.social),
        timing: clampScore(data.timing),
        continuity: clampScore(data.continuity),
    };
    const w = {
        relevance: cfg.weights?.relevance ?? 0.25,
        willingness: cfg.weights?.willingness ?? 0.2,
        social: cfg.weights?.social ?? 0.2,
        timing: cfg.weights?.timing ?? 0.15,
        continuity: cfg.weights?.continuity ?? 0.2,
    };
    const overall = (dims.relevance * w.relevance +
        dims.willingness * w.willingness +
        dims.social * w.social +
        dims.timing * w.timing +
        dims.continuity * w.continuity) /
        10.0;
    return {
        shouldReply: overall >= (cfg.replyThreshold ?? 0.6),
        overallScore: overall,
        dimensions: dims,
        reasoning: typeof data.reasoning === "string" ? data.reasoning : "",
    };
}
export async function judgeHeartflow(input, cfg, opts) {
    if (!opts.apiKey) {
        warn("[WPP HEARTFLOW] missing MiniMax API key, skip heartflow judge");
        return null;
    }
    const baseUrl = (opts.baseUrl ?? "https://api.minimaxi.com/anthropic").replace(/\/$/, "");
    const model = cfg.model ?? "MiniMax-M2.5";
    const timeoutMs = cfg.timeoutMs ?? 5000;
    const maxTokens = 300;
    const maxRetries = Math.max(0, cfg.maxRetries ?? 2);
    const prompt = buildHeartflowPrompt(input, cfg);
    const systemPrompt = "你是一个专业的群聊回复决策系统，能够准确判断消息价值和回复时机。\n" +
        "你必须严格按照JSON格式返回结果，不要包含任何其他内容！请不要进行对话，只返回JSON！";
    let lastErr = "";
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const userPrompt = attempt === 0
            ? prompt
            : prompt.replace("**重要！！！请严格按照以下JSON格式回复，不要添加任何其他内容：**", `**重要！！！请严格按照以下JSON格式回复，不要添加任何其他内容！这是第${attempt + 1}次尝试，请确保返回有效的JSON格式！**`);
        try {
            const resp = await safeFetch(`${baseUrl}/v1/messages`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "anthropic-version": "2023-06-01",
                    "x-api-key": opts.apiKey,
                },
                body: JSON.stringify({
                    model,
                    max_tokens: maxTokens,
                    temperature: 0,
                    system: systemPrompt,
                    messages: [{ role: "user", content: userPrompt }],
                }),
                signal: AbortSignal.timeout(timeoutMs),
            });
            if (!resp.ok) {
                const err = await resp.text().catch(() => "");
                lastErr = `HTTP ${resp.status}: ${err.slice(0, 120)}`;
                continue;
            }
            const json = (await resp.json());
            const text = json.content?.find((b) => b.type === "text")?.text ?? "";
            const result = parseHeartflowResponse(text, cfg);
            if (result)
                return result;
            lastErr = `unparseable: ${text.slice(0, 80)}`;
        }
        catch (e) {
            lastErr = e instanceof Error ? e.message : String(e);
        }
    }
    warn(`[WPP HEARTFLOW] judge failed after ${maxRetries + 1} attempts: ${lastErr}`);
    return null;
}
export function checkHeartflowGate(chatId, content, cfg, nowMs) {
    if (!cfg.enabled)
        return { allowed: false, reason: "disabled" };
    if (cfg.whitelistGroups && cfg.whitelistGroups.length > 0) {
        if (!cfg.whitelistGroups.includes(chatId))
            return { allowed: false, reason: "not-whitelisted" };
    }
    if (!content || !content.trim())
        return { allowed: false, reason: "empty" };
    const minInterval = cfg.minReplyIntervalSec ?? 0;
    if (minInterval > 0) {
        const since = secondsSinceLastReply(chatId, nowMs);
        if (since > 0 && since < minInterval)
            return { allowed: false, reason: "cooling" };
    }
    return { allowed: true };
}
