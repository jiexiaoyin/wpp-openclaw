// src/inbound/heartflow-budget.ts - v1.6.9 心流发言预算 (结构层频率约束)
//
// 为什么需要它 (2026-09-26 老板拍板):
//   老板: "群里回复消息的频率太高了 … 如果我不设定下限, 就会一直降低 [阈值]".
//   根因有两层 —— ①标签学错了 (v1.6.8 修: 见 heartflow-label.ts) ②**拿一个被自学的标量去控频率**,
//   它必然漂到边界。阈值是"要不要开口"的**质量**判据, 不该同时兼任"多久能开口一次"的**频率**闸。
//   本模块把频率约束上移到**结构层**: 有界、可解释、不依赖学习。
//
// 与既有机制的分工 (不是替代):
//   - energy 状态机: 保留原样 (软性精力衰减, 影响 judge 的 willingness 维度).
//   - minReplyIntervalSec / minJudgeIntervalSec: 保留 (既有冷却与 LLM 调用闸).
//   - **本模块**: 每群硬上限 (最小间隔 / 每小时 / 每天) + 静默段 + 陈旧触发防重放.
//   预算在 `checkHeartflowGate` 里、**judge 之前**判定 ⇒ 顺带省掉被拦那次的 LLM 调用。
//
// 计数在内存 (`_budget`), judge 热路径**零 DB IO** (遵守 perf-heat-path 约定);
//   进程启动时用一条聚合 (listHfSentCountsRecent) 回填小时/天计数, 重启不清零 (已知降级:
//   `lastHumanAtSec` 无法回填 ⇒ 重启后它为空, 见下方 consecutive 分支的说明)。
import { debug } from "../core/logger.js";
/** 老板 2026-09-26 拍板档位: 中等 (每群 ≤1条/3分钟, ≤8条/小时, ≤60条/天) */
export const HF_BUDGET_DEFAULTS = {
    enabled: true,
    minGapSec: 180,
    maxPerHour: 8,
    maxPerDay: 60,
    noConsecutiveWithoutHuman: true,
    quietHours: [],
};
/** 合并参数 (缺省走 HF_BUDGET_DEFAULTS; 与 resolveHfLearning 同范式, 不依赖 accounts 合并语义) */
export function resolveHfBudget(cfg) {
    const b = cfg?.budget;
    const D = HF_BUDGET_DEFAULTS;
    return {
        enabled: b?.enabled ?? D.enabled,
        minGapSec: b?.minGapSec ?? D.minGapSec,
        maxPerHour: b?.maxPerHour ?? D.maxPerHour,
        maxPerDay: b?.maxPerDay ?? D.maxPerDay,
        noConsecutiveWithoutHuman: b?.noConsecutiveWithoutHuman ?? D.noConsecutiveWithoutHuman,
        quietHours: b?.quietHours ?? D.quietHours,
    };
}
/** 本地日期键 `YYYY-MM-DD` (本地时区; 与 ops 看日志/加静默段的直觉一致) */
export function hfDayBucketKey(nowSec) {
    const d = new Date(nowSec * 1000);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
}
/** 本地小时 (0-23) */
export function hfLocalHour(nowSec) {
    return new Date(nowSec * 1000).getHours();
}
/** 本地小时桶键 */
export function hfHourBucketKey(nowSec) {
    return `${hfDayBucketKey(nowSec)}#${hfLocalHour(nowSec)}`;
}
/**
 * 本地整点起点 (秒) —— 回填"本小时已发条数"的边界, 必须与 hfHourBucketKey 同口径:
 * 用 `now-3600` 会把上一小时的尾巴算进本小时, 新小时一开局就少一条额度。
 * 走 `setMinutes` 让运行时的本地规则 (含 DST) 决定偏移, 不自己算 UTC 偏移。
 */
export function hfHourStartSec(nowSec) {
    const d = new Date(nowSec * 1000);
    d.setMinutes(0, 0, 0);
    return Math.floor(d.getTime() / 1000);
}
/** 本地零点起点 (秒) —— 回填"今日已发条数"的边界 (天桶按**日历日**滚动, 不是滚动 24h) */
export function hfDayStartSec(nowSec) {
    const d = new Date(nowSec * 1000);
    d.setHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
}
/**
 * 是否落在静默段 (纯函数)。区间按 `[start, end)` 半开 —— 相邻段 `[9,12)` 与 `[12,15)` 不重叠。
 * `start === end` 视为**空段** (不静默): 否则 `[0,0]` 会意外变成全天静默。
 * `start > end` 表示跨零点 (如 `[23, 7]`).
 */
export function isHfQuietHour(hour, ranges) {
    if (!ranges || ranges.length === 0)
        return false;
    const h = ((Math.floor(hour) % 24) + 24) % 24;
    return ranges.some(([s, e]) => {
        const start = ((Math.floor(s) % 24) + 24) % 24;
        const end = ((Math.floor(e) % 24) + 24) % 24;
        if (start === end)
            return false;
        return start < end ? h >= start && h < end : h >= start || h < end;
    });
}
/** 新建状态 (计数从 0 起) */
export function newHfBudgetState(nowSec) {
    return {
        hourKey: hfHourBucketKey(nowSec),
        hourCount: 0,
        dayKey: hfDayBucketKey(nowSec),
        dayCount: 0,
        lastReplyAtSec: null,
        lastHumanAtSec: null,
    };
}
/** 桶滚动 (纯函数): 跨小时/跨天则对应计数归零 */
export function rollHfBudgetState(state, nowSec) {
    const dayKey = hfDayBucketKey(nowSec);
    const hourKey = hfHourBucketKey(nowSec);
    if (state.dayKey === dayKey && state.hourKey === hourKey)
        return state;
    const sameDay = state.dayKey === dayKey;
    return {
        ...state,
        dayKey,
        dayCount: sameDay ? state.dayCount : 0,
        hourKey,
        hourCount: state.hourKey === hourKey ? state.hourCount : 0,
    };
}
/**
 * 预算判定 (纯函数, 不改 state)。
 *
 * 判定顺序 (从"最绝对"到"最软"): 静默段 → 最小间隔 → 陈旧触发 → 每小时 → 每天。
 * 只报**第一条**命中的原因 (便于 `/heartflow status` 归因, 不叠加)。
 *
 * @param candidateAtSec 本次候选消息的时刻 (秒) —— 用于陈旧触发判定
 *
 * ⚠️ 计划里 `noConsecutiveWithoutHuman` 写的是"无人类插话不得连发第 2 条", 但**照字面实现会永远不生效**:
 *   心流的每次触发本身就源自一条人类消息, 故"上次发言后没有人类消息"在门禁处不可能成立。
 *   这里落成**陈旧触发防重放**: 候选消息不晚于我们上次发言 ⇒ 是同一批/更旧的消息被重复处理
 *   (debounce 重放、重试、补扫), 拦住它。真频率约束由 minGapSec / maxPerHour / maxPerDay 承担。
 */
export function checkHfBudget(state, cfg, nowSec, candidateAtSec = nowSec) {
    if (!cfg.enabled)
        return { allowed: true };
    const rolled = rollHfBudgetState(state, nowSec);
    if (isHfQuietHour(hfLocalHour(nowSec), cfg.quietHours)) {
        return { allowed: false, reason: "quiet-hours" };
    }
    if (cfg.minGapSec > 0 && rolled.lastReplyAtSec != null && nowSec - rolled.lastReplyAtSec < cfg.minGapSec) {
        return { allowed: false, reason: "budget-gap" };
    }
    if (cfg.noConsecutiveWithoutHuman &&
        rolled.lastReplyAtSec != null &&
        candidateAtSec <= rolled.lastReplyAtSec) {
        return { allowed: false, reason: "budget-consecutive" };
    }
    if (cfg.maxPerHour > 0 && rolled.hourCount >= cfg.maxPerHour) {
        return { allowed: false, reason: "budget-hour" };
    }
    if (cfg.maxPerDay > 0 && rolled.dayCount >= cfg.maxPerDay) {
        return { allowed: false, reason: "budget-day" };
    }
    return { allowed: true };
}
/** 记一次已发出的发言 (纯函数: 返回新 state) */
export function recordHfBudgetReply(state, nowSec) {
    const rolled = rollHfBudgetState(state, nowSec);
    return { ...rolled, hourCount: rolled.hourCount + 1, dayCount: rolled.dayCount + 1, lastReplyAtSec: nowSec };
}
/** 记一条人类消息 (纯函数: 返回新 state) */
export function recordHfBudgetHuman(state, nowSec) {
    const rolled = rollHfBudgetState(state, nowSec);
    const last = rolled.lastHumanAtSec ?? 0;
    if (nowSec <= last)
        return rolled;
    return { ...rolled, lastHumanAtSec: nowSec };
}
// ===== 进程内状态 (key = `${accountId}:${groupId}`) =====
const _budget = new Map();
/** 进程内发生的预算拦截计数 (按原因; 供 /heartflow status 显示; 重启归零, 显示时须标注) */
const _blocked = new Map();
function _key(accountId, groupId) {
    return `${accountId}:${groupId}`;
}
/** 取状态 (不存在则新建; 顺带滚动桶) */
export function getHfBudgetState(accountId, groupId, nowSec) {
    const k = _key(accountId, groupId);
    const cur = _budget.get(k);
    if (!cur) {
        const fresh = newHfBudgetState(nowSec);
        _budget.set(k, fresh);
        return fresh;
    }
    const rolled = rollHfBudgetState(cur, nowSec);
    if (rolled !== cur)
        _budget.set(k, rolled);
    return rolled;
}
/** 门禁调用: 判定 + 记拦截 (不写 DB) */
export function peekHfBudget(accountId, groupId, cfg, nowSec, candidateAtSec = nowSec) {
    if (!cfg.enabled)
        return { allowed: true };
    const acct = accountId ?? "*";
    const verdict = checkHfBudget(getHfBudgetState(acct, groupId, nowSec), cfg, nowSec, candidateAtSec);
    if (!verdict.allowed && verdict.reason) {
        const k = verdict.reason;
        _blocked.set(k, (_blocked.get(k) ?? 0) + 1);
        debug(`[WPP HF] budget blocked: account=${acct} group=${groupId} reason=${k}`);
    }
    return verdict;
}
/** 人类消息 hook (handler 里与接话判定同一处调用; 零额外 IO) */
export function noteHfHumanMessage(accountId, groupId, nowSec) {
    const k = _key(accountId, groupId);
    const cur = _budget.get(k) ?? newHfBudgetState(nowSec);
    _budget.set(k, recordHfBudgetHuman(cur, nowSec));
}
/** 发言 hook (发送结果确认为 sent 后调用; 见 heartflow-learn.persistHfSendOutcome) */
export function noteHfReplySent(accountId, groupId, nowSec) {
    const k = _key(accountId, groupId);
    const cur = _budget.get(k) ?? newHfBudgetState(nowSec);
    _budget.set(k, recordHfBudgetReply(cur, nowSec));
}
/** 启动回填 (账号启动时一次; 重启不清零小时/天计数; lastHumanAtSec 无法回填 → 留 null) */
export function seedHfBudgetStates(accountId, rows, nowSec) {
    let n = 0;
    for (const r of rows) {
        if (!r.group_id)
            continue;
        const fresh = newHfBudgetState(nowSec);
        _budget.set(_key(accountId, r.group_id), {
            ...fresh,
            hourCount: Math.max(0, Math.floor(r.hour_count) || 0),
            dayCount: Math.max(0, Math.floor(r.day_count) || 0),
            lastReplyAtSec: r.last_sent_at ?? null,
        });
        n += 1;
    }
    return n;
}
/** 拦截计数快照 (近进程生命周期; 供 /heartflow status) */
export function hfBudgetBlockedSnapshot() {
    return Object.fromEntries([..._blocked.entries()].sort((a, b) => b[1] - a[1]));
}
/** 测试/热重载: 清空预算状态与拦截计数 */
export function resetHfBudgetCache() {
    _budget.clear();
    _blocked.clear();
}
/** 测试/可观测: 当前已跟踪的群数 */
export function hfBudgetTrackedGroups() {
    return _budget.size;
}
//# sourceMappingURL=heartflow-budget.js.map