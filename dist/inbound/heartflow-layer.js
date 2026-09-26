// src/inbound/heartflow-layer.ts - v1.8.0 心流分层学习 (P2): 群 × 时段
//
// 老板 2026-09-26 拍板的 P2 定义是「群×时段×话题, n≥k 才生效, 不够回落画像先验(不是地板), shadow 先只记录」。
// 本批**只做群 × 时段** —— 话题层的样本在"每群每天 ~4 条 bot 发言"的量级下长期 <k, 而且会让 `why` 的
// 归因链变成三层不可解释 (见 CHANGELOG「与计划的偏差与取舍」)。`layer_kind` 字段与 `'topic'` 槽位已预留。
//
// 三条不可动摇的设计 (都是实测踩出来的, 不是偏好):
//
//  1. **每轮全量重算, 绝不做增量累加**。sweep 每 300s 一次; 若把"新收敛的行"累加进桶, 同一批行会被重复
//     计入 ⇒ n 一小时虚涨 12 倍 ⇒ minSamples 门槛形同虚设, 而且**永远无法自愈**。重算是幂等的: 同样的
//     输入永远得到同样的输出, 改口径/改分段后几个 sweep 周期内自动收敛, 不需要数据迁移。
//  2. **窗口上限 windowDays (默认 60)**。没有上限时桶内速率会被 60 天前的旧样本永久锁死, "晚段更受欢迎"
//     这类结论再也不会随近况变化 —— 这是与"累加"并列的第二个不可逆点。
//  3. **不新增冷却**。分层每轮从同一批重算 ⇒ 天然不累积、跑不飞; 判定直接复用 evalHfThreshold 的**死区**
//     (接话率落在 (lowEngageRate, highEngageRate) 之间就不动) 当防抖, **不要写第二套参数**。
//
// judge 热路径**零 DB 读**: 段统计常驻内存 (_layerStats), 由 sweep 每轮重算后填充; 判定只看内存。
//
// 本模块同时托管「每群×每小时入站人类消息数」的**唯一取数入口** loadHfGroupHourCounts:
//   分层的本底过滤与 P0 反事实基线用的是同一条聚合查询 —— 放在这里是因为 heartflow-learn 反向依赖本模块
//   (拿分层决策), 若放 learn 里再被本模块 import 就成环。缓存 120s ⇒ 同一轮 sweep 的两个 pass 共用一次 IO。
import { resolveHfLearning, isHfGroupAllowed } from "./heartflow.js";
import { asHfEngageSignal, hfAmbientP, isHfSampleInformative } from "./heartflow-label.js";
import { hfLocalHour } from "./heartflow-budget.js";
import { listHfClosedSince, listHfGroupMsgHourBuckets, upsertHfLayerStat, listHfLayerStats } from "../storage/db/index.js";
import { debug, warn } from "../core/logger.js";
/**
 * 本底基线回看天数 (与 P0 的反事实基线同源, 全插件一个数)。
 * 导出给 heartflow-learn 用: 两个 pass 必须用**同一个** lookback 与同一个 labelWindowSec, 否则同一条样本
 * 会在调阈侧"可采信"、在分层侧"不可采信"(或被反过来), `/heartflow report` 的 n 与 `why` 的 n 就永远对不上。
 */
export const HF_AMBIENT_LOOKBACK_DAYS = 14;
/** 段统计只分"日时段"一种 (话题层预留未启用) */
export const HF_LAYER_KIND = "daypart";
/** 分段数上限 (超过一律回落到默认四段, 防止有人配出 24 段让表爆掉) */
const HF_LAYER_MAX_BUCKETS = 6;
/** 每群×每小时入站量查询的缓存时长 (秒): 同一轮 sweep 的调阈 pass 与分层 pass 共用一次 IO */
const HF_HOUR_COUNTS_TTL_SEC = 120;
/** 落库行数上限 (一次 sweep 最多写这么多行; 与适配器的 LIMIT 钳制同档)。
 *  v1.9.0: 导出给 `/heartflow report` 复用 —— 两处取同一批已收敛样本, 上限必须一致, 否则
 *  报告里的"接话率可用 N 条"与 sweep 实际拿去调阈的样本数会对不上。 */
export const HF_LAYER_DB_ROW_CAP = 5000;
/**
 * 默认档。`apply:false` 是**刻意的**: 分层要先当一段时间的影子, 让老板从 `/heartflow report` 看清
 * "若生效会怎么变"之后再手动开; `allowLoosen:false` 同理 (放开"更主动"的权利只需要他一句话)。
 */
export const HF_LAYERED_DEFAULTS = {
    enabled: true,
    apply: false,
    allowLoosen: false,
    minSamples: 30,
    windowDays: 60,
    buckets: [
        [0, 7],
        [7, 12],
        [12, 18],
        [18, 24],
    ],
};
const defaultBuckets = () => HF_LAYERED_DEFAULTS.buckets.map(([s, e]) => [s, e]);
/**
 * 分段定义校验: 越界 / 倒置 / 重叠 / 非整数 / 超上限 ⇒ **整体**回落默认。
 * 整体回落而不是"逐段丢弃": 半套分段会让 `layer_key` 的语义变得不可预测 (`"3-9"` 是老板配的还是残留的?)。
 */
export function normalizeHfBuckets(raw) {
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > HF_LAYER_MAX_BUCKETS)
        return defaultBuckets();
    const out = [];
    for (const item of raw) {
        if (!Array.isArray(item) || item.length !== 2)
            return defaultBuckets();
        const s = Number(item[0]);
        const e = Number(item[1]);
        if (!Number.isInteger(s) || !Number.isInteger(e))
            return defaultBuckets();
        if (s < 0 || e > 24 || s >= e)
            return defaultBuckets();
        out.push([s, e]);
    }
    out.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < out.length; i += 1) {
        const prev = out[i - 1];
        const cur = out[i];
        if (prev && cur && cur[0] < prev[1])
            return defaultBuckets();
    }
    return out;
}
export function resolveHfLayeredCfg(cfg) {
    const p = cfg?.layered;
    const D = HF_LAYERED_DEFAULTS;
    return {
        enabled: p?.enabled ?? D.enabled,
        apply: p?.apply ?? D.apply,
        allowLoosen: p?.allowLoosen ?? D.allowLoosen,
        minSamples: Math.max(1, Math.floor(p?.minSamples ?? D.minSamples)),
        windowDays: Math.max(1, Math.floor(p?.windowDays ?? D.windowDays)),
        buckets: normalizeHfBuckets(p?.buckets),
    };
}
/** 本地小时 → 段名 (如 "18-24"); 未被任何段覆盖 ⇒ null (该样本不进任何桶, 不报错) */
export function hfLayerKeyFor(hour, buckets) {
    if (!Number.isFinite(hour))
        return null;
    const h = Math.floor(hour);
    for (const [s, e] of buckets)
        if (h >= s && h < e)
            return `${s}-${e}`;
    return null;
}
const round4 = (v) => Math.round(v * 10000) / 10000;
/**
 * **纯函数**: 一批已收敛样本 → 每群每段的 (n, engaged)。
 *
 * 取舍逐条写死, 免得日后有人"顺手放宽":
 *  - `engage_signal` 为 null 的行**一律丢弃** (v1.6.8 之前落的行没有信号列, 那些正是旧错误标签);
 *  - `sent_at` 缺失/非法的行丢弃 (无法归段);
 *  - **逐样本**用它**自己那一小时**的 ambientP 过滤 (不是段平均值 —— 段内 23 点冷清、18 点热闹,
 *    用平均会把 23 点的弱样本放进统计);
 *  - 强信号 (quote/mention/negative/veto) 不受本底过滤 (isHfSampleInformative 内已实现);
 *  - 空段也输出 n=0 的行 (前端要显示进度条, 不能"没数据就不显示")。
 */
export function aggregateHfLayerStats(samples, opts) {
    const acc = new Map();
    for (const s of samples) {
        const gid = s?.group_id;
        if (!gid)
            continue;
        if (opts.groupFilter && !opts.groupFilter(gid))
            continue;
        const signal = asHfEngageSignal(s.engage_signal ?? null);
        if (signal == null)
            continue;
        const at = Number(s.sent_at);
        if (!Number.isFinite(at) || at <= 0)
            continue;
        const hour = hfLocalHour(at);
        const key = hfLayerKeyFor(hour, opts.buckets);
        if (key == null)
            continue;
        const ap = opts.ambientPByGroupHour.get(`${gid}|${hour}`) ?? 0;
        if (!isHfSampleInformative(signal, ap, opts.ambientMax))
            continue;
        let byKey = acc.get(gid);
        if (!byKey) {
            byKey = new Map();
            acc.set(gid, byKey);
        }
        const cell = byKey.get(key) ?? { n: 0, engaged: 0 };
        cell.n += 1;
        if (Number(s.engaged) === 1)
            cell.engaged += 1;
        byKey.set(key, cell);
    }
    const groups = new Set(acc.keys());
    for (const g of opts.alsoGroups ?? []) {
        if (!g)
            continue;
        if (opts.groupFilter && !opts.groupFilter(g))
            continue;
        groups.add(g);
    }
    const rows = [];
    for (const gid of [...groups].sort()) {
        const byKey = acc.get(gid);
        for (const [s, e] of opts.buckets) {
            const key = `${s}-${e}`;
            const cell = byKey?.get(key);
            let amb = 0;
            for (let h = s; h < e; h += 1) {
                const v = opts.ambientPByGroupHour.get(`${gid}|${h}`);
                if (v != null && Number.isFinite(v) && v > amb)
                    amb = v;
            }
            rows.push({
                group_id: gid,
                layer_kind: HF_LAYER_KIND,
                layer_key: key,
                n: cell?.n ?? 0,
                engaged: cell?.engaged ?? 0,
                ambient_p: round4(amb),
                window_start: opts.windowStart,
            });
        }
    }
    return rows;
}
// ---------------------------------------------------------------- 内存缓存 (judge 热路径唯一依赖)
/** `${accountId}:${groupId}` → (layerKey → 行) */
const _layerStats = new Map();
/** `${accountId}:${groupId}:${kind}:${key}` → 上次**成功写库**的内容签名 (diff 用; 只在真写成功后更新) */
const _written = new Map();
/** 每群×每小时入站量 (见 loadHfGroupHourCounts) */
const _hourCounts = new Map();
const ck = (accountId, groupId) => `${accountId}:${groupId}`;
const wk = (accountId, r) => `${accountId}:${r.group_id}:${r.layer_kind}:${r.layer_key}`;
const sigOf = (r) => `${r.n}|${r.engaged}|${r.ambient_p ?? ""}|${r.window_start}`;
function putRow(accountId, r) {
    const k = ck(accountId, r.group_id);
    let m = _layerStats.get(k);
    if (!m) {
        m = new Map();
        _layerStats.set(k, m);
    }
    m.set(r.layer_key, r);
}
/** 当前时刻落在哪一段 (返回该段的行; 无数据/未覆盖 ⇒ null) */
export function getHfLayerStat(accountId, groupId, nowSec, buckets) {
    const m = _layerStats.get(ck(accountId, groupId));
    if (!m)
        return null;
    const key = hfLayerKeyFor(hfLocalHour(nowSec), buckets);
    if (key == null)
        return null;
    const stat = m.get(key);
    return stat ? { key, stat } : null;
}
/** 该群有缓存的段名清单 (只给诊断/测试用) */
export function hfLayerKeysCached(accountId, groupId) {
    return [...(_layerStats.get(ck(accountId, groupId))?.keys() ?? [])].sort();
}
export function hfLayerCacheSize() {
    let n = 0;
    for (const m of _layerStats.values())
        n += m.size;
    return n;
}
/** 测试用: 清掉全部内存态 (统计 + 写库签名 + 入站量缓存) */
export function resetHfLayerCache() {
    _layerStats.clear();
    _written.clear();
    _hourCounts.clear();
}
/** 启动预热: 把库里已有的段统计读进内存 (judge 热路径零 DB 读的前提) */
export async function loadHfLayerStats(accountId) {
    const rows = await listHfLayerStats(accountId);
    const prefix = `${accountId}:`;
    for (const k of [..._layerStats.keys()])
        if (k.startsWith(prefix))
            _layerStats.delete(k);
    for (const k of [..._written.keys()])
        if (k.startsWith(prefix))
            _written.delete(k);
    for (const r of rows) {
        putRow(accountId, {
            group_id: r.group_id,
            layer_kind: r.layer_kind,
            layer_key: r.layer_key,
            n: r.n,
            engaged: r.engaged,
            ambient_p: r.ambient_p,
            window_start: r.window_start,
        });
        _written.set(wk(accountId, r), sigOf(r));
    }
    return rows.length;
}
// ---------------------------------------------------------------- 每群×每小时入站量 (唯一取数入口)
/**
 * 每群×每小时**入站人类**消息数 → `Map<"group|hour", n>`。
 * 调阈侧 (loadAmbientByGroup) 与分层侧共用同一条聚合查询, 结果缓存 120s ⇒ 一轮 sweep 只查一次。
 * 失败**向上抛** (让调用方各自 warn + 决定降级策略), 成功才写缓存 (失败不留脏缓存)。
 */
export async function loadHfGroupHourCounts(accountId, nowSec) {
    const hit = _hourCounts.get(accountId);
    if (hit && nowSec - hit.atSec < HF_HOUR_COUNTS_TTL_SEC)
        return hit.counts;
    const localOffsetSec = -new Date(nowSec * 1000).getTimezoneOffset() * 60;
    const buckets = await listHfGroupMsgHourBuckets(accountId, nowSec - HF_AMBIENT_LOOKBACK_DAYS * 86400, localOffsetSec);
    const counts = new Map();
    for (const b of buckets)
        counts.set(`${b.group_id}|${b.hour}`, b.n);
    _hourCounts.set(accountId, { atSec: nowSec, counts });
    return counts;
}
/** `Map<"group|hour", n>` → `Map<"group|hour", ambientP>` (公式与调阈侧同一处, 不复制第二份) */
export function ambientPFromHourCounts(counts, labelWindowSec) {
    const out = new Map();
    for (const [k, n] of counts)
        out.set(k, hfAmbientP(n, HF_AMBIENT_LOOKBACK_DAYS * 3600, labelWindowSec));
    return out;
}
// ---------------------------------------------------------------- IO 入口 (sweep 每轮一次)
/**
 * 重算并落库分层统计。返回**实际写库的行数** (0 = 全部无变化, 这是稳态下的正常结果)。
 *
 * 调用位置: `runHeartflowSweep` 里 `maybeGenerateHfGroupProfiles` 之后、`if (!L.enabled) return` **之前**
 * —— 分层统计与画像同级, 不依赖"自动调阈"开关 (老板可能关掉自动调阈但仍要看分层观测)。
 */
export async function maybeRecomputeHfLayerStats(accountId, cfg, nowSec) {
    const LAY = resolveHfLayeredCfg(cfg);
    if (!LAY.enabled)
        return 0;
    const LRN = resolveHfLearning(cfg);
    const windowStart = nowSec - LAY.windowDays * 86400;
    const samples = await listHfClosedSince(accountId, windowStart, HF_LAYER_DB_ROW_CAP);
    if (samples.length >= HF_LAYER_DB_ROW_CAP) {
        warn(`[WPP HF] 分层样本触顶 (${HF_LAYER_DB_ROW_CAP} 行, 窗口 ${LAY.windowDays} 天) ⇒ 统计可能偏高; 考虑缩小 windowDays`);
    }
    // 本底取数失败不该拖垮统计本身: 退化成"不过滤本底"(= v1.6.8 之前的旧行为), 如实 warn 出来。
    let ambientPByGroupHour = new Map();
    try {
        ambientPByGroupHour = ambientPFromHourCounts(await loadHfGroupHourCounts(accountId, nowSec), LRN.labelWindowSec);
    }
    catch (e) {
        warn(`[WPP HF] 分层本底取数失败 ⇒ 本轮不做本底过滤: ${e?.message ?? e}`);
    }
    const rows = aggregateHfLayerStats(samples, {
        buckets: LAY.buckets,
        ambientPByGroupHour,
        ambientMax: LRN.ambientMax,
        windowStart,
        groupFilter: (g) => isHfGroupAllowed(g, cfg),
        alsoGroups: [..._layerStats.keys()].filter((k) => k.startsWith(`${accountId}:`)).map((k) => k.slice(accountId.length + 1)),
    });
    for (const r of rows)
        putRow(accountId, r);
    let wrote = 0;
    for (const r of rows) {
        const k = wk(accountId, r);
        const sig = sigOf(r);
        if (_written.get(k) === sig)
            continue;
        await upsertHfLayerStat({ account_id: accountId, ...r });
        _written.set(k, sig);
        wrote += 1;
    }
    if (wrote > 0)
        debug(`[WPP HF] 分层统计写入 ${wrote}/${rows.length} 行 (account=${accountId})`);
    return wrote;
}
//# sourceMappingURL=heartflow-layer.js.map