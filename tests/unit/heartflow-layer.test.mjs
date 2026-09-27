// tests/unit/heartflow-layer.test.mjs — v1.8.0 分层学习 (群 × 时段) 完整性测试
//
// 这一批最容易"假绿"的三处, 各配一条**行为级**回归门 (不是文本断言):
//   1. 分层桶**必须是每轮全量重算**, 不能累加 —— 用假适配器数 upsert 调用次数:
//      同一批输入连跑两次, 第二次必须 0 写。累加实现会在第二次又写一遍 (n 变成两倍)。
//   2. veto 必须真能落库读回 (`veto` 漏进值域 ⇒ asHfEngageSignal 返回 null ⇒ 静默无效)。
//   3. 读侧判定必须**纯内存** (judge 热路径零 DB IO): 源级断言体内无 await / 无 SQL。
//
// 真实日期/生产数字一律不进本文件 (公开仓红线); 样本全是构造的。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const read = (p) => fs.readFileSync(p, 'utf-8');
const src = (rel) => read(`${ROOT}/${rel}`);

const DIST = await import(new URL(`file://${ROOT}/dist/inbound/heartflow-layer.js`).href).catch(() => null);
const LEARN = await import(new URL(`file://${ROOT}/dist/inbound/heartflow-learn.js`).href).catch(() => null);
const FACTORY = await import(new URL(`file://${ROOT}/dist/storage/db/factory.js`).href).catch(() => null);

/** dist 未构建时跳过行为级断言 (文本断言仍跑) —— 与既有测试同惯例 */
const skipNoDist = (t) => {
  if (!DIST || !LEARN || !FACTORY) {
    t.skip('dist 未构建 (先 npm run build)');
    return true;
  }
  return false;
};

const CFG = (layered = {}, learning = {}) => ({
  replyThreshold: 0.6,
  learning: {
    enabled: true,
    minSample: 10,
    lowEngageRate: 0.15,
    highEngageRate: 0.5,
    step: 0.05,
    bandMin: 0.5,
    bandMax: 0.9,
    ...learning,
  },
  layered: { minSamples: 3, apply: false, windowDays: 60, ...layered },
});

/** 本地时刻 → unix 秒 (用本地字段构造, 与 hfLocalHour 同语义) */
const atLocal = (h, min = 0) => Math.floor(new Date(2026, 8, 20, h, min, 0).getTime() / 1000);
const NOW_20 = atLocal(20, 30);

// ===== 1. 纯函数: 分段 =====

test('hfLayerKeyFor: 段边界 (左闭右开)', (t) => {
  if (skipNoDist(t)) return;
  const B = DIST.normalizeHfBuckets(undefined);
  assert.deepEqual(B, [[0, 7], [7, 12], [12, 18], [18, 24]], '默认四段');
  assert.equal(DIST.hfLayerKeyFor(0, B), '0-7', '0 点归 0-7');
  assert.equal(DIST.hfLayerKeyFor(6, B), '0-7');
  assert.equal(DIST.hfLayerKeyFor(7, B), '7-12', '7 点归下一段 (右开)');
  assert.equal(DIST.hfLayerKeyFor(18, B), '18-24');
  assert.equal(DIST.hfLayerKeyFor(23, B), '18-24');
  // 24 点不存在 (0-23); 越界与非法输入返回 null (不 throw)
  assert.equal(DIST.hfLayerKeyFor(24, B), null);
  assert.equal(DIST.hfLayerKeyFor(Number.NaN, B), null);
  assert.equal(DIST.hfLayerKeyFor(3, [[9, 17]]), null, '未被任何段覆盖 ⇒ null (该样本不进任何桶)');
});

test('normalizeHfBuckets: 非法输入整体回落默认 (不半套生效)', (t) => {
  if (skipNoDist(t)) return;
  const D = [[0, 7], [7, 12], [12, 18], [18, 24]];
  for (const bad of [
    [[7, 3]],                       // 倒置
    [[0, 7], [6, 12]],              // 重叠
    [[0, 25]],                      // 越界
    [[-1, 7]],                      // 负数
    [[1.5, 7]],                     // 非整数
    [[0, 7, 9]],                    // 不是二元组
    [],                             // 空
    [[0, 3], [3, 6], [6, 9], [9, 12], [12, 15], [15, 18], [18, 21]], // 超 6 段
    'x', 3, null,                   // 非数组 (null 例外: 缺省回落默认)
  ]) {
    assert.deepEqual(DIST.normalizeHfBuckets(bad), D, `非法输入必须整体回落默认: ${JSON.stringify(bad)}`);
  }
  assert.deepEqual(DIST.normalizeHfBuckets(null), D, 'null ⇒ 默认 (与 undefined 同)');
  assert.deepEqual(DIST.normalizeHfBuckets([[18, 24], [0, 7]]), [[0, 7], [18, 24]], '合法输入按起始排序');
});

// ===== 2. 纯函数: 聚合取舍 =====

test('aggregateHfLayerStats: 信号/时刻/本底/白名单四道取舍', (t) => {
  if (skipNoDist(t)) return;
  const B = DIST.normalizeHfBuckets(undefined);
  const opts = (ambient = new Map(), extra = {}) => ({
    buckets: B,
    ambientPByGroupHour: ambient,
    ambientMax: 0.5,
    windowStart: NOW_20 - 60 * 86400,
    ...extra,
  });
  const rows = DIST.aggregateHfLayerStats(
    [
      { group_id: 'gA', engaged: 0, engage_signal: 'silence', sent_at: atLocal(20) },
      { group_id: 'gA', engaged: 1, engage_signal: 'short-window', sent_at: atLocal(21) },
      { group_id: 'gA', engaged: 1, engage_signal: null, sent_at: atLocal(20) },        // 旧行 ⇒ 丢
      { group_id: 'gA', engaged: 1, engage_signal: 'veto', sent_at: 0 },                 // 无时刻 ⇒ 丢
      { group_id: 'gA', engaged: 1, engage_signal: 'bogus', sent_at: atLocal(20) },      // 未知信号 ⇒ 丢
      { group_id: 'gB', engaged: 1, engage_signal: 'quote', sent_at: atLocal(20) },      // 强信号
      { group_id: 'gB', engaged: 0, engage_signal: 'short-window', sent_at: atLocal(20) }, // 弱+本底高 ⇒ 丢
      { group_id: 'gC', engaged: 0, engage_signal: 'silence', sent_at: atLocal(3) },     // 未被段覆盖? (有覆盖)
    ],
    opts(
      new Map([
        ['gB|20', 0.9], // 本底很热闹: 弱信号不可采信, 强信号照样算
      ]),
      { groupFilter: (g) => g !== 'gC', alsoGroups: ['gD'] },
    ),
  );
  const cell = (g, k) => rows.find((r) => r.group_id === g && r.layer_key === k);
  assert.equal(cell('gA', '18-24').n, 2, 'gA 18-24: silence + short-window 两条 (旧行/无时刻/未知信号被丢)');
  assert.equal(cell('gA', '18-24').engaged, 1);
  assert.equal(cell('gA', '0-7').n, 0, '空段也要出行 (前端要显示进度)');
  assert.equal(cell('gB', '18-24').n, 1, 'gB 本底 0.9: 弱信号被丢, 强信号(quote)留下');
  assert.equal(cell('gB', '18-24').engaged, 1);
  assert.equal(cell('gB', '18-24').ambient_p, 0.9, '段本底 = 该段各小时 ambientP 最大值');
  assert.equal(cell('gC', '0-7'), undefined, '白名单外的群整群不出行');
  assert.ok(cell('gD', '0-7'), 'alsoGroups 的空群也要出行 (n=0)');
  assert.equal(cell('gD', '0-7').n, 0);
  assert.equal(rows[0].layer_kind, 'daypart');
  assert.equal(rows[0].window_start, opts().windowStart);
});

test('aggregateHfLayerStats: veto 记 engaged=0 且不受本底过滤', (t) => {
  if (skipNoDist(t)) return;
  const rows = DIST.aggregateHfLayerStats(
    [{ group_id: 'gA', engaged: 0, engage_signal: 'veto', sent_at: atLocal(9) }],
    {
      buckets: DIST.normalizeHfBuckets(undefined),
      ambientPByGroupHour: new Map([['gA|9', 0.99]]), // 极热闹时段
      ambientMax: 0.5,
      windowStart: 0,
    },
  );
  const c = rows.find((r) => r.layer_key === '7-12');
  assert.equal(c.n, 1, 'veto 是人工强负样本, 恒可采信');
  assert.equal(c.engaged, 0);
});

// ===== 3. 幂等 (核心回归门: 防"累加桶"复活) =====

test('maybeRecomputeHfLayerStats: 每轮全量重算 —— 同一批输入连跑两次, 第二次 0 写', async (t) => {
  if (skipNoDist(t)) return;
  const writes = [];
  const SAMPLES = [
    { group_id: 'gA', engaged: 0, engage_signal: 'silence', sent_at: atLocal(20) },
    { group_id: 'gA', engaged: 0, engage_signal: 'silence', sent_at: atLocal(21) },
    { group_id: 'gA', engaged: 1, engage_signal: 'short-window', sent_at: atLocal(22) },
  ];
  FACTORY.setAdapterForTest({
    async listHfClosedSince() {
      return SAMPLES;
    },
    async listHfGroupMsgHourBuckets() {
      return [];
    },
    async upsertHfLayerStat(r) {
      writes.push(r);
    },
    async listHfLayerStats() {
      return [];
    },
  });
  LEARN.resetLearnedThresholdCache();
  try {
    const n1 = await DIST.maybeRecomputeHfLayerStats('acct', CFG(), NOW_20);
    const n2 = await DIST.maybeRecomputeHfLayerStats('acct', CFG(), NOW_20);
    assert.ok(n1 > 0, '首轮必须写库 (至少 4 段有变化)');
    assert.equal(writes.length, n1, '写库次数 === 返回值');
    assert.equal(n2, 0, '第二轮必须 0 写: 累加实现会再写一遍 (n 翻倍) ⇒ 这条就是门');
    const eighteen = writes.find((w) => w.layer_key === '18-24');
    assert.equal(eighteen.n, 3, '18-24 段 n=3 (三个样本全落在 20/21/22 点)');
    assert.equal(eighteen.engaged, 1);
    assert.equal(eighteen.account_id, 'acct');
    assert.equal(eighteen.layer_kind, 'daypart');
    // 缓存里也是重算值 (judge 读侧与库一致)
    const cached = DIST.getHfLayerStat('acct', 'gA', NOW_20, DIST.normalizeHfBuckets(undefined));
    assert.equal(cached.key, '18-24');
    assert.equal(cached.stat.n, 3);
  } finally {
    FACTORY.resetAdapter();
  }
});

test('maybeRecomputeHfLayerStats: enabled=false ⇒ 完全不动 (连查询都不发)', async (t) => {
  if (skipNoDist(t)) return;
  let queried = 0;
  FACTORY.setAdapterForTest({
    async listHfClosedSince() {
      queried += 1;
      return [];
    },
    async listHfGroupMsgHourBuckets() {
      return [];
    },
    async upsertHfLayerStat() {},
    async listHfLayerStats() {
      return [];
    },
  });
  LEARN.resetLearnedThresholdCache();
  try {
    const n = await DIST.maybeRecomputeHfLayerStats('acct', CFG({ enabled: false }), NOW_20);
    assert.equal(n, 0);
    assert.equal(queried, 0, '开关关掉就不该打 DB');
  } finally {
    FACTORY.resetAdapter();
  }
});

test('loadHfGroupHourCounts: 同一轮内缓存 (两个 pass 只查一次 DB)', async (t) => {
  if (skipNoDist(t)) return;
  let queries = 0;
  FACTORY.setAdapterForTest({
    async listHfGroupMsgHourBuckets() {
      queries += 1;
      return [{ group_id: 'gA', hour: 20, n: 5 }];
    },
  });
  LEARN.resetLearnedThresholdCache();
  try {
    const a = await DIST.loadHfGroupHourCounts('acctC', NOW_20);
    const b = await DIST.loadHfGroupHourCounts('acctC', NOW_20 + 5);
    assert.equal(queries, 1, '120s 内的第二次调用必须命中缓存');
    assert.equal(a.get('gA|20'), 5);
    assert.equal(b.get('gA|20'), 5);
    await DIST.loadHfGroupHourCounts('acctC', NOW_20 + 3600);
    assert.equal(queries, 2, '超过 TTL 后重查');
  } finally {
    FACTORY.resetAdapter();
  }
});

// ===== 4. 读侧判定 (judge 热路径) =====

/** 灌一批样本 + 群级 learned 进内存, 返回 accountId */
async function seed(accountId, groupId, samples, learnedThreshold, cfg) {
  FACTORY.setAdapterForTest({
    async listHfClosedSince() {
      return samples;
    },
    async listHfGroupMsgHourBuckets() {
      return [];
    },
    async upsertHfLayerStat() {},
    async listHfLayerStats() {
      return [];
    },
    async listHfGroupStates() {
      return [
        {
          account_id: accountId,
          group_id: groupId,
          learned_threshold: learnedThreshold,
          last_change_at: null,
          last_change_old: null,
          last_change_new: null,
          last_change_reason: null,
        },
      ];
    },
  });
  await LEARN.loadLearnedThresholds(accountId);
  await DIST.maybeRecomputeHfLayerStats(accountId, cfg, NOW_20);
}

const quiet = (g, n, h = 20) =>
  Array.from({ length: n }, () => ({ group_id: g, engaged: 0, engage_signal: 'silence', sent_at: atLocal(h) }));
const busy = (g, n, h = 20) =>
  Array.from({ length: n }, () => ({ group_id: g, engaged: 1, engage_signal: 'short-window', sent_at: atLocal(h) }));

test('决策: 段内样本够 + apply ⇒ 用分层值 (source=layer)', async (t) => {
  if (skipNoDist(t)) return;
  try {
    await seed('acct1', 'gA', quiet('gA', 3), 0.6, CFG({ apply: true }));
    const d = LEARN.resolveHfThresholdDecision('acct1', 'gA', CFG({ apply: true }), NOW_20);
    assert.equal(d.source, 'layer');
    assert.equal(d.layerKey, '18-24');
    assert.equal(d.layerN, 3);
    assert.equal(d.layerRate, 0, 'rate=0 ≤ lowEngageRate ⇒ 上调');
    assert.equal(d.applied, 0.65, '0.60 + step 0.05 = 0.65 (更克制)');
    assert.equal(d.shadow, null, '生效时不再报影子');
  } finally {
    FACTORY.resetAdapter();
  }
});

test('决策: apply=false ⇒ 只给影子建议, 生效值仍是群级 learned', async (t) => {
  if (skipNoDist(t)) return;
  try {
    await seed('acct2', 'gB', quiet('gB', 3), 0.6, CFG());
    const d = LEARN.resolveHfThresholdDecision('acct2', 'gB', CFG(), NOW_20);
    assert.equal(d.source, 'group');
    assert.equal(d.applied, 0.6, '影子态不得改变生效阈值');
    assert.equal(d.shadow?.threshold, 0.65, '影子建议 = 若生效会是多少');
    assert.equal(d.shadow?.layerKey, '18-24');
    assert.equal(d.apply, false);
  } finally {
    FACTORY.resetAdapter();
  }
});

test('决策: 段内样本 < k ⇒ 回落群级 (影子也不给)', async (t) => {
  if (skipNoDist(t)) return;
  try {
    await seed('acct3', 'gC', quiet('gC', 2), 0.7, CFG({ apply: true, minSamples: 3 }));
    const d = LEARN.resolveHfThresholdDecision('acct3', 'gC', CFG({ apply: true, minSamples: 3 }), NOW_20);
    assert.equal(d.source, 'group', '样本不足 ⇒ 回落先验 (这就是"不够回落画像先验"的一半)');
    assert.equal(d.applied, 0.7);
    assert.equal(d.layerN, 2);
    assert.equal(d.shadow, null);
  } finally {
    FACTORY.resetAdapter();
  }
});

test('决策: 速率落死区 ⇒ 不动 (复用 evalHfThreshold 的滞回, 无第二套参数)', async (t) => {
  if (skipNoDist(t)) return;
  try {
    // 3 条里 1 条被接话 = 0.333 ∈ (0.15, 0.5) ⇒ 死区
    const samples = [
      ...busy('gD', 1),
      ...quiet('gD', 2, 21),
    ];
    await seed('acct4', 'gD', samples, 0.6, CFG({ apply: true }));
    const d = LEARN.resolveHfThresholdDecision('acct4', 'gD', CFG({ apply: true }), NOW_20);
    assert.equal(d.layerRate, 1 / 3);
    assert.equal(d.source, 'group', '死区内不动');
    assert.equal(d.applied, 0.6);
    assert.equal(d.shadow, null, '死区不给影子建议 (免得老板以为它随时会动)');
  } finally {
    FACTORY.resetAdapter();
  }
});

test('决策: allowLoosen=false (默认) ⇒ 分层只许收紧; =true 才许放宽', async (t) => {
  if (skipNoDist(t)) return;
  try {
    // 3/3 被接话 = 1.0 ≥ highEngageRate ⇒ 想下调 0.05 (更主动)
    await seed('acct5', 'gE', busy('gE', 3), 0.6, CFG({ apply: true }));
    const strict = LEARN.resolveHfThresholdDecision('acct5', 'gE', CFG({ apply: true }), NOW_20);
    assert.equal(strict.source, 'group', '默认不许放宽 ⇒ 回落群级 (历史教训: v1.6.6 的正反馈飞轮)');
    assert.equal(strict.applied, 0.6);

    const loose = LEARN.resolveHfThresholdDecision(
      'acct5',
      'gE',
      CFG({ apply: true, allowLoosen: true }),
      NOW_20,
    );
    assert.equal(loose.source, 'layer');
    assert.equal(loose.applied, 0.55, '显式允许才下调');
  } finally {
    FACTORY.resetAdapter();
  }
});

test('决策: 无 learned 且分层生效 ⇒ 分层值也过读侧钳制 (band)', async (t) => {
  if (skipNoDist(t)) return;
  try {
    // 库里 learned 停在地板 0.5 (旧值/手动设), 段内 rate=0 ⇒ 想上调到 0.55
    await seed('acct6', 'gF', quiet('gF', 3), 0.5, CFG({ apply: true }));
    const d = LEARN.resolveHfThresholdDecision('acct6', 'gF', CFG({ apply: true }), NOW_20);
    assert.equal(d.applied, 0.55);
    // 上限方向: learned 0.9 + 想上调 ⇒ 被 bandMax 钳住 ⇒ changed=false ⇒ 回落群级
    await seed('acct6', 'gG', quiet('gG', 3), 0.9, CFG({ apply: true }));
    const upper = LEARN.resolveHfThresholdDecision('acct6', 'gG', CFG({ apply: true }), NOW_20);
    assert.equal(upper.applied, 0.9, '0.9 + 0.05 被 bandMax 0.9 钳回 ⇒ 无变化');
    assert.equal(upper.source, 'group');
  } finally {
    FACTORY.resetAdapter();
  }
});

test('决策: 无 learned 无分层样本 ⇒ 账号级 (applied=undefined, 不 clone cfg)', async (t) => {
  if (skipNoDist(t)) return;
  try {
    FACTORY.setAdapterForTest({
      async listHfClosedSince() {
        return [];
      },
      async listHfGroupMsgHourBuckets() {
        return [];
      },
      async upsertHfLayerStat() {},
      async listHfLayerStats() {
        return [];
      },
      async listHfGroupStates() {
        return [];
      },
    });
    LEARN.resetLearnedThresholdCache();
    const d = LEARN.resolveHfThresholdDecision('acct7', 'gH', CFG({ apply: true }), NOW_20);
    assert.equal(d.source, 'account');
    assert.equal(d.applied, undefined);
    assert.equal(LEARN.resolveThresholdOverride('acct7', 'gH', CFG({ apply: true }), NOW_20), undefined);
  } finally {
    FACTORY.resetAdapter();
  }
});

test('resolveThresholdOverride: 保名加参 —— 第 4 参时段生效, 3 参调用仍可用', async (t) => {
  if (skipNoDist(t)) return;
  try {
    await seed('acct8', 'gI', quiet('gI', 3), 0.6, CFG({ apply: true }));
    assert.equal(LEARN.resolveThresholdOverride('acct8', 'gI', CFG({ apply: true }), NOW_20), 0.65, '白天(20点)段生效');
    // 同一群在另一个时段 (9 点) 没有样本 ⇒ 回落群级 0.6 == 账号级 ⇒ undefined (不 clone)
    const at9 = atLocal(9, 30);
    assert.equal(LEARN.resolveThresholdOverride('acct8', 'gI', CFG({ apply: true }), at9), undefined);
  } finally {
    FACTORY.resetAdapter();
  }
});

// ===== 5. 源级接线守卫 =====

test('无循环依赖: heartflow-layer 不 import heartflow-learn; heartflow.ts 只 import type', () => {
  const layer = src('src/inbound/heartflow-layer.ts');
  assert.doesNotMatch(layer, /from "\.\/heartflow-learn\.js"/, 'layer 不得反向 import learn (会成环)');
  const hf = src('src/inbound/heartflow.ts');
  assert.match(hf, /import type \{ HfLayeredConfig \} from "\.\/heartflow-layer\.js"/, '必须 import type (值导入会成环)');
  assert.match(hf, /layered\?: HfLayeredConfig/, 'HeartflowConfig 必须挂 layered 子块');
  // 新配置块不进 defaultHeartflowConfig (缺省走 HF_LAYERED_DEFAULTS, UI schema 也不回流)
  const dflt = hf.slice(hf.indexOf('export function defaultHeartflowConfig'));
  assert.doesNotMatch(dflt.slice(0, 600), /layered:/, 'defaultHeartflowConfig 不得写死 layered (否则热载覆盖失效)');
});

test('sweep 顺序: 画像 pass < 分层 pass < learning 开关 (分层不依赖自动调阈)', () => {
  const hl = src('src/inbound/heartflow-learn.ts');
  const iGen = hl.indexOf('await maybeGenerateHfGroupProfiles(');
  const iLayer = hl.indexOf('await maybeRecomputeHfLayerStats(');
  const iGate = hl.indexOf('if (!L.enabled) return;');
  assert.ok(iGen > 0 && iLayer > 0 && iGate > 0, '三处接线都必须在 runHeartflowSweep 里');
  assert.ok(iGen < iLayer, '画像 pass 必须在分层之前 (既有测试约束 gen < learnGate)');
  assert.ok(iLayer < iGate, '分层 pass 必须在 learning.enabled 判定之前 (关掉调阈仍要分层观测)');
});

test('judge 热路径零 DB IO: resolveHfThresholdDecision 体内无 await / 无 SQL', () => {
  const hl = src('src/inbound/heartflow-learn.ts');
  const start = hl.indexOf('export function resolveHfThresholdDecision(');
  const rest = hl.slice(start + 10);
  const nextTop = Math.min(
    ...[rest.indexOf('\nexport function '), rest.indexOf('\nexport interface '), rest.indexOf('\n// =====')]
      .filter((i) => i >= 0),
  );
  const body = rest.slice(0, nextTop);
  assert.ok(body.length > 200, '切片自检: 函数体必须被切出来 (否则这条断言是假绿)');
  assert.doesNotMatch(body, /await /, '判定必须纯内存 (await 意味着热路径读 DB)');
  assert.doesNotMatch(body, /SELECT|FROM wpp_|getAdapter/, '判定体内不得出现 SQL');
  assert.match(body, /getHfLayerStat\(/, '判定必须读内存缓存 getHfLayerStat');
});

test('veto 五要件: 值域 / 排序键 / 强信号 / 清开窗 / 多群歧义拒绝', () => {
  const label = src('src/inbound/heartflow-label.ts');
  assert.match(label, /"quote" \| "mention" \| "negative" \| "veto"/, "HfEngageSignal 必须含 veto");
  assert.match(label, /HF_ALL_SIGNALS: readonly string\[\] = \[[^\]]*"veto"/, 'HF_ALL_SIGNALS 必须含 veto (漏了 ⇒ 静默无效)');
  assert.match(label, /HF_STRONG_SIGNALS[^=]*= \[[^\]]*"veto"/, 'veto 必须是强信号 (不受 ambientP 过滤)');
  // 排序键: sent_at (不能按 judged_at —— 被预算拦久的旧行会盖过刚发出的那条)
  const m = src('src/storage/db/mysql.ts');
  const vs = m.slice(m.indexOf('async markHfLedgerVeto('));
  const vbody = vs.slice(0, vs.indexOf('\n    },'));
  assert.match(vbody, /status IN \('sent','closed'\)/, '只标已发出的行');
  assert.match(vbody, /ORDER BY sent_at DESC, id DESC/, '必须按 sent_at 排序');
  assert.doesNotMatch(vbody, /ORDER BY judged_at/, '不得按 judged_at');
  assert.doesNotMatch(vbody, /UPDATE[\s\S]*WHERE id = \(SELECT/, '不得同表子查询更新 (MariaDB 拒绝)');
  assert.match(vbody, /engaged = 0, engage_signal = 'veto'/, 'veto = engaged 0 + 信号 veto');
  // 命令侧: 清开窗 + 多群歧义拒绝
  // v1.9.2: handleFeatureCommand 迁到 src/inbound/filehelper-features.ts —— 命令侧断言跟着源码搬家, 意图不变
  const i = src('src/inbound/filehelper-features.ts');
  assert.match(i, /forgetHfOpenWindow\(accountId, gid\)/, 'veto 必须清内存开窗');
  assert.match(i, /active\.length >= 2/, '≥2 群时必须拒绝并要求显式群 ID (写错群不可撤销)');
  assert.match(i, /listHfSentCountsRecent\(accountId, nowSec - 900, nowSec - 900\)/, '歧义判定用最近 15 分钟已发统计');
});

test('分层 SQL 单表 (不与 wpp_messages JOIN: collation 不同会报 Illegal mix)', () => {
  const m = src('src/storage/db/mysql.ts');
  for (const fn of ['async listHfClosedSince(', 'async upsertHfLayerStat(', 'async listHfLayerStats(']) {
    const s = m.slice(m.indexOf(fn));
    const body = s.slice(0, s.indexOf('\n    },'));
    assert.ok(body.length > 40, `切片自检: ${fn} 必须被切出来`);
    assert.doesNotMatch(body, /JOIN/i, `${fn} 不得 JOIN`);
  }
});

test('配置面: layered 不进默认容器 / 不进 UI schema; 默认影子 + 只许收紧', async (t) => {
  if (skipNoDist(t)) return;
  const D = DIST.HF_LAYERED_DEFAULTS;
  assert.equal(D.enabled, true, '统计默认开 (观测价值无损)');
  assert.equal(D.apply, false, '生效默认关 = 影子 (老板看够日报再手动开)');
  assert.equal(D.allowLoosen, false, '默认只许收紧');
  assert.equal(D.minSamples, 30);
  assert.equal(D.windowDays, 60, '窗口上限: 防止旧样本永久锁死速率');
  const plug = JSON.parse(read(`${ROOT}/openclaw.plugin.json`));
  const hfProps = plug.channelConfigs.wechatpadpro.schema.properties.heartflow.properties;
  assert.equal(hfProps.layered, undefined, 'layered 不许回流 UI schema');
  const L = DIST.resolveHfLayeredCfg(undefined);
  assert.equal(L.apply, false);
  assert.deepEqual(L.buckets, [[0, 7], [7, 12], [12, 18], [18, 24]]);
});

test('R2 红线: 新模块/本文件不含真实群 ID', () => {
  // 群 ID 形态可断言; 门店/品牌/人名的词表**不能写在这里** (写出来这条测试自己就成了泄漏),
  //   它们由发布链的脱敏规则门 (tools/sanitize-source.sh --check) 负责, 每次同步 GitHub 都跑。
  for (const rel of ['src/inbound/heartflow-layer.ts', 'tests/unit/heartflow-layer.test.mjs']) {
    assert.doesNotMatch(src(rel), /\d{9,}@chatroom/, `${rel} 不得出现真实群 ID`);
  }
});
