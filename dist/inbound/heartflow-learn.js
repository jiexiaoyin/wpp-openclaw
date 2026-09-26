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
import { recordHfJudged as dbRecordHfJudged, setHfLedgerSent, setHfLedgerSuppressed, markHfEngaged, closeHfExpiredWindows, expireHfStaleJudged, getHfClosedRecent, getHfGroupState, listHfGroupStates, listHfSentCountsRecent, upsertHfGroupState, logHfThresholdChange, getHfLedgerDistinctClosedGroups, listHfBotMsgShare, } from "../storage/db/heartflow.js";
import { resolveHfLearning, isHfGroupAllowed, } from "./heartflow.js";
import { asHfEngageSignal, classifyHfEngagement, isHfSampleInformative, } from "./heartflow-label.js";
import { noteHfReplySent, seedHfBudgetStates, hfHourStartSec, hfDayStartSec, hfLocalHour, } from "./heartflow-budget.js";
import { maybeGenerateHfGroupProfiles } from "./heartflow-profile.js";
import { HF_DEDUPE_DEFAULTS, noteHfRecentReply, pruneHfRecentReplies, resetHfDedupeStore, resolveHfDedupeCfg, } from "./heartflow-dedupe.js";
import { hfBotShare, noteHfGroupShare, resetHfShareGuard, resolveHfShareGuardCfg, } from "./heartflow-observe.js";
import { ambientPFromHourCounts, getHfLayerStat, hfLayerKeyFor, loadHfGroupHourCounts, maybeRecomputeHfLayerStats, resetHfLayerCache, resolveHfLayeredCfg, } from "./heartflow-layer.js";
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
/**
 * 占位符 msgId 清单 (ok:true 但**没真发**): 三个来源语义不同但后果相同 —— 预算与观察窗都不得被占用。
 * v1.9.0 加 `repeat-suppressed` (重复闸拦下): 不加这一条, 它会被判成 **sent**, 从而
 *   ① 消耗发言预算额度 ② 开一个 600s 观察窗 ⇒ 随后人类的正常发言被记成"接了我那句" ⇒ **毒化学习样本**。
 */
const HF_PLACEHOLDER_MSG_IDS = [
    "dedup-suppressed",
    "ack-template-dropped",
    "repeat-suppressed",
];
export function classifyHfSend(result) {
    if (!result.ok)
        return "pending"; // 等框架重试
    if (result.msgId != null && HF_PLACEHOLDER_MSG_IDS.includes(result.msgId)) {
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
/** 群级锚点 (分层每段都从它出发): 群级 learned (无则账号级), 已过读侧钳制 */
export function hfLayerAnchorFor(accountId, groupId, hfCfg) {
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
export function hfLayerStep(anchor, stat, hfCfg) {
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
    if (!r.changed)
        return { threshold: anchor, changed: false };
    const t = LAY.allowLoosen ? r.newThreshold : Math.max(anchor, r.newThreshold);
    return { threshold: t, changed: t !== anchor };
}
export function resolveHfThresholdDecision(accountId, groupId, hfCfg, nowSec = Math.floor(Date.now() / 1000)) {
    const LAY = resolveHfLayeredCfg(hfCfg);
    const learned = getLearnedThreshold(accountId, groupId);
    // 群级锚点: 库里存量的旧值 (地板抬高前落的 0.3) 也必须被读侧钳回来 —— 与 v1.6.6 同一道保证
    const anchor = hfLayerAnchorFor(accountId, groupId, hfCfg);
    const layerKey = LAY.enabled ? hfLayerKeyFor(hfLocalHour(nowSec), LAY.buckets) : null;
    const hit = layerKey == null ? null : getHfLayerStat(accountId, groupId, nowSec, LAY.buckets);
    const rate = hit && hit.stat.n > 0 ? hit.stat.engaged / hit.stat.n : null;
    const d = LAY.apply && hit && hit.stat.n >= LAY.minSamples
        ? hfLayerStep(anchor, { n: hit.stat.n, engaged: hit.stat.engaged }, hfCfg)
        : { threshold: anchor, changed: false };
    const layeredOn = LAY.apply && LAY.enabled && hit != null && hit.stat.n >= LAY.minSamples && d.changed;
    const shadow = !LAY.apply && LAY.enabled && hit != null && hit.stat.n >= LAY.minSamples
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
export function resolveThresholdOverride(accountId, groupId, hfCfg, nowSec = Math.floor(Date.now() / 1000)) {
    const d = resolveHfThresholdDecision(accountId, groupId, hfCfg, nowSec);
    if (d.applied === undefined)
        return undefined;
    const base = hfCfg.replyThreshold ?? 0.6;
    // v1.6.6 硬地板/上限: 读时再钳一次, 保证 "阈值最低不低于 bandMin" 不依赖 DB 里旧值是否会被 sweep 修好.
    // 局部名沿用 learned: 分层生效时它已是"从群级锚点走了半步"的值, 但读侧钳制对**两种来源都**是
    // 必需的硬保证 (库里可能还存着地板抬高前的 0.3)。
    const learned = d.applied;
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
            // v1.9.0 重复闸: 同一条件同一时刻记历史 —— 只有真发出去的文本才有资格"被重复"
            //   (被预算/闸拦下的、vendor 去重掉的都不能进历史, 否则会拿"没说出口的话"去拦下一句)
            if (opts.text) {
                noteHfRecentReply(accountId, opts.groupId, opts.text, atSec, opts.dedupeCfg ?? HF_DEDUPE_DEFAULTS);
            }
            return;
        }
        if (outcome === "suppressed") {
            const reason = result.msgId === "ack-template-dropped"
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
/**
 * v1.8.0 `/heartflow veto`: 删掉该群的开窗内存记录。
 *
 * 为什么**必须**做 (最容易漏的一步): veto 只作用于已 sent 的行, 而 sent 那一刻已经登记了 600s 开窗。
 *   不删窗的话, 若随后有人引用了那条 bot 消息, markHfGroupEngaged 会用 `engaged=1, signal='quote'`
 *   **覆盖 veto** —— 样本从"不该回"翻转成"该回", 比老板不点这一下更糟。
 */
export function forgetHfOpenWindow(accountId, groupId) {
    _openWindows.delete(_key(accountId, groupId));
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
/** 测试/重置用: 清空全部内存 learned 缓存 + 开窗表 + 分层缓存 + 重复历史 + 占比外环状态 */
export function resetLearnedThresholdCache() {
    _learnedThresholds.clear();
    _openWindows.clear();
    resetHfLayerCache();
    resetHfDedupeStore();
    resetHfShareGuard();
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
    if (!cfg.enabled)
        return;
    // v1.7.0 群画像: 每群每日一次 (内部按 generated_at 判新旧 + 单轮配额).
    //   放在 learning.enabled 判定**之前**: 画像不依赖调阈开关 —— 老板可能关掉自动调阈但仍要画像.
    //   内部全 catch (单个群失败不影响其它群, 更不影响 sweep); 这里再包一层只为防御性兜底.
    try {
        await maybeGenerateHfGroupProfiles(accountId, cfg, nowSec);
    }
    catch (e) {
        warn(`[WPP HF] profile pass failed (不影响调阈): ${formatErr(e)}`);
    }
    // v1.8.0 分层统计 (群 × 时段): 每轮**全量重算** + 只 upsert 有变化的行 (稳态下 0 写)。
    //   同样放在 learning.enabled 判定**之前** (与画像同级): 分层是"观测 + 影子建议", 不依赖自动调阈开关。
    //   内部全 catch (查询/写库失败都不影响调阈), 这里再包一层只为防御性兜底。
    try {
        await maybeRecomputeHfLayerStats(accountId, cfg, nowSec);
    }
    catch (e) {
        warn(`[WPP HF] layer pass failed (不影响调阈): ${formatErr(e)}`);
    }
    // v1.9.0 占比外环 (老板拍板: bot 发言占比 > 目标 ⇒ 收紧当日预算):
    //   DB 聚合只在这里做 (sweep 侧), 结果落内存 → judge 读侧零 DB IO。
    //   同样放在 learning.enabled 判定**之前**: 它是"频率约束的外环", 与自动调阈开关无关。
    try {
        await maybeRecomputeHfShareGuard(accountId, cfg, nowSec);
    }
    catch (e) {
        warn(`[WPP HF] share-guard pass failed (不影响调阈): ${formatErr(e)}`);
    }
    // v1.9.0 重复闸历史裁剪 (防长跑进程里内存无限增长; 与 pruneOpenWindows 同级, 零 IO)
    pruneHfRecentReplies(nowSec, resolveHfDedupeCfg(cfg));
    if (!L.enabled)
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
 *
 * v1.8.0: 取数收口到 heartflow-layer 的 loadHfGroupHourCounts (与分层统计共用同一条查询 + 120s 缓存),
 *   公式用同一个 ambientPFromHourCounts —— 两处若各写一份, 同一条样本会在调阈侧"可采信"、在分层侧
 *   "不可采信", `/heartflow report` 的 n 与这里的样本数就永远对不上。
 */
async function loadAmbientByGroup(accountId, nowSec, labelWindowSec) {
    const mA = new Map();
    try {
        const all = ambientPFromHourCounts(await loadHfGroupHourCounts(accountId, nowSec), labelWindowSec);
        const curHour = hfLocalHour(nowSec);
        for (const [k, p] of all) {
            const i = k.lastIndexOf("|");
            if (Number(k.slice(i + 1)) !== curHour)
                continue;
            mA.set(k.slice(0, i), p);
        }
    }
    catch (e) {
        // 拿不到基线 → 返回空表 ⇒ 所有弱信号/沉默都按 ambientP=0 采信 (退回旧行为).
        // 明知这会让阈值更容易漂, 故留 warn: 基线查询长期失败必须看得见.
        warn(`[WPP HF] ambient baseline query failed (弱信号将不过滤): ${formatErr(e)}`);
    }
    return mA;
}
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
/**
 * v1.9.0 占比外环: 重算**今日**每群 bot 发言占比 → 落内存 (judge 读侧零 DB IO)。
 *
 * 为什么用"今日"而不是"近 N 天": 外环是**当日**预算的收紧依据 —— 今天的嘴今天管, 昨天的超标
 *   不该锁今天 (跨日本地日翻页时 `getHfShareTighten` 会自然返回 null, 不需要额外的失效逻辑)。
 *
 * 只在**占比超标**时才 warn: 冷清群每天 4 条发言, 每轮都打日志会把 journal 刷满 (每账号每 300s 一次)。
 * 返回命中的群数 (测试与诊断用)。
 */
async function maybeRecomputeHfShareGuard(accountId, cfg, nowSec) {
    const G = resolveHfShareGuardCfg(cfg);
    if (!G.enabled)
        return 0;
    const rows = await listHfBotMsgShare(accountId, hfDayStartSec(nowSec));
    const byGroup = new Map();
    for (const r of rows) {
        if (!r.group_id)
            continue; // 归群失败的脏行 (peer_id 也空) 直接丢
        const cur = byGroup.get(r.group_id) ?? { inbound: 0, outbound: 0 };
        if (r.direction === "outbound")
            cur.outbound += r.n;
        else
            cur.inbound += r.n;
        byGroup.set(r.group_id, cur);
    }
    let hits = 0;
    for (const [gid, v] of byGroup) {
        const share = hfBotShare(v.inbound, v.outbound);
        noteHfGroupShare(accountId, gid, nowSec, { total: v.inbound + v.outbound, botSends: v.outbound }, share);
        if (share > G.targetShare && v.inbound + v.outbound >= G.minMsgs && v.outbound >= G.minBotSends) {
            hits++;
            warn(`[WPP HF] share-guard: group=${gid} bot 发言占比 ${(share * 100).toFixed(1)}% ` +
                `(${v.outbound}/${v.inbound + v.outbound}) > ${(G.targetShare * 100).toFixed(0)}% ⇒ 今日预算收紧`);
        }
    }
    return hits;
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