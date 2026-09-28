// src/inbound/heartflow-learn.ts - 心流反馈闭环 (v1.6.x): 自适应调阈算法 + per-群阈值缓存 + sweep
//
// 职责分层:
//   纯算法/分类 (evalHfThreshold/hfCooldownOk/round2/classifyHfSend) — 无副作用, 单测直接 import dist
//   per-群 learned 阈值内存缓存 (judge 路径零 DB IO; 由 sweep/启动加载刷新)
//   DB 薄管线 (persistHfJudged/persistHfSendOutcome/markHfGroupEngaged/sweep) — 全 catch, 失败不阻断 dispatch
//
// 设计 (老板 2026-09-07 拍板: 双向自适应 + 硬护栏, 只对白名单群):
//   每次「应触发发送」的心流回复落 ledger → deliver 真发开观察窗 → 人类接话=engaged / 到期无人=ignored
//   → sweep 按每群最近 closed 样本接话率双向微调 learned 阈值, 区间 [bandMin,bandMax] 钳制 + minSample + 变更冷却 + 审计
//   v1.6.6: 区间钳制是**双保险** — 写入侧 evalHfThreshold + 读取侧 clampHfThresholdToBand (死区绕过见该函数注释)
//
// learned 阈值存 DB (wpp_hf_group_state), 不回写 accounts JSON (高频写会抖 fs.watch)

import { info, warn, debug, formatErr } from "../core/logger.js";
import type { HfLedgerRecord } from "../storage/db/types.js";
import {
  recordHfJudged as dbRecordHfJudged,
  setHfLedgerSent,
  setHfLedgerSuppressed,
  markHfEngaged,
  closeHfExpiredWindows,
  expireHfStaleJudged,
  getHfClosedRecent,
  getHfGroupState,
  listHfGroupStates,
  listHfSentCountsRecent,
  upsertHfGroupState,
  logHfThresholdChange,
  getHfLedgerDistinctClosedGroups,
  listHfBotMsgShare,
  listHfRecentJudgedScores,
  getHfLastSentAtSec,
} from "../storage/db/heartflow.js";
import { HeartflowMetrics } from "../monitor/metrics.js";
import {
  resolveHfLearning,
  isHfGroupAllowed,
  type HeartflowConfig,
} from "./heartflow.js";
import {
  asHfEngageSignal,
  classifyHfEngagement,
  isHfSampleInformative,
  type HfEngageCandidate,
} from "./heartflow-label.js";
import {
  noteHfReplySent,
  seedHfBudgetStates,
  hfHourStartSec,
  hfDayStartSec,
  hfLocalHour,
} from "./heartflow-budget.js";
import { maybeGenerateHfGroupProfiles, resolveHfProfileBandEffectFor } from "./heartflow-profile.js";
import {
  HF_DEDUPE_DEFAULTS,
  noteHfRecentReply,
  pruneHfRecentReplies,
  resetHfDedupeStore,
  resolveHfDedupeCfg,
  type HfDedupeConfig,
} from "./heartflow-dedupe.js";
import {
  hfBotShare,
  noteHfGroupShare,
  resetHfShareGuard,
  resolveHfShareGuardCfg,
} from "./heartflow-observe.js";
import {
  ambientPFromHourCounts,
  getHfLayerStat,
  hfLayerKeyFor,
  loadHfGroupHourCounts,
  maybeRecomputeHfLayerStats,
  resetHfLayerCache,
  resolveHfLayeredCfg,
} from "./heartflow-layer.js";

/**
 * v1.10.0 可达性护栏的单轮取数上限 (行): sweep 每 300s 一次, 不能把台账整表拉进内存。
 * 5000 行 ≈ 生产 5 个群跑 2 周的判定量, 远高于 reachabilityMinSample(20) —— 只为防御脏数据/异常刷单。
 */
export const HF_REACH_DB_ROW_CAP = 5000;

// ============ 纯算法 (可单测) ============

export interface HfThresholdEvalInput {
  /** 滚窗已收敛 closed 样本统计 */
  stats: { total: number; engaged: number };
  /** 当前 learned 阈值 (无则 undefined) */
  learnedThreshold: number | undefined;
  /** 账号级 replyThreshold (回落基线) */
  baseThreshold: number;
  params: {
    minSample: number;
    lowEngageRate: number;
    highEngageRate: number;
    step: number;
    bandMin: number;
    bandMax: number;
  };
}

export type HfThresholdEvalResult =
  | { changed: false; reason: "insufficient-sample" | "in-dead-zone" | "clamped-noop" }
  | {
      changed: true;
      newThreshold: number;
      direction: "up" | "down";
      rate: number;
      reason: string;
    };

/**
 * 双向自适应判定 (纯函数).
 * 方向: 接话率 ≤ lowEngageRate → 上调 (少说精选); ≥ highEngageRate → 下调 (多说);
 *       (low, high) 之间为死区 → 不变 (天然滞回防抖).
 * 护栏: 区间钳制在函数内; cur 回落基线 = learnedThreshold ?? baseThreshold.
 */
export function evalHfThreshold(inp: HfThresholdEvalInput): HfThresholdEvalResult {
  const { stats, learnedThreshold, baseThreshold, params } = inp;
  if (stats.total < params.minSample) {
    return { changed: false, reason: "insufficient-sample" };
  }
  const cur = learnedThreshold ?? baseThreshold;
  const rate = stats.engaged / stats.total;
  const delta =
    rate <= params.lowEngageRate
      ? params.step
      : rate >= params.highEngageRate
        ? -params.step
        : 0;
  if (delta === 0) return { changed: false, reason: "in-dead-zone" };
  const raw = Math.max(params.bandMin, Math.min(params.bandMax, round2(cur + delta)));
  if (raw === round2(cur)) return { changed: false, reason: "clamped-noop" };
  return {
    changed: true,
    newThreshold: raw,
    direction: delta > 0 ? "up" : "down",
    rate,
    reason: `rate=${rate.toFixed(3)} total=${stats.total} engaged=${stats.engaged}`,
  };
}

/** 相邻两次阈值变更冷却是否已过 */
export function hfCooldownOk(
  lastChangeAtSec: number | null | undefined,
  nowSec: number,
  minCooldownSec: number,
): boolean {
  if (lastChangeAtSec == null) return true;
  return nowSec - lastChangeAtSec >= minCooldownSec;
}

/** 阈值保留 2 位小数 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * v1.6.6: 把阈值钳进 [bandMin, bandMax] (纯函数).
 *
 * 为什么需要它 (只改 bandMin 不够): evalHfThreshold 的钳制**只在 delta≠0 时才执行** ——
 * 接话率落死区 (lowEngageRate, highEngageRate) 时直接 return in-dead-zone, 根本不走到
 * `Math.max(bandMin, ...)`. 于是地板被抬高后, 库里存量的旧 learned 值 (如 0.3) 在死区期间
 * 会继续生效, 永久绕过新地板.
 * 故读取侧 (resolveThresholdOverride, 即 judge 判定真正用的阈值) 必须再钳一次 —— 这才是
 * "最低不能低于 bandMin" 的硬保证.
 *
 * 不钳 evalHfThreshold 的 cur: 那会让库里旧值变成 clamped-noop 永不修复;
 *   保持原样则 sweep 在非死区时会把 DB 自愈到地板值.
 */
export function clampHfThresholdToBand(t: number, bandMin: number, bandMax: number): number {
  return round2(Math.max(bandMin, Math.min(bandMax, t)));
}

/**
 * v1.10.0 可达性天花板 (纯函数): 阈值不得高于"该群近期判定过的最高分 + step"。
 *
 * 语义 (为什么是这个形状, 而不是"什么都没过就调低"): 归因必须**无歧义**。
 *   "最近 N 条消息没有一条达到阈值" = 阈值落在裁判可给的分域之外 ⇒ 它不是在筛选, 是在**关闸**。
 *   注意不能用"最近有没有发出"当判据 —— 冷清群本来就该一条不发, 那是健康的; 只有**分数够不着**才是坏的。
 * 上下界:
 *   - 上界 = maxScore + step: 只比历史最好那条高一步, 保证下一出现同类消息就能过 (略有择优而非来者不拒);
 *   - 下界 = bandMin (0.5): 老板 2026-09-16 定的质量底线 —— 护栏绝不允许把阈值压进垃圾分域
 *     (生产垃圾档实测 0.18-0.39, 全部低于 0.5, 所以这道下界真的能挡住"为了有话说而回垃圾")。
 * 无数据 (n=0) / 样本不足 / 最高分已经够得着 ⇒ 返回 null (= 不设天花板, 保持调用方原值)。
 */
export function hfReachabilityCap(
  scores: readonly number[],
  threshold: number,
  params: { minSample: number; step: number; bandMin: number },
): { cap: number; maxScore: number; n: number } | null {
  const valid = scores.filter((s) => Number.isFinite(s));
  if (valid.length < Math.max(1, params.minSample)) return null;
  const maxScore = Math.max(...valid);
  if (maxScore >= threshold) return null; // 够得着 ⇒ 阈值可达, 无需护栏
  const cap = Math.max(params.bandMin, round2(maxScore + params.step));
  // 天花板 ≥ 原阈值时它不起作用 (例如 maxScore 0.58 + 0.05 = 0.63 > 阈值 0.6 —— 那是"刚好差一点", 属正常滞回)
  if (cap >= threshold) return null;
  return { cap, maxScore, n: valid.length };
}

/** 发送结果真发判别: ok:true ≠ 真发 (dedup/ack/空文本 是占位符, 见 sendAiReply) */
export type HfSendOutcome = "sent" | "suppressed" | "pending";

/**
 * 占位符 msgId 清单 (ok:true 但**没真发**): 三个来源语义不同但后果相同 —— 预算与观察窗都不得被占用。
 * v1.9.0 加 `repeat-suppressed` (重复闸拦下): 不加这一条, 它会被判成 **sent**, 从而
 *   ① 消耗发言预算额度 ② 开一个 600s 观察窗 ⇒ 随后人类的正常发言被记成"接了我那句" ⇒ **毒化学习样本**。
 */
const HF_PLACEHOLDER_MSG_IDS: readonly string[] = [
  "dedup-suppressed",
  "ack-template-dropped",
  "repeat-suppressed",
];

export function classifyHfSend(result: {
  ok: boolean;
  msgId?: string;
  error?: string;
}): HfSendOutcome {
  if (!result.ok) return "pending"; // 等框架重试
  if (result.msgId != null && HF_PLACEHOLDER_MSG_IDS.includes(result.msgId)) {
    return "suppressed"; // 占位符: 没真发
  }
  if (result.msgId === "") return "suppressed"; // 空文本早退
  return "sent"; // undefined msgId = 真发但 vendor 没回 id
}

// ============ per-群 learned 阈值内存缓存 (judge 路径零 DB IO) ============

const _key = (accountId: string, groupId: string): string => `${accountId}:${groupId}`;
const _learnedThresholds = new Map<string, number>();

/**
 * v1.6.8: 每群"正在观察中"的心流回复 (onFlush 判定接话要用的最小状态).
 *
 * 为什么必须有: 判"有人接了我那句"要知道 **我在这个群刚发了什么/什么时候发的**.
 *   旧码不知道 (所以只能退化成"群里有没有人说话"); 若改成每条人类消息都查一次 DB, 又是
 *   群聊热路径上的每消息一次查询. 内存表让"没开窗"这个绝大多数情况零成本直接 return.
 *
 * 生命周期: persistHfSendOutcome (真发出) 登记 → markHfGroupEngaged 收敛时删 (弱信号保留)
 *   → sweep 到期清理 (防重启后残留). 进程重启会丢 ⇒ 丢窗口那几行会按 silence 收敛 (已知降级,
 *   影响面 = 重启前 10 分钟内发过心流回复的群, 且只损失一次样本).
 */
interface HfOpenWindow {
  /**
   * v1.10.0: 本窗对应的**那条台账行** (ledger.inbound_msg_id)。
   * 为什么必须记住它: 收敛标记过去只按 (账号, 群, status='sent') 匹配 ⇒ 当同群有**两条** sent 行重叠
   *   (minGapSec < observeWindowSec 时可达, 生产 `minReplyIntervalSec=0`+`minGapSec=180` 即满足) 时,
   *   一个"有人引用了我"会给**两条**都记 engaged=1, 一句"别刷了"会**罚两条** —— 一条信号被算两遍,
   *   样本量凭空翻倍、接话率被稀释/放大, 学习直接被喂脏数据。故收敛必须精确到行。
   */
  inboundMsgId: string;
  /** bot 发出那条的 vendor msgId (null = vendor 未回 id ⇒ 引用匹配退化为"同群 outbound + 窗内") */
  botMsgId: string | null;
  sentAtSec: number;
  observeWindowSec: number;
  labelWindowSec: number;
}
const _openWindows = new Map<string, HfOpenWindow>();

/** 读单群 learned (无则 undefined) */
export function getLearnedThreshold(accountId: string, groupId: string): number | undefined {
  return _learnedThresholds.get(_key(accountId, groupId));
}

/**
 * v1.10.0 可达性天花板缓存 (每群一份, 由 sweep 每轮用一条聚合查询刷新 ⇒ judge 热路径零 DB IO)。
 * 只存"天花板"这一个数 + 诊断用的三要素 (最高分/样本数/刷新时刻), 供 /heartflow status 展示。
 */
interface HfReachCap {
  cap: number;
  maxScore: number;
  n: number;
  atSec: number;
}
const _reachCaps = new Map<string, HfReachCap>();

/**
 * 读取侧可达性钳制: 返回不高于天花板的阈值 (无天花板 ⇒ 原值)。
 * 与 clampHfThresholdToBand 同为**读取侧硬保证** —— 天花板来自 sweep 的观测, 这里只做取 min。
 */
export function clampHfThresholdToReachability(accountId: string, groupId: string, t: number): number {
  const c = _reachCaps.get(_key(accountId, groupId));
  if (!c) return t;
  return Math.min(t, c.cap);
}

/** 该群当前的可达性天花板信息 (供 /heartflow status / why 展示; 无则 null) */
export function getHfReachabilityCap(
  accountId: string,
  groupId: string,
): { cap: number; maxScore: number; n: number; atSec: number } | null {
  const c = _reachCaps.get(_key(accountId, groupId));
  return c ? { ...c } : null;
}

/**
 * v1.8.0 阈值决策 (纯内存, judge 热路径零 DB 读): 谁在说话 + 依据 + 影子建议。
 *
 * 链路: 段内样本够 且 `layered.apply` ⇒ **分层值** → 否则群级 learned → 否则账号级 base。
 * 分层值**不是独立自学的标量**, 而是"从群级锚点出发、按段内接话率走**一步** evalHfThreshold"
 * (±step, 被 band 钳死) ⇒ 不累积、不漂移, 所以**不需要冷却** (值本身跑不飞)。
 * 段内样本不够 / 接话率落死区 ⇒ 一律回落群级锚点 (这就是老板要的"不够就回落先验")。
 */
export interface HfThresholdDecision {
  /** 真正应生效的阈值 (已过读侧钳制); undefined = 无覆盖 ⇒ 调用方沿用账号级 cfg */
  applied: number | undefined;
  /** 生效来源 */
  source: "layer" | "group" | "account";
  /** 当前时刻所处的段名 (无论该段有无样本; 未覆盖 ⇒ null) */
  layerKey: string | null;
  /** 该段可采信样本数 / 其中被接话数 (无数据 ⇒ 0) */
  layerN: number;
  layerEngaged: number;
  /** 段内接话率 (无样本 ⇒ null) */
  layerRate: number | null;
  /** 分层是否真正生效 (= layered.enabled && layered.apply) */
  apply: boolean;
  /** 影子建议: 样本够但 `apply=false` 时给出"若生效会是多少"; 无建议(样本不够/死区) ⇒ null */
  shadow: { threshold: number; layerKey: string; n: number; engaged: number; rate: number } | null;
}

/** 群级锚点 (分层每段都从它出发): 群级 learned (无则账号级), 已过读侧钳制 */
export function hfLayerAnchorFor(accountId: string, groupId: string, hfCfg: HeartflowConfig): number {
  const { bandMin, bandMax } = resolveHfLearning(hfCfg);
  const learned = getLearnedThreshold(accountId, groupId);
  return clampHfThresholdToBand(learned ?? hfCfg.replyThreshold ?? 0.6, bandMin, bandMax);
}

/**
 * 分层"一步"预览 (纯函数, 供决策与 `/heartflow layers` 共用):
 * 从群级锚点出发, 按该段接话率走一步 `evalHfThreshold` —— **复用调阈的同一套参数**
 * (死区/step/band), 绝不写第二套判定参数; n < minSamples 时 evalHfThreshold 自带 insufficient-sample。
 * `allowLoosen=false` (默认) ⇒ 只许**收紧** (阈值只许变高 = 更克制), 不许变主动。
 */
export function hfLayerStep(
  anchor: number,
  stat: { n: number; engaged: number },
  hfCfg: HeartflowConfig,
): { threshold: number; changed: boolean } {
  const L = resolveHfLearning(hfCfg);
  const LAY = resolveHfLayeredCfg(hfCfg);
  const r = evalHfThreshold({
    stats: { total: stat.n, engaged: stat.engaged },
    learnedThreshold: anchor,
    baseThreshold: hfCfg.replyThreshold ?? 0.6,
    params: {
      minSample: LAY.minSamples,
      lowEngageRate: L.lowEngageRate,
      highEngageRate: L.highEngageRate,
      step: L.step,
      bandMin: L.bandMin,
      bandMax: L.bandMax,
    },
  });
  if (!r.changed) return { threshold: anchor, changed: false };
  const t = LAY.allowLoosen ? r.newThreshold : Math.max(anchor, r.newThreshold);
  return { threshold: t, changed: t !== anchor };
}

export function resolveHfThresholdDecision(
  accountId: string,
  groupId: string,
  hfCfg: HeartflowConfig,
  nowSec: number = Math.floor(Date.now() / 1000),
): HfThresholdDecision {
  const LAY = resolveHfLayeredCfg(hfCfg);
  const learned = getLearnedThreshold(accountId, groupId);
  // 群级锚点: 库里存量的旧值 (地板抬高前落的 0.3) 也必须被读侧钳回来 —— 与 v1.6.6 同一道保证
  const anchor = hfLayerAnchorFor(accountId, groupId, hfCfg);
  const layerKey = LAY.enabled ? hfLayerKeyFor(hfLocalHour(nowSec), LAY.buckets) : null;
  const hit = layerKey == null ? null : getHfLayerStat(accountId, groupId, nowSec, LAY.buckets);

  const rate = hit && hit.stat.n > 0 ? hit.stat.engaged / hit.stat.n : null;
  const d =
    LAY.apply && hit && hit.stat.n >= LAY.minSamples
      ? hfLayerStep(anchor, { n: hit.stat.n, engaged: hit.stat.engaged }, hfCfg)
      : { threshold: anchor, changed: false };
  const layeredOn = LAY.apply && LAY.enabled && hit != null && hit.stat.n >= LAY.minSamples && d.changed;

  const shadow =
    !LAY.apply && LAY.enabled && hit != null && hit.stat.n >= LAY.minSamples
      ? (() => {
          const s = hfLayerStep(anchor, { n: hit.stat.n, engaged: hit.stat.engaged }, hfCfg);
          return s.changed
            ? { threshold: s.threshold, layerKey: hit.key, n: hit.stat.n, engaged: hit.stat.engaged, rate: rate ?? 0 }
            : null;
        })()
      : null;

  if (layeredOn) {
    return {
      applied: d.threshold,
      source: "layer",
      layerKey: hit?.key ?? layerKey,
      layerN: hit?.stat.n ?? 0,
      layerEngaged: hit?.stat.engaged ?? 0,
      layerRate: rate,
      apply: true,
      shadow: null,
    };
  }
  return {
    applied: learned === undefined ? undefined : anchor,
    source: learned === undefined ? "account" : "group",
    layerKey: hit?.key ?? layerKey,
    layerN: hit?.stat.n ?? 0,
    layerEngaged: hit?.stat.engaged ?? 0,
    layerRate: rate,
    apply: LAY.apply && LAY.enabled,
    shadow,
  };
}

/**
 * 应 override 的阈值 (≠账号级时返回; 否则 undefined → 调用方沿用原 cfg, 不 clone)
 * v1.8.0: **保名加第 4 参** (照 markHfGroupEngaged 的先例) —— 分层要按"当前时段"取值。
 */
export function resolveThresholdOverride(
  accountId: string,
  groupId: string,
  hfCfg: HeartflowConfig,
  nowSec: number = Math.floor(Date.now() / 1000),
): number | undefined {
  const d = resolveHfThresholdDecision(accountId, groupId, hfCfg, nowSec);
  if (d.applied === undefined) return undefined;
  const base = hfCfg.replyThreshold ?? 0.6;
  // v1.6.6 硬地板/上限: 读时再钳一次, 保证 "阈值最低不低于 bandMin" 不依赖 DB 里旧值是否会被 sweep 修好.
  // 局部名沿用 learned: 分层生效时它已是"从群级锚点走了半步"的值, 但读侧钳制对**两种来源都**是
  // 必需的硬保证 (库里可能还存着地板抬高前的 0.3)。
  const learned = d.applied;
  const { bandMin, bandMax } = resolveHfLearning(hfCfg);
  const eff = clampHfThresholdToBand(learned, bandMin, bandMax);
  if (Math.abs(eff - base) < 1e-9) return undefined; // == 账号级, 不用 clone
  return eff;
}

/** 生效阈值的完整分解 (判定用 `threshold`, 其余字段只供 /heartflow status · why 展示) */
export interface HfEffectiveThreshold {
  /** 真正生效的阈值 —— judge 拿它与 judge_overall 比的就是这个 */
  threshold: number;
  /** 账号级基线 (heartflow.replyThreshold) */
  base: number;
  /** 群级 learned / 分层覆盖值 (未覆盖 ⇒ undefined) */
  override?: number;
  /** 画像建议的 band (无画像 ⇒ null) */
  band: number | null;
  /** 画像抬升被上限截断 (画像想要得更高, 但只给了 base+maxRaise) */
  bandCapped: boolean;
  /** 可达性天花板 (未被压 ⇒ null) */
  reachCap: number | null;
  /** 天花板依据: 窗口内判定条数 / 最高分 (无天花板 ⇒ null) */
  reachInfo: { n: number; maxScore: number } | null;
}

/**
 * v1.10.0: **唯一**的"生效阈值"计算入口 —— judge 判定与 `/heartflow status` 共用。
 *
 * 为什么必须收口成一个函数: 2026-09-26 的静默停摆之所以能藏 3 天, 一半原因是**各处各算一份**——
 *   judge 按 profile band 抬到 0.85, 状态页却打印账号级 0.6 (看起来一切正常), sweep 的告警又是第三份。
 *   只要三处不共用同一段代码, 它们迟早会漂移, 而漂移的那一刻恰好就是"看起来正常但已经死了"。
 *   链路顺序 (与旧内联代码逐字等价): 学习/分层覆盖 → 画像 band 有界抬升 → 可达性天花板。
 */
export function resolveHfEffectiveThreshold(
  accountId: string,
  groupId: string,
  hfCfg: HeartflowConfig,
  nowSec: number = Math.floor(Date.now() / 1000),
): HfEffectiveThreshold {
  const base = hfCfg.replyThreshold ?? 0.6;
  const override = resolveThresholdOverride(accountId, groupId, hfCfg, nowSec);
  const bandEff = resolveHfProfileBandEffectFor(accountId, groupId, override ?? base, hfCfg);
  const cap = getHfReachabilityCap(accountId, groupId);
  const threshold = clampHfThresholdToReachability(accountId, groupId, bandEff.threshold);
  return {
    threshold,
    base,
    override,
    band: bandEff.band,
    bandCapped: bandEff.capped,
    reachCap: cap && threshold < bandEff.threshold - 1e-9 ? cap.cap : null,
    reachInfo: cap && threshold < bandEff.threshold - 1e-9 ? { n: cap.n, maxScore: cap.maxScore } : null,
  };
}

// ============ DB 薄管线 (全 catch, 失败不阻断 dispatch / 收发) ============

/** judge 通过落 ledger 行 (insert 失败仅 warn, 不阻断 dispatch) */
export async function persistHfJudged(record: HfLedgerRecord): Promise<void> {
  try {
    await dbRecordHfJudged(record);
  } catch (e) {
    warn(`[WPP HF] ledger insert failed (non-fatal): ${formatErr(e)}`);
  }
}

/**
 * judge 跑了、但判定**不回复** → 也落一行 ledger (judged → 立即 suppressed, reason='below-threshold').
 *
 * 为什么要有 (2026-09-13): 旧码只在 shouldReply=true 时落 ledger ⇒「judge 跑了但没过」在
 *   **日志与 DB 里零留痕**, 与「群里压根没消息」外观完全一致。09-11 静默瘫 3 天正是被这一点掩盖:
 *   台账最后一行停在 09-10, 而真实原因 (judge 恒失败) 只在那条 warn 里。
 *
 * 为什么可安全加: suppressed 行**不进阈值学习样本** —— getHfClosedRecent 与
 *   getHfLedgerDistinctClosedGroups 都要求 `status='closed' AND engaged IS NOT NULL`, 故
 *   学习闭环与既有行为**零变更**; 频率 = 每群每个 judge 冷却周期最多一行 (minJudgeIntervalSec 闸)。
 *
 * 注: 走 INSERT 后再 UPDATE 两步, 复用既有状态机 (INSERT IGNORE 幂等 + 仅 judged 可推进的 guard),
 *   不新增 SQL 分支。
 *
 * @param atSec 收敛时刻 (秒), 与 record.judged_at 同源
 */
export async function persistHfJudgedBelowThreshold(
  record: HfLedgerRecord,
  atSec: number,
): Promise<void> {
  try {
    await dbRecordHfJudged(record);
    await setHfLedgerSuppressed(record.account_id, record.inbound_msg_id, "below-threshold", atSec);
  } catch (e) {
    warn(`[WPP HF] ledger below-threshold insert failed (non-fatal): ${formatErr(e)}`);
  }
}

/**
 * deliver 之后落发送结果: sent → 开观察窗 (窗口时长由调用方给); suppressed → 收敛.
 * ok=false (pending) 不改 → 留给 sweep 呆账收敛.
 *
 * v1.6.8: sent 时额外 ① 把 bot 自己那条的 msgId 落库 (判"有人引用了我那条") ② 在内存里登记开窗,
 *   供 onFlush 的接话判定用 (零 DB IO); 并统一由 opts 传窗长, 避免调用方各自拼参数。
 */
export async function persistHfSendOutcome(
  accountId: string,
  inboundMsgId: string,
  result: { ok: boolean; msgId?: string; error?: string },
  atSec: number,
  opts: {
    groupId: string;
    observeSec: number;
    labelWindowSec: number;
    /** v1.9.0: 真发出那条的文本 —— 进重复闸历史 (只记真发出的, 见 heartflow-dedupe.ts) */
    text?: string;
    /** v1.9.0: 重复闸有效参数 (调用方已 resolve; 不传 = 用默认档) */
    dedupeCfg?: Required<HfDedupeConfig>;
  },
): Promise<void> {
  const outcome = classifyHfSend(result);
  try {
    if (outcome === "sent") {
      HeartflowMetrics.incSent();
      // msgId 可能 undefined (vendor 不回 id) 或占位符; 占位符不会走到这里 (classifyHfSend 已判 suppressed)
      const botMsgId = result.msgId ? result.msgId : null;
      await setHfLedgerSent(
        accountId,
        inboundMsgId,
        atSec,
        atSec + opts.observeSec,
        botMsgId,
      );
      // v1.10.0: 若覆盖掉一个还没收敛的旧窗, 说明该群在 observeWindowSec 内发了第二条 —— 旧窗
      //   从此不再收到"接话"信号, 会按 silence 收敛 (由 closeHfExpiredWindows 到期处理, 语义正确:
      //   它确实没人接)。留一行 debug 让这种重叠可见 (它是样本可信度的一个风险点)。
      const prevWin = _openWindows.get(_key(accountId, opts.groupId));
      if (prevWin && prevWin.sentAtSec + prevWin.observeWindowSec > atSec) {
        debug(
          `[WPP HF] window overlap: account=${accountId} group=${opts.groupId} prev=${prevWin.inboundMsgId} (${atSec - prevWin.sentAtSec}s ago) ⇒ prev 按 silence 收敛`,
        );
      }
      _openWindows.set(_key(accountId, opts.groupId), {
        inboundMsgId,
        botMsgId,
        sentAtSec: atSec,
        observeWindowSec: opts.observeSec,
        labelWindowSec: opts.labelWindowSec,
      });
      // v1.6.9 发言预算: **真发出去**才占额度 (判了但被下游拦掉的不占) —— 与上面开窗同一时刻同一条件
      noteHfReplySent(accountId, opts.groupId, atSec);
      // v1.9.0 重复闸: 同一条件同一时刻记历史 —— 只有真发出去的文本才有资格"被重复"
      //   (被预算/闸拦下的、vendor 去重掉的都不能进历史, 否则会拿"没说出口的话"去拦下一句)
      if (opts.text) {
        noteHfRecentReply(
          accountId,
          opts.groupId,
          opts.text,
          atSec,
          opts.dedupeCfg ?? HF_DEDUPE_DEFAULTS,
        );
      }
      return;
    }
    if (outcome === "suppressed") {
      const reason =
        result.msgId === "ack-template-dropped"
          ? "ack-template"
          : result.msgId === "dedup-suppressed"
            ? "dedup"
            : result.msgId === "repeat-suppressed"
              ? "repeat"
              : result.msgId === ""
                ? "empty-text"
                : "unknown";
      await setHfLedgerSuppressed(accountId, inboundMsgId, reason, atSec);
    }
    // pending: 不动
  } catch (e) {
    warn(`[WPP HF] ledger send outcome failed (non-fatal): ${formatErr(e)}`);
  }
}

/**
 * onFlush 人类消息 → 按信号判定该群开窗行 (v1.6.8 换标签的核心).
 *
 * 旧行为 (v1.6.x 起至 v1.6.7): 只要群里出现人类消息就 engaged=1+关窗 ⇒ 活跃群恒饱和 ⇒ 阈值单调降.
 * 现行为: 见 heartflow-label.ts —— 引用 bot / @bot / 针对 bot 的负词 = 强信号; 窄窗内有人说话 = 弱信号;
 *   全部候选一起判 (优先级 quote>mention>negative>short-window), 弱信号不关窗留待升级.
 *
 * 无开窗 (绝大多数情况) 或本行无信号 → 立刻 return, 不做任何 DB 写.
 */
export async function markHfGroupEngaged(
  accountId: string,
  groupId: string,
  atSec: number,
  candidates: HfEngageCandidate[],
): Promise<void> {
  const key = _key(accountId, groupId);
  const w = _openWindows.get(key);
  if (!w) return;
  const verdict = classifyHfEngagement({
    sentAtSec: w.sentAtSec,
    labelWindowSec: w.labelWindowSec,
    observeWindowSec: w.observeWindowSec,
    candidates,
  });
  if (verdict.signal == null || verdict.engaged == null) return;
  try {
    // v1.10.0: 精确到**这一行** (w.inboundMsgId) —— 见 HfOpenWindow.inboundMsgId 注释 (防两行同标)
    await markHfEngaged(accountId, groupId, atSec, verdict.engaged, verdict.signal, verdict.close, w.inboundMsgId);
    // 关窗了才从内存摘掉; 弱信号仍留在表里等更强信号升级
    if (verdict.close) _openWindows.delete(key);
  } catch (e) {
    debug(`[WPP HF] mark engaged failed (non-fatal): ${formatErr(e)}`);
  }
}

/**
 * 取该群开窗信息 (handler 判"引用的这条是不是 bot 刚发的那条").
 * 返回副本, 调用方不可改写内部状态.
 */
export function getOpenHfWindow(
  accountId: string,
  groupId: string,
): { botMsgId: string | null; sentAtSec: number; observeWindowSec: number } | undefined {
  const w = _openWindows.get(_key(accountId, groupId));
  if (!w) return undefined;
  return { botMsgId: w.botMsgId, sentAtSec: w.sentAtSec, observeWindowSec: w.observeWindowSec };
}

/**
 * v1.8.0 `/heartflow veto`: 删掉该群的开窗内存记录。
 *
 * 为什么**必须**做 (最容易漏的一步): veto 只作用于已 sent 的行, 而 sent 那一刻已经登记了 600s 开窗。
 *   不删窗的话, 若随后有人引用了那条 bot 消息, markHfGroupEngaged 会用 `engaged=1, signal='quote'`
 *   **覆盖 veto** —— 样本从"不该回"翻转成"该回", 比老板不点这一下更糟。
 */
export function forgetHfOpenWindow(accountId: string, groupId: string): void {
  _openWindows.delete(_key(accountId, groupId));
}

/** 账号启动/热载后从 DB 加载 learned 阈值进内存缓存 */
export async function loadLearnedThresholds(accountId: string): Promise<number> {
  let n = 0;
  try {
    const rows = await listHfGroupStates(accountId);
    for (const r of rows) {
      if (r.learned_threshold != null) {
        _learnedThresholds.set(_key(accountId, r.group_id), r.learned_threshold);
        n++;
      }
    }
  } catch (e) {
    warn(`[WPP HF] loadLearnedThresholds failed (account starts w/o learned): ${formatErr(e)}`);
  }
  return n;
}

/**
 * v1.6.9 账号启动: 从账本回填发言预算的小时/天计数 (重启不清零额度)。
 *
 * 为什么必须回填: 预算计数在内存里 —— 若只在进程内累加, 一次重启就把"今天已发 60 条"清零,
 *   等于给"重启刷额度"开了后门 (插件在部署/热重载时会重启, 那不是老板想要的豁免)。
 * 边界口径: 小时边界取**本地整点**、天边界取**本地零点**, 与运行时桶键 (hfHourBucketKey/hfDayBucketKey)
 *   完全一致; 否则新小时/新的一天会带着上一段的余数开局。
 * 已知降级: `lastHumanAtSec` 无法从账本回填 (账本没有人类消息时刻) ⇒ 留空。
 */
export async function loadHfBudgetSeed(
  accountId: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<number> {
  try {
    const rows = await listHfSentCountsRecent(accountId, hfHourStartSec(nowSec), hfDayStartSec(nowSec));
    const n = seedHfBudgetStates(accountId, rows, nowSec);
    if (n > 0) debug(`[WPP HF] budget seed loaded: account=${accountId} groups=${n}`);
    return n;
  } catch (e) {
    warn(`[WPP HF] budget seed failed (counters start at 0): ${formatErr(e)}`);
    return 0;
  }
}

/** 测试/重置用: 清空全部内存 learned 缓存 + 开窗表 + 分层缓存 + 重复历史 + 占比外环状态 */
export function resetLearnedThresholdCache(): void {
  _learnedThresholds.clear();
  _openWindows.clear();
  _reachCaps.clear();
  resetHfLayerCache();
  resetHfDedupeStore();
  resetHfShareGuard();
}

// ============ sweep (周期: 关过期窗 + 呆账收敛 + 自适应) ============

/** 每账号 sweep 一次单跳 (accountId, 当前 cfg, nowSec) */
export async function runHeartflowSweep(
  accountId: string,
  cfg: HeartflowConfig,
  nowSec: number,
): Promise<void> {
  const L = resolveHfLearning(cfg);
  // 关窗 + 呆账收敛 (无论学习开关都跑: 防 pending/超期行无限堆积)
  try {
    await closeHfExpiredWindows(accountId, nowSec);
    await expireHfStaleJudged(accountId, nowSec, nowSec - L.staleJudgedMaxSec);
    pruneOpenWindows(accountId, nowSec);
  } catch (e) {
    warn(`[WPP HF] sweep close/expire failed: ${formatErr(e)}`);
    return;
  }
  if (!cfg.enabled) return;

  // v1.7.0 群画像: 每群每日一次 (内部按 generated_at 判新旧 + 单轮配额).
  //   放在 learning.enabled 判定**之前**: 画像不依赖调阈开关 —— 老板可能关掉自动调阈但仍要画像.
  //   内部全 catch (单个群失败不影响其它群, 更不影响 sweep); 这里再包一层只为防御性兜底.
  try {
    await maybeGenerateHfGroupProfiles(accountId, cfg, nowSec);
  } catch (e) {
    warn(`[WPP HF] profile pass failed (不影响调阈): ${formatErr(e)}`);
  }

  // v1.8.0 分层统计 (群 × 时段): 每轮**全量重算** + 只 upsert 有变化的行 (稳态下 0 写)。
  //   同样放在 learning.enabled 判定**之前** (与画像同级): 分层是"观测 + 影子建议", 不依赖自动调阈开关。
  //   内部全 catch (查询/写库失败都不影响调阈), 这里再包一层只为防御性兜底。
  try {
    await maybeRecomputeHfLayerStats(accountId, cfg, nowSec);
  } catch (e) {
    warn(`[WPP HF] layer pass failed (不影响调阈): ${formatErr(e)}`);
  }

  // v1.9.0 占比外环 (老板拍板: bot 发言占比 > 目标 ⇒ 收紧当日预算):
  //   DB 聚合只在这里做 (sweep 侧), 结果落内存 → judge 读侧零 DB IO。
  //   同样放在 learning.enabled 判定**之前**: 它是"频率约束的外环", 与自动调阈开关无关。
  try {
    await maybeRecomputeHfShareGuard(accountId, cfg, nowSec);
  } catch (e) {
    warn(`[WPP HF] share-guard pass failed (不影响调阈): ${formatErr(e)}`);
  }

  // v1.10.0 可达性护栏: 阈值高于"近期最高分+step" ⇒ 记天花板 (judge 读侧压回), 并告警。
  //   放在 learning.enabled 判定**之前**: 它保的是"心流还能不能说话", 与自动调阈开关无关。
  try {
    await refreshHfReachabilityCaps(accountId, cfg, nowSec);
  } catch (e) {
    warn(`[WPP HF] reachability pass failed (不影响调阈): ${formatErr(e)}`);
  }

  // v1.10.0 静默金丝雀: 距上次真发言多久 —— 心流停摆时台账/日志都看不出, 只有这个数能一眼看出。
  try {
    const last = await getHfLastSentAtSec(accountId);
    HeartflowMetrics.setLastSendAgeSec(last == null ? -1 : Math.max(0, nowSec - last));
  } catch {
    /* 观测失败不影响任何功能 */
  }

  // v1.9.0 重复闸历史裁剪 (防长跑进程里内存无限增长; 与 pruneOpenWindows 同级, 零 IO)
  pruneHfRecentReplies(nowSec, resolveHfDedupeCfg(cfg));

  if (!L.enabled) return;

  try {
    // v1.6.8 反事实基线: 该群**当前小时段**本来有多热闹 (近 14 天同小时段的入站人类消息数).
    //   没数据的群 = 该时段本来没人说话 ⇒ ambientP=0 ⇒ 弱信号/沉默都算有效信息.
    const ambient = await loadAmbientByGroup(accountId, nowSec, L.labelWindowSec);

    // 近 7 天有已收敛样本的群 → 逐群滚窗统计 → 判定 → (过冷却才) 应用
    const sinceSec = nowSec - 7 * 86400;
    const groups = await getHfLedgerDistinctClosedGroups(accountId, sinceSec);
    for (const groupId of groups) {
      // 护栏: 只对白名单群调阈
      if (!isHfGroupAllowed(groupId, cfg)) continue;
      const samples = await getHfClosedRecent(accountId, groupId, L.sampleWindow);
      if (samples.length === 0) continue;
      const ambientP = ambient.get(groupId) ?? 0;
      // v1.6.8: 只采信"可鉴别"样本 —— 强信号(引用/@/负词)恒采信; 弱信号与沉默仅在
      //   该时段本来不热闹时采信. v1.6.8 之前的行 engage_signal 为 NULL ⇒ 全部排除
      //   (= 旧错误标签作废, 不再驱动阈值; 上线后需重新攒够 minSample 条新样本才会再调阈).
      const usable = samples.filter((s) =>
        isHfSampleInformative(asHfEngageSignal(s.engage_signal), ambientP, L.ambientMax),
      );
      if (usable.length === 0) {
        debug(
          `[WPP HF] no informative sample: group=${groupId} window=${samples.length} ambientP=${ambientP.toFixed(3)}`,
        );
        continue;
      }
      const engaged = usable.reduce((s, x) => s + (x.engaged ? 1 : 0), 0);
      const st = await getHfGroupState(accountId, groupId);
      const baseThreshold = cfg.replyThreshold ?? 0.6;
      const res = evalHfThreshold({
        stats: { total: usable.length, engaged },
        learnedThreshold: st?.learned_threshold ?? undefined,
        baseThreshold,
        params: {
          minSample: L.minSample,
          lowEngageRate: L.lowEngageRate,
          highEngageRate: L.highEngageRate,
          step: L.step,
          bandMin: L.bandMin,
          bandMax: L.bandMax,
        },
      });
      if (!res.changed) continue;
      // 护栏: 变更冷却
      if (!hfCooldownOk(st?.last_change_at ?? null, nowSec, L.minChangeCooldownSec)) continue;
      const oldEffective = st?.learned_threshold ?? baseThreshold;
      const detail = `${res.reason} skipped=${samples.length - usable.length} ambientP=${ambientP.toFixed(3)} sig=${signalHistogram(usable)}`;
      await applyHfThresholdChange(accountId, groupId, oldEffective, res.newThreshold, detail, usable.length, engaged, nowSec);
      info(
        `[WPP HF] threshold adapted: group=${groupId} ${oldEffective.toFixed(2)} → ${res.newThreshold.toFixed(2)} (${res.direction}, ${detail})`,
      );
    }
  } catch (e) {
    warn(`[WPP HF] sweep adapt failed: ${formatErr(e)}`);
  }
}

/**
 * 该群在当前小时段的本底接话概率 (近 14 天同小时段的入站人类消息数 → 泊松近似).
 * 一次聚合查询覆盖所有群, 不按群逐个查 (sweep 每 5 分钟一次, 别把 DB 打热).
 *
 * v1.8.0: 取数收口到 heartflow-layer 的 loadHfGroupHourCounts (与分层统计共用同一条查询 + 120s 缓存),
 *   公式用同一个 ambientPFromHourCounts —— 两处若各写一份, 同一条样本会在调阈侧"可采信"、在分层侧
 *   "不可采信", `/heartflow report` 的 n 与这里的样本数就永远对不上。
 */
async function loadAmbientByGroup(
  accountId: string,
  nowSec: number,
  labelWindowSec: number,
): Promise<Map<string, number>> {
  const mA = new Map<string, number>();
  try {
    const all = ambientPFromHourCounts(await loadHfGroupHourCounts(accountId, nowSec), labelWindowSec);
    const curHour = hfLocalHour(nowSec);
    for (const [k, p] of all) {
      const i = k.lastIndexOf("|");
      if (Number(k.slice(i + 1)) !== curHour) continue;
      mA.set(k.slice(0, i), p);
    }
  } catch (e) {
    // 拿不到基线 → 返回空表 ⇒ 所有弱信号/沉默都按 ambientP=0 采信 (退回旧行为).
    // 明知这会让阈值更容易漂, 故留 warn: 基线查询长期失败必须看得见.
    warn(`[WPP HF] ambient baseline query failed (弱信号将不过滤): ${formatErr(e)}`);
  }
  return mA;
}

/** 清掉该账号已过期的开窗内存 (sweep 到期关窗后同步; 防长跑进程里表无限增长) */
function pruneOpenWindows(accountId: string, nowSec: number): void {
  const prefix = `${accountId}:`;
  for (const [k, w] of _openWindows) {
    if (!k.startsWith(prefix)) continue;
    if (w.sentAtSec + w.observeWindowSec <= nowSec) _openWindows.delete(k);
  }
}

/**
 * v1.9.0 占比外环: 重算**今日**每群 bot 发言占比 → 落内存 (judge 读侧零 DB IO)。
 *
 * 为什么用"今日"而不是"近 N 天": 外环是**当日**预算的收紧依据 —— 今天的嘴今天管, 昨天的超标
 *   不该锁今天 (跨日本地日翻页时 `getHfShareTighten` 会自然返回 null, 不需要额外的失效逻辑)。
 *
 * 只在**占比超标**时才 warn: 冷清群每天 4 条发言, 每轮都打日志会把 journal 刷满 (每账号每 300s 一次)。
 * 返回命中的群数 (测试与诊断用)。
 */
async function maybeRecomputeHfShareGuard(
  accountId: string,
  cfg: HeartflowConfig,
  nowSec: number,
): Promise<number> {
  const G = resolveHfShareGuardCfg(cfg);
  if (!G.enabled) return 0;
  const rows = await listHfBotMsgShare(accountId, hfDayStartSec(nowSec));
  const byGroup = new Map<string, { inbound: number; outbound: number }>();
  for (const r of rows) {
    if (!r.group_id) continue; // 归群失败的脏行 (peer_id 也空) 直接丢
    const cur = byGroup.get(r.group_id) ?? { inbound: 0, outbound: 0 };
    if (r.direction === "outbound") cur.outbound += r.n;
    else cur.inbound += r.n;
    byGroup.set(r.group_id, cur);
  }
  let hits = 0;
  for (const [gid, v] of byGroup) {
    const share = hfBotShare(v.inbound, v.outbound);
    noteHfGroupShare(accountId, gid, nowSec, { total: v.inbound + v.outbound, botSends: v.outbound }, share);
    if (share > G.targetShare && v.inbound + v.outbound >= G.minMsgs && v.outbound >= G.minBotSends) {
      hits++;
      warn(
        `[WPP HF] share-guard: group=${gid} bot 发言占比 ${(share * 100).toFixed(1)}% ` +
          `(${v.outbound}/${v.inbound + v.outbound}) > ${(G.targetShare * 100).toFixed(0)}% ⇒ 今日预算收紧`,
      );
    }
  }
  return hits;
}

/**
 * v1.10.0 可达性护栏刷新 (sweep 侧, 每轮一次 DB 聚合): 逐群算"阈值够得着吗", 够不着就记天花板。
 *
 * 为什么放在 sweep 而不是 judge 热路径: 判据需要"该群近期判过的最高分", 是一条聚合查询 ——
 *   放进 judge 就是每条群消息一次查询 (违反 perf-heat-path 约定)。sweep 每 300s 一次, 结果落内存,
 *   judge 侧只做一次 Map 查 (clampHfThresholdToReachability)。
 *
 * 为什么无条件跑 (不受 learning.enabled 影响): 它保护的是**功能可用性**, 不是学习闭环 ——
 *   老板关掉自动调阈 (learning.enabled=false) 时, 阈值仍可能被画像/手工设到够不着的高度。
 *
 * 返回被压住的群数 (测试与指标用)。
 */
async function refreshHfReachabilityCaps(
  accountId: string,
  cfg: HeartflowConfig,
  nowSec: number,
): Promise<number> {
  const L = resolveHfLearning(cfg);
  if (!L.recoverUnreachable) {
    // 关掉时清空缓存: 否则旧的压住值会继续生效 (开关要真能关)
    for (const k of [..._reachCaps.keys()]) if (k.startsWith(`${accountId}:`)) _reachCaps.delete(k);
    return 0;
  }
  const rows = await listHfRecentJudgedScores(accountId, nowSec - L.reachabilityWindowSec, HF_REACH_DB_ROW_CAP);
  const byGroup = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.group_id) continue;
    const arr = byGroup.get(r.group_id);
    if (arr) arr.push(Number(r.judge_overall));
    else byGroup.set(r.group_id, [Number(r.judge_overall)]);
  }
  const base = cfg.replyThreshold ?? 0.6;
  let capped = 0;
  let reachable = 0;
  let maxEff = 0;
  for (const [groupId, scores] of byGroup) {
    if (!isHfGroupAllowed(groupId, cfg)) continue;
    // 生效阈值必须与 judge 路径算得**一模一样** (学习值 → 读侧钳制 → 画像 band 有界抬升),
    //   否则护栏量错了对象: 拿账号级 0.6 去比 0.85 的生效值, 就永远发现不了自锁。
    const override = resolveThresholdOverride(accountId, groupId, cfg, nowSec);
    const anchor = override ?? base;
    const { threshold: eff } = resolveHfProfileBandEffectFor(accountId, groupId, anchor, cfg);
    maxEff = Math.max(maxEff, eff);
    const r = hfReachabilityCap(scores, eff, {
      minSample: L.reachabilityMinSample,
      step: L.step,
      bandMin: L.bandMin,
    });
    const key = _key(accountId, groupId);
    const prev = _reachCaps.get(key);
    if (!r) {
      if (prev) _reachCaps.delete(key);
      if (scores.length >= L.reachabilityMinSample) reachable++;
      continue;
    }
    capped++;
    _reachCaps.set(key, { cap: r.cap, maxScore: r.maxScore, n: r.n, atSec: nowSec });
    // 告警: **只在这一格首次出现 / 压住值变化 / 每小时一次** 时打 —— sweep 每 300s 一轮,
    //   不做节流会把 journal 刷满, 反而让这条真正重要的告警被淹没。
    const shouldWarn = !prev || prev.cap !== r.cap || nowSec - prev.atSec >= 3600;
    if (shouldWarn) {
      HeartflowMetrics.incReachCapApplied();
      warn(
        `[WPP HF] threshold unreachable ⇒ capped: account=${accountId} group=${groupId} ` +
          `eff=${eff.toFixed(2)} 但近 ${Math.round(L.reachabilityWindowSec / 86400)} 天 ${r.n} 条判定最高只 ${r.maxScore.toFixed(2)} ⇒ ` +
          `生效阈值压到 ${r.cap.toFixed(2)} (心流此前等于停摆; 检查画像 band / 学习值 / 手工阈值)`,
      );
    }
  }
  HeartflowMetrics.setEffectiveThresholdMax(maxEff);
  HeartflowMetrics.setThresholdCeilingGroups(capped);
  HeartflowMetrics.setReachableGroups(reachable);
  return capped;
}

/** 样本信号分布 `quote:2,short-window:5` (审计 reason 用, 有界: 信号种类固定 5 种, 样本 ≤ sampleWindow) */
function signalHistogram(samples: readonly { engage_signal?: string | null }[]): string {
  const m = new Map<string, number>();
  for (const s of samples) {
    const k = s.engage_signal ?? "unknown";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([k, n]) => `${k}:${n}`).join(",");
}

async function applyHfThresholdChange(
  accountId: string,
  groupId: string,
  oldThreshold: number,
  newThreshold: number,
  reason: string,
  sampleTotal: number,
  sampleEngaged: number,
  nowSec: number,
): Promise<void> {
  await upsertHfGroupState({
    account_id: accountId,
    group_id: groupId,
    learned_threshold: newThreshold,
    last_change_at: nowSec,
    last_change_old: oldThreshold,
    last_change_new: newThreshold,
    last_change_reason: reason,
  });
  await logHfThresholdChange({
    account_id: accountId,
    group_id: groupId,
    old_threshold: oldThreshold,
    new_threshold: newThreshold,
    sample_total: sampleTotal,
    sample_engaged: sampleEngaged,
    reason,
  });
  _learnedThresholds.set(_key(accountId, groupId), newThreshold);
}

/** 每账号 sweep 调度 (幂等): 复用 state.setRetryTimer 生命周期, stop 时统一 clear */
type RetryTimerHost = { setRetryTimer(t: ReturnType<typeof setInterval>): void };
const _sweepTimers = new Map<string, ReturnType<typeof setInterval>>();

export function startHeartflowSweep(
  state: RetryTimerHost,
  accountId: string,
  getCfg: () => HeartflowConfig,
): void {
  const prev = _sweepTimers.get(accountId);
  if (prev !== undefined) {
    clearInterval(prev); // 已启动 (含 stop 后旧句柄) → 先清再排, 防重复
  }
  const intervalMs = resolveHfLearning(getCfg()).sweepIntervalSec * 1000;
  const timer = setInterval(() => {
    void runHeartflowSweep(accountId, getCfg(), Math.floor(Date.now() / 1000)).catch((e) =>
      warn(`[WPP HF] sweep tick error: ${formatErr(e)}`),
    );
  }, intervalMs);
  timer.unref?.();
  state.setRetryTimer(timer);
  _sweepTimers.set(accountId, timer);
  info(
    `[WPP HF] sweep scheduled: account=${accountId} interval=${Math.round(intervalMs / 1000)}s (learning.enabled=${resolveHfLearning(getCfg()).enabled})`,
  );
}
