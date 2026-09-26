// src/inbound/heartflow-label.ts - v1.6.8 心流标签判定 (纯函数, 无 DB / 无 IO)
//
// 为什么需要它 (2026-09-26 老板拍板改造):
//   旧闭环的 engaged 判据是「**该群出现任意人类群消息**」(handler.ts 里 markHfGroupEngaged, 600s 窗)
//   ⇒ 活跃群恒为真 ⇒ 接话率饱和 ⇒ evalHfThreshold 每轮都下调 ⇒ 阈值单调降到地板
//   ("不设下限就会一直降低", 老板原话). 它学的是「群里有没有人说话」, 不是「我上一条说得怎么样」.
//
//   本模块把标签锚回 **bot 自己发的那条消息**:
//     quote   = 有人引用了我那条        (强正: 最可靠)
//     mention = 有人 @ 我              (强正)
//     negative= 有人针对我那条说"别刷了"(强负) / 窗内出现极少数硬负词
//     short-window = 弱窗(默认 60s)内有人说话 (弱正: 可能只是群里本来就热闹 ⇒ 需反事实基线过滤)
//     silence = 观察窗内无人接话        (负; 同样受反事实基线约束)
//
// ⚠️ 负信号词**只用于给 bot 自己的发言打分**, 绝不参与"要不要回复"的触发判定
//   (老板 2026-09-26 明确: 触发必须由心流五维判断, 不许用固定关键词. 这里是**评估已发出消息的效果**,
//    是反馈闭环的输入, 不是触发器.)
/** 强信号 (与群是否本来就热闹无关, 永远算有效学习样本) */
export const HF_STRONG_SIGNALS = ["quote", "mention", "negative"];
/** 全部信号 (落库值域; 供 asHfEngageSignal 校验用) */
const HF_ALL_SIGNALS = ["quote", "mention", "negative", "short-window", "silence"];
/**
 * DB 读回来的 engage_signal (string|null) → 收窄成 HfEngageSignal.
 * NULL / 未知值 → null (不采信): v1.6.8 之前落的行没有信号列, 那些正是**旧错误标签**,
 * 必须被排除在学习样本外, 否则改造白做.
 */
export function asHfEngageSignal(s) {
    if (s == null)
        return null;
    return HF_ALL_SIGNALS.includes(s) ? s : null;
}
/**
 * 强负信号词 (仅在**引用/提到 bot** 的消息里判定 —— 此时几乎可以肯定在说 bot).
 * ⚠️ 这是**评估用**词表, 不是触发关键词 (见文件头).
 */
export const HF_NEGATIVE_PHRASES = [
    "别刷了",
    "别刷屏",
    "不要刷屏",
    "别发了",
    "别说话了",
    "别说话",
    "闭嘴",
    "别插话",
    "别乱说",
    "别瞎说",
    "少说两句",
    "谁让你说话",
    "别吵",
    "别烦",
];
/**
 * 硬负信号词: 极少数"只能是冲着刷屏者说的"短语, 允许在**窗内任意人类消息**上判定.
 * 刻意压到 4 个 —— 窗内裸消息没有上下文, 误报代价是冤枉一次好回复, 宁可少判.
 */
export const HF_HARD_NEGATIVE_PHRASES = [
    "别刷了",
    "别刷屏",
    "不要刷屏",
    "别发了",
];
/** 归一化: 去空白 + 全角转半角标点无关, 只做小写与去空格 (中文群聊场景够用) */
function norm(s) {
    return s.replace(/\s+/g, "").toLowerCase();
}
/** 文本是否命中负信号词 (`strong=true` 用完整词表, false 只用极少数硬词) */
export function isHfNegativeText(text, strong) {
    const t = norm(text ?? "");
    if (!t)
        return false;
    const list = strong ? HF_NEGATIVE_PHRASES : HF_HARD_NEGATIVE_PHRASES;
    return list.some((p) => t.includes(norm(p)));
}
/** 无结论 (窗内没有可用候选) */
const NO_VERDICT = { engaged: null, signal: null, close: false };
/**
 * 判定一条账本行的接话结果 (纯函数).
 *
 * 优先级不是"按信号种类排", 而是**按每条候选消息的意图置信度先定其性质**, 再聚合成一行一个结论:
 *   ① 任何一条判为 negative → 整行 negative/0 (即便同时有人引用了 bot: "别刷了"是针对 bot 那句的)
 *   ② 否则有 quote → quote/1 (quote 比 mention 强: 引用带上下文, @ 可能只是叫人)
 *   ③ 否则有 mention → mention/1
 *   ④ 否则有短窗内消息 → short-window/1 (不关窗, 留给更强信号升级)
 *   ⑤ 否则无结论
 */
export function classifyHfEngagement(inp) {
    const { sentAtSec, labelWindowSec, observeWindowSec, candidates } = inp;
    const obsEnd = sentAtSec + observeWindowSec;
    const labelEnd = sentAtSec + labelWindowSec;
    let sawQuote = false;
    let sawMention = false;
    let sawWeak = false;
    for (const c of candidates) {
        if (c.atSec < sentAtSec || c.atSec > obsEnd)
            continue; // 窗外: 与本行无关
        const inLabel = c.atSec <= labelEnd;
        if (c.quotesBot) {
            // 引用 bot 的那条: 说"别刷了"= 负面; 否则 = 强正
            if (isHfNegativeText(c.text, true))
                return { engaged: 0, signal: "negative", close: true };
            sawQuote = true;
            continue;
        }
        if (c.mentionsBot) {
            if (isHfNegativeText(c.text, true))
                return { engaged: 0, signal: "negative", close: true };
            sawMention = true;
            continue;
        }
        // 既没引用也没提到: 只有窄窗内的"极少数硬负词"才敢判负 (误报代价高)
        if (inLabel && isHfNegativeText(c.text, false)) {
            return { engaged: 0, signal: "negative", close: true };
        }
        if (inLabel)
            sawWeak = true;
    }
    if (sawQuote)
        return { engaged: 1, signal: "quote", close: true };
    if (sawMention)
        return { engaged: 1, signal: "mention", close: true };
    if (sawWeak)
        return { engaged: 1, signal: "short-window", close: false }; // 弱: 不关窗
    return NO_VERDICT;
}
/**
 * 反事实基线: 该群在**同一时段**本来就会有人说话的概率 (泊松近似).
 *
 * 为什么要它: `short-window`(窗内有人说话) 与 `silence`(窗内没人说话) 都有信息量**仅当**
 *   "这个时段本来就没那么热闹". 刷口号群的高峰时段本来 120s 内必有人说话 ⇒ 那行标签
 *   其实什么都没证明 ⇒ 直接不采信, 而不是把它当成"bot 受欢迎"继续下调阈值.
 *   (这正是旧标签跑飞的机制; 也是老板说的"不设下限就会一直降低"的根因.)
 *
 * @param count 该群**同一小时段**在观察期内的入站人类消息数
 * @param observedSec 该时段被观察的总秒数 (天数 * 3600)
 * @param windowSec 要算的窗长 (labelWindowSec)
 */
export function hfAmbientP(count, observedSec, windowSec) {
    if (!Number.isFinite(count) || count <= 0)
        return 0;
    if (!Number.isFinite(observedSec) || observedSec <= 0)
        return 0;
    const rate = count / observedSec; // 条/秒
    return 1 - Math.exp(-rate * Math.max(0, windowSec));
}
/**
 * 该样本是否可采信 (进自适应调阈的统计).
 *
 * 强信号 (quote/mention/negative) **永远**可采信 —— 引用与 @ 是有指向的行为, 群里再热闹也不减损其含义.
 * 弱信号 (short-window) 与沉默 (silence) 只在 `ambientP < ambientMax` 时采信.
 */
export function isHfSampleInformative(signal, ambientP, ambientMax) {
    if (signal == null)
        return false;
    if (HF_STRONG_SIGNALS.includes(signal))
        return true;
    return ambientP < ambientMax;
}
//# sourceMappingURL=heartflow-label.js.map