// src/inbound/affection.ts - v1.3.77 AFFECTION: 好感度/社交关系系统
//
// 移植自 AstrBot 插件 astrbot_plugin_self_learning (v3.6.1) 的 affection_manager 模块。
// 纯规则核心 (枚举+规则表+情绪+重分配) TS 移植, 可选 LLM 增强交互分类 (降级为关键词规则)。
//
// 价值: 让 AI 对不同的用户/交互建立好感度 + 情绪状态, 回复更有人情味。
//   用户夸你 → 好感度+5, 心情变好 → 回复更热情
//   用户骂你 → 好感度-8, 心情低落 → 回复更谨慎
//   情绪会注入 system prompt, 影响 AI 回复风格。
//
// 架构:
//   ① 交互分类: 关键词规则 (零 LLM) + 可选 LLM 增强
//   ② 好感度增减: 17 交互类型 × 分值 × 情绪修正 (情绪门槛/上限/取整)
//   ③ 情绪状态机: 10 情绪 × 修正系数 × 强度; 交互触发情绪变化 (负面/正面/一般)
//   ④ 重分配: 群总量超限按比例扣减其他用户
//   ⑤ 情绪注入: 生成受情绪影响的 system prompt

import { callJudge, resolveJudgeCreds } from "../llm-judge.js";

// ===== 枚举 =====

export type MoodType =
  | "happy" | "sad" | "excited" | "calm" | "angry"
  | "anxious" | "playful" | "serious" | "nostalgic" | "curious";

export type InteractionType =
  | "chat" | "compliment" | "flirt" | "comfort" | "help"
  | "thanks" | "apology" | "tease" | "care" | "gift"
  | "insult" | "harassment" | "abuse" | "threat"
  | "praise" | "encourage" | "support";

// ===== 情绪修正系数 (对齐 BotMood.get_mood_modifier) =====
const MOOD_MODIFIERS: Record<MoodType, number> = {
  happy: 1.2,
  excited: 1.3,
  playful: 1.1,
  calm: 1.0,
  curious: 1.05,
  nostalgic: 0.9,
  serious: 0.8,
  sad: 0.6,
  anxious: 0.7,
  angry: 0.4,
};

/** 情绪修正系数 = base * (0.5 + intensity*0.5), intensity∈[0,1] */
export function moodModifier(mood: MoodType, intensity: number): number {
  const base = MOOD_MODIFIERS[mood] ?? 1.0;
  return base * (0.5 + Math.max(0, Math.min(1, intensity)) * 0.5);
}

// ===== 交互规则表 (对齐 _init_affection_rules) =====

export interface AffectionRule {
  baseChange: number;
  moodSensitive: boolean;
  moodEffect: number;
  description: string;
  /** 情绪门槛: 当前情绪必须是这些之一才允许变化 */
  moodRequirements?: MoodType[];
  /** 提升积极情绪 */
  positiveMoodBoost?: boolean;
  /** 触发负面情绪 */
  negativeMoodTrigger?: boolean;
  /** 触发恐惧情绪 */
  triggerFear?: boolean;
}

export const AFFECTION_RULES: Record<InteractionType, AffectionRule> = {
  chat: { baseChange: 1, moodSensitive: true, moodEffect: 0.1, description: "普通聊天" },
  compliment: { baseChange: 3, moodSensitive: true, moodEffect: 0.2, description: "称赞鼓励" },
  praise: { baseChange: 5, moodSensitive: true, moodEffect: 0.3, positiveMoodBoost: true, description: "夸赞表扬" },
  encourage: { baseChange: 4, moodSensitive: true, moodEffect: 0.25, positiveMoodBoost: true, description: "鼓励支持" },
  support: { baseChange: 4, moodSensitive: true, moodEffect: 0.2, description: "支持认同" },
  flirt: { baseChange: 5, moodSensitive: true, moodEffect: 0.15, moodRequirements: ["happy", "playful", "excited"], description: "撩拨调情" },
  comfort: { baseChange: 4, moodSensitive: true, moodEffect: 0.3, moodRequirements: ["sad", "anxious"], description: "安慰关怀" },
  help: { baseChange: 2, moodSensitive: false, moodEffect: 0.1, description: "寻求帮助" },
  thanks: { baseChange: 2, moodSensitive: true, moodEffect: 0.15, description: "表达感谢" },
  apology: { baseChange: 1, moodSensitive: true, moodEffect: 0.1, moodRequirements: ["angry", "sad"], description: "道歉认错" },
  tease: { baseChange: 2, moodSensitive: true, moodEffect: 0.1, moodRequirements: ["playful", "happy"], description: "善意调侃" },
  care: { baseChange: 3, moodSensitive: true, moodEffect: 0.2, description: "关心问候" },
  gift: { baseChange: 8, moodSensitive: true, moodEffect: 0.4, positiveMoodBoost: true, description: "赠送礼物" },
  insult: { baseChange: -8, moodSensitive: true, moodEffect: -0.5, negativeMoodTrigger: true, description: "侮辱攻击" },
  harassment: { baseChange: -6, moodSensitive: true, moodEffect: -0.4, negativeMoodTrigger: true, description: "骚扰行为" },
  abuse: { baseChange: -10, moodSensitive: true, moodEffect: -0.6, negativeMoodTrigger: true, description: "恶意谩骂" },
  threat: { baseChange: -12, moodSensitive: true, moodEffect: -0.7, negativeMoodTrigger: true, triggerFear: true, description: "威胁恐吓" },
};

// ===== 配置 =====

export interface AffectionConfig {
  /** 总开关 (默认 false) */
  enabled: boolean;
  /** 单用户好感度上限 (默认 100) */
  maxUserAffection?: number;
  /** 群总好感度上限 (默认 500) */
  maxTotalAffection?: number;
  /** 重分配衰减率 (默认 0.3) */
  affectionDecayRate?: number;
  /** LLM 分类模型. v1.4.0 12:21 老板拍板 B: 消除 hardcode, model 必须从 schema default (openclaw.plugin.json channelConfigs.wechatpadpro.schema.properties.affection.properties.model) 或 accounts cfg 链提供, 缺失抛错 (affection.ts:271) */
  model?: string;
  /** LLM 超时毫秒 (默认 5000) */
  timeoutMs?: number;
  /** 用 LLM 增强交互分类 (默认 false, 纯规则降级) */
  llmClassify?: boolean;
}

export function defaultAffectionConfig(): AffectionConfig {
  return {
    // v1.5.2 老板 23:30 拍板 "启用" + 8-23 01:00 Explicit Preference
    enabled: true,
    maxUserAffection: 100,
    maxTotalAffection: 500,
    affectionDecayRate: 0.3,
    // v1.4.0 12:09 老板拍板: 消除 plugin hardcode. model 由 schema default (openclaw.plugin.json) + accounts cfg 链提供.
    // 万一两层都未配置 → 运行时 cfg.model 抛错 (affection.ts:271)
    model: undefined as unknown as string,  // placeholder,运行时由 cfg.model 提供;类型占位仅为兼容 AffectionConfig.model?: string
    timeoutMs: 5000, // v1.4.0 P0-fix 19:30: L3 跟 L1/L2/L4=5000 对齐; affection 无重试, 单次 5s 足够
    // v1.4.0 09:38 备注: llmClassify 仍默认 false (老板 8-23 偏好: 默认值不动)
    llmClassify: false,
  };
}

// ===== 数据模型 =====

export interface BotMood {
  moodType: MoodType;
  /** 强度 0-1 */
  intensity: number;
  /** 情绪描述 (供 system prompt) */
  description: string;
}

export interface UserAffection {
  userId: string;
  level: number;
  /** 最近更新时间 */
  updatedAt: number;
}

export interface InteractionResult {
  interactionType: InteractionType;
  canChange: boolean;
  change: number;
  reason: string;
}

// ===== 关键词规则分类 (对齐 _rule_based_interaction_analysis) =====

// P1 (2026-08-23): 去掉单字正词 (美/棒/牛/强/好/6/萌/帅) — 裸 includes 把 "晚上好"/"你好呀" 误判为称赞。
//   保留完整称赞词 (≥2 字)。
const COMPLIMENT_KEYWORDS = [
  "好美", "漂亮", "可爱", "美丽", "好看", "厉害", "优秀", "聪明", "温柔", "体贴", "贴心", "善良",
  "完美", "很棒", "真好", "不错", "赞", "给力", "牛逼", "好啊", "好呀", "棒棒", "太棒了", "真棒",
  "真厉害", "哇塞", "厉害了", "太好了", "好厉害", "好强", "好棒", "赞赞", "牛牛", "牛b", "nb",
  "牛批", "牛皮", "好牛", "超棒", "超好", "很好", "很棒", "很厉害", "太厉害了", "好喜欢", "喜欢你",
  "爱了", "太可爱了", "好可爱", "可爱爆了", "萌萌", "好萌",
];
const THANKS_KEYWORDS = ["谢谢", "感谢", "多谢", "thank", "谢", "thx", "谢啦", "谢了"];
const CARE_KEYWORDS = [
  "你好", "早上好", "晚上好", "怎么样", "最近好吗", "hello", "hi", "嗨", "哈喽",
  "哈罗", "安", "早", "晚安", "午安", "下午好", "你在吗", "在吗", "你在不在",
  "在不在", "你好呀", "你好啊",
];
// P1 (2026-08-23): 去掉单字负向词 (死/滚/草/狗/操/贱/婊) —
//   裸 includes 会把 "笑死了"/"累死了"/"狗粮"/"热狗" 误判为侮辱 (好感度-8 + 情绪 sad 2小时)。
//   保留完整负向词 (≥2 字), 降低误伤。
const NEGATIVE_KEYWORDS = [
  "傻逼", "蠢货", "白痴", "垃圾", "废物", "去死", "妈的", "他妈", "畜生", "王八蛋", "神经病",
  "滚蛋", "混蛋", "欠揍", "找打", "白痴啊",
];
const THREAT_KEYWORDS = ["威胁", "杀", "打死", "弄死", "干掉", "揍", "打你"];

/** 关键词规则交互分类 (零 LLM, 返回 undefined 表示无法判断) */
export function classifyInteractionByRules(message: string): InteractionType | undefined {
  const lower = (message ?? "").toLowerCase().trim();
  for (const kw of COMPLIMENT_KEYWORDS) {
    if (lower.includes(kw)) return "compliment";
  }
  for (const kw of THANKS_KEYWORDS) {
    if (lower.includes(kw)) return "thanks";
  }
  for (const kw of CARE_KEYWORDS) {
    if (lower.includes(kw)) return "care";
  }
  for (const kw of THREAT_KEYWORDS) {
    if (lower.includes(kw)) return "threat";
  }
  for (const kw of NEGATIVE_KEYWORDS) {
    if (lower.includes(kw)) return "insult";
  }
  return undefined;
}

// ===== LLM 交互分类 (可选增强, 对齐 analyze_interaction_type) =====

export interface AffectionLlmOptions {
  apiKey: string;
  baseUrl?: string;
  format?: "openai" | "anthropic";
}

/** 构造 LLM 交互分类 prompt */
export function buildClassifyPrompt(message: string, senderName: string): string {
  return `你是微信机器人${senderName ? ` ${senderName}` : ""}的社交关系分析器。请判断用户消息的交互类型。

消息: "${message}"

从以下类型中选择一个 (返回 JSON: {"type": "xxx"}):
- chat: 普通聊天/闲聊
- compliment: 称赞/夸外貌/夸表现
- praise: 夸赞表扬 (比 compliment 更强烈)
- encourage: 鼓励支持
- support: 支持认同
- flirt: 撩拨调情
- comfort: 安慰关怀
- help: 寻求帮助
- thanks: 表达感谢
- apology: 道歉认错
- tease: 善意调侃
- care: 关心问候
- gift: 赠送礼物
- insult: 侮辱攻击
- harassment: 骚扰行为
- abuse: 恶意谩骂
- threat: 威胁恐吓

不确定时优先 "chat"。只输出 JSON。`;
}

/** 解析 LLM 分类响应 */
export function parseClassifyResponse(text: string): InteractionType | undefined {
  if (!text) return undefined;
  const fence = text.trim().match(/```(?:json)?\s*([\s\S]*?)```/);
  const s = (fence ? fence[1]! : text).trim();
  try {
    const obj = JSON.parse(s) as { type?: string };
    const t = obj.type as InteractionType;
    if (t && t in AFFECTION_RULES) return t;
    return undefined;
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const obj = JSON.parse(m[0]) as { type?: string };
        const t = obj.type as InteractionType;
        if (t && t in AFFECTION_RULES) return t;
      } catch {
        /* ignore */
      }
    }
    return undefined;
  }
}

/** 调 LLM 做交互分类 (失败降级为 undefined → 调用方用规则/chat) */
export async function classifyInteractionWithLlm(
  message: string,
  senderName: string,
  cfg: AffectionConfig,
  opts: AffectionLlmOptions,
): Promise<InteractionType | undefined> {
  if (!opts.apiKey || !cfg.llmClassify) return undefined;
  try {
    const text = await callJudge({
      model: (() => {
        const m = cfg.model;
        if (!m) {
          throw new Error(
            "[WPP AFFECTION] cfg.model unresolved. v1.4.0 12:09 老板拍板: 必须从 schema default 或 accounts/<id>.json:affection.model 提供. plugin 不再 hardcode fallback"
          );
        }
        return m;
      })(),
      userPrompt: buildClassifyPrompt(message, senderName),
      maxTokens: 50,
      timeoutMs: cfg.timeoutMs ?? 5000, // v1.4.0 P0-fix 19:30: L4 跟 L1/L2/L3=5000 对齐
      creds: {
        apiKey: opts.apiKey,
        baseUrl: opts.baseUrl ?? resolveJudgeCreds().baseUrl,
        format: opts.format ?? "anthropic",
      },
    });
    return parseClassifyResponse(text);
  } catch {
    return undefined;
  }
}

// ===== 好感度计算 (对齐 _calculate_affection_change) =====

export interface AffectionCalcInput {
  interactionType: InteractionType;
  currentLevel: number;
  currentMood?: BotMood | null;
  maxUserAffection: number;
}

/** 计算好感度变化 (纯函数) */
export function calculateAffectionChange(input: AffectionCalcInput): InteractionResult {
  const rule = AFFECTION_RULES[input.interactionType] ?? AFFECTION_RULES.chat;

  // 情绪门槛检查
  if (rule.moodRequirements && input.currentMood) {
    if (!rule.moodRequirements.includes(input.currentMood.moodType)) {
      return {
        interactionType: input.interactionType,
        canChange: false,
        change: 0,
        reason: `当前心情(${input.currentMood.moodType})不适合${rule.description}`,
      };
    }
  }

  // 基础变化
  let actualChange = rule.baseChange;

  // 情绪修正
  if (rule.moodSensitive && input.currentMood) {
    const mod = moodModifier(input.currentMood.moodType, input.currentMood.intensity);
    actualChange = Math.trunc(rule.baseChange * mod);
  }

  // 上限检查
  if (input.currentLevel >= input.maxUserAffection && actualChange > 0) {
    return {
      interactionType: input.interactionType,
      canChange: false,
      change: 0,
      reason: "好感度已达到上限",
    };
  }

  return {
    interactionType: input.interactionType,
    canChange: true,
    change: actualChange,
    reason: rule.description,
  };
}

// ===== 重分配 (对齐 _redistribute_affection) =====

/**
 * 群总量超限时, 按比例从其他用户 (高到低) 扣减好感度。
 * 纯函数: 输入现有 affections, 返回应扣减的映射。
 */
export function planRedistribution(
  allAffections: Array<{ userId: string; level: number }>,
  targetUserId: string,
  increaseAmount: number,
  decayRate: number,
): Map<string, number> {
  const result = new Map<string, number>();
  let totalToDecrease = Math.max(0, increaseAmount);

  const others = allAffections
    .filter((a) => a.userId !== targetUserId)
    .sort((a, b) => b.level - a.level);

  const totalOthersLevel = others.reduce((sum, a) => sum + Math.max(0, a.level), 0);
  if (totalOthersLevel <= 0) return result;

  for (const user of others) {
    if (totalToDecrease <= 0) break;
    if (user.level <= 0) continue;
    const decreaseRatio = Math.min(1.0, totalToDecrease / totalOthersLevel);
    let decreaseAmount = Math.max(1, Math.trunc(user.level * decreaseRatio * decayRate));
    decreaseAmount = Math.min(decreaseAmount, user.level, totalToDecrease);
    result.set(user.userId, decreaseAmount);
    totalToDecrease -= decreaseAmount;
  }
  return result;
}

// ===== 情绪状态机 =====

export interface MoodState {
  moodType: MoodType;
  intensity: number;
  description: string;
  expiresAt: number;
}

/** 情绪描述模板 (供 system prompt) */
const MOOD_PROMPTS: Record<MoodType, string> = {
  happy: "你现在心情很好，说话比较活泼开朗，容易表达正面情感。",
  sad: "你现在心情有些低落，说话比较温和，需要更多的理解和安慰。",
  excited: "你现在很兴奋，说话比较有活力，对很多事情都很感兴趣。",
  calm: "你现在心情平静，说话比较稳重，给人安全感。",
  angry: "你现在心情不太好，说话可能比较直接，不太有耐心。",
  anxious: "你现在有些紧张不安，说话可能比较谨慎，需要更多确认。",
  playful: "你现在心情很调皮，喜欢开玩笑，说话比较幽默风趣。",
  serious: "你现在比较严肃认真，说话简洁直接，专注于重要的事情。",
  nostalgic: "你现在有些怀旧情绪，说话带有回忆色彩，比较感性。",
  curious: "你现在对很多事情都很好奇，喜欢提问和探索新事物。",
};

const MOOD_DESCRIPTIONS: Record<MoodType, string> = {
  happy: "心情愉快",
  sad: "心情低落",
  excited: "兴奋激动",
  calm: "平静",
  angry: "愤怒",
  anxious: "紧张不安",
  playful: "调皮",
  serious: "严肃",
  nostalgic: "怀旧",
  curious: "好奇",
};

/** 默认情绪 (平静) */
export function defaultMood(nowMs: number): MoodState {
  return { moodType: "calm", intensity: 0.5, description: MOOD_DESCRIPTIONS.calm, expiresAt: nowMs };
}

/**
 * 处理交互对情绪的影响 (对齐 _handle_mood_response + _trigger_*).
 * 返回新情绪状态 (null = 情绪不变)。
 */
export function applyMoodResponse(
  currentMood: MoodState,
  interactionType: InteractionType,
  nowMs: number,
): MoodState | null {
  const rule = AFFECTION_RULES[interactionType];
  if (!rule) return null;
  const moodEffect = rule.moodEffect ?? 0;
  if (Math.abs(moodEffect) < 0.1) return null; // 影响太小不处理

  // 负面触发
  if (rule.negativeMoodTrigger) {
    let newMood: MoodType;
    if (interactionType === "threat") newMood = "anxious";
    else if (interactionType === "abuse") newMood = "angry";
    else if (interactionType === "insult") newMood = "sad";
    else newMood = "anxious"; // harassment
    const intensity = Math.min(0.9, Math.abs(moodEffect));
    return {
      moodType: newMood,
      intensity,
      description: MOOD_DESCRIPTIONS[newMood],
      expiresAt: nowMs + 2 * 3600 * 1000, // 2 小时
    };
  }

  // 正面触发
  if (rule.positiveMoodBoost) {
    const newMood: MoodType = interactionType === "gift" ? "excited" : "happy";
    const intensity = Math.min(0.8, moodEffect);
    return {
      moodType: newMood,
      intensity,
      description: MOOD_DESCRIPTIONS[newMood],
      expiresAt: nowMs + 4 * 3600 * 1000, // 4 小时
    };
  }

  // 一般调整: 调整强度 (夹在 [0.1, 0.9])
  let intensity = currentMood.intensity + moodEffect;
  intensity = Math.max(0.1, Math.min(0.9, intensity));
  if (Math.abs(intensity - currentMood.intensity) <= 0.1) return null; // 变化太小
  return { ...currentMood, intensity };
}

/** 生成受情绪影响的 system prompt (对齐 get_mood_influenced_system_prompt) */
export function buildMoodSystemPrompt(basePrompt: string, mood: MoodState): string {
  const moodPrompt = MOOD_PROMPTS[mood.moodType] ?? "";
  if (!moodPrompt) return basePrompt;
  const intensityModifier = mood.intensity > 0.7 ? "非常" : mood.intensity > 0.4 ? "有些" : "轻微";
  const finalMoodPrompt = moodPrompt.replace("现在", `现在${intensityModifier}`);

  // 避免重复添加
  const moodKeywords = ["当前情绪状态", "心情", "情绪", "【当前情绪状态", "【增量更新"];
  if (moodKeywords.some((kw) => basePrompt.includes(kw))) return basePrompt;

  return `${basePrompt}\n\n当前情绪状态：${mood.description} ${finalMoodPrompt}\n\n请根据以上情绪状态调整你的回复风格和语气。`;
}

// ===== 内存存储 (每群状态) =====

interface GroupAffectionState {
  /** user_id → level */
  users: Map<string, number>;
  mood: MoodState;
  /** 情绪有效期检查 */
}

const groupStates = new Map<string, GroupAffectionState>();

/** 测试/热重载: 清空所有群好感度 */
export function resetAffectionStates(): void {
  groupStates.clear();
}

/** 清空某群 */
export function resetGroupAffection(groupId: string): void {
  groupStates.delete(groupId);
}

function getGroupState(groupId: string): GroupAffectionState {
  let st = groupStates.get(groupId);
  if (!st) {
    st = { users: new Map(), mood: defaultMood(Date.now()) };
    groupStates.set(groupId, st);
  }
  return st;
}

/** 当前情绪 (过期则重置为平静) */
export function getGroupMood(groupId: string, nowMs: number): MoodState {
  const st = getGroupState(groupId);
  if (nowMs > st.mood.expiresAt) {
    st.mood = defaultMood(nowMs);
  }
  return st.mood;
}

/** 用户好感度 */
export function getUserAffection(groupId: string, userId: string): number {
  return getGroupState(groupId).users.get(userId) ?? 0;
}

/** 群所有用户好感度 */
export function getAllUserAffections(groupId: string): Array<{ userId: string; level: number }> {
  const st = getGroupState(groupId);
  return [...st.users.entries()].map(([userId, level]) => ({ userId, level }));
}

/** 群总好感度 */
export function getGroupTotalAffection(groupId: string): number {
  const st = getGroupState(groupId);
  let total = 0;
  for (const l of st.users.values()) total += Math.max(0, l);
  return total;
}

/**
 * 核心入口: 处理一条消息的好感度 + 情绪更新。
 * 纯规则 (关键词分类) + 可选 LLM。返回结果摘要。
 */
export async function processAffectionMessage(
  groupId: string,
  userId: string,
  message: string,
  senderName: string,
  cfg: AffectionConfig,
  opts: AffectionLlmOptions,
  nowMs: number,
): Promise<{
  interactionType: InteractionType;
  change: number;
  canChange: boolean;
  reason: string;
} | null> {
  if (!cfg.enabled) return null;

  // ① 交互分类 (规则优先, LLM 增强可选)
  let interactionType = classifyInteractionByRules(message);
  if (!interactionType) {
    interactionType = await classifyInteractionWithLlm(message, senderName, cfg, opts);
  }
  if (!interactionType) interactionType = "chat"; // 兜底普通聊天

  const st = getGroupState(groupId);
  const currentMood = getGroupMood(groupId, nowMs);
  const currentLevel = st.users.get(userId) ?? 0;

  // ② 计算好感度变化
  const calc = calculateAffectionChange({
    interactionType,
    currentLevel,
    currentMood,
    maxUserAffection: cfg.maxUserAffection ?? 100,
  });

  // ③ 应用变化
  if (calc.canChange) {
    const newLevel = Math.max(0, currentLevel + calc.change);
    st.users.set(userId, newLevel);
  }

  // ④ 情绪响应
  const newMood = applyMoodResponse(st.mood, interactionType, nowMs);
  if (newMood) st.mood = newMood;

  // ⑤ 群总量超限 → 重分配
  const total = getGroupTotalAffection(groupId);
  if (total > (cfg.maxTotalAffection ?? 500)) {
    const excess = total - (cfg.maxTotalAffection ?? 500);
    if (calc.canChange && calc.change > 0) {
      const plan = planRedistribution(
        getAllUserAffections(groupId),
        userId,
        excess,
        cfg.affectionDecayRate ?? 0.3,
      );
      for (const [uid, amount] of plan) {
        const cur = st.users.get(uid) ?? 0;
        st.users.set(uid, Math.max(0, cur - amount));
      }
    }
  }

  return {
    interactionType,
    change: calc.canChange ? calc.change : 0,
    canChange: calc.canChange,
    reason: calc.reason,
  };
}

/** 群好感度状态摘要 (供调试/命令) */
export function getAffectionSummary(groupId: string): string {
  const st = getGroupState(groupId);
  const mood = st.mood;
  const users = [...st.users.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const lines = users.map(([uid, level]) => `- ${uid}: ${level}`);
  return [
    `情绪: ${mood.description} (强度 ${mood.intensity.toFixed(1)}, ${MOOD_PROMPTS[mood.moodType] ?? ""})`,
    `用户数: ${st.users.size}`,
    ...lines,
  ].join("\n");
}
