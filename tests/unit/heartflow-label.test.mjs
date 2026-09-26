// tests/unit/heartflow-label.test.mjs - v1.6.8 心流换标签 (纯函数 + 源级接线守卫)
//
// 为什么有这份测试 (2026-09-26 老板拍板):
//   旧 engaged 判据 = 「该群 600s 内出现过任意人类群消息」⇒ 活跃群恒为真 ⇒ 接话率饱和
//   ⇒ 每轮 sweep 都下调阈值 ⇒ 单调降到地板 ("不设下限就会一直降低"). 新判据锚在 **bot 自己发的那条**:
//     quote/mention/negative 为强信号 (永远可采信) · short-window/silence 为弱信号 (需反事实基线过滤).
//
// 覆盖:
//   1) classifyHfEngagement 优先级 (negative > quote > mention > short-window) 与窗边界
//   2) 弱信号不关窗 (留给更强信号升级) / 强信号关窗
//   3) 负词表只认硬词 (裸消息) vs 全表 (引用/@ 消息) —— 词表是**评估用**, 不是触发关键词
//   4) ⭐ 回归门: 饱和群 (ambientP≈1) 过滤后样本 0 ⇒ evalHfThreshold 不再下调 (跑飞被掐死)
//   5) hfAmbientP 泊松近似与退化输入
//   6) 源级守卫: bot_msg_id / engage_signal 列在 mysql.ts 的 ensureColumn + schema.sql 同块
//
// dist 缺失 (未 npm run build) → t.skip, 不红 (与 heartflow-learn.test.mjs 同惯例).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const read = (p) => fs.readFileSync(p, 'utf-8');
const src = (rel) => read(`${ROOT}/${rel}`);

let L = null;
let HL = null;
let loadErr = null;
try {
  L = await import(new URL('../../dist/inbound/heartflow-label.js', import.meta.url));
  HL = await import(new URL('../../dist/inbound/heartflow-learn.js', import.meta.url));
} catch (e) {
  loadErr = e;
}

function skipNoDist(t) {
  if (!L || !HL) t.skip(`dist/inbound/heartflow-label.js 缺失 (先 npm run build): ${loadErr?.message ?? ''}`);
}

// 测试内 fixture (与代码默认一一对应, 改默认=改测试 ⇒ 起 guard 作用)
const SENT = 1_000_000; // bot 发言时刻
const LABEL = 60; // labelWindowSec (生产实测选定: 见 HF_LEARNING_DEFAULTS 注释)
const OBS = 600; // observeWindowSec

const cand = (o) => ({ atSec: SENT, text: "", ...o });

// ===== 1. classifyHfEngagement: 优先级与窗边界 =====

test('classify: 引用 bot 那条 → engaged=1 / quote / 关窗', (t) => {
  skipNoDist(t);
  const r = L.classifyHfEngagement({
    sentAtSec: SENT,
    labelWindowSec: LABEL,
    observeWindowSec: OBS,
    candidates: [cand({ atSec: SENT + 10, quotesBot: true, text: "这个价格还有吗" })],
  });
  assert.deepEqual(r, { engaged: 1, signal: "quote", close: true });
});

test('classify: @bot → engaged=1 / mention / 关窗', (t) => {
  skipNoDist(t);
  const r = L.classifyHfEngagement({
    sentAtSec: SENT,
    labelWindowSec: LABEL,
    observeWindowSec: OBS,
    candidates: [cand({ atSec: SENT + 30, mentionsBot: true, text: "@小助理 在吗" })],
  });
  assert.deepEqual(r, { engaged: 1, signal: "mention", close: true });
});

test('classify: 引用与 @ 同时存在 → quote 优先 (引用带上下文, @ 可能只是叫人)', (t) => {
  skipNoDist(t);
  const r = L.classifyHfEngagement({
    sentAtSec: SENT,
    labelWindowSec: LABEL,
    observeWindowSec: OBS,
    candidates: [
      cand({ atSec: SENT + 5, mentionsBot: true, text: "@小助理" }),
      cand({ atSec: SENT + 20, quotesBot: true, text: "同问" }),
    ],
  });
  assert.equal(r.signal, "quote", 'quote 必须压过 mention');
});

test('classify: 负信号优先级最高 —— 即便同时有人引用, "别刷了"就是针对 bot 那条', (t) => {
  skipNoDist(t);
  const r = L.classifyHfEngagement({
    sentAtSec: SENT,
    labelWindowSec: LABEL,
    observeWindowSec: OBS,
    candidates: [
      cand({ atSec: SENT + 5, quotesBot: true, text: "这个有货" }),
      cand({ atSec: SENT + 40, quotesBot: true, text: "别刷了" }),
    ],
  });
  assert.deepEqual(r, { engaged: 0, signal: "negative", close: true }, 'negative 必须压过 quote');
});

test('classify: 提到 bot 且说负话 → negative/0 (提到 = 几乎可以肯定在说 bot)', (t) => {
  skipNoDist(t);
  const r = L.classifyHfEngagement({
    sentAtSec: SENT,
    labelWindowSec: LABEL,
    observeWindowSec: OBS,
    candidates: [cand({ atSec: SENT + 8, mentionsBot: true, text: "@小助理 别说话了" })],
  });
  assert.deepEqual(r, { engaged: 0, signal: "negative", close: true });
});

test('classify: 短窗内裸消息 → engaged=1 / short-window / **不关窗** (等更强信号升级)', (t) => {
  skipNoDist(t);
  const r = L.classifyHfEngagement({
    sentAtSec: SENT,
    labelWindowSec: LABEL,
    observeWindowSec: OBS,
    candidates: [cand({ atSec: SENT + 60, text: "哈哈" })],
  });
  assert.deepEqual(r, { engaged: 1, signal: "short-window", close: false }, '弱信号必须 close=false');
});

test('classify: 晚到的引用 (超出弱窗但在观察窗内) 仍是强正 —— 晚回也是真接话', (t) => {
  skipNoDist(t);
  const r = L.classifyHfEngagement({
    sentAtSec: SENT,
    labelWindowSec: LABEL,
    observeWindowSec: OBS,
    candidates: [cand({ atSec: SENT + 400, quotesBot: true, text: "刚看到" })],
  });
  assert.deepEqual(r, { engaged: 1, signal: "quote", close: true });
});

test('classify: 超出弱窗的裸消息不算弱信号 (无结论, 窗保持开着)', (t) => {
  skipNoDist(t);
  const r = L.classifyHfEngagement({
    sentAtSec: SENT,
    labelWindowSec: LABEL,
    observeWindowSec: OBS,
    candidates: [cand({ atSec: SENT + 200, text: "在的" })],
  });
  assert.deepEqual(r, { engaged: null, signal: null, close: false }, '弱窗外的裸消息不得算接话');
});

test('classify: 窗外消息一律忽略 (早于 sentAt 或晚于 observeWindowSec)', (t) => {
  skipNoDist(t);
  const early = L.classifyHfEngagement({
    sentAtSec: SENT,
    labelWindowSec: LABEL,
    observeWindowSec: OBS,
    candidates: [cand({ atSec: SENT - 1, quotesBot: true, text: "别刷了" })],
  });
  assert.equal(early.engaged, null, '早于 sentAt 的消息与本行无关');
  const late = L.classifyHfEngagement({
    sentAtSec: SENT,
    labelWindowSec: LABEL,
    observeWindowSec: OBS,
    candidates: [cand({ atSec: SENT + OBS + 1, quotesBot: true, text: "别刷了" })],
  });
  assert.equal(late.engaged, null, '超出观察窗的消息与本行无关');
});

test('classify: 窗边界含端点 (atSec == labelEnd 算弱信号; atSec == obsEnd 仍有效)', (t) => {
  skipNoDist(t);
  const atLabelEnd = L.classifyHfEngagement({
    sentAtSec: SENT,
    labelWindowSec: LABEL,
    observeWindowSec: OBS,
    candidates: [cand({ atSec: SENT + LABEL, text: "嗯" })],
  });
  assert.equal(atLabelEnd.signal, "short-window", 'atSec == sentAt+labelWindowSec 必须算窗内');
  const atObsEnd = L.classifyHfEngagement({
    sentAtSec: SENT,
    labelWindowSec: LABEL,
    observeWindowSec: OBS,
    candidates: [cand({ atSec: SENT + OBS, quotesBot: true, text: "回了" })],
  });
  assert.equal(atObsEnd.signal, "quote", 'atSec == sentAt+observeWindowSec 必须算窗内');
});

test('classify: 无候选 → 无结论 (engaged=null, 不关窗, 交给到期 silence)', (t) => {
  skipNoDist(t);
  const r = L.classifyHfEngagement({ sentAtSec: SENT, labelWindowSec: LABEL, observeWindowSec: OBS, candidates: [] });
  assert.deepEqual(r, { engaged: null, signal: null, close: false });
});

// ===== 2. 负词表 (评估用, 不是触发关键词) =====

test('负词: 裸消息只认极少数硬词 —— 软词 ("别说话了") 在裸消息上不判负 (误报代价高)', (t) => {
  skipNoDist(t);
  assert.equal(L.isHfNegativeText("别刷屏", false), true, '硬词在裸消息上判负');
  assert.equal(L.isHfNegativeText("别说话了", false), false, '软词在裸消息上**不**判负');
  assert.equal(L.isHfNegativeText("别说话了", true), true, '软词在引用/@ 消息上判负');
  const soft = L.classifyHfEngagement({
    sentAtSec: SENT,
    labelWindowSec: LABEL,
    observeWindowSec: OBS,
    candidates: [cand({ atSec: SENT + 30, text: "别说话了" })],
  });
  assert.equal(soft.signal, "short-window", '软负词在裸消息上退化为弱正, 不得判负');
});

test('负词: 归一化忽略空白与大小写', (t) => {
  skipNoDist(t);
  assert.equal(L.isHfNegativeText(" 别 刷 屏 ", false), true, '空白必须被归一化掉');
});

test('负词: 空文本/无命中不判负', (t) => {
  skipNoDist(t);
  assert.equal(L.isHfNegativeText("", true), false);
  assert.equal(L.isHfNegativeText("这个多少钱", true), false);
});

// ===== 3. asHfEngageSignal: 旧行必须被排除 =====

test('asHfEngageSignal: NULL/未知 → null (v1.6.8 前的旧错误标签不得进学习样本)', (t) => {
  skipNoDist(t);
  assert.equal(L.asHfEngageSignal(null), null, 'NULL 旧行 → null');
  assert.equal(L.asHfEngageSignal(undefined), null);
  assert.equal(L.asHfEngageSignal("legacy"), null, '未知值 → null');
  assert.equal(L.asHfEngageSignal("quote"), "quote");
  assert.equal(L.asHfEngageSignal("short-window"), "short-window");
  assert.equal(L.asHfEngageSignal("silence"), "silence");
});

test('HF_STRONG_SIGNALS = quote/mention/negative (只含强信号)', (t) => {
  skipNoDist(t);
  assert.deepEqual([...L.HF_STRONG_SIGNALS].sort(), ["mention", "negative", "quote"]);
});

// ===== 4. hfAmbientP + 可采信判定 =====

test('hfAmbientP: 泊松近似单调 + 退化输入归 0', (t) => {
  skipNoDist(t);
  assert.equal(L.hfAmbientP(0, 14 * 3600, 120), 0, '该时段无消息 → 0');
  assert.equal(L.hfAmbientP(-3, 14 * 3600, 120), 0, '负数 → 0');
  assert.equal(L.hfAmbientP(10, 0, 120), 0, '观察时长 0 → 0 (防除零)');
  assert.equal(L.hfAmbientP(Number.NaN, 14 * 3600, 120), 0, 'NaN → 0');
  // 口径: count = 该群**同一小时段**在 14 天里累计的入站人类消息数 ⇒ 每小时均条数 = count/14
  const lo = L.hfAmbientP(2 * 14, 14 * 3600, 120); // 该时段 ~2 条/小时: 冷清
  const hi = L.hfAmbientP(600, 14 * 3600, 120); // 该时段 ~43 条/小时: 话痨
  assert.ok(lo < hi, '消息越多 → ambientP 越大');
  assert.ok(hi > 0.5 && hi < 1, `话痨时段 ambientP 应 >0.5 且 <1 (实测 ${hi})`);
  assert.ok(lo < 0.5, `冷清时段 ambientP 应 <0.5 (实测 ${lo})`);
  // 钉住 ambientMax=0.5 的运行含义 (调这个旋钮时看这里): 约 21 条/小时 是该时段的分水岭
  assert.ok(L.hfAmbientP(300, 14 * 3600, 120) > 0.5, '该时段 ~21 条/小时 已过线 (会被判"本来就热闹")');
  assert.ok(L.hfAmbientP(200, 14 * 3600, 120) < 0.5, '该时段 ~14 条/小时 未过线 (弱信号仍可采信)');
});

test('isHfSampleInformative: 强信号永远采信; 弱信号要 ambientP < ambientMax', (t) => {
  skipNoDist(t);
  const MAX = 0.5;
  for (const s of ["quote", "mention", "negative"]) {
    assert.equal(L.isHfSampleInformative(s, 0.999, MAX), true, `${s} 在饱和群也必须采信`);
  }
  assert.equal(L.isHfSampleInformative("short-window", 0.99, MAX), false, '饱和群 short-window 不可采信');
  assert.equal(L.isHfSampleInformative("silence", 0.99, MAX), false, '饱和群 silence 不可采信');
  assert.equal(L.isHfSampleInformative("short-window", 0.1, MAX), true, '冷清群 short-window 可采信');
  assert.equal(L.isHfSampleInformative("silence", 0.1, MAX), true, '冷清群 silence 可采信');
  assert.equal(L.isHfSampleInformative(null, 0.1, MAX), false, '无信号 (旧行) 不可采信');
  assert.equal(L.isHfSampleInformative("short-window", MAX, MAX), false, '恰等于 ambientMax 不算小于 → 不可采信');
});

// ===== 5. ⭐ 回归门: 饱和群必须不再下调阈值 (跑飞的机制性根治) =====

test('回归门: 饱和群 (ambientP≈1) 过滤后样本 0 → evalHfThreshold 不下调', (t) => {
  skipNoDist(t);
  const P = { minSample: 10, lowEngageRate: 0.15, highEngageRate: 0.5, step: 0.05, bandMin: 0.5, bandMax: 0.9 };
  // 该群该时段本来就极热闹: 14 天里每个同一小时段都有 200 条人类消息 (= 200 条/小时)
  const ambientP = L.hfAmbientP(200 * 14, 14 * 3600, LABEL);
  assert.ok(ambientP > 0.5, `饱和群 ambientP 必须过线 (实测 ${ambientP})`);

  // 模拟旧闭环在饱和群上攒出的样本: 全部靠"窗内有人说话"判 1 (40/40 = 接话率 1.0)
  const saturated = Array.from({ length: 40 }, () => ({ engaged: 1, engage_signal: "short-window" }));

  // 旧行为 (不做反事实过滤): 接话率 1.0 ≥ highEngageRate → 下调 —— 这就是跑飞
  const oldEval = HL.evalHfThreshold({
    stats: { total: saturated.length, engaged: saturated.filter((s) => s.engaged === 1).length },
    learnedThreshold: 0.6,
    baseThreshold: 0.6,
    params: P,
  });
  assert.equal(oldEval.changed, true);
  assert.equal(oldEval.direction, "down", '无过滤时饱和群必然下调 (旧行为复现)');

  // 新行为: 逐条按 isHfSampleInformative 过滤 → 0 条可采信 → 样本不足 → 不动
  const usable = saturated.filter((s) => L.isHfSampleInformative(L.asHfEngageSignal(s.engage_signal), ambientP, 0.5));
  assert.equal(usable.length, 0, '饱和群的 short-window 样本必须被全部跳过');
  const newEval = HL.evalHfThreshold({
    stats: { total: usable.length, engaged: usable.filter((s) => s.engaged === 1).length },
    learnedThreshold: 0.6,
    baseThreshold: 0.6,
    params: P,
  });
  assert.deepEqual(newEval, { changed: false, reason: "insufficient-sample" }, '新标签下饱和群不再下调 (跑飞被掐死)');
});

test('回归门: 冷清群 (ambientP 低) 样本照常参与学习 (别把学习一起掐死)', (t) => {
  skipNoDist(t);
  const P = { minSample: 10, lowEngageRate: 0.15, highEngageRate: 0.5, step: 0.05, bandMin: 0.5, bandMax: 0.9 };
  const ambientP = L.hfAmbientP(2 * 14, 14 * 3600, LABEL); // 该时段一天才 2 条
  assert.ok(ambientP < 0.5, `冷清群 ambientP 应 <0.5 (实测 ${ambientP})`);
  // 冷清群里 20 条全部沉默 (发了没人理) → 接话率 0 → 应上调 (少说精选)
  const samples = Array.from({ length: 20 }, () => ({ engaged: 0, engage_signal: "silence" }));
  const usable = samples.filter((s) => L.isHfSampleInformative(L.asHfEngageSignal(s.engage_signal), ambientP, 0.5));
  assert.equal(usable.length, 20, '冷清群样本必须全部保留');
  const res = HL.evalHfThreshold({
    stats: { total: usable.length, engaged: 0 },
    learnedThreshold: 0.6,
    baseThreshold: 0.6,
    params: P,
  });
  assert.equal(res.changed, true);
  assert.equal(res.direction, "up", '冷清群没人理 → 上调阈值 (少说精选)');
});

test('回归门: 新列落地 (mysql.ts ensureColumn + schema.sql 同块), 列值域与 classify 信号一致', (t) => {
  const m = src('src/storage/db/mysql.ts');
  assert.match(
    m,
    /ensureColumn\(pool,\s*"wpp_hf_ledger",\s*"bot_msg_id"/,
    'bot_msg_id 必须走 ensureColumn (生产表已存在, CREATE IF NOT EXISTS 改不到)',
  );
  assert.match(
    m,
    /ensureColumn\(pool,\s*"wpp_hf_ledger",\s*"engage_signal"/,
    'engage_signal 必须走 ensureColumn',
  );
  assert.match(m, /CREATE TABLE IF NOT EXISTS wpp_hf_ledger[\s\S]{0,1200}?bot_msg_id VARCHAR\(128\) NULL/,
    'mysql.ts 的 wpp_hf_ledger CREATE 块内必须含 bot_msg_id 列');
  const s = read(`${ROOT}/db/schema.sql`);
  assert.match(s, /CREATE TABLE IF NOT EXISTS wpp_hf_ledger[\s\S]{0,1200}?bot_msg_id VARCHAR\(128\) NULL/,
    'db/schema.sql 的 wpp_hf_ledger 块必须同步含 bot_msg_id (dev/prod 一致性)');
  assert.match(s, /engage_signal VARCHAR\(24\) NULL/, 'db/schema.sql 必须含 engage_signal');
  assert.doesNotMatch(s, /ALTER TABLE/i, 'db/schema.sql 不许出现 ALTER (schema-sql-split 断言)');
});

test('回归门: 标签不再挂在"任意人类消息"上 —— handler 必须先取开窗 (bot 自己那条) 再判定', (t) => {
  skipNoDist(t);
  const h = src('src/inbound/handler.ts');
  assert.match(h, /getOpenHfWindow\(/, 'handler 必须按群取 bot 自己的开窗 (旧标签的根因就是不看这个)');
  assert.match(h, /void markHfGroupEngaged\(/, 'markHfGroupEngaged 触点必须保留 (部署门断言字面量)');
  assert.match(h, /isQuotingBotReply\(/, 'handler 必须判定"引用的正是 bot 那条"');
  assert.match(h, /extractQuotedMsgId\(/, 'handler 必须解析被引用消息 id');
  // dispatcher 必须把 labelWindowSec 交给落账 (弱信号窗与观察窗解耦)
  const d = src('src/dispatch/dispatcher.ts');
  assert.match(d, /labelWindowSec/, 'dispatcher 必须把 labelWindowSec 传给 persistHfSendOutcome');
  assert.match(d, /HF_LEARNING_DEFAULTS\.observeWindowSec/, '既有点位不许动 (部署门断言字面量)');
  // 学习侧: 反事实基线过滤必须接线到 sweep
  const hl = src('src/inbound/heartflow-learn.ts');
  assert.match(hl, /isHfSampleInformative\(/, 'sweep 必须按可采信判定过滤样本');
  assert.match(hl, /hfAmbientP\(/, 'sweep 必须算反事实基线');
  assert.match(hl, /listHfGroupMsgHourBuckets\(/, '反事实基线素材必须来自同小时段聚合');
  assert.match(hl, /pruneOpenWindows\(/, 'sweep 必须清理内存开窗 (防泄漏)');
});

test('回归门: 负词表是**评估用**的, 不得出现在触发路径 (老板 2026-09-26: 不许用固定关键词触发)', (t) => {
  skipNoDist(t);
  // 负信号判定只能被 heartflow-label.ts (评估侧) 与 handler 的候选构造用到; heartflow.ts 的触发/闸门路径不得引用
  const hf = src('src/inbound/heartflow.ts');
  assert.doesNotMatch(hf, /HF_NEGATIVE_PHRASES|HF_HARD_NEGATIVE_PHRASES|isHfNegativeText/, '触发/闸门路径不得引用负词表');
  const lab = src('src/inbound/heartflow-label.ts');
  assert.match(lab, /只用于给 bot 自己的发言打分/, 'heartflow-label.ts 必须写明"评估用/不是触发关键词"');
});

test('回归门: 阈值语义键不许丢 (observeWindowSec 保持; labelWindowSec/ambientMax 三处齐)', (t) => {
  const h = src('src/inbound/heartflow.ts');
  for (const k of ["observeWindowSec", "labelWindowSec", "ambientMax"]) {
    const n = (h.match(new RegExp(`\\b${k}\\b`, "g")) ?? []).length;
    assert.ok(n >= 3, `${k} 必须在接口 + HF_LEARNING_DEFAULTS + resolveHfLearning 三处出现 (实测 ${n})`);
  }
  assert.match(h, /observeWindowSec:\s*600/, 'observeWindowSec 必须保持 600 (dispatcher 字面量被部署门断言)');
  assert.match(h, /labelWindowSec:\s*60/, 'labelWindowSec 默认 60 (实测选死区中点, 见 HF_LEARNING_DEFAULTS 注释)');
  assert.match(h, /ambientMax:\s*0\.5/, 'ambientMax 默认 0.5');
});
