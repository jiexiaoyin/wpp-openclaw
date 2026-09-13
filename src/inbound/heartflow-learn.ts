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
  upsertHfGroupState,
  logHfThresholdChange,
  getHfLedgerDistinctClosedGroups,
} from "../storage/db/heartflow.js";
import {
  resolveHfLearning,
  isHfGroupAllowed,
  type HeartflowConfig,
} from "./heartflow.js";

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

/** 发送结果真发判别: ok:true ≠ 真发 (dedup/ack/空文本 是占位符, 见 sendAiReply) */
export type HfSendOutcome = "sent" | "suppressed" | "pending";

export function classifyHfSend(result: {
  ok: boolean;
  msgId?: string;
  error?: string;
}): HfSendOutcome {
  if (!result.ok) return "pending"; // 等框架重试
  if (
    result.msgId === "dedup-suppressed" ||
    result.msgId === "ack-template-dropped"
  ) {
    return "suppressed"; // 占位符: 没真发
  }
  if (result.msgId === "") return "suppressed"; // 空文本早退
  return "sent"; // undefined msgId = 真发但 vendor 没回 id
}

// ============ per-群 learned 阈值内存缓存 (judge 路径零 DB IO) ============

const _key = (accountId: string, groupId: string): string => `${accountId}:${groupId}`;
const _learnedThresholds = new Map<string, number>();

/** 读单群 learned (无则 undefined) */
export function getLearnedThreshold(accountId: string, groupId: string): number | undefined {
  return _learnedThresholds.get(_key(accountId, groupId));
}

/**
 * 应 override 的阈值 (learned 有且 ≠ 账号级时返回; 否则 undefined → 调用方沿用原 cfg, 不 clone)
 */
export function resolveThresholdOverride(
  accountId: string,
  groupId: string,
  hfCfg: HeartflowConfig,
): number | undefined {
  const learned = getLearnedThreshold(accountId, groupId);
  if (learned === undefined) return undefined;
  const base = hfCfg.replyThreshold ?? 0.6;
  if (Math.abs(learned - base) < 1e-9) return undefined; // == 账号级, 不用 clone
  return learned;
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
 * deliver 之后落发送结果: sent → 开观察窗 (窗口时长由调用方 observeSec 给); suppressed → 收敛.
 * ok=false (pending) 不改 → 留给 sweep 呆账收敛.
 */
export async function persistHfSendOutcome(
  accountId: string,
  inboundMsgId: string,
  result: { ok: boolean; msgId?: string; error?: string },
  atSec: number,
  observeSec: number,
): Promise<void> {
  const outcome = classifyHfSend(result);
  try {
    if (outcome === "sent") {
      await setHfLedgerSent(accountId, inboundMsgId, atSec, atSec + observeSec);
      return;
    }
    if (outcome === "suppressed") {
      const reason =
        result.msgId === "ack-template-dropped"
          ? "ack-template"
          : result.msgId === "dedup-suppressed"
            ? "dedup"
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

/** onFlush 人类接话: sent 开窗且未定 → engaged=1+closed (失败仅降级, 窗口留待 sweep 到期关) */
export async function markHfGroupEngaged(
  accountId: string,
  groupId: string,
  atSec: number,
): Promise<void> {
  try {
    await markHfEngaged(accountId, groupId, atSec);
  } catch (e) {
    debug(`[WPP HF] mark engaged failed (non-fatal): ${formatErr(e)}`);
  }
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

/** 测试/重置用: 清空全部内存 learned 缓存 */
export function resetLearnedThresholdCache(): void {
  _learnedThresholds.clear();
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
  } catch (e) {
    warn(`[WPP HF] sweep close/expire failed: ${formatErr(e)}`);
    return;
  }
  if (!cfg.enabled || !L.enabled) return;

  try {
    // 近 7 天有已收敛样本的群 → 逐群滚窗统计 → 判定 → (过冷却才) 应用
    const sinceSec = nowSec - 7 * 86400;
    const groups = await getHfLedgerDistinctClosedGroups(accountId, sinceSec);
    for (const groupId of groups) {
      // 护栏: 只对白名单群调阈
      if (!isHfGroupAllowed(groupId, cfg)) continue;
      const samples = await getHfClosedRecent(accountId, groupId, L.sampleWindow);
      if (samples.length === 0) continue;
      const engaged = samples.reduce((s, x) => s + (x.engaged ? 1 : 0), 0);
      const st = await getHfGroupState(accountId, groupId);
      const baseThreshold = cfg.replyThreshold ?? 0.6;
      const res = evalHfThreshold({
        stats: { total: samples.length, engaged },
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
      await applyHfThresholdChange(accountId, groupId, oldEffective, res.newThreshold, res.reason, samples.length, engaged, nowSec);
      info(
        `[WPP HF] threshold adapted: group=${groupId} ${oldEffective.toFixed(2)} → ${res.newThreshold.toFixed(2)} (${res.direction}, ${res.reason})`,
      );
    }
  } catch (e) {
    warn(`[WPP HF] sweep adapt failed: ${formatErr(e)}`);
  }
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
