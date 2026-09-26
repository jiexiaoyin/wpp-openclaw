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
import { recordHfJudged as dbRecordHfJudged, setHfLedgerSent, setHfLedgerSuppressed, markHfEngaged, closeHfExpiredWindows, expireHfStaleJudged, getHfClosedRecent, getHfGroupState, listHfGroupStates, listHfGroupMsgHourBuckets, listHfSentCountsRecent, upsertHfGroupState, logHfThresholdChange, getHfLedgerDistinctClosedGroups, } from "../storage/db/heartflow.js";
import { resolveHfLearning, isHfGroupAllowed, } from "./heartflow.js";
import { asHfEngageSignal, classifyHfEngagement, hfAmbientP, isHfSampleInformative, } from "./heartflow-label.js";
import { noteHfReplySent, seedHfBudgetStates, hfHourStartSec, hfDayStartSec, } from "./heartflow-budget.js";
/**
 * 双向自适应判定 (纯函数).
 * 方向: 接话率 ≤ lowEngageRate → 上调 (少说精选); ≥ highEngageRate → 下调 (多说);
 *       (low, high) 之间为死区 → 不变 (天然滞回防抖).
 * 护栏: 区间钳制在函数内; cur 回落基线 = learnedThreshold ?? baseThreshold.
 */
export function evalHfThreshold(inp) {
    const { stats, learnedThreshold, baseThreshold, params } = inp;
    if (stats.total < params.minSample) {
        return { changed: false, reason: "insufficient-sample" };
    }
    const cur = learnedThreshold ?? baseThreshold;
    const rate = stats.engaged / stats.total;
    const delta = rate <= params.lowEngageRate
        ? params.step
        : rate >= params.highEngageRate
            ? -params.step
            : 0;
    if (delta === 0)
        return { changed: false, reason: "in-dead-zone" };
    const raw = Math.max(params.bandMin, Math.min(params.bandMax, round2(cur + delta)));
    if (raw === round2(cur))
        return { changed: false, reason: "clamped-noop" };
    return {
        changed: true,
        newThreshold: raw,
        direction: delta > 0 ? "up" : "down",
        rate,
        reason: `rate=${rate.toFixed(3)} total=${stats.total} engaged=${stats.engaged}`,
    };
}
/** 相邻两次阈值变更冷却是否已过 */
export function hfCooldownOk(lastChangeAtSec, nowSec, minCooldownSec) {
    if (lastChangeAtSec == null)
        return true;
    return nowSec - lastChangeAtSec >= minCooldownSec;
}
/** 阈值保留 2 位小数 */
export function round2(n) {
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
export function clampHfThresholdToBand(t, bandMin, bandMax) {
    return round2(Math.max(bandMin, Math.min(bandMax, t)));
}
export function classifyHfSend(result) {
    if (!result.ok)
        return "pending"; // 等框架重试
    if (result.msgId === "dedup-suppressed" ||
        result.msgId === "ack-template-dropped") {
        return "suppressed"; // 占位符: 没真发
    }
    if (result.msgId === "")
        return "suppressed"; // 空文本早退
    return "sent"; // undefined msgId = 真发但 vendor 没回 id
}
// ============ per-群 learned 阈值内存缓存 (judge 路径零 DB IO) ============
const _key = (accountId, groupId) => `${accountId}:${groupId}`;
const _learnedThresholds = new Map();
const _openWindows = new Map();
/** 读单群 learned (无则 undefined) */
export function getLearnedThreshold(accountId, groupId) {
    return _learnedThresholds.get(_key(accountId, groupId));
}
/**
 * 应 override 的阈值 (learned 有且 ≠ 账号级时返回; 否则 undefined → 调用方沿用原 cfg, 不 clone)
 */
export function resolveThresholdOverride(accountId, groupId, hfCfg) {
    const learned = getLearnedThreshold(accountId, groupId);
    if (learned === undefined)
        return undefined;
    const base = hfCfg.replyThreshold ?? 0.6;
    // v1.6.6 硬地板/上限: 读时再钳一次, 保证 "阈值最低不低于 bandMin" 不依赖 DB 里旧值是否会被 sweep 修好.
    const { bandMin, bandMax } = resolveHfLearning(hfCfg);
    const eff = clampHfThresholdToBand(learned, bandMin, bandMax);
    if (Math.abs(eff - base) < 1e-9)
        return undefined; // == 账号级, 不用 clone
    return eff;
}
// ============ DB 薄管线 (全 catch, 失败不阻断 dispatch / 收发) ============
/** judge 通过落 ledger 行 (insert 失败仅 warn, 不阻断 dispatch) */
export async function persistHfJudged(record) {
    try {
        await dbRecordHfJudged(record);
    }
    catch (e) {
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
export async function persistHfJudgedBelowThreshold(record, atSec) {
    try {
        await dbRecordHfJudged(record);
        await setHfLedgerSuppressed(record.account_id, record.inbound_msg_id, "below-threshold", atSec);
    }
    catch (e) {
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
export async function persistHfSendOutcome(accountId, inboundMsgId, result, atSec, opts) {
    const outcome = classifyHfSend(result);
    try {
        if (outcome === "sent") {
            // msgId 可能 undefined (vendor 不回 id) 或占位符; 占位符不会走到这里 (classifyHfSend 已判 suppressed)
            const botMsgId = result.msgId ? result.msgId : null;
            await setHfLedgerSent(accountId, inboundMsgId, atSec, atSec + opts.observeSec, botMsgId);
            _openWindows.set(_key(accountId, opts.groupId), {
                botMsgId,
                sentAtSec: atSec,
                observeWindowSec: opts.observeSec,
                labelWindowSec: opts.labelWindowSec,
            });
            // v1.6.9 发言预算: **真发出去**才占额度 (判了但被下游拦掉的不占) —— 与上面开窗同一时刻同一条件
            noteHfReplySent(accountId, opts.groupId, atSec);
            return;
        }
        if (outcome === "suppressed") {
            const reason = result.msgId === "ack-template-dropped"
                ? "ack-template"
                : result.msgId === "dedup-suppressed"
                    ? "dedup"
                    : result.msgId === ""
                        ? "empty-text"
                        : "unknown";
            await setHfLedgerSuppressed(accountId, inboundMsgId, reason, atSec);
        }
        // pending: 不动
    }
    catch (e) {
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
export async function markHfGroupEngaged(accountId, groupId, atSec, candidates) {
    const key = _key(accountId, groupId);
    const w = _openWindows.get(key);
    if (!w)
        return;
    const verdict = classifyHfEngagement({
        sentAtSec: w.sentAtSec,
        labelWindowSec: w.labelWindowSec,
        observeWindowSec: w.observeWindowSec,
        candidates,
    });
    if (verdict.signal == null || verdict.engaged == null)
        return;
    try {
        await markHfEngaged(accountId, groupId, atSec, verdict.engaged, verdict.signal, verdict.close);
        // 关窗了才从内存摘掉; 弱信号仍留在表里等更强信号升级
        if (verdict.close)
            _openWindows.delete(key);
    }
    catch (e) {
        debug(`[WPP HF] mark engaged failed (non-fatal): ${formatErr(e)}`);
    }
}
/**
 * 取该群开窗信息 (handler 判"引用的这条是不是 bot 刚发的那条").
 * 返回副本, 调用方不可改写内部状态.
 */
export function getOpenHfWindow(accountId, groupId) {
    const w = _openWindows.get(_key(accountId, groupId));
    if (!w)
        return undefined;
    return { botMsgId: w.botMsgId, sentAtSec: w.sentAtSec, observeWindowSec: w.observeWindowSec };
}
/** 账号启动/热载后从 DB 加载 learned 阈值进内存缓存 */
export async function loadLearnedThresholds(accountId) {
    let n = 0;
    try {
        const rows = await listHfGroupStates(accountId);
        for (const r of rows) {
            if (r.learned_threshold != null) {
                _learnedThresholds.set(_key(accountId, r.group_id), r.learned_threshold);
                n++;
            }
        }
    }
    catch (e) {
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
export async function loadHfBudgetSeed(accountId, nowSec = Math.floor(Date.now() / 1000)) {
    try {
        const rows = await listHfSentCountsRecent(accountId, hfHourStartSec(nowSec), hfDayStartSec(nowSec));
        const n = seedHfBudgetStates(accountId, rows, nowSec);
        if (n > 0)
            debug(`[WPP HF] budget seed loaded: account=${accountId} groups=${n}`);
        return n;
    }
    catch (e) {
        warn(`[WPP HF] budget seed failed (counters start at 0): ${formatErr(e)}`);
        return 0;
    }
}
/** 测试/重置用: 清空全部内存 learned 缓存 + 开窗表 */
export function resetLearnedThresholdCache() {
    _learnedThresholds.clear();
    _openWindows.clear();
}
// ============ sweep (周期: 关过期窗 + 呆账收敛 + 自适应) ============
/** 每账号 sweep 一次单跳 (accountId, 当前 cfg, nowSec) */
export async function runHeartflowSweep(accountId, cfg, nowSec) {
    const L = resolveHfLearning(cfg);
    // 关窗 + 呆账收敛 (无论学习开关都跑: 防 pending/超期行无限堆积)
    try {
        await closeHfExpiredWindows(accountId, nowSec);
        await expireHfStaleJudged(accountId, nowSec, nowSec - L.staleJudgedMaxSec);
        pruneOpenWindows(accountId, nowSec);
    }
    catch (e) {
        warn(`[WPP HF] sweep close/expire failed: ${formatErr(e)}`);
        return;
    }
    if (!cfg.enabled || !L.enabled)
        return;
    try {
        // v1.6.8 反事实基线: 该群**当前小时段**本来有多热闹 (近 14 天同小时段的入站人类消息数).
        //   没数据的群 = 该时段本来没人说话 ⇒ ambientP=0 ⇒ 弱信号/沉默都算有效信息.
        const ambient = await loadAmbientByGroup(accountId, nowSec, L.labelWindowSec);
        // 近 7 天有已收敛样本的群 → 逐群滚窗统计 → 判定 → (过冷却才) 应用
        const sinceSec = nowSec - 7 * 86400;
        const groups = await getHfLedgerDistinctClosedGroups(accountId, sinceSec);
        for (const groupId of groups) {
            // 护栏: 只对白名单群调阈
            if (!isHfGroupAllowed(groupId, cfg))
                continue;
            const samples = await getHfClosedRecent(accountId, groupId, L.sampleWindow);
            if (samples.length === 0)
                continue;
            const ambientP = ambient.get(groupId) ?? 0;
            // v1.6.8: 只采信"可鉴别"样本 —— 强信号(引用/@/负词)恒采信; 弱信号与沉默仅在
            //   该时段本来不热闹时采信. v1.6.8 之前的行 engage_signal 为 NULL ⇒ 全部排除
            //   (= 旧错误标签作废, 不再驱动阈值; 上线后需重新攒够 minSample 条新样本才会再调阈).
            const usable = samples.filter((s) => isHfSampleInformative(asHfEngageSignal(s.engage_signal), ambientP, L.ambientMax));
            if (usable.length === 0) {
                debug(`[WPP HF] no informative sample: group=${groupId} window=${samples.length} ambientP=${ambientP.toFixed(3)}`);
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
            if (!res.changed)
                continue;
            // 护栏: 变更冷却
            if (!hfCooldownOk(st?.last_change_at ?? null, nowSec, L.minChangeCooldownSec))
                continue;
            const oldEffective = st?.learned_threshold ?? baseThreshold;
            const detail = `${res.reason} skipped=${samples.length - usable.length} ambientP=${ambientP.toFixed(3)} sig=${signalHistogram(usable)}`;
            await applyHfThresholdChange(accountId, groupId, oldEffective, res.newThreshold, detail, usable.length, engaged, nowSec);
            info(`[WPP HF] threshold adapted: group=${groupId} ${oldEffective.toFixed(2)} → ${res.newThreshold.toFixed(2)} (${res.direction}, ${detail})`);
        }
    }
    catch (e) {
        warn(`[WPP HF] sweep adapt failed: ${formatErr(e)}`);
    }
}
/**
 * 该群在当前小时段的本底接话概率 (近 14 天同小时段的入站人类消息数 → 泊松近似).
 * 一次聚合查询覆盖所有群, 不按群逐个查 (sweep 每 5 分钟一次, 别把 DB 打热).
 */
async function loadAmbientByGroup(accountId, nowSec, labelWindowSec) {
    const mA = new Map();
    const days = HF_AMBIENT_LOOKBACK_DAYS;
    try {
        // 本地时区偏移: 让 SQL 分出来的"小时"与应用侧 new Date().getHours() 同义
        const localOffsetSec = -new Date(nowSec * 1000).getTimezoneOffset() * 60;
        const buckets = await listHfGroupMsgHourBuckets(accountId, nowSec - days * 86400, localOffsetSec);
        const curHour = new Date(nowSec * 1000).getHours();
        for (const b of buckets) {
            if (b.hour !== curHour)
                continue;
            mA.set(b.group_id, hfAmbientP(b.n, days * 3600, labelWindowSec));
        }
    }
    catch (e) {
        // 拿不到基线 → 返回空表 ⇒ 所有弱信号/沉默都按 ambientP=0 采信 (退回旧行为).
        // 明知这会让阈值更容易漂, 故留 warn: 基线查询长期失败必须看得见.
        warn(`[WPP HF] ambient baseline query failed (弱信号将不过滤): ${formatErr(e)}`);
    }
    return mA;
}
/** 反事实基线回看天数 (与 sweep 的 7 天样本窗不同: 本底要更长的历史才稳) */
const HF_AMBIENT_LOOKBACK_DAYS = 14;
/** 清掉该账号已过期的开窗内存 (sweep 到期关窗后同步; 防长跑进程里表无限增长) */
function pruneOpenWindows(accountId, nowSec) {
    const prefix = `${accountId}:`;
    for (const [k, w] of _openWindows) {
        if (!k.startsWith(prefix))
            continue;
        if (w.sentAtSec + w.observeWindowSec <= nowSec)
            _openWindows.delete(k);
    }
}
/** 样本信号分布 `quote:2,short-window:5` (审计 reason 用, 有界: 信号种类固定 5 种, 样本 ≤ sampleWindow) */
function signalHistogram(samples) {
    const m = new Map();
    for (const s of samples) {
        const k = s.engage_signal ?? "unknown";
        m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([k, n]) => `${k}:${n}`).join(",");
}
async function applyHfThresholdChange(accountId, groupId, oldThreshold, newThreshold, reason, sampleTotal, sampleEngaged, nowSec) {
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
const _sweepTimers = new Map();
export function startHeartflowSweep(state, accountId, getCfg) {
    const prev = _sweepTimers.get(accountId);
    if (prev !== undefined) {
        clearInterval(prev); // 已启动 (含 stop 后旧句柄) → 先清再排, 防重复
    }
    const intervalMs = resolveHfLearning(getCfg()).sweepIntervalSec * 1000;
    const timer = setInterval(() => {
        void runHeartflowSweep(accountId, getCfg(), Math.floor(Date.now() / 1000)).catch((e) => warn(`[WPP HF] sweep tick error: ${formatErr(e)}`));
    }, intervalMs);
    timer.unref?.();
    state.setRetryTimer(timer);
    _sweepTimers.set(accountId, timer);
    info(`[WPP HF] sweep scheduled: account=${accountId} interval=${Math.round(intervalMs / 1000)}s (learning.enabled=${resolveHfLearning(getCfg()).enabled})`);
}
//# sourceMappingURL=heartflow-learn.js.map