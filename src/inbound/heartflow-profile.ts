// src/inbound/heartflow-profile.ts - v1.7.0 心流群画像 (P1)
//
// 老板 2026-09-26 的原话: "我希望能根据每个群聊环境, 能自动理解群身份与特征, 建立画像, 应景回复 …
//   使其更贴合一个真人身份角色"; 同时明确 "**不愿意设定固定的触发关键词**".
// 本模块就是那句"自动理解群身份与特征"的落地: 每群每日一份画像, 注入 judge prompt 供"应景"参考。
//
// v1.10.0 (2026-09-28) 血的教训 —— 画像曾把心流**整体治死 3 天**:
//   ① `bot_role` 里的"基本不该插话的旁观者/少插话"被 judge prompt 的三条维度当成**否决票**
//      (relevance+willingness+social 合计权重 0.65) ⇒ 裁判给所有消息打 0.2-0.39, "该回"档整体消失;
//   ② `band` 被当**无上界的硬地板**, 4/5 个群抬到 0.70-0.90, 高于裁判给"明显该回"消息的分数上限 (0.82);
//   ③ 该 band 值还被印进 judge prompt 当及格线, 反过来压低裁判打分 (闭环自锁)。
//   修法: 源头改措辞 (buildHfProfilePrompt 两条硬约束) + 注入前过滤 (stripHfMutePhrases) +
//        band 改为**有界抬升** (resolveHfProfileBandEffect) + prompt 不再印阈值 (heartflow.ts)。
//
// 三条设计红线 (为什么这么写, 而不是"让 LLM 说什么就是什么"):
//  1. **画像只能收紧, 不许放开**。画像产出的建议 band / 预算一律过代码侧硬上限 —— 只能让 bot 更克制,
//     不能更激进。激进的后果正是老板要治的病 (刷屏); 而"更多参与"这件事由学习闭环 + 预算在安全边界内自己决定。
//  2. **画像文本注入前截断** (≤ maxPromptChars, 默认 400)。LLM 会越写越长, 未经截断的画像会悄悄吃掉
//     judge prompt 的预算 (而 judge 的输出预算只有 300 token, 见 heartflow.ts) —— 这是会引发静默故障的耦合。
//  3. **生成失败绝不写空画像**: 解析失败/调用失败一律保留上一版并 warn。空画像比没有画像更坏 (它会让
//     prompt 里出现"本群画像: (空)", 引导 judge 乱猜)。
//
// 与静默段的关系 (如实说明): 画像会给出"建议静默段", 但**不自动生效** —— 只存库、只在 /heartflow profile 展示,
//   需要人工确认后才放进 accounts 配置。原因: 静默段是"彻底不说话"的开关, 一次幻觉就能让某个群整天无响应;
//   而画像本身的价值 (语气/身份/宜忌) 已经通过 prompt 注入拿到了。
//
// 热路径 (judge) 零 DB 读: 画像文本在内存缓存里 (`_profiles`), 由 sweep 每轮用一条 listHfGroupProfiles 预热。

import { debug, formatErr, info, warn } from "../core/logger.js";
import { callJudge, resolveJudgeCreds } from "../llm-judge.js";
import {
  getHfGroupMessageStats,
  listHfGroupMsgHourBuckets,
  listHfGroupProfiles,
  upsertHfGroupProfile,
  getMessages,
} from "../storage/db/index.js";
import type { HfGroupMsgStats, HfGroupProfileRecord } from "../storage/db/types.js";
import { HF_LEARNING_DEFAULTS, isHfGroupAllowed, resolveHfLearning, type HeartflowConfig } from "./heartflow.js";
import { resolveHfBudget, type HfBudgetConfig } from "./heartflow-budget.js";

/**
 * 阈值钳制 (本地实现而非 import heartflow-learn 的 clampHfThresholdToBand:
 *   本模块已被 sweep (heartflow-learn) 反向 import, 再从那边 import 回来就成环).
 * 语义与 heartflow-learn.clampHfThresholdToBand 一致 —— 只有这两行, 不值得为它承担循环依赖.
 */
function clampBand(t: number, bandMin: number, bandMax: number): number {
  return Math.min(bandMax, Math.max(bandMin, t));
}

/** 画像参数 (挂 `HeartflowConfig.profile`, 缺省走 HF_PROFILE_DEFAULTS; 不进 UI schema) */
export interface HfProfileConfig {
  /** 总开关 (默认 true: 老板要的就是画像; false 可关掉生成) */
  enabled?: boolean;
  /** 样本门槛: 窗口内入站人类消息少于此值不生成 (几条消息的"画像"是噪声) */
  minMsgs?: number;
  /** 统计窗口 (天) */
  lookbackDays?: number;
  /**
   * 画像生成的 maxTokens —— **必须单独给**, 绝不复用 heartflow.ts 里硬编码的 judge 300:
   * 2026-09-13 那次 judge 静默瘫 3 天, 根因就是推理模型的思考与正文共享 max_tokens.
   */
  maxTokens?: number;
  /** 多久重生成一次 (小时; 默认 22 = 每天一次, 留 2h 抖动余量) */
  refreshHours?: number;
  /** 单轮 sweep 最多生成几个群 (防一次打爆 LLM: 20 个群同时到期不该并发 20 次调用) */
  maxPerRun?: number;
  /** 注入 judge prompt 的画像文本上限 (字符) */
  maxPromptChars?: number;
  /** 喂给 LLM 的样本消息条数 */
  sampleMsgs?: number;
  /** 单次画像调用的超时 (毫秒; 比 judge 的 5s 宽 —— 它要写的是一整份结构化画像) */
  timeoutMs?: number;
  /**
   * 是否让画像建议的**静默段**自动生效 (默认 **false** = 只存库+展示, 不改变行为)。
   *
   * 老板 2026-09-26 拍板"静默段默认关"; 且它与其他画像建议不同 —— 它是"彻底不吭声"的开关,
   *   一次幻觉就能让某个群整天无响应。要开须显式置 true, 且仍过硬上限 (单段 ≤6h / 全天 ≤8h)。
   * 详见 heartflow-budget.mergeHfQuietHours 与 /heartflow profile 的输出。
   */
  applyQuietHours?: boolean;
  /**
   * v1.10.0: 画像 band 相对基线阈值的**最大抬升幅度** (默认 0.10)。
   *
   * 为什么要有上界: 旧码把 band 当无上界的硬地板, 而画像是 LLM 按"越谨慎越大"给的、对裁判打分刻度
   *   一无所知 ⇒ 2026-09-26 起 4/5 个群被抬到 0.70-0.90, 高于裁判给"明显该回"消息的分数上限 (0.82),
   *   心流静默 3 天 (见 resolveHfProfileBandEffect 注释)。
   * 想让画像说话更保守请调预算/静默段 (结构层), 不要靠抬阈值 —— 那是"用质量闸干频率闸的活"。
   */
  maxRaise?: number;
}

export const HF_PROFILE_DEFAULTS = {
  enabled: true,
  minMsgs: 30,
  lookbackDays: 14,
  maxTokens: 1200,
  refreshHours: 22,
  maxPerRun: 3,
  maxPromptChars: 400,
  sampleMsgs: 40,
  timeoutMs: 20000,
  applyQuietHours: false,
  maxRaise: 0.1,
} satisfies Required<HfProfileConfig>;

export function resolveHfProfileCfg(cfg?: { profile?: HfProfileConfig }): Required<HfProfileConfig> {
  const p = cfg?.profile;
  const D = HF_PROFILE_DEFAULTS;
  return {
    enabled: p?.enabled ?? D.enabled,
    minMsgs: p?.minMsgs ?? D.minMsgs,
    lookbackDays: p?.lookbackDays ?? D.lookbackDays,
    maxTokens: p?.maxTokens ?? D.maxTokens,
    refreshHours: p?.refreshHours ?? D.refreshHours,
    maxPerRun: p?.maxPerRun ?? D.maxPerRun,
    maxPromptChars: p?.maxPromptChars ?? D.maxPromptChars,
    sampleMsgs: p?.sampleMsgs ?? D.sampleMsgs,
    timeoutMs: p?.timeoutMs ?? D.timeoutMs,
    applyQuietHours: p?.applyQuietHours ?? D.applyQuietHours,
    maxRaise: p?.maxRaise ?? D.maxRaise,
  };
}

/** 解析并校验后的画像 (所有字段都已限长 ⇒ 可安全拼进 prompt / 展示) */
export interface HfGroupProfile {
  /** 群性质 (如"手机零售商的客户售后群") */
  nature: string;
  /** 语言风格 (如"短句、口语、爱用表情") */
  style: string;
  /** bot 在该群的角色定位 */
  botRole: string;
  /** 模型自己归纳的一句话说话基调 (渲染时放最后: 它是上面几项的重述, 截断最先丢它) */
  summary: string;
  /** 宜聊话题 */
  engage: string[];
  /** 忌聊话题 */
  avoid: string[];
  /** 活跃时段 (本地小时 0-23) */
  activeHours: number[];
  /** ⚠️ 建议静默段: **仅展示, 不自动生效** (见文件头) */
  quietHours: Array<[number, number]>;
  /** 建议阈值 (已过 band 硬区间钳制; null = 无建议) */
  band: number | null;
  /** 建议预算 (已**只收紧不放开**地钳制) */
  budget: HfBudgetConfig | null;
}

/** 字段上限 (防 LLM 越写越长 ⇒ prompt 膨胀) */
const LIM = {
  nature: 60,
  style: 60,
  botRole: 60,
  summary: 120,
  listItem: 30,
  listLen: 5,
};

// ===== 生成侧 (纯函数) =====

/**
 * 画像生成 prompt。要求模型只回 JSON —— 与 judge 同范式 (judge 也是"只回 JSON"), 复用既有的容忍式解析。
 * 样本消息用 `sender: content` 形式给出 (不含 wxid, 模型不需要身份, 也少一处个人数据外发面)。
 */
export function buildHfProfilePrompt(input: {
  msgs: number;
  days: number;
  stats: HfGroupMsgStats;
  samples: string[];
}): string {
  const { stats } = input;
  const hist = stats.hourHist
    .map((n, h) => (n > 0 ? `${h}时:${n}` : null))
    .filter(Boolean)
    .join(" ");
  const senders = stats.topSenders.length
    ? stats.topSenders.map((s) => `${s.n}条`).join(", ")
    : "(无)";
  const types = Object.entries(stats.typeHist)
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
  return `你在为一个微信群建立"群画像", 供一个群聊机器人决定"该不该接话、怎么说话"时参考。

## 统计 (近 ${input.days} 天, 共 ${input.msgs} 条群成员消息)
- 活跃天数: ${stats.activeDays}
- 每小时消息量: ${hist || "(无)"}
- 平均消息长度: ${stats.avgLen} 字
- 消息类型分布: ${types || "(无)"}
- 发言最多的成员条数: ${senders}

## 最近群聊样本 (可能被截断)
${input.samples.join("\n")}

## 任务
判断这是**什么样的群**、机器人在**这个群**里应该扮演什么角色、说什么话合适。

**只输出 JSON, 不要任何其他内容** (不要 markdown 代码块, 不要解释):
{
  "nature": "群性质, 一句话 (如: 某行业的客户售后群 / 家人群 / 同事闲聊群)",
  "style": "群里的语言风格, 一句话 (如: 短句口语 / 专业术语多 / 表情包多)",
  "bot_role": "机器人在该群的**身份与口吻**, 一句话 (如: 答疑的客服 / 偶尔搭话的熟人 / 懂业务的同事)",
  "engage": ["适合接话的话题, 最多5个短词"],
  "avoid": ["不适合接话/不该提的话题, 最多5个短词"],
  "active_hours": [消息最活跃的本地小时 0-23 数组, 最多6个],
  "quiet_hours": [[开始小时, 结束小时]],
  "band": 建议的回复阈值 0-1 的小数 (越谨慎越大; 拿不准给 null),
  "budget": {"min_gap_sec": 最小发言间隔秒, "max_per_hour": 每小时上限, "max_per_day": 每天上限},
  "summary": "给机器人看的一句话提示 (30字内, 说清该群该用什么口吻说话)"
}

**两条硬约束 (写错会让机器人彻底不吭声, 比画像为空更糟):**
1. bot_role 与 summary 只写"**以什么身份、用什么口吻**说话", **绝不要**写"不该插话/少说话/旁观/不主动/别闲聊"
   这类**要不要说话**的结论 —— 说不说由系统的评分阈值与发言预算决定, 画像只决定"怎么说、聊什么"。
   反例: "基本不该插话的旁观者, 仅在明确被@时回应" (❌ 会当成否决票, 让机器人再不开口)
   正例: "懂手机业务的同事, 说话短、直给结论, 不客套" (✅)
2. band 是"这个群我想多克制一点"的**微调**, 系统只允许它在基线阈值 0.6 上小幅上调 (最多 +0.10),
   再往上写没有意义。请用 0.55-0.70 之间的小数表达"稍微谨慎", 拿不准就给 null。
   **不要**用 0.85/0.9 这类数字表达"谨慎" —— 那会把阈值抬到任何消息都过不去的高度。

只依据样本判断, 不要编造。数据不足以判断的字段给 null 或空数组。`;
}

/** 取第一个 `{` 到最后一个 `}` 并 JSON.parse (容忍代码块围栏/前后废话) */
function extractJsonObject(text: string): Record<string, unknown> | null {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try {
    const v = JSON.parse(text.slice(s, e + 1));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function asStr(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  const s = v.replace(/\s+/g, " ").trim();
  if (!s || s === "null") return "";
  return s.slice(0, max);
}

function asStrList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    const s = asStr(x, LIM.listItem);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= LIM.listLen) break;
  }
  return out;
}

function asHourList(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const x of v) {
    const n = Number(x);
    if (!Number.isFinite(n)) continue;
    const h = Math.floor(n);
    if (h < 0 || h > 23 || out.includes(h)) continue;
    out.push(h);
    if (out.length >= 6) break;
  }
  return out;
}

function asQuietRanges(v: unknown): Array<[number, number]> {
  if (!Array.isArray(v)) return [];
  const out: Array<[number, number]> = [];
  for (const x of v) {
    if (!Array.isArray(x) || x.length < 2) continue;
    const a = Number(x[0]);
    const b = Number(x[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const s = Math.floor(a);
    const e = Math.floor(b);
    if (s < 0 || s > 23 || e < 0 || e > 23 || s === e) continue;
    out.push([s, e]);
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * 解析画像响应 → HfGroupProfile; 坏 JSON / 全空 → null (调用方据此保留上一版, 绝不写空画像)。
 * 所有字段限长, 数组限长, 小时限 0-23 —— 校验发生在**入库之前**。
 */
export function parseHfProfileResponse(
  text: string,
  opts?: { bandMin?: number; bandMax?: number; budgetCfg?: Required<HfBudgetConfig> },
): HfGroupProfile | null {
  const o = extractJsonObject(text);
  if (!o) return null;
  const bandRaw = o.band == null ? null : Number(o.band);
  const budgetRaw = o.budget && typeof o.budget === "object" ? (o.budget as Record<string, unknown>) : null;
  const p: HfGroupProfile = {
    nature: asStr(o.nature, LIM.nature),
    style: asStr(o.style, LIM.style),
    botRole: asStr(o.bot_role, LIM.botRole),
    summary: asStr(o.summary, LIM.summary),
    engage: asStrList(o.engage),
    avoid: asStrList(o.avoid),
    activeHours: asHourList(o.active_hours),
    quietHours: asQuietRanges(o.quiet_hours),
    band:
      bandRaw != null && Number.isFinite(bandRaw) && bandRaw > 0 && bandRaw <= 1
        ? clampBand(
            bandRaw,
            opts?.bandMin ?? HF_LEARNING_DEFAULTS.bandMin,
            opts?.bandMax ?? HF_LEARNING_DEFAULTS.bandMax,
          )
        : null,
    budget: budgetRaw ? clampHfProfileBudget(budgetRaw, opts?.budgetCfg) : null,
  };
  // 全空 = 没有信息量 ⇒ null (不写库, 保留上一版)
  // 只有 summary 也算有内容 (它是模型对全群的归纳, 单看也有价值)
  const empty =
    !p.nature &&
    !p.style &&
    !p.botRole &&
    !p.summary &&
    p.engage.length === 0 &&
    p.avoid.length === 0 &&
    !p.band;
  return empty ? null : p;
}

/**
 * 画像建议的预算 → **只能收紧, 不许放开**。
 * 每条都与配置上限取 min (间隔取 max), 缺省字段不填 (不覆盖配置); 关掉的总开关不给画像改。
 * 返回 null = 该建议没有任何有效字段。
 */
export function clampHfProfileBudget(
  suggested: Record<string, unknown>,
  cfg?: Required<HfBudgetConfig>,
): HfBudgetConfig | null {
  const num = (k: string): number | null => {
    const n = Number(suggested[k]);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  };
  const gap = num("min_gap_sec");
  const hour = num("max_per_hour");
  const day = num("max_per_day");
  if (gap == null && hour == null && day == null) return null;
  const out: HfBudgetConfig = {};
  if (gap != null) {
    // 间隔: 画像只能要求"更久不说话"
    out.minGapSec = cfg ? Math.max(cfg.minGapSec, gap) : gap;
  }
  if (hour != null) {
    out.maxPerHour = cfg && cfg.maxPerHour > 0 ? Math.min(cfg.maxPerHour, hour) : hour;
  }
  if (day != null) {
    out.maxPerDay = cfg && cfg.maxPerDay > 0 ? Math.min(cfg.maxPerDay, day) : day;
  }
  return out;
}

/**
 * v1.10.0 画像"禁言令"过滤器 (纯函数): 命中 ⇒ 返回 "" (丢弃该字段), 未命中 ⇒ 原样返回。
 *
 * 为什么必须有 (2026-09-28 生产事故的**主**根因, 不是洁癖):
 *   judge prompt 的三条评分维度都写着"结合机器人角色特点/角色定位"判断 —— 于是画像的
 *   `我的角色定位: 基本不该插话的旁观者` 成了压在 relevance+willingness+social (合计权重 0.65)
 *   上的**否决票**。2026-09-26 画像上线当天, 台账里"该回"档 (0.61-0.82) 整体消失, 38 次判定最高 0.39。
 *   回溯验证 (23 条 09-22..25 曾得 ≥0.6 的真实消息, 同一 judge 模型):
 *     注入现状画像 (含"不该插话/少插话") = 均分 0.322, 仅 2 条 ≥0.6
 *     删掉这两行                      = 均分 0.581, 15 条 ≥0.6
 *     换成**只讲身份与口吻**的同类文本  = 均分 0.669, 20 条 ≥0.6   ← 画像本身是好的, 只有"禁言令"有毒
 *   即: 群性质/语言风格/宜接话题/忌接话题 这些**话题性**内容是资产, 必须留;
 *   而"少说话/别插话/旁观"这类**元指令**是负债 —— "说还是不说"由代码侧的阈值与预算决定,
 *   不是画像能投票的事。故这里对 `botRole`/`summary` 两个字段做过滤 (engage/avoid 是话题清单, 不扫)。
 *
 * 与 `buildHfProfilePrompt` 的措辞约束是**双保险**: 源头让它别这么写 (改措辞), 这里保证即使写了也进不去
 *   judge prompt (改代码)。只靠源头措辞 = 一次模型抽风就重新自锁; 只靠这里 = 白丢一条本来有用的信息。
 */
const HF_MUTE_PATTERNS: readonly RegExp[] = [
  /不该插话|不要插话|别插话|少插话|不插话/,
  /不该说话|不要说话|别说话|少说话|不说话/,
  /旁观者|围观者/,
  /不主动(说|发|聊|参|插|搭|回)/,
  /不闲聊|不聊闲|勿闲聊/,
  /禁言|保持沉默|尽量沉默|闭嘴/,
];

export function stripHfMutePhrases(text: string): string {
  const s = (text ?? "").trim();
  if (!s) return "";
  for (const re of HF_MUTE_PATTERNS) {
    if (re.test(s)) return "";
  }
  return s;
}

/**
 * 对画像做注入前过滤 (纯函数): 只过滤 `botRole` / `summary` 两个**可能变成否决票**的字段。
 * 返回新对象, 不改原对象 (原始画像仍原样存库/展示 —— `/heartflow profile` 要看得到真相)。
 */
export function guardHfProfileForPrompt(p: HfGroupProfile): HfGroupProfile {
  return { ...p, botRole: stripHfMutePhrases(p.botRole), summary: stripHfMutePhrases(p.summary) };
}

/** 画像 band 对阈值的**有界**抬升幅度 (默认 +0.10) —— 见 resolveHfProfileBandEffect */
export const HF_PROFILE_MAX_RAISE = 0.1;

/**
 * v1.10.0 画像 band 的生效规则 (纯函数): 从锚点值出发, **只抬不降, 且抬升有上限**。
 *
 * 修的是 09-26 那次自锁的**点火器**: 旧码 `Math.max(baseThreshold, profileFloor)` 让画像建议的
 *   0.85/0.90 直接成为**无上界的硬地板** —— 而画像的 prompt 只让模型"越谨慎越大", 模型没有任何
 *   关于裁判打分刻度 (实测"该回"档 0.61-0.82) 的信息, 于是给出 0.85/0.90 ⇒ 连裁判认为明显该回的
 *   消息都永远越不过 ⇒ 零发言 (台账 09-26 起 38 次判定全部 below-threshold)。
 *   同时该值还会被印进 judge prompt 当"及格线", 反过来把裁判的打分也压下去 (闭环自锁, 双重)。
 *
 * 现在的语义: band 是"这个群我想更克制一点"的**微调**, 不是"我重新定义及格线"。
 *   - 只抬不降 (画像无权放宽约束), 且最多抬 `maxRaise` (默认 0.10);
 *   - 再与阈值硬区间 [bandMin, bandMax] 取交 —— 与 evalHfThreshold / clampHfThresholdToBand 同一道保证。
 * `capped=true` 表示画像想要的值被截住了 (调用方据此打一条 warn, 让"画像想说 0.9"这件事可见)。
 */
export function resolveHfProfileBandEffect(
  anchor: number,
  band: number | null | undefined,
  opts?: { maxRaise?: number; bandMin?: number; bandMax?: number },
): { threshold: number; capped: boolean } {
  const maxRaise = Math.max(0, opts?.maxRaise ?? HF_PROFILE_MAX_RAISE);
  const bandMin = opts?.bandMin ?? HF_LEARNING_DEFAULTS.bandMin;
  const bandMax = opts?.bandMax ?? HF_LEARNING_DEFAULTS.bandMax;
  const a = Number.isFinite(anchor) ? anchor : 0.6;
  if (band == null || !Number.isFinite(band)) {
    return { threshold: clampBand(a, bandMin, bandMax), capped: false };
  }
  const want = Math.max(a, band);
  const limited = Math.min(want, a + maxRaise);
  return { threshold: clampBand(limited, bandMin, bandMax), capped: want - limited > 1e-9 };
}

/**
 * 渲染给 judge prompt 的画像文本 (≤ maxChars)。
 * 按行拼装, 超限时**整行丢弃**而不是硬切 —— 半句话比没有更误导。
 * 无内容 → "" (调用方据此不注入)。
 * v1.10.0: `botRole`/`summary` 行先过 stripHfMutePhrases —— 这里的产物直接进 judge prompt,
 *   是"禁言令"能造成伤害的唯一入口, 所以过滤点选在这一层的上游 (loadHfProfilesIntoCache 里做一次)。
 */
export function renderHfProfileForPrompt(p: HfGroupProfile, maxChars: number): string {
  const lines: string[] = [];
  if (p.nature) lines.push(`群性质: ${p.nature}`);
  if (p.style) lines.push(`语言风格: ${p.style}`);
  if (p.botRole) lines.push(`我的角色定位: ${p.botRole}`);
  if (p.engage.length) lines.push(`宜接话题: ${p.engage.join("、")}`);
  if (p.avoid.length) lines.push(`忌接话题: ${p.avoid.join("、")}`);
  if (p.activeHours.length) lines.push(`活跃时段: ${p.activeHours.map((h) => `${h}时`).join(",")}`);
  // summary 放最后: 它是上面几项的重述, prompt 紧张时最先被整行丢掉, 不挤掉硬信息
  if (p.summary) lines.push(`说话基调: ${p.summary}`);
  const out: string[] = [];
  let len = 0;
  for (const ln of lines) {
    const add = out.length === 0 ? ln.length : ln.length + 1;
    if (len + add > Math.max(0, maxChars)) break;
    out.push(ln);
    len += add;
  }
  return out.join("\n");
}

/**
 * 由统计直方图**确定性推导**活跃时段 (不靠 LLM): 消息量 ≥ 均值的小时。
 * 用途: (a) 给 judge prompt 一个客观的"这个群什么时候热闹"; (b) 与画像里的 active_hours 对照,
 *   LLM 说的和实测不符时以实测为准 (在 /heartflow profile 里并排展示, 便于老板判断画像可信度)。
 */
export function deriveActiveHours(hourHist: number[], minMsgs = 1): number[] {
  const total = hourHist.reduce((s, n) => s + n, 0);
  if (total < minMsgs) return [];
  const avg = total / 24;
  const out: number[] = [];
  for (let h = 0; h < 24; h += 1) if ((hourHist[h] ?? 0) >= avg) out.push(h);
  return out;
}

/** 该群画像是否需要重新生成 (无画像 / 无生成时刻 / 超过 refreshHours) */
export function isHfProfileStale(
  generatedAtSec: number | null | undefined,
  nowSec: number,
  refreshHours: number,
): boolean {
  if (generatedAtSec == null || generatedAtSec <= 0) return true;
  return nowSec - generatedAtSec >= Math.max(1, refreshHours) * 3600;
}

/** 从 DB 行解析画像 (坏 JSON → null; 不抛) */
export function parseHfGroupProfileRow(row: HfGroupProfileRecord): HfGroupProfile | null {
  return parseHfProfileResponse(row.profile_json);
}

// ===== 进程内缓存 (judge 热路径零 DB 读) =====

interface CachedProfile {
  text: string;
  /** 画像建议的阈值下限 (只抬不降; null = 无建议) */
  band: number | null;
  budget: HfBudgetConfig | null;
  generatedAt: number | null;
  version: number;
}

const _profiles = new Map<string, CachedProfile>();

function _key(accountId: string, groupId: string): string {
  return `${accountId}:${groupId}`;
}

/** judge 路径取画像文本 (无则 null, 不查 DB) */
export function getHfProfilePromptText(accountId: string, groupId: string): string | null {
  const c = _profiles.get(_key(accountId, groupId));
  return c && c.text ? c.text : null;
}

/**
 * 画像建议的阈值下限 (与账号阈值取 max ⇒ 画像只能让 bot 更克制)。
 * 无画像/无建议 → null (调用方保持原阈值)。
 */
export function getHfProfileBandFloor(accountId: string, groupId: string): number | null {
  const c = _profiles.get(_key(accountId, groupId));
  return c?.band ?? null;
}

/** 画像建议的预算 (已只收紧钳制; 供调用方与配置取交集; 无则 null) */
export function getHfProfileBudget(accountId: string, groupId: string): HfBudgetConfig | null {
  return _profiles.get(_key(accountId, groupId))?.budget ?? null;
}

/**
 * v1.10.0: 画像 band 的实际生效结果 (读取侧唯一入口) —— 有界抬升 + 硬区间钳制, 零 DB IO。
 * 返回 `band` = 画像原始建议 (供展示/诊断, 让"画像想要 0.9 但只生效 0.70"这件事看得见)。
 */
export function resolveHfProfileBandEffectFor(
  accountId: string,
  groupId: string,
  anchor: number,
  cfg?: HeartflowConfig,
): { threshold: number; capped: boolean; band: number | null } {
  const P = resolveHfProfileCfg(cfg);
  const L = resolveHfLearning(cfg);
  const band = getHfProfileBandFloor(accountId, groupId);
  const r = resolveHfProfileBandEffect(anchor, band, { maxRaise: P.maxRaise, bandMin: L.bandMin, bandMax: L.bandMax });
  return { threshold: r.threshold, capped: r.capped, band };
}

/** sweep 预热: 用一条 listHfGroupProfiles 的结果整体替换该账号的缓存 (含删除已消失的群) */
export function loadHfProfilesIntoCache(
  accountId: string,
  rows: HfGroupProfileRecord[],
  maxPromptChars: number,
): number {
  const prefix = `${accountId}:`;
  for (const k of [..._profiles.keys()]) if (k.startsWith(prefix)) _profiles.delete(k);
  let n = 0;
  for (const r of rows) {
    const raw = parseHfGroupProfileRow(r);
    if (!raw) continue;
    // v1.10.0: 注入 judge prompt 的文本过一次"禁言令"过滤 —— 库里已有的坏画像 (如 09-26 那批
    //   "基本不该插话的旁观者") 立刻失效, 不必等下一次重生成; 原始画像仍留在库里供 /heartflow profile 查看。
    const p = guardHfProfileForPrompt(raw);
    if (raw.botRole && !p.botRole) {
      warn(`[WPP HF] profile mute-phrase stripped: account=${accountId} group=${r.group_id} field=bot_role`);
    }
    if (raw.summary && !p.summary) {
      warn(`[WPP HF] profile mute-phrase stripped: account=${accountId} group=${r.group_id} field=summary`);
    }
    _profiles.set(_key(accountId, r.group_id), {
      text: renderHfProfileForPrompt(p, maxPromptChars),
      band: p.band,
      budget: p.budget,
      generatedAt: r.generated_at ?? null,
      version: r.version ?? 1,
    });
    n += 1;
  }
  return n;
}

/** 测试/热重载: 清空画像缓存 (不加这个, 单测之间会互相污染) */
export function resetHfProfileCache(): void {
  _profiles.clear();
}

export function hfProfileCacheSize(): number {
  return _profiles.size;
}

// ===== 生成侧 (IO) =====

export interface HfProfileGenResult {
  /** 本轮新生成的群数 */
  generated: number;
  /** 本轮跳过的群数 (样本不足 / 还新 / 超 maxPerRun) */
  skipped: number;
}

/**
 * sweep 调用的每日画像生成 (纯 IO 编排; 每群每日最多一次)。
 *
 * 顺序: 预热缓存 (始终) → 逐群判断是否该生成 → 统计 → 样本 → LLM → 解析 → 落库 → 更新缓存。
 * 任一环节失败: **保留上一版画像**, warn 一次, 继续下一个群 —— 单个群的失败不许影响其它群, 更不许影响 sweep。
 */
export async function maybeGenerateHfGroupProfiles(
  accountId: string,
  cfg: HeartflowConfig,
  nowSec: number,
): Promise<HfProfileGenResult> {
  const P = resolveHfProfileCfg(cfg);
  const out: HfProfileGenResult = { generated: 0, skipped: 0 };
  const budgetCfg = resolveHfBudget(cfg);

  // 1) 预热缓存 (无论是否生成: judge 每次都要用; 也让"关掉生成但用旧画像"成立)
  let existing: HfGroupProfileRecord[] = [];
  try {
    existing = await listHfGroupProfiles(accountId);
    const n = loadHfProfilesIntoCache(accountId, existing, P.maxPromptChars);
    if (n > 0) debug(`[WPP HF] profile cache warm: account=${accountId} groups=${n}`);
  } catch (e) {
    warn(`[WPP HF] profile cache warm failed (judge 将无画像可用): ${formatErr(e)}`);
    return out;
  }
  if (!P.enabled) return out;

  const model = cfg.model;
  if (!model) {
    warn("[WPP HF] profile: cfg.model 缺失 ⇒ 跳过画像生成 (阈值/预算不受影响)");
    return out;
  }

  // 2) 该生成哪些群: 近 lookbackDays 有入站消息的群 ∩ 白名单
  let groups: string[] = [];
  try {
    const localOffsetSec = -new Date(nowSec * 1000).getTimezoneOffset() * 60;
    const buckets = await listHfGroupMsgHourBuckets(accountId, nowSec - P.lookbackDays * 86400, localOffsetSec);
    groups = [...new Set(buckets.map((b) => b.group_id))].filter((g) => isHfGroupAllowed(g, cfg));
  } catch (e) {
    warn(`[WPP HF] profile: 活跃群清单查询失败: ${formatErr(e)}`);
    return out;
  }

  const byGroup = new Map(existing.map((r) => [r.group_id, r]));
  const creds = resolveJudgeCreds();
  for (const groupId of groups) {
    const prev = byGroup.get(groupId);
    if (!isHfProfileStale(prev?.generated_at ?? null, nowSec, P.refreshHours)) {
      out.skipped += 1;
      continue;
    }
    if (out.generated >= Math.max(1, P.maxPerRun)) {
      // 本轮配额用完: 剩下的等下一轮 sweep (5 分钟后再来), 不并发打 LLM
      out.skipped += 1;
      continue;
    }
    try {
      const stats = await getHfGroupMessageStats(accountId, groupId, nowSec - P.lookbackDays * 86400);
      if (stats.total < P.minMsgs) {
        debug(`[WPP HF] profile skipped (样本不足): group=${groupId} msgs=${stats.total}<${P.minMsgs}`);
        out.skipped += 1;
        continue;
      }
      const samples = await loadSampleLines(accountId, groupId, P.sampleMsgs);
      const text = await callJudge({
        model,
        userPrompt: buildHfProfilePrompt({
          msgs: stats.total,
          days: P.lookbackDays,
          stats,
          samples,
        }),
        systemPrompt: "你是群体行为分析师, 只输出 JSON。",
        maxTokens: P.maxTokens,
        timeoutMs: P.timeoutMs,
        creds,
      });
      const p = parseHfProfileResponse(text, {
        bandMin: cfg.learning?.bandMin,
        bandMax: cfg.learning?.bandMax,
        budgetCfg,
      });
      if (!p) {
        warn(`[WPP HF] profile 解析失败 (保留上一版): group=${groupId} len=${text.length}`);
        out.skipped += 1;
        continue;
      }
      const version = (prev?.version ?? 0) + 1;
      await upsertHfGroupProfile({
        account_id: accountId,
        group_id: groupId,
        profile_json: JSON.stringify(p),
        stats_json: JSON.stringify({
          total: stats.total,
          activeDays: stats.activeDays,
          avgLen: stats.avgLen,
          hourHist: stats.hourHist,
          typeHist: stats.typeHist,
          derivedActiveHours: deriveActiveHours(stats.hourHist),
          topSenderCount: stats.topSenders.length,
        }),
        sample_msgs: samples.length,
        model,
        version,
        generated_at: nowSec,
      });
      _profiles.set(_key(accountId, groupId), {
        text: renderHfProfileForPrompt(p, P.maxPromptChars),
        band: p.band,
        budget: p.budget,
        generatedAt: nowSec,
        version,
      });
      out.generated += 1;
      info(
        `[WPP HF] profile generated: group=${groupId} v${version} msgs=${stats.total} ` +
          `chars=${renderHfProfileForPrompt(p, P.maxPromptChars).length} band=${p.band ?? "-"}`,
      );
    } catch (e) {
      // 保留上一版: 不 upsert, 缓存里仍是预热进来的那版
      warn(`[WPP HF] profile 生成失败 (保留上一版): group=${groupId} ${formatErr(e)}`);
      out.skipped += 1;
    }
  }
  return out;
}

/**
 * 取最近入站消息作为样本 (`sender: content`, 单条截断 80 字)。
 * 复用既有 getMessages (不新增查询): 出站消息被 direction='inbound' 过滤掉 ⇒ 样本里没有 bot 自己的话
 * (画像要理解的是**群**, 不是 bot 的说话习惯 —— 把 bot 自己的话喂进去会让画像自我强化)。
 */
async function loadSampleLines(accountId: string, groupId: string, limit: number): Promise<string[]> {
  const max = Math.max(1, Math.min(limit, 100));
  const rows = await getMessages({ accountId, peerKind: "group", peerId: groupId, limit: max * 2 });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of rows) {
    if (m.direction !== "inbound") continue;
    const body = (m.content ?? "").replace(/\s+/g, " ").trim();
    if (!body || body.length < 2) continue;
    const who = (m.from_wxid ?? "").slice(0, 6) + "**";
    const line = `${who}: ${body.slice(0, 80)}`;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= max) break;
  }
  return out;
}
