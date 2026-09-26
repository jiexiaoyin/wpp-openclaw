// src/inbound/heartflow-observe.ts - v1.9.0 心流观测复盘 + 占比外环 (P3)
//
// 为什么要有这个: 老板问"bot 到底说多了没有", 此前**没有任何观测面**能回答 —— 调阈/预算/画像三套机制
//   都在改行为, 却没有人看结果。这个模块补上"看结果", 并把看的结果接回一个**有界**的控制环:
//   **该群 bot 发言占比 > 目标值 ⇒ 收紧当日预算** (老板 2026-09-26 拍板)。
//
// 与调阈的关系 (关键, 别混): v1.6.6 的教训是"拿被自学的标量去控频率"必然漂到边界。本模块的外环
//   **不动阈值**, 只动预算 —— 预算是有界参数 (间隔×2 有 cap, 上限÷2 有 floor), 收紧了不会自我强化:
//   占比降下来 ⇒ 下一轮就不再收紧; 占比还是高 ⇒ 也只停在 floor, 不会把 bot 静音。
//
// 为什么是"占比"而不是"绝对条数": 冷清群 bot 说 3 条就可能是 30% 占比, 活跃群说 30 条才 5%。
//   绝对条数没法跨群比较, 占比可以。
//
// 口径 (逐项标注, 不标注会得出错误结论):
//   - 占比 / 重复率: `wpp_messages.ts` 口径 (消息实际时间), 窗口 = 近 N 天。
//   - 被制止率 / 接话率: `wpp_hf_ledger.judged_at` 口径 (判断时刻)。**两者窗口不同**, 不可相除。
//   - 已知偏差 (写死在注释里, 报告里也点一句): ①长回复被 chunkMarkdown 切成多条 ⇒ bot 条数被放大;
//     ②分母是"已入库的群消息", 不是群里真实消息量 ⇒ **占比只看趋势, 不判绝对超标**;
//     ③出站行含"老板自己用 iPad 手打的消息", 插件发送与人工发送在 wpp_messages 里无法区分。
//
// ⚠️ 绝不 import heartflow-learn.js (成环); 纯函数为主, 唯一的内存写在"占比外环"的状态上 (judge 读侧零 DB IO)。

import type { HeartflowConfig } from "./heartflow.js";
import type { HfBudgetConfig } from "./heartflow-budget.js";
import { hfDayBucketKey, hfDayStartSec, hfLocalHour } from "./heartflow-budget.js";
import { asHfEngageSignal, isHfSampleInformative } from "./heartflow-label.js";
import type { HfDedupeConfig, HfRepeatVerdict } from "./heartflow-dedupe.js";
import { hfRepeatVerdict, normHfText } from "./heartflow-dedupe.js";

// ============ 纯指标 ============

/**
 * 发言占比 (纯函数): bot 条数 / 群消息总数。
 *
 * 用**有界**分母 (人类+bot) 而不是 bot/人类: 后者在"群里没人说话但 bot 说了 3 条"时趋于无穷,
 *   会让外环对着一个无意义的数做决策。两种口径的差别在分母: 同一个分子在 bot/人类 口径下**必然更大**
 *   (分母少了 bot 自己)。报告里一律**同时显示原始条数** (`12.5% (30/240)`), 避免口径本身成为误读来源。
 */
export function hfBotShare(inbound: number, outbound: number): number {
  const total = inbound + outbound;
  if (total <= 0) return 0;
  return outbound / total;
}

/** 占比的可读格式 (报告与日志共用): `12.5% (30/240)` */
export function fmtHfShare(inbound: number, outbound: number): string {
  return `${(hfBotShare(inbound, outbound) * 100).toFixed(1)}% (${outbound}/${inbound + outbound})`;
}

/** 接话提升倍数 (纯函数): 实测接话率 / 本底接话率。本底 <0.01 ⇒ null (不除零, 也不吹成 100×) */
export function hfEngagementLift(rate: number, ambientP: number): number | null {
  if (!Number.isFinite(rate) || !Number.isFinite(ambientP)) return null;
  if (ambientP < 0.01) return null;
  return rate / ambientP;
}

/** 被制止率 (纯函数): (负词 + veto) / 已收敛样本。无样本 ⇒ null */
export function hfVetoRate(veto: number, total: number): number | null {
  if (total <= 0) return null;
  return veto / total;
}

/** 重复率素材 (每群一条; 由 DB 侧 listHfOutboundTexts 提供) */
export interface HfRepeatItem {
  groupId: string;
  text: string;
  atSec: number;
}

export interface HfRepeatStat {
  total: number;
  repeats: number;
  rate: number;
  prefix: number;
  similar: number;
}

/**
 * 重复率 (纯函数, **与闸共用 hfRepeatVerdict**):
 *   按群分组、按时刻升序逐条比对"它之前同群窗口内的发言", 命中即计一次重复。
 *   与闸严格同源 ⇒ 日报说 28% 就等于"这 28% 换到今天会被闸拦" —— 否则观测驱动收口是假的。
 *
 * 裁剪历史与闸一致 (historyMax): 只差"闸只看当下内存, 日报看 DB 素材"。若两侧裁剪策略不同,
 *   日报会把闸永远不会看到的老句子算成重复, 数字虚高。
 */
export function hfRepeatRate(
  items: readonly HfRepeatItem[],
  cfg: Required<HfDedupeConfig>,
): HfRepeatStat {
  const sorted = [...items].sort((a, b) => a.atSec - b.atSec);
  const hist = new Map<string, Array<{ text: string; atSec: number; norm: string }>>();
  let repeats = 0;
  let prefix = 0;
  let similar = 0;
  for (const it of sorted) {
    const norm = normHfText(it.text);
    if (norm.length < cfg.minChars) continue; // 短句豁免 (与闸同一门槛)
    const h = hist.get(it.groupId) ?? [];
    const v: HfRepeatVerdict | null = hfRepeatVerdict(it.text, h, cfg, it.atSec);
    if (v) {
      repeats++;
      if (v.kind === "prefix") prefix++;
      else similar++;
    }
    h.push({ text: it.text, atSec: it.atSec, norm });
    while (h.length > cfg.historyMax) h.shift();
    hist.set(it.groupId, h);
  }
  return {
    total: sorted.length,
    repeats,
    rate: sorted.length > 0 ? repeats / sorted.length : 0,
    prefix,
    similar,
  };
}

/** 接话率摘要 (纯函数, 规则与 sweep 的调阈 pass **完全同源**: 逐样本用它自己那一小时的本底) */
export interface HfEngagementSummary {
  usable: number;
  skipped: number;
  engaged: number;
  /** 可采信样本的接话率 (无可采信样本 ⇒ null) */
  rate: number | null;
  /** 可采信样本的本底均值 (lift 的分母; 无 ⇒ 0) */
  ambientP: number;
}

/**
 * 从已收敛样本算接话率 (纯函数)。
 *
 * 为什么必须逐样本用它**自己那一小时**的本底: 样本可能落在不同小时段 (7 天窗口里白天/夜里的都有),
 *   拿"当前小时"的本底去过滤全部样本, 会把夜里那批全判成"不可采信" —— 这正是 v1.6.8 踩过的坑
 *   (标签锚错 + 单一 ambient 口径), 见 heartflow-label.ts 的注释。
 */
export function hfEngagementSummary(
  samples: readonly { engage_signal?: string | null; engaged?: number | null; sent_at?: number | null; group_id: string }[],
  ambientByGroupHour: ReadonlyMap<string, number>,
  ambientMax: number,
): HfEngagementSummary {
  let usable = 0;
  let engaged = 0;
  let skipped = 0;
  let ambientSum = 0;
  for (const s of samples) {
    const at = s.sent_at ?? 0;
    if (at <= 0) {
      skipped++;
      continue;
    }
    const p = ambientByGroupHour.get(`${s.group_id}|${hfLocalHour(at)}`) ?? 0;
    if (isHfSampleInformative(asHfEngageSignal(s.engage_signal), p, ambientMax)) {
      usable++;
      ambientSum += p;
      if (s.engaged === 1) engaged++;
    } else {
      skipped++;
    }
  }
  return {
    usable,
    skipped,
    engaged,
    rate: usable > 0 ? engaged / usable : null,
    ambientP: usable > 0 ? ambientSum / usable : 0,
  };
}

// ============ 占比外环 (老板拍板: >5% ⇒ 收紧当日预算) ============

/**
 * 占比外环参数 (挂 `HeartflowConfig.shareGuard`; 不进 UI schema)。
 * `minMsgs` / `minBotSends` 是**防噪声闸**: 早上 6 条消息里 bot 说了 1 条 = 16.7% 占比, 样本太小,
 *   据此收紧会让新群/冷清群开局就被上锁。样本够了才有资格谈占比。
 */
export interface HfShareGuardConfig {
  enabled?: boolean;
  /** 目标占比 (默认 0.05 = 5%); 严格大于才收紧 (恰好 5% 不动) */
  targetShare?: number;
  /** 当日该群消息总数下限 (默认 40) */
  minMsgs?: number;
  /** 当日该群 bot 发言数下限 (默认 5) */
  minBotSends?: number;
}

export const HF_SHARE_GUARD_DEFAULTS: Required<HfShareGuardConfig> = {
  enabled: true,
  targetShare: 0.05,
  minMsgs: 40,
  minBotSends: 5,
};

/** 收紧档硬边界: 间隔 ≤15 分钟 / 每小时 ≥2 条 / 每天 ≥10 条 (外环只能收紧, 不能把 bot 锁死) */
export const HF_SHARE_MIN_GAP_CAP_SEC = 900;
export const HF_SHARE_MAX_PER_HOUR_FLOOR = 2;
export const HF_SHARE_MAX_PER_DAY_FLOOR = 10;

export function resolveHfShareGuardCfg(cfg?: HeartflowConfig): Required<HfShareGuardConfig> {
  const g = cfg?.shareGuard;
  const D = HF_SHARE_GUARD_DEFAULTS;
  const posInt = (v: number | undefined, fb: number): number =>
    v != null && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fb;
  const ts = g?.targetShare;
  const target =
    ts != null && Number.isFinite(ts) && ts > 0 && ts <= 1 ? ts : D.targetShare;
  return {
    enabled: g?.enabled !== false,
    targetShare: target,
    minMsgs: posInt(g?.minMsgs, D.minMsgs),
    minBotSends: posInt(g?.minBotSends, D.minBotSends),
  };
}

/**
 * 占比外环判定 (纯函数): 该群当日占比 > 目标 且 样本够 ⇒ 返回**收紧档** (间隔×2 有 cap, 上限÷2 有 floor);
 *   否则 null (不收紧)。
 *
 * 返回的是 `HfBudgetConfig` 而非直接算好的预算: 交给既有的 `tightenHfBudget(effBudget, tighter)` 复合 ——
 *   与画像收紧走**同一条** "只能更紧" 的合成路径 (复合安全: 两次收紧取更严的一侧)。
 * ⚠️ `base.maxPerHour <= 0` 表示"不限": 此时收紧档直接用 floor (否则 0÷2=0 会被 tightenHfBudget
 *   当成"未指定"而回落成原值, 外环静默失效 —— 不限额的账号恰恰最需要这个外环)。
 */
export function hfShareTighten(
  base: Required<HfBudgetConfig>,
  share: number,
  volume: { total: number; botSends: number },
  cfg: Required<HfShareGuardConfig>,
): HfBudgetConfig | null {
  if (!cfg.enabled) return null;
  if (!Number.isFinite(share) || share <= cfg.targetShare) return null; // 恰好等于目标 ⇒ 不收紧
  if (volume.total < cfg.minMsgs || volume.botSends < cfg.minBotSends) return null;
  const halfOrFloor = (v: number, floor: number): number =>
    v > 0 ? Math.max(Math.floor(v / 2), floor) : floor;
  return {
    enabled: true,
    minGapSec: Math.min(base.minGapSec * 2, HF_SHARE_MIN_GAP_CAP_SEC),
    maxPerHour: halfOrFloor(base.maxPerHour, HF_SHARE_MAX_PER_HOUR_FLOOR),
    maxPerDay: halfOrFloor(base.maxPerDay, HF_SHARE_MAX_PER_DAY_FLOOR),
    noConsecutiveWithoutHuman: base.noConsecutiveWithoutHuman,
  };
}

/** 外环状态 (内存; 由 sweep 的 DB 聚合填充, judge 读侧零 DB IO) */
interface HfShareState {
  dayKey: string;
  share: number;
  total: number;
  botSends: number;
}

const _shareKey = (accountId: string, groupId: string): string => `${accountId}:${groupId}`;
const _share = new Map<string, HfShareState>();

/** sweep 侧写入 (每轮重算当日占比; 随本地日翻页自然失效 —— 读侧比对 dayKey) */
export function noteHfGroupShare(
  accountId: string,
  groupId: string,
  nowSec: number,
  volume: { total: number; botSends: number },
  share: number,
): void {
  _share.set(_shareKey(accountId, groupId), {
    dayKey: hfDayBucketKey(nowSec),
    share,
    total: volume.total,
    botSends: volume.botSends,
  });
}

/**
 * judge 读侧 (零 DB IO): 该群当前是否命中占比外环 ⇒ 返回收紧档。
 * 跨日 (state.dayKey ≠ 今日) 视为无数据 ⇒ null (新的一天从零开始, 不带着昨天的结论锁今天的嘴)。
 */
export function getHfShareTighten(
  accountId: string,
  groupId: string,
  base: Required<HfBudgetConfig>,
  hfCfg: HeartflowConfig | undefined,
  nowSec: number,
): HfBudgetConfig | null {
  const st = _share.get(_shareKey(accountId, groupId));
  if (!st || st.dayKey !== hfDayBucketKey(nowSec)) return null;
  return hfShareTighten(base, st.share, { total: st.total, botSends: st.botSends }, resolveHfShareGuardCfg(hfCfg));
}

/** 报告用快照: 命中外环的群 + 收紧前后 (供 `/heartflow report` 显示"已收紧") */
export interface HfShareGuardHit {
  groupId: string;
  share: number;
  total: number;
  botSends: number;
  from: Required<HfBudgetConfig>;
  to: HfBudgetConfig;
}
export function hfShareGuardSnapshot(
  accountId: string,
  base: Required<HfBudgetConfig>,
  hfCfg: HeartflowConfig | undefined,
  nowSec: number,
): HfShareGuardHit[] {
  const out: HfShareGuardHit[] = [];
  const prefix = `${accountId}:`;
  const g = resolveHfShareGuardCfg(hfCfg);
  for (const [k, st] of _share) {
    if (!k.startsWith(prefix)) continue;
    if (st.dayKey !== hfDayBucketKey(nowSec)) continue;
    const to = hfShareTighten(base, st.share, { total: st.total, botSends: st.botSends }, g);
    if (!to) continue;
    out.push({
      groupId: k.slice(prefix.length),
      share: st.share,
      total: st.total,
      botSends: st.botSends,
      from: base,
      to,
    });
  }
  return out.sort((a, b) => b.share - a.share);
}

/** 测试/诊断 */
export function resetHfShareGuard(): void {
  _share.clear();
}

/** 今日起点 (报告与 sweep 共用的窗口边界; 只是 hfDayStartSec 的一层语义化包装) */
export function hfShareGuardWindowStart(nowSec: number): number {
  return hfDayStartSec(nowSec);
}

// ============ 复盘文本 (`/heartflow report` 的正文) ============

/** 硬上限: 单条 filehelper 消息的阅读上限 (超了老板也懒得看, 且 vendor 侧消息过长体验差) */
export const HF_DIGEST_MAX_CHARS = 3500;
/** 报告里最多列几个群 (其余折叠) */
export const HF_DIGEST_MAX_GROUPS = 8;
/** 单节字符预算 (逐节限流, 再叠加全局硬 cap) */
const SECTION_CAP = 700;

export interface HfDigestInput {
  nowSec: number;
  days: number;
  /** 每群当日/近 N 天发言占比 (调用方按占比降序) */
  shares: Array<{ groupId: string; inbound: number; outbound: number; share: number }>;
  /** 接话率 (已收敛样本) */
  engagement: { usable: number; skipped: number; rate: number | null; ambientP: number };
  /** 被制止率 (judged_at 口径) */
  stopped: { negative: number; veto: number; total: number };
  /** 重复率 (ts 口径, 同群 6h 窗, 与闸同源) */
  repeat: HfRepeatStat;
  /** 全部重复样本条数 (报告里区分"素材总量"与"重复数") */
  repeatSampleTotal: number;
  /** 分层 (每群当前时段的影子/生效建议) */
  layers: Array<{
    groupId: string;
    layerKey: string;
    n: number;
    engaged: number;
    rate: number | null;
    suggestion: number | null;
    applied: boolean;
  }>;
  /** 预算拦截 (进程内累计计数, 见 hfBudgetBlockedSnapshot) */
  budget: Record<string, number>;
  /** 占比外环命中 */
  shareGuard: HfShareGuardHit[];
}

/** 逐节累加, 超节预算就停 (不抛错, 报告宁可少一节也不能发不出去) */
function pushLine(lines: string[], line: string, used: { n: number }): void {
  if (used.n + line.length > SECTION_CAP) return;
  used.n += line.length;
  lines.push(line);
}

function fmtDate(nowSec: number): string {
  const d = new Date(nowSec * 1000);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 复盘正文 (纯函数, 硬 cap 3500 字符)。
 *
 * 版式固定 6 节, 每节**自带口径标注** (占比/重复率 = ts 口径; 被制止率 = judged_at 口径) ——
 *   不标注就会有人把两节的数字相除, 得出错误结论。
 * 超限策略: 逐节限流 → 仍超全局 cap ⇒ 从尾部丢行并加 `…(已截断)` (宁可少信息, 不可发不出去)。
 */
export function buildHfDigest(inp: HfDigestInput): string {
  const lines: string[] = [];
  lines.push(`心流复盘 (近 ${inp.days} 天)  ${fmtDate(inp.nowSec)}`);

  // 【发言占比】
  {
    lines.push(`【发言占比】目标 ≤${(HF_SHARE_GUARD_DEFAULTS.targetShare * 100).toFixed(0)}% · ts 口径 · 分母=已入库群消息`);
    const sec = { n: 0 };
    const shown = inp.shares.slice(0, HF_DIGEST_MAX_GROUPS);
    const secLines: string[] = [];
    for (const s of shown) {
      pushLine(secLines, `  ${s.groupId} ${fmtHfShare(s.inbound, s.outbound)}`, sec);
    }
    if (inp.shares.length > shown.length) {
      pushLine(secLines, `  …其余 ${inp.shares.length - shown.length} 群`, sec);
    }
    if (secLines.length === 0) secLines.push("  (窗口内无群消息)");
    lines.push(...secLines);
  }

  // 【接话率】
  {
    const rate = inp.engagement.rate;
    const lift = rate == null ? null : hfEngagementLift(rate, inp.engagement.ambientP);
    lines.push(
      `【接话率】可用 ${inp.engagement.usable} 跳过 ${inp.engagement.skipped}` +
        ` · rate ${rate == null ? "-" : rate.toFixed(2)}` +
        ` · 本底 ${inp.engagement.ambientP.toFixed(3)}` +
        (lift == null ? " · lift -(本底过冷, 不计算)" : ` · lift ${lift.toFixed(1)}×`),
    );
  }

  // 【被制止率】
  {
    const vr = hfVetoRate(inp.stopped.veto, inp.stopped.total);
    lines.push(
      `【被制止率】负词 ${inp.stopped.negative} / veto ${inp.stopped.veto} / 样本 ${inp.stopped.total}` +
        (vr == null ? "" : ` · veto 占比 ${(vr * 100).toFixed(1)}%`) +
        ` (judged_at 口径, 与上两节不同窗)`,
    );
  }

  // 【重复率】
  {
    const r = inp.repeat;
    lines.push(
      `【重复率】${(r.rate * 100).toFixed(0)}% (${r.repeats}/${inp.repeatSampleTotal})` +
        ` · 前缀 ${r.prefix} / 相似 ${r.similar} (同群 6h 窗, 与闸同源)`,
    );
  }

  // 【分层 群×时段】(影子/生效)
  {
    lines.push("【分层 群×时段】当前时段各群样本与建议:");
    const sec = { n: 0 };
    const secLines: string[] = [];
    const shown = inp.layers.slice(0, HF_DIGEST_MAX_GROUPS);
    for (const l of shown) {
      pushLine(
        secLines,
        `  ${l.groupId} [${l.layerKey}] n=${l.n} rate=${l.rate == null ? "-" : l.rate.toFixed(3)}` +
          (l.suggestion == null
            ? " ⇒ 无建议"
            : ` ⇒ 建议 ${l.suggestion.toFixed(2)}${l.applied ? " (生效)" : " (未生效)"}`),
        sec,
      );
    }
    if (inp.layers.length > shown.length) {
      pushLine(secLines, `  …其余 ${inp.layers.length - shown.length} 群`, sec);
    }
    if (secLines.length === 0) secLines.push("  (当前时段无分层样本)");
    lines.push(...secLines);
  }

  // 【预算拦截】
  {
    const b = inp.budget;
    const keys = ["budget-gap", "budget-hour", "budget-day", "budget-consecutive", "quiet-hours"];
    const parts = keys.filter((k) => (b[k] ?? 0) > 0).map((k) => `${k.replace("budget-", "")} ${b[k]}`);
    lines.push(`【预算拦截】${parts.length > 0 ? parts.join(" / ") : "无"} (进程内累计, 重启清零)`);
  }

  // 【占比外环】
  {
    if (inp.shareGuard.length === 0) {
      lines.push("【占比外环】未触发 (无群超目标占比)");
    } else {
      lines.push("【占比外环】占比超标 ⇒ 当日预算收紧 (只能收紧, 有 floor/cap):");
      const sec = { n: 0 };
      const secLines: string[] = [];
      for (const h of inp.shareGuard.slice(0, 4)) {
        pushLine(
          secLines,
          `  ${h.groupId} ${(h.share * 100).toFixed(1)}% > 目标 ⇒ 今日预算已收紧` +
            ` (间隔 ${h.from.minGapSec}→${h.to.minGapSec}s, ${h.from.maxPerHour}→${h.to.maxPerHour} 条/小时;` +
            ` 运行时还叠加画像收紧, 只会更严)`,
          sec,
        );
      }
      lines.push(...secLines);
    }
  }

  const text = lines.join("\n");
  if (text.length <= HF_DIGEST_MAX_CHARS) return text;
  // 超硬 cap: 从尾部整行丢弃 (不切半行, 免得留下半句话被误读)
  const kept: string[] = [];
  let n = 0;
  const tail = "…(已截断)";
  for (const l of lines) {
    if (n + l.length + 1 + tail.length > HF_DIGEST_MAX_CHARS) break;
    kept.push(l);
    n += l.length + 1;
  }
  return kept.join("\n") + "\n" + tail;
}
