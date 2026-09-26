// src/inbound/heartflow-dedupe.ts - v1.9.0 心流重复内容闸 (P3)
//
// 为什么要有这个: 只读回放真实账本发现, bot 的一部分发言与更早一条**高度雷同** (归一化后前若干字符
//   完全相同)。这是"bot 不像真人"最刺眼的症状 —— 群友看到第二遍就出戏。
//   根因不是模型笨, 是**没有任何机制记得自己刚说过什么**: judge 只看最近几条群消息上下文, 看不到
//   自己两小时前那句; 而心流插话是"应景"的, 场景相似 ⇒ 话也相似。
//
// 设计 (老板 2026-09-26 拍板): **同群 6 小时内高度相似 (≥0.85) 就不发**, 只对心流主动插话生效。
//
// 三条硬约束:
//   ① 判定与观测**必须共用同一个函数** (hfRepeatVerdict): 日报的"重复率"与闸的"拦不拦"若各写一套,
//      就会出现"日报说重复率很高、闸却一条都没拦"这种自相矛盾 —— 观测驱动收口就成了假的。
//   ② 只比对**真发出**的文本 (noteHfRecentReply 只在 sendAiReply 真发后调): 被预算/闸拦下的、被
//      vendor 去重掉的不能进历史, 否则会拿"没说出口的话"去拦下一句。
//   ③ 短句豁免 (minChars=12): "收到 / 好的 / 👌" 这类回复天然高频且无害, 归一化后不足 12 字不进相似
//      判定 (前缀判定用的是同一个阈值) —— 否则 bot 连"好的"都不敢说, 比重复更不像人。
//
// 为什么自带 normHfText + 字符 3-gram 而不用 jargon.ts 的 tokenize:
//   `ngramTokens` 未导出, 且 `tokenize` 会过滤标准词表 ⇒ 短句/口语会被滤成空 token, 相似度恒 0 而
//   静默失效 (src/inbound/jargon.ts:117-157)。这里只要"像不像", 不需要分词, 零 jieba 依赖。
//
// ⚠️ 绝不 import heartflow-learn.js (它 import 本模块 ⇒ 成环; 测试有源级守卫)。
import { warn } from "../core/logger.js";
/**
 * 老板档位: 6 小时窗 / 0.85 / 12 字豁免 / 每群记 50 条。
 *
 * 为什么是 6 小时而不是 24 小时: 群聊话题半天就换一轮, 24 小时窗会把"早上问价、晚上又问价"这种
 *   正常重访也拦掉 (那是应该回的)。6 小时 ≈ 一个活跃时段, 窗内重复才是真·复读。
 * 50 条 × 6 小时: 心流每天每群只发个位数条 ⇒ 6 小时窗内最多几条, 50 是给异常情况留的余量。
 */
export const HF_DEDUPE_DEFAULTS = {
    enabled: true,
    proactiveOnly: true,
    windowSec: 21600,
    simThreshold: 0.85,
    minChars: 12,
    historyMax: 50,
};
export function resolveHfDedupeCfg(cfg) {
    const d = cfg?.dedupe;
    const pos = (v, fallback) => v != null && Number.isFinite(v) && v > 0 ? v : fallback;
    const D = HF_DEDUPE_DEFAULTS;
    const simRaw = d?.simThreshold;
    const sim = simRaw != null && Number.isFinite(simRaw) && simRaw > 0 && simRaw <= 1 ? simRaw : D.simThreshold;
    return {
        enabled: d?.enabled !== false,
        proactiveOnly: d?.proactiveOnly !== false,
        windowSec: Math.floor(pos(d?.windowSec, D.windowSec)),
        simThreshold: sim,
        minChars: Math.floor(pos(d?.minChars, D.minChars)),
        historyMax: Math.min(Math.floor(pos(d?.historyMax, D.historyMax)), 500),
    };
}
// ---------------------------------------------------------------- 纯文本归一化 + 相似度
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu;
const AT_RE = /@[^\s@]{1,64}/g;
const FULLWIDTH_RE = /[！-～]/g;
const IDEOGRAPHIC_SPACE_RE = /　/g;
/**
 * 归一化 (纯函数): 去 emoji / @ 提及 / 全角转半角 / 只保留字母数字与汉字 / 小写。
 *
 * 为什么保留数字: "iPhone 15 现在多少钱" 与 "iPhone 16 现在多少钱" 是**不同问题**, 只差一个数字——
 *   滤掉数字会让这两句的相似度飙到极高而被误判成重复。保留数字后用 3-gram, 差异会体现出来。
 * 为什么滤标点与空白: 同一句话换个标点/换行不该算两句; 而老板与群友的书写习惯差异极大。
 */
export function normHfText(s) {
    if (!s)
        return "";
    return s
        .replace(EMOJI_RE, "")
        .replace(AT_RE, "")
        .replace(FULLWIDTH_RE, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
        .replace(IDEOGRAPHIC_SPACE_RE, " ")
        .replace(/[^\p{L}\p{N}]/gu, "")
        .toLowerCase();
}
/** 字符 n-gram 集合 (默认 3): 中文短句无空格, 3-gram 在"口语近重复"上比分词稳 (见文件头注) */
export function hfCharGrams(s, n = 3) {
    const out = new Set();
    if (s.length === 0)
        return out;
    if (s.length < n) {
        out.add(s);
        return out;
    }
    for (let i = 0; i + n <= s.length; i++)
        out.add(s.slice(i, i + n));
    return out;
}
/** Jaccard 相似度 (纯函数): 交集/并集; 任一为空 ⇒ 0 (不凭空相似) */
export function hfJaccard(a, b) {
    if (a.size === 0 || b.size === 0)
        return 0;
    let inter = 0;
    const [small, big] = a.size <= b.size ? [a, b] : [b, a];
    for (const g of small)
        if (big.has(g))
            inter++;
    const union = a.size + b.size - inter;
    return union <= 0 ? 0 : inter / union;
}
/**
 * 重复判定 (纯函数, **闸与日报共用**):
 *   同群 (由调用方保证 history 是同一个群的) + 窗口内 + 归一化后 ≥ minChars ⇒
 *   ① 归一化前缀 (前 minChars 字) 完全相同 ⇒ prefix (更准更便宜, 优先级高);
 *   ② 否则字符 3-gram Jaccard ≥ simThreshold ⇒ similar。
 *
 * 多条命中时: prefix 优先于 similar; 同为 similar 取相似度最高的那条 (并列取更近的)。
 * 返回 null = 放行。
 */
export function hfRepeatVerdict(text, history, cfg, nowSec) {
    const a = normHfText(text);
    if (a.length < cfg.minChars)
        return null; // 短句豁免 ("好的/收到"不该被拦)
    const aGram = hfCharGrams(a);
    const prefix = a.slice(0, cfg.minChars);
    let best = null;
    for (const h of history) {
        if (nowSec - h.atSec > cfg.windowSec)
            continue; // 窗口外: bot 半年前的旧话不算复读
        const b = h.norm ?? normHfText(h.text);
        if (b.length < cfg.minChars)
            continue;
        const head = h.text.slice(0, 24);
        if (b.slice(0, cfg.minChars) === prefix) {
            // prefix 是更强证据 (开头一字不差), 直接覆盖任何 similar 候选; 同 prefix 取更近的
            if (!best || best.kind === "similar" || prevIsNewer(h, best)) {
                best = { kind: "prefix", sim: 1, prevAt: h.atSec, prevHead: head };
            }
            continue;
        }
        const sim = hfJaccard(aGram, hfCharGrams(b));
        if (sim < cfg.simThreshold)
            continue;
        if (!best || (best.kind === "similar" && (sim > best.sim || (sim === best.sim && prevIsNewer(h, best))))) {
            best = { kind: "similar", sim, prevAt: h.atSec, prevHead: head };
        }
    }
    return best;
}
function prevIsNewer(h, best) {
    return h.atSec > best.prevAt;
}
// ---------------------------------------------------------------- 内存历史 (per 账号×群)
const _key = (accountId, groupId) => `${accountId}:${groupId}`;
const _recent = new Map();
/**
 * 闸判定 (只读, 不改内存): 调用方 = dispatcher 的 deliver 回调, **发之前**问一句。
 * `enabled=false` / 非心流主动插话 (proactiveOnly) ⇒ 一律 null (放行), 连归一化都不做。
 */
export function checkHfRepeat(accountId, groupId, text, cfg, nowSec, opts) {
    if (!cfg.enabled)
        return null;
    if (cfg.proactiveOnly && opts?.proactive === false)
        return null;
    const hist = _recent.get(_key(accountId, groupId));
    if (!hist || hist.length === 0)
        return null;
    return hfRepeatVerdict(text, hist, cfg, nowSec);
}
/**
 * 记一条**真发出**的发言 (调用方 = persistHfSendOutcome 的 sent 分支; 与开窗/预算同一条件同一时刻)。
 *
 * 与 peekHfBudget / noteHfReplySent 的分割同构: 判定 (check) 与记账 (note) 分开, 判了但没发出去的不记账。
 * 只读侧不清理过期项 (群里可能几小时没发言) ⇒ 这里顺手按窗口裁掉过期的, 顺带把长度压到 historyMax。
 */
export function noteHfRecentReply(accountId, groupId, text, atSec, cfg) {
    if (!cfg.enabled)
        return;
    const norm = normHfText(text);
    if (norm.length < cfg.minChars)
        return; // 短句既不进历史, 也不参与判定 (两侧对称)
    const key = _key(accountId, groupId);
    const hist = _recent.get(key) ?? [];
    hist.push({ text: text.slice(0, 200), atSec, norm });
    const kept = hist.filter((h) => atSec - h.atSec <= cfg.windowSec);
    while (kept.length > cfg.historyMax)
        kept.shift();
    _recent.set(key, kept);
}
/** v1.9.0 sweep: 按窗口裁掉过期历史 (防长跑进程里内存无限增长; 与 pruneOpenWindows 同级) */
export function pruneHfRecentReplies(nowSec, cfg) {
    for (const [k, hist] of _recent) {
        const kept = hist.filter((h) => nowSec - h.atSec <= cfg.windowSec);
        if (kept.length === 0)
            _recent.delete(k);
        else if (kept.length !== hist.length)
            _recent.set(k, kept);
    }
}
/** 测试/诊断: 某群当前历史条数 */
export function hfRecentCount(accountId, groupId) {
    return _recent.get(_key(accountId, groupId))?.length ?? 0;
}
/** 测试用: 清空内存历史 (热重载/单测隔离; 生产不经此路径) */
export function resetHfDedupeStore() {
    _recent.clear();
}
/** 记一条**未发出**的判定 (日志用; 不写历史) */
export function logHfRepeatSkip(groupId, v, nowSec) {
    warn(`[WPP HF] repeat-suppressed: group=${groupId} kind=${v.kind} sim=${v.sim.toFixed(3)} ` +
        `prev=${nowSec - v.prevAt}s ago head="${v.prevHead}"`);
}
//# sourceMappingURL=heartflow-dedupe.js.map