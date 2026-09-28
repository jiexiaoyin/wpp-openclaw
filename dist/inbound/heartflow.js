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
import { peekHfBudget, resolveHfBudget } from "./heartflow-budget.js";
/** v1.6.x 心流学习参数缺省表 (代码默认; schema default 与 accounts JSON 缺省保持一致) */
export const HF_LEARNING_DEFAULTS = {
    enabled: false,
    minSample: 10,
    lowEngageRate: 0.15,
    highEngageRate: 0.5,
    step: 0.05,
    // v1.6.6 硬地板 0.3 → 0.5 (老板 2026-09-16 拍板: 阈值最低不能低于 0.5).
    //   起因: 接话率指标饱和 (群内 600s 有任意人类消息即 engaged, 见 handler.ts onFlush) ⇒ 闭环必然
    //   把阈值推到地板; 生产上出现过阈值降到地板后长期卡死, 群里刷口号时 bot 连续快速回长话术的极端情形.
    //   ⚠️ 单靠本参数不够: evalHfThreshold 只在 delta≠0 时钳制, 接话率落死区时库里存量旧值会绕过它 ⇒
    //   读取侧另有 clampHfThresholdToBand (heartflow-learn.ts) 兜底.
    bandMin: 0.5,
    bandMax: 0.9,
    sampleWindow: 20,
    observeWindowSec: 600,
    // v1.6.8 标签锚回 bot 自己那条 (老板 2026-09-26 拍板): 弱信号窗 60s.
    //   取值不是拍的 —— 拿生产账本里已收敛的样本实测"窗内出现人类消息"的比例 (只读回放, 不落库):
    //     窗越宽比率越高, 且旧标签那个宽窗的实测值几乎与台账存量 engaged 率逐位吻合 ⇒ 机制诊断被数据证实.
    //   选 60s 而不是更宽的窗的理由: 死区是 (lowEngageRate 0.15, highEngageRate 0.5), 中点 0.325。
    //     宽窗的实测比率离上调上限 0.5 只剩很薄的余量 (样本量不大时置信区间就会跨过 0.5),
    //     而该标签**因果上受 bot 自己影响** (回得多 → 群里反应多 → 比率更高 ⇒ 再下调 = 正反馈跑飞),
    //     余量太薄会重新点燃同一个飞轮; 60s 的实测比率落在死区中点附近, 两侧余量大致对称。
    //   ⚠️ 弱信号窗变窄**不会漏掉真接话**: 引用 bot / @bot / 负词这些强信号在整个 observeWindowSec
    //     (600s) 内都有效 (见 heartflow-label.ts).
    labelWindowSec: 60,
    // v1.6.8 反事实基线: 该群同一时段本来就有 ≥50% 概率有人说话 ⇒ 弱信号/沉默不采信.
    ambientMax: 0.5,
    minChangeCooldownSec: 4 * 3600,
    sweepIntervalSec: 300,
    staleJudgedMaxSec: 1800,
    // v1.10.0 可达性护栏 (见 HfLearningConfig.recoverUnreachable): 阈值高于近期最高分 ⇒ 压回最高分+step.
    //   窗口/样本量取值: 7 天 × 20 条 —— 比调阈的 minSample(10) 高一档, 因为"把阈值压下来"比"抬上去"更需要证据:
    //   压错了会多说话 (老板要治的病), 抬错了只是少说话 (护栏本身不会抬, 只抬天花板)。
    recoverUnreachable: true,
    reachabilityWindowSec: 7 * 86400,
    reachabilityMinSample: 20,
};
/** v1.6.x: 合并账号 learning 配置与缺省 (enabled 取配置或缺省) */
export function resolveHfLearning(cfg) {
    const l = cfg?.learning;
    const D = HF_LEARNING_DEFAULTS;
    return {
        enabled: l?.enabled ?? D.enabled,
        minSample: l?.minSample ?? D.minSample,
        lowEngageRate: l?.lowEngageRate ?? D.lowEngageRate,
        highEngageRate: l?.highEngageRate ?? D.highEngageRate,
        step: l?.step ?? D.step,
        bandMin: l?.bandMin ?? D.bandMin,
        bandMax: l?.bandMax ?? D.bandMax,
        sampleWindow: l?.sampleWindow ?? D.sampleWindow,
        observeWindowSec: l?.observeWindowSec ?? D.observeWindowSec,
        labelWindowSec: l?.labelWindowSec ?? D.labelWindowSec,
        ambientMax: l?.ambientMax ?? D.ambientMax,
        minChangeCooldownSec: l?.minChangeCooldownSec ?? D.minChangeCooldownSec,
        sweepIntervalSec: l?.sweepIntervalSec ?? D.sweepIntervalSec,
        staleJudgedMaxSec: l?.staleJudgedMaxSec ?? D.staleJudgedMaxSec,
        recoverUnreachable: l?.recoverUnreachable ?? D.recoverUnreachable,
        reachabilityWindowSec: l?.reachabilityWindowSec ?? D.reachabilityWindowSec,
        reachabilityMinSample: l?.reachabilityMinSample ?? D.reachabilityMinSample,
    };
}
/** v1.6.x: 群是否在心流白名单 (空数组=全放行; 与 checkHeartflowGate 白名单子句同语义, 供 sweep 过滤) */
export function isHfGroupAllowed(chatId, cfg) {
    const wl = cfg.whitelistGroups;
    if (!wl || wl.length === 0)
        return true;
    return wl.includes(chatId);
}
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
 *
 * v1.10.0 (2026-09-28): **删掉原上游 prompt 里的 `**回复阈值**: X (综合评分达到此分数才回复)` 一行**。
 *
 * 为什么 (生产实测, 不是理论洁癖): 该行把"我方当前的及格线"告诉裁判模型, 裁判随即**按这个数字校准自己的
 *   打分**, 于是阈值一动, 分数就跟着动, 闭环失效。2026-09-26 上线群画像后, 有效阈值被画像 band 抬到
 *   0.85/0.90, prompt 里那行就写着 0.85/0.90 —— 同一天起 `wpp_hf_ledger` 里"该回"档 (0.61-0.82) 整体消失,
 *   38 次判定最高只到 0.39, 阈值再也不可能被越过 (自锁)。
 *   回溯验证 (23 条 09-22..25 曾得 ≥0.6 的真实消息, 同一 judge 同一模型):
 *     带阈值行 + 现状画像 = 均分 0.322 / 仅 2 条 ≥0.6  (线上现状)
 *     去掉阈值行 + 现状画像 = 均分 0.374 / 3 条 ≥0.6
 *     去掉阈值行 + 画像改口吻 = 均分 0.669 / 20 条 ≥0.6  (修法)
 *   即: 这一行是**第二抑制源** (主抑制源是画像的"少插话"文本, 见 heartflow-profile.stripHfMutePhrases)。
 * 判定仍按数值阈值做, 但那个数只在代码里 (`parseHeartflowResponse`: overall >= cfg.replyThreshold),
 *   模型不需要知道 —— 它的职责是给绝对值, 不是猜我们的及格线。
 */
export function buildHeartflowPrompt(input, cfg) {
    const reasoningPart = cfg.includeReasoning
        ? ',\n    "reasoning": "详细分析原因，说明为什么应该或不应该回复，需要结合机器人角色特点进行分析，特别说明与上次回复的关联性"'
        : "";
    const lastReplyStr = input.lastBotReply || "暂无上次回复记录";
    const sinceMin = input.secondsSinceLastReply > 0 ? Math.round(input.secondsSinceLastReply / 60) : "从未回复";
    // v1.7.0 群画像 (可选): 只提供"这个群是什么群、我在这该怎么说话"的背景, 不改变打分口径;
    //   文本已在上游截断 (heartflow-profile.renderHfProfileForPrompt), 这里不做二次裁剪.
    const profilePart = input.groupProfile
        ? `\n\n## 本群画像 (系统按历史消息自动归纳, 供你应景参考)\n${input.groupProfile}`
        : "";
    return `你是群聊机器人的决策系统，需要判断是否应该主动回复以下消息。

## 机器人角色设定
${input.botNickname ? `我是 ${input.botNickname}，一个群聊机器人助手。` : "默认角色：智能助手"}

## 当前群聊情况
- 群聊ID: ${input.chatId}
- 我的精力水平: ${input.energy.toFixed(1)}/1.0
- 上次发言: ${sinceMin}${typeof sinceMin === "number" ? "分钟前" : ""}

## 群聊基本信息
${input.chatContext}${profilePart}

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
 * - v1.6.9 发言预算 (每群最小间隔/每小时/每天/静默段/陈旧触发) → 拒绝
 * 通过后由调用方调 judgeHeartflow 做 LLM 打分。
 *
 * @param accountId 预算计数按账号分桶用; 省略时退化为 `*` 桶 (group id 本身全局唯一, 不会串群)
 * @param candidateAtSec 本次候选消息的时刻 (秒); 省略 = nowMs/1000 (仅用于预算的陈旧触发判定)
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
export function checkHeartflowGate(chatId, content, cfg, nowMs, accountId, candidateAtSec, 
/**
 * v1.7.0: 画像收紧后的有效预算 (调用方用 tightenHfBudget 与账号配置取交集)。
 * 缺省 = 只用账号配置。**用参数而不是在函数内 import 画像模块**: heartflow.ts 被 heartflow-profile.ts
 * 反向 import (拿 isHfGroupAllowed / HF_LEARNING_DEFAULTS), 从这边再 import 回去就成环。
 */
budgetOverride) {
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
    // v1.6.9 发言预算 (结构层频率约束): 放在最后、judge 之前 —— 被拦的消息连 LLM 都不调。
    //   用 peek (判定+计数+debug 日志), 真正的计数落账在发送成功时 (heartflow-learn.persistHfSendOutcome),
    //   这样"判了但被下游拦掉"的不会占用预算额度。
    const nowSec = Math.floor(nowMs / 1000);
    const verdict = peekHfBudget(accountId, chatId, budgetOverride ?? resolveHfBudget(cfg), nowSec, candidateAtSec ?? nowSec);
    if (!verdict.allowed)
        return { allowed: false, reason: verdict.reason ?? "budget" };
    return { allowed: true };
}
//# sourceMappingURL=heartflow.js.map