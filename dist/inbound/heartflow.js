// src/inbound/heartflow.ts - v1.3.75 HEARTFLOW: 群聊主动回复 (心流机制)
//
// 移植自 AstrBot 插件 astrbot_plugin_Heartflow (v2.1.1, Jason.Joestar) —
// 算法/状态机/缓冲纯逻辑平移, 接入层按 OpenClaw 语义重写。
//
// 核心: 未@机器人的群消息, 用「小模型 5 维打分 + 加权阈值 + 精力状态机」决定
//       是否主动参与群聊 (让机器人在群里更"活", 而非只回 @)。
//
// 架构 (双 LLM):
//   群消息(未@) → heartflowJudge() 小模型打分(5维) → 分≥阈值 → via:"heartflow" 触发
//                                                      → 主 LLM 生成自然回复
//                  ↓ 分<阈值
//                  记录精力, 不回复 (精力控制频率防刷屏)
//
// 5 维评分 (0-10, 加权, 默认 relevance 0.25 / willingness 0.20 / social 0.20 /
//          timing 0.15 / continuity 0.20):
//   1. 内容相关度  消息是否值得回复 (质量/话题性/角色契合)
//   2. 回复意愿    基于精力/心情/今日频率
//   3. 社交适宜性  群氛围下回复是否合适
//   4. 时机恰当性  距上次回复间隔/时效性
//   5. 对话连贯性  与上次 bot 回复的关联
//
// 精力状态机 (每群独立):
//   - 回复后 energy -= decay (默认 0.1)
//   - 不回复时 energy += recovery (默认 0.02)
//   - 每日重置 +0.2, 时间流逝自然恢复
//   - 范围 [0.1, 1.0]
import { warn } from "../core/logger.js";
import { callJudge, resolveJudgeCreds } from "../llm-judge.js";
export function defaultHeartflowConfig() {
    return {
        enabled: false,
        // v1.4.0 12:09 老板拍板: 消除 plugin hardcode. model 由 schema default (openclaw.plugin.json) + accounts cfg 链提供.
        // 万一两层都未配置 → 运行时 cfg.model 抛错 (heartflow.ts:475)
        model: undefined, // placeholder,运行时由 cfg.model 提供;类型占位仅为兼容 HeartflowConfig.model?: string
        timeoutMs: 5000, // v1.4.0 P0-fix 19:30: L3 跟 L1/L2/L4=5000 对齐; 老板 09:38 15000 是为旧 hardcode M2.5 准备的, 14:55 改 M2.7-highspeed 后 5000ms 足够
        replyThreshold: 0.6,
        energyDecayRate: 0.1,
        energyRecoveryRate: 0.02,
        contextMessagesCount: 5,
        minReplyIntervalSec: 0,
        minJudgeIntervalSec: 0,
        whitelistGroups: [],
        weights: { relevance: 0.25, willingness: 0.2, social: 0.2, timing: 0.15, continuity: 0.2 },
        includeReasoning: false,
        maxRetries: 1, // P1: 默认 1 次重试 (原 2 → 3 次调用, 阻塞最坏 15s)
        independentTrigger: false, // v1.5.0 B-fix 20:06: 默认关闭, 保持现有行为兼容
    };
}
// ===== 纯逻辑: JSON 稳健解析 (移植自 Heartflow _extract_json) =====
/**
 * 从模型返回文本中稳健提取 JSON 对象 (依次尝试直接解析 / 剥 markdown 围栏 / 正则取最外层 {...})。
 */
export function extractHeartflowJson(text) {
    const s = String(text ?? "").trim();
    if (!s)
        return null;
    // 1. 直接解析
    try {
        return JSON.parse(s);
    }
    catch {
        /* 继续 */
    }
    // 2. 剥 markdown 代码块
    const cleaned = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    try {
        return JSON.parse(cleaned);
    }
    catch {
        /* 继续 */
    }
    // 3. 正则提取最外层 {...}
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
/** 分数钉位到 [0, 10] (移植自 Heartflow _clamp_score) */
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
// ===== 纯逻辑: 精力状态机 (移植自 Heartflow ChatState + _get_chat_state) =====
/** 每群状态存储 (内存) */
const chatStates = new Map();
/** 测试/热重载: 清空所有群状态 */
export function resetHeartflowStates() {
    chatStates.clear();
}
/**
 * 获取 (或创建) 群状态, 并应用每日重置 + 时间自然恢复。
 * P0-5: 时间恢复用独立 lastEnergyRecoveryTs, 不再推进 lastReplyTime —
 *   否则每次 judge 调用都重置 lastReplyTime → secondsSinceLastReply 恒≈0 → 冷却失效。
 */
export function getChatState(chatId, cfg, nowMs) {
    let st = chatStates.get(chatId);
    if (!st) {
        st = { energy: 1.0, lastReplyTime: 0, lastResetDate: "", totalMessages: 0, totalReplies: 0, lastEnergyRecoveryTs: 0 };
        chatStates.set(chatId, st);
    }
    const today = new Date(nowMs).toISOString().slice(0, 10);
    if (st.lastResetDate !== today) {
        st.lastResetDate = today;
        st.energy = Math.min(1.0, st.energy + 0.2); // 每日重置恢复 20%
    }
    // 时间自然恢复: 每 5 分钟恢复 recovery * 5 (基于上次恢复时间, 不碰 lastReplyTime)
    if (st.lastEnergyRecoveryTs > 0) {
        const elapsedMs = nowMs - st.lastEnergyRecoveryTs;
        if (elapsedMs > 0) {
            const timeRecovery = (elapsedMs / (60 * 1000)) * ((cfg.energyRecoveryRate ?? 0.02) * 5);
            st.energy = Math.min(1.0, st.energy + timeRecovery);
        }
    }
    st.lastEnergyRecoveryTs = nowMs;
    return st;
}
/** 距上次回复的秒数 (0 = 从未回复) */
export function secondsSinceLastReply(chatId, nowMs) {
    const st = chatStates.get(chatId);
    if (!st || st.lastReplyTime === 0)
        return 0;
    return Math.max(0, (nowMs - st.lastReplyTime) / 1000);
}
/** 回复后更新状态 (精力消耗) */
export function recordActiveReply(chatId, cfg, nowMs) {
    const st = getChatState(chatId, cfg, nowMs);
    st.lastReplyTime = nowMs;
    st.totalReplies += 1;
    st.totalMessages += 1;
    st.energy = Math.max(0.1, st.energy - (cfg.energyDecayRate ?? 0.1));
}
/** 未回复时更新状态 (精力恢复 + 消息计数) */
export function recordPassiveMessage(chatId, cfg, nowMs) {
    const st = getChatState(chatId, cfg, nowMs);
    st.totalMessages += 1;
    st.energy = Math.min(1.0, st.energy + (cfg.energyRecoveryRate ?? 0.02));
}
// ===== 纯逻辑: 原始消息环形缓冲 (移植自 Heartflow _raw_msg_buffer) =====
const rawBuffers = new Map();
const RAW_BUFFER_MAX = 200;
/** 测试/热重载: 清空所有群缓冲 */
export function resetHeartflowBuffers() {
    rawBuffers.clear();
}
/** 写入一条原始消息 (无论是否触发, 含 bot 自己回复) */
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
/** 取最近 N 条 (时间顺序) */
export function getRawBuffer(chatId, n) {
    const buf = rawBuffers.get(chatId) ?? [];
    return buf.slice(-n);
}
/** 最近消息 → 文本行 (供 prompt) */
export function formatRawMessages(msgs) {
    if (!msgs.length)
        return "暂无对话历史";
    return msgs
        .map((m) => `${m.isBot ? "[机器人]" : `[${m.senderName}]`}: ${m.content}`)
        .join("\n");
}
/** 最近消息 → 对话上下文 (供 MiniMax messages) */
export function rawMessagesToContexts(msgs) {
    return msgs.map((m) => ({ role: m.isBot ? "assistant" : "user", content: m.content }));
}
/** 上次 bot 回复内容 */
export function lastBotReply(chatId) {
    const buf = rawBuffers.get(chatId) ?? [];
    for (let i = buf.length - 1; i >= 0; i--) {
        const m = buf[i];
        if (m && m.isBot && m.content.trim())
            return m.content;
    }
    return null;
}
/** 构建群聊上下文摘要 (活跃度/回复率/当前时间/上次回复效果) */
export function buildChatContextSummary(chatId, cfg, nowMs) {
    const st = getChatState(chatId, cfg, nowMs);
    const msgs = rawBuffers.get(chatId) ?? [];
    // 上次回复后群里的接话情况
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
/**
 * 构造 5 维判断 prompt (移植自 Heartflow judge_prompt)。
 * 返回完整 user prompt。
 */
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
/**
 * 解析 5 维打分响应 → JudgeResult。
 * 失败 (坏 JSON / 分数异常) → null (调用方降级为不回复)。
 */
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
/**
 * 调小模型做 5 维打分判断。
 * 任何失败 (无 key/超时/HTTP/坏 JSON) → null (调用方降级不回复)。
 * 带重试 (maxRetries)。
 */
export async function judgeHeartflow(input, cfg, opts) {
    if (!opts.apiKey) {
        warn("[WPP HEARTFLOW] missing judge API key (DEEPSEEK_API_KEY / MINIMAX_API_KEY), skip heartflow judge");
        return null;
    }
    // v1.4.0 12:09 老板拍板: 消除 plugin hardcode, model 必须从 cfg 链 (schema default → accounts cfg) 提供, 缺失立即报错
    const model = cfg.model;
    if (!model) {
        throw new Error("[WPP HEARTFLOW] cfg.model unresolved. v1.4.0 12:09 老板拍板: 必须从 schema default (openclaw.plugin.json channelConfigs.wechatpadpro.schema.properties.heartflow.properties.model.default) 或 accounts/<id>.json:heartflow.model 提供. plugin 不再 hardcode fallback. 参见 https://docs.openclaw.ai");
    }
    const timeoutMs = cfg.timeoutMs ?? 5000; // v1.4.0 P0-fix 19:30: L4 跟 L1/L2/L3=5000 对齐
    const maxTokens = 300;
    const maxRetries = Math.max(0, cfg.maxRetries ?? 1); // v1.4.0 P0-fix 19:25: fallback 2→1 跟 defaultHeartflowConfig (line 154) 对齐 + 真实实现老板 14:55 C 方案 "5000ms × 2次重试 = 10秒总"
    const prompt = buildHeartflowPrompt(input, cfg);
    const systemPrompt = (cfg.businessContext ? cfg.businessContext + "\n\n" : "") +
        "你是一个专业的群聊回复决策系统，能够准确判断消息价值和回复时机。\n" +
        "你必须严格按照JSON格式返回结果，不要包含任何其他内容！请不要进行对话，只返回JSON！";
    let lastErr = "";
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const userPrompt = attempt === 0
            ? prompt
            : prompt.replace("**重要！！！请严格按照以下JSON格式回复，不要添加任何其他内容：**", `**重要！！！请严格按照以下JSON格式回复，不要添加任何其他内容！这是第${attempt + 1}次尝试，请确保返回有效的JSON格式！**`);
        try {
            const text = await callJudge({
                model,
                userPrompt,
                systemPrompt,
                maxTokens,
                timeoutMs,
                creds: {
                    apiKey: opts.apiKey,
                    baseUrl: opts.baseUrl ?? resolveJudgeCreds().baseUrl,
                    format: opts.format ?? "anthropic",
                },
            });
            const result = parseHeartflowResponse(text, cfg);
            if (result)
                return result;
            lastErr = `unparseable: ${text.slice(0, 80)}`;
        }
        catch (e) {
            lastErr = e instanceof Error ? e.message : String(e);
        }
        // 失败重试 (非最后一次)
    }
    warn(`[WPP HEARTFLOW] judge failed after ${maxRetries + 1} attempts: ${lastErr}`);
    return null;
}
/**
 * 心流触发门禁 (纯同步预筛, 不调 LLM):
 * - enabled 关闭 → 拒绝
 * - 群白名单 (非空) 且 chatId 不在 → 拒绝
 * - 空消息 → 拒绝
 * - 冷却期 (minReplyIntervalSec) → 拒绝
 * 通过后由调用方调 judgeHeartflow 做 LLM 打分。
 */
/** P1: 每群最近一次 LLM judge 时间 (minJudgeIntervalSec 频率闸用) */
const lastJudgeAt = new Map();
/** 测试/热重载: 清空 judge 频率 */
export function resetHeartflowJudgeIntervals() {
    lastJudgeAt.clear();
}
/** 标记某群已 judge (judgeHeartflow 实际调用后更新) */
export function markHeartflowJudged(chatId, nowMs) {
    lastJudgeAt.set(chatId, nowMs);
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
    // P1: LLM judge 频率闸 — 每群 minJudgeIntervalSec 内最多 judge 1 次 (降 LLM 调用 + 防阻塞)
    const judgeInterval = cfg.minJudgeIntervalSec ?? 0;
    if (judgeInterval > 0) {
        const last = lastJudgeAt.get(chatId) ?? 0;
        if (last > 0 && nowMs - last < judgeInterval * 1000) {
            return { allowed: false, reason: "judge-cooldown" };
        }
    }
    return { allowed: true };
}
/**
 * 心流独立 trigger 入口 (v1.5.0 B-fix 20:06 老板拍板 B)
 *
 * 流程:
 *   1. 检查 cfg.independentTrigger=true (B 方案开关)
 *   2. 检查 cfg.enabled=true
 *   3. 检查 whitelistGroups 包含 chatId
 *   4. 检查 checkHeartflowGate (gate = false → not triggered)
 *   5. 调 judgeHeartflow 异步打分 (5 维)
 *   6. markHeartflowJudged 标记已 judge (频率闸生效)
 *   7. 返回 { triggered, reason, judgeResult }
 *
 * 设计: 不抛异常 (failure-soft), 失败返回 { triggered: false, reason }
 *       enrichBatch 调用方 try/catch 隔离, 不影响主入库流程
 */
export async function tryIndependentTrigger(opts, cfg) {
    // 步骤 1: B 方案开关检查
    if (!cfg.independentTrigger) {
        return { triggered: false, reason: "independentTrigger disabled" };
    }
    // 步骤 2: 总开关
    if (!cfg.enabled) {
        return { triggered: false, reason: "heartflow disabled" };
    }
    // 步骤 3: 群白名单
    if (cfg.whitelistGroups && cfg.whitelistGroups.length > 0 && !cfg.whitelistGroups.includes(opts.chatId)) {
        return { triggered: false, reason: "not in whitelistGroups" };
    }
    // 步骤 4: 心流 gate (冷却/精力)
    const nowMs = Date.now();
    const gate = checkHeartflowGate(opts.chatId, opts.content, cfg, nowMs);
    if (!gate.allowed) {
        return { triggered: false, reason: `gate:${gate.reason}` };
    }
    // 步骤 5: 异步 judge
    try {
        const judgeResult = await judgeHeartflow({
            chatId: opts.chatId,
            botNickname: opts.botWxid ?? "",
            content: opts.content,
            senderName: opts.senderName,
            chatContext: buildChatContextSummary(opts.chatId, cfg, nowMs),
            recentMessages: formatRawMessages(getRawBuffer(opts.chatId, cfg.contextMessagesCount ?? 5)),
            lastBotReply: lastBotReply(opts.chatId) ?? "",
            secondsSinceLastReply: secondsSinceLastReply(opts.chatId, nowMs),
            energy: getChatState(opts.chatId, cfg, nowMs).energy,
        }, cfg, {
            apiKey: opts.apiKey,
            baseUrl: opts.baseUrl,
            format: opts.format,
        });
        // 步骤 6: 标记已 judge
        markHeartflowJudged(opts.chatId, nowMs);
        // 步骤 7: 返回结果
        if (!judgeResult) {
            return { triggered: false, reason: "judge returned null" };
        }
        return {
            triggered: judgeResult.shouldReply,
            reason: judgeResult.shouldReply ? "judge.shouldReply=true" : `score=${judgeResult.overallScore.toFixed(2)}<threshold`,
            judgeResult,
        };
    }
    catch (err) {
        // 失败软处理: 不抛, 不影响 enrichBatch
        const msg = err instanceof Error ? err.message : String(err);
        return { triggered: false, reason: `judge threw: ${msg}` };
    }
}
//# sourceMappingURL=heartflow.js.map