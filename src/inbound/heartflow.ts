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

// ===== 配置接口 =====

export interface HeartflowConfig {
  /** 总开关 (默认 false) */
  enabled: boolean;
  /** 判断小模型. v1.4.0 12:21 老板拍板 B: 消除 hardcode, model 必须从 schema default (openclaw.plugin.json channelConfigs.wechatpadpro.schema.properties.heartflow.properties.model) 或 accounts cfg 链提供, 缺失抛错 (heartflow.ts:475) */
  model?: string;
  /** 判断超时毫秒 (默认 5000) */
  timeoutMs?: number;
  /** 回复阈值 0-1 (默认 0.6) */
  replyThreshold?: number;
  /** 精力衰减 (每次回复后, 默认 0.1) */
  energyDecayRate?: number;
  /** 精力恢复 (每次不回复时, 默认 0.02) */
  energyRecoveryRate?: number;
  /** 判断时考虑的最近消息数 (默认 5) */
  contextMessagesCount?: number;
  /** 最小回复间隔秒 (默认 0 = 不限) */
  minReplyIntervalSec?: number;
  /** P1: 最小 LLM 判断间隔秒 (默认 0 = 每条都判; 建议 >0 降 LLM 调用, 如 30 = 每 30s 最多判 1 次) */
  minJudgeIntervalSec?: number;
  /** 群白名单 (空 = 不启用白名单; 非空 = 仅这些群触发) */
  whitelistGroups?: string[];
  /** 5 维权重 (默认 relevance/willingness/social/timing/continuity) */
  weights?: {
    relevance?: number;
    willingness?: number;
    social?: number;
    timing?: number;
    continuity?: number;
  };
  /** 判断时是否要求小模型输出 reasoning (默认 false 省 token) */
  includeReasoning?: boolean;
  /** 判断最大重试 (默认 2) */
  maxRetries?: number;
  /** v1.5.4 BUSINESS-CONTEXT: 心流 judge 的业务背景知识注入，提升运营商群等专业场景判断准确率 */
  businessContext?: string;
  /**
   * v1.6.x HEARTFLOW-FEEDBACK: per-群双向自适应调阈 (反馈闭环) 参数块
   * 只在 heartflow-learn.ts 的 sweep 使用; 默认缺省 = 全用 HF_LEARNING_DEFAULTS, enabled 缺省 false (不开)
   * learned 阈值本身存 DB (wpp_hf_group_state), 不回写 accounts JSON
   */
  learning?: HfLearningConfig;
}

/**
 * v1.6.x 心流自适应学习参数 (全部可选, 缺省走 HF_LEARNING_DEFAULTS)
 * 方向: 接话率高 = 插话受欢迎 → 下调阈值更主动; 低 = 不受待见 → 上调更克制
 */
export interface HfLearningConfig {
  /** 总开关 (默认 false; 生产 accounts/default.json 显式开 true) */
  enabled?: boolean;
  /** 最小样本量 (不足=不调阈, 自然灰度) */
  minSample?: number;
  /** 接话率 ≤ 此值 → 上调 */
  lowEngageRate?: number;
  /** 接话率 ≥ 此值 → 下调 */
  highEngageRate?: number;
  /** 单次步长上限 */
  step?: number;
  /** 硬区间下限 */
  bandMin?: number;
  /** 硬区间上限 */
  bandMax?: number;
  /** 参与统计的最近 closed 样本数 (滚窗) */
  sampleWindow?: number;
  /** 观察窗时长 (秒): 心流回复发出后多久内有人类消息 = engaged */
  observeWindowSec?: number;
  /** 相邻两次阈值变更最小间隔 (秒, 防抖) */
  minChangeCooldownSec?: number;
  /** sweep 周期 (秒) */
  sweepIntervalSec?: number;
  /** judged 无发送结果呆账上限 (秒) */
  staleJudgedMaxSec?: number;
}

/** v1.6.x 心流学习参数缺省表 (代码默认; schema default 与 accounts JSON 缺省保持一致) */
export const HF_LEARNING_DEFAULTS: Required<Omit<HfLearningConfig, "enabled">> & {
  enabled: boolean;
} = {
  enabled: false,
  minSample: 10,
  lowEngageRate: 0.15,
  highEngageRate: 0.5,
  step: 0.05,
  bandMin: 0.3,
  bandMax: 0.9,
  sampleWindow: 20,
  observeWindowSec: 600,
  minChangeCooldownSec: 4 * 3600,
  sweepIntervalSec: 300,
  staleJudgedMaxSec: 1800,
};

/** v1.6.x: 合并账号 learning 配置与缺省 (enabled 取配置或缺省) */
export function resolveHfLearning(cfg?: HeartflowConfig): Required<HfLearningConfig> {
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
    minChangeCooldownSec: l?.minChangeCooldownSec ?? D.minChangeCooldownSec,
    sweepIntervalSec: l?.sweepIntervalSec ?? D.sweepIntervalSec,
    staleJudgedMaxSec: l?.staleJudgedMaxSec ?? D.staleJudgedMaxSec,
  };
}

/** v1.6.x: 群是否在心流白名单 (空数组=全放行; 与 checkHeartflowGate 白名单子句同语义, 供 sweep 过滤) */
export function isHfGroupAllowed(chatId: string, cfg: HeartflowConfig): boolean {
  const wl = cfg.whitelistGroups;
  if (!wl || wl.length === 0) return true;
  return wl.includes(chatId);
}

export function defaultHeartflowConfig(): HeartflowConfig {
  return {
    enabled: false,
    // v1.4.0 12:09 老板拍板: 消除 plugin hardcode. model 由 schema default (openclaw.plugin.json) + accounts cfg 链提供.
    // 万一两层都未配置 → 运行时 cfg.model 抛错 (heartflow.ts:475)
    model: undefined as unknown as string,  // placeholder,运行时由 cfg.model 提供;类型占位仅为兼容 HeartflowConfig.model?: string
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

// ===== 状态数据 =====

/** 判断结果 */
export interface HeartflowJudgeResult {
  shouldReply: boolean;
  overallScore: number;
  /** 五个维度分数 (0-10) */
  dimensions: { relevance: number; willingness: number; social: number; timing: number; continuity: number };
  reasoning: string;
}

/** 单条原始消息 (供判断上下文) */
export interface HeartflowRawMessage {
  senderName: string;
  senderId: string;
  content: string;
  timestamp: number;
  isBot: boolean;
}

/** 每群状态 (精力状态机) */
export interface HeartflowChatState {
  energy: number;
  lastReplyTime: number;
  lastResetDate: string;
  totalMessages: number;
  totalReplies: number;
  /** P0-5: 上次精力时间恢复的时间戳 (独立于 lastReplyTime, 避免恢复推进冷却) */
  lastEnergyRecoveryTs: number;
}

// ===== 纯逻辑: JSON 稳健解析 (移植自 Heartflow _extract_json) =====

/**
 * 从模型返回文本中稳健提取 JSON 对象 (依次尝试直接解析 / 剥 markdown 围栏 / 正则取最外层 {...})。
 */
export function extractHeartflowJson(text: string): Record<string, unknown> | null {
  const s = String(text ?? "").trim();
  if (!s) return null;
  // 1. 直接解析
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    /* 继续 */
  }
  // 2. 剥 markdown 代码块
  const cleaned = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    /* 继续 */
  }
  // 3. 正则提取最外层 {...}
  const m = s.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

/** 分数钉位到 [0, 10] (移植自 Heartflow _clamp_score) */
export function clampScore(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.max(0, Math.min(10, v));
  }
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.max(0, Math.min(10, n));
  }
  return 0;
}

// ===== 纯逻辑: 精力状态机 (移植自 Heartflow ChatState + _get_chat_state) =====

/** 每群状态存储 (内存) */
const chatStates = new Map<string, HeartflowChatState>();

/** 测试/热重载: 清空所有群状态 */
export function resetHeartflowStates(): void {
  chatStates.clear();
}

/**
 * 获取 (或创建) 群状态, 并应用每日重置 + 时间自然恢复。
 * P0-5: 时间恢复用独立 lastEnergyRecoveryTs, 不再推进 lastReplyTime —
 *   否则每次 judge 调用都重置 lastReplyTime → secondsSinceLastReply 恒≈0 → 冷却失效。
 */
export function getChatState(
  chatId: string,
  cfg: HeartflowConfig,
  nowMs: number,
): HeartflowChatState {
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
export function secondsSinceLastReply(chatId: string, nowMs: number): number {
  const st = chatStates.get(chatId);
  if (!st || st.lastReplyTime === 0) return 0;
  return Math.max(0, (nowMs - st.lastReplyTime) / 1000);
}

/** 回复后更新状态 (精力消耗) */
export function recordActiveReply(chatId: string, cfg: HeartflowConfig, nowMs: number): void {
  const st = getChatState(chatId, cfg, nowMs);
  st.lastReplyTime = nowMs;
  st.totalReplies += 1;
  st.totalMessages += 1;
  st.energy = Math.max(0.1, st.energy - (cfg.energyDecayRate ?? 0.1));
}

/** 未回复时更新状态 (精力恢复 + 消息计数) */
export function recordPassiveMessage(chatId: string, cfg: HeartflowConfig, nowMs: number): void {
  const st = getChatState(chatId, cfg, nowMs);
  st.totalMessages += 1;
  st.energy = Math.min(1.0, st.energy + (cfg.energyRecoveryRate ?? 0.02));
}

// ===== 纯逻辑: 原始消息环形缓冲 (移植自 Heartflow _raw_msg_buffer) =====

const rawBuffers = new Map<string, HeartflowRawMessage[]>();
const RAW_BUFFER_MAX = 200;

/** 测试/热重载: 清空所有群缓冲 */
export function resetHeartflowBuffers(): void {
  rawBuffers.clear();
}

/** 写入一条原始消息 (无论是否触发, 含 bot 自己回复) */
export function recordRawMessage(
  chatId: string,
  msg: HeartflowRawMessage,
): void {
  let buf = rawBuffers.get(chatId);
  if (!buf) {
    buf = [];
    rawBuffers.set(chatId, buf);
  }
  buf.push(msg);
  if (buf.length > RAW_BUFFER_MAX) buf.splice(0, buf.length - RAW_BUFFER_MAX);
}

/** 取最近 N 条 (时间顺序) */
export function getRawBuffer(chatId: string, n: number): HeartflowRawMessage[] {
  const buf = rawBuffers.get(chatId) ?? [];
  return buf.slice(-n);
}

/** 最近消息 → 文本行 (供 prompt) */
export function formatRawMessages(msgs: HeartflowRawMessage[]): string {
  if (!msgs.length) return "暂无对话历史";
  return msgs
    .map((m) => `${m.isBot ? "[机器人]" : `[${m.senderName}]`}: ${m.content}`)
    .join("\n");
}

/** 最近消息 → 对话上下文 (供 MiniMax messages) */
export function rawMessagesToContexts(msgs: HeartflowRawMessage[]): Array<{ role: string; content: string }> {
  return msgs.map((m) => ({ role: m.isBot ? "assistant" : "user", content: m.content }));
}

/** 上次 bot 回复内容 */
export function lastBotReply(chatId: string): string | null {
  const buf = rawBuffers.get(chatId) ?? [];
  for (let i = buf.length - 1; i >= 0; i--) {
    const m = buf[i];
    if (m && m.isBot && m.content.trim()) return m.content;
  }
  return null;
}

/** 构建群聊上下文摘要 (活跃度/回复率/当前时间/上次回复效果) */
export function buildChatContextSummary(
  chatId: string,
  cfg: HeartflowConfig,
  nowMs: number,
): string {
  const st = getChatState(chatId, cfg, nowMs);
  const msgs = rawBuffers.get(chatId) ?? [];

  // 上次回复后群里的接话情况
  let postReplyEngagement = "";
  let foundBot = false;
  let userMsgsAfterBot = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (!m) break;
    if (m.isBot) { foundBot = true; break; }
    userMsgsAfterBot += 1;
  }
  if (foundBot) {
    if (userMsgsAfterBot >= 3) postReplyEngagement = "（上次回复后群里进行了热烈讨论）";
    else if (userMsgsAfterBot === 0) postReplyEngagement = "（上次回复后无人接话）";
  }

  const activity = st.totalMessages > 100 ? "高" : st.totalMessages > 20 ? "中" : "低";
  const replyRate = (st.totalReplies / Math.max(1, st.totalMessages)) * 100;
  const now = new Date(nowMs);
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  let info = `最近活跃度: ${activity}\n历史回复率: ${replyRate.toFixed(1)}%\n当前时间: ${hhmm}`;
  if (postReplyEngagement) info += `\n回复效果: ${postReplyEngagement}`;
  return info;
}

// ===== LLM 判断 (5 维打分) =====

export interface HeartflowJudgeInput {
  /** 群 ID */
  chatId: string;
  /** 机器人昵称 */
  botNickname: string;
  /** 待判断消息内容 (已去 @) */
  content: string;
  /** 发送者昵称 */
  senderName: string;
  /** 群聊状态摘要 */
  chatContext: string;
  /** 最近 N 条消息文本 */
  recentMessages: string;
  /** 上次 bot 回复 */
  lastBotReply: string;
  /** 距上次回复秒数 */
  secondsSinceLastReply: number;
  /** 精力水平 */
  energy: number;
}

export interface HeartflowJudgeOptions {
  apiKey: string;
  baseUrl?: string;
  format?: "openai" | "anthropic";
}

/**
 * 构造 5 维判断 prompt (移植自 Heartflow judge_prompt)。
 * 返回完整 user prompt。
 */
export function buildHeartflowPrompt(input: HeartflowJudgeInput, cfg: HeartflowConfig): string {
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
export function parseHeartflowResponse(
  text: string,
  cfg: HeartflowConfig,
): HeartflowJudgeResult | null {
  const data = extractHeartflowJson(text);
  if (!data) return null;

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
  const overall =
    (dims.relevance * w.relevance +
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
export async function judgeHeartflow(
  input: HeartflowJudgeInput,
  cfg: HeartflowConfig,
  opts: HeartflowJudgeOptions,
): Promise<HeartflowJudgeResult | null> {
  if (!opts.apiKey) {
    warn("[WPP HEARTFLOW] missing judge API key (DEEPSEEK_API_KEY / MINIMAX_API_KEY), skip heartflow judge");
    return null;
  }
  // v1.4.0 12:09 老板拍板: 消除 plugin hardcode, model 必须从 cfg 链 (schema default → accounts cfg) 提供, 缺失立即报错
  const model = cfg.model;
  if (!model) {
    throw new Error(
      "[WPP HEARTFLOW] cfg.model unresolved. v1.4.0 12:09 老板拍板: 必须从 schema default (openclaw.plugin.json channelConfigs.wechatpadpro.schema.properties.heartflow.properties.model.default) 或 accounts/<id>.json:heartflow.model 提供. plugin 不再 hardcode fallback. 参见 https://docs.openclaw.ai"
    );
  }
  const timeoutMs = cfg.timeoutMs ?? 5000; // v1.4.0 P0-fix 19:30: L4 跟 L1/L2/L3=5000 对齐
  const maxTokens = 300;
  const maxRetries = Math.max(0, cfg.maxRetries ?? 1); // v1.4.0 P0-fix 19:25: fallback 2→1 跟 defaultHeartflowConfig (line 154) 对齐 + 真实实现老板 14:55 C 方案 "5000ms × 2次重试 = 10秒总"

  const prompt = buildHeartflowPrompt(input, cfg);
  const systemPrompt =
    (cfg.businessContext ? cfg.businessContext + "\n\n" : "") +
    "你是一个专业的群聊回复决策系统，能够准确判断消息价值和回复时机。\n" +
    "你必须严格按照JSON格式返回结果，不要包含任何其他内容！请不要进行对话，只返回JSON！";

  let lastErr = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const userPrompt = attempt === 0
      ? prompt
      : prompt.replace(
          "**重要！！！请严格按照以下JSON格式回复，不要添加任何其他内容：**",
          `**重要！！！请严格按照以下JSON格式回复，不要添加任何其他内容！这是第${attempt + 1}次尝试，请确保返回有效的JSON格式！**`,
        );
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
          format: (opts as { format?: "openai" | "anthropic" }).format ?? "anthropic",
        },
      });
      const result = parseHeartflowResponse(text, cfg);
      if (result) return result;
      lastErr = `unparseable: ${text.slice(0, 80)}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    // 失败重试 (非最后一次)
  }
  warn(`[WPP HEARTFLOW] judge failed after ${maxRetries + 1} attempts: ${lastErr}`);
  return null;
}

// ===== 触发判定 (供 triggers.ts 接入) =====

export interface HeartflowGateResult {
  /** 是否允许心流触发 */
  allowed: boolean;
  /** 拒绝原因 (allowed=false 时) */
  reason?: string;
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
const lastJudgeAt = new Map<string, number>();

/** 测试/热重载: 清空 judge 频率 */
export function resetHeartflowJudgeIntervals(): void {
  lastJudgeAt.clear();
}

/** 标记某群已 judge (judgeHeartflow 实际调用后更新) */
export function markHeartflowJudged(chatId: string, nowMs: number): void {
  lastJudgeAt.set(chatId, nowMs);
}

export function checkHeartflowGate(
  chatId: string,
  content: string,
  cfg: HeartflowConfig,
  nowMs: number,
): HeartflowGateResult {
  if (!cfg.enabled) return { allowed: false, reason: "disabled" };
  if (cfg.whitelistGroups && cfg.whitelistGroups.length > 0) {
    if (!cfg.whitelistGroups.includes(chatId)) return { allowed: false, reason: "not-whitelisted" };
  }
  if (!content || !content.trim()) return { allowed: false, reason: "empty" };
  const minInterval = cfg.minReplyIntervalSec ?? 0;
  if (minInterval > 0) {
    const since = secondsSinceLastReply(chatId, nowMs);
    if (since > 0 && since < minInterval) return { allowed: false, reason: "cooling" };
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
