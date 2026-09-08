// tests/unit/heartflow-learn.test.mjs - v1.6.x HEARTFLOW-FEEDBACK 纯函数单元测试
//
// import dist/inbound/heartflow-learn.js (编译产物) 直接测纯算法/分类:
//   evalHfThreshold (样本不足/死区/上跳/下跳/双端钳制/round2/回落基线/边界 noop)
//   hfCooldownOk / round2 / classifyHfSend (四态: pending/suppressed×3/sent×2)
//
// dist 缺失 (未 npm run build) → t.skip + 提示, 不红 (编译产物由 CI/deploy 门禁负责).
// 引用实际常量锚点: 参数默认值用测试内 fixture, 与 heartflow.ts HF_LEARNING_DEFAULTS 解耦,
//   但 fixture 值一一对应代码默认 (改默认=改测试, 起 guard 作用).
import test from 'node:test';
import assert from 'node:assert/strict';

let hf = null;
let loadErr = null;
try {
  hf = await import(new URL('../../dist/inbound/heartflow-learn.js', import.meta.url));
} catch (e) {
  loadErr = e;
}

const P = { minSample: 10, lowEngageRate: 0.15, highEngageRate: 0.5, step: 0.05, bandMin: 0.3, bandMax: 0.9 };

function skipNoDist(t) {
  if (!hf) t.skip(`dist/inbound/heartflow-learn.js 缺失 (先 npm run build): ${loadErr?.message ?? ''}`);
}

test('evalHfThreshold: 样本不足 → insufficient-sample (不调阈, 自然灰度)', (t) => {
  skipNoDist(t);
  const res = hf.evalHfThreshold({
    stats: { total: 9, engaged: 1 },
    learnedThreshold: undefined,
    baseThreshold: 0.6,
    params: P,
  });
  assert.deepEqual(res, { changed: false, reason: 'insufficient-sample' });
});

test('evalHfThreshold: 接话率落死区 (0.15, 0.5) → in-dead-zone (天然滞回不跳)', (t) => {
  skipNoDist(t);
  const res = hf.evalHfThreshold({
    stats: { total: 20, engaged: 6 }, // 0.30 ∈ 死区
    learnedThreshold: undefined,
    baseThreshold: 0.6,
    params: P,
  });
  assert.deepEqual(res, { changed: false, reason: 'in-dead-zone' });
});

test('evalHfThreshold: 接话率 ≤ low → 上调 (少说精选), 方向 up, rate 随附', (t) => {
  skipNoDist(t);
  const res = hf.evalHfThreshold({
    stats: { total: 20, engaged: 2 }, // 0.10 ≤ 0.15
    learnedThreshold: undefined,
    baseThreshold: 0.6,
    params: P,
  });
  assert.equal(res.changed, true);
  assert.equal(res.direction, 'up');
  assert.equal(res.newThreshold, 0.65);
  assert.equal(res.rate, 0.1);
});

test('evalHfThreshold: 接话率 ≥ high → 下调 (更主动), 方向 down', (t) => {
  skipNoDist(t);
  const res = hf.evalHfThreshold({
    stats: { total: 20, engaged: 18 }, // 0.90 ≥ 0.5
    learnedThreshold: undefined,
    baseThreshold: 0.6,
    params: P,
  });
  assert.equal(res.changed, true);
  assert.equal(res.direction, 'down');
  assert.equal(res.newThreshold, 0.55);
});

test('evalHfThreshold: float 步长被 round2 归一 (0.65+0.05=0.7 非 0.7000…1)', (t) => {
  skipNoDist(t);
  const res = hf.evalHfThreshold({
    stats: { total: 20, engaged: 2 },
    learnedThreshold: undefined,
    baseThreshold: 0.65,
    params: P,
  });
  assert.equal(res.changed, true);
  assert.equal(res.newThreshold, 0.7);
  assert.equal(typeof res.newThreshold, 'number');
});

test('evalHfThreshold: learned 覆盖回落基线 (cur = learnedThreshold ?? baseThreshold)', (t) => {
  skipNoDist(t);
  // learned 0.8 + down → 0.75 (不回落 base 0.6)
  const down = hf.evalHfThreshold({
    stats: { total: 20, engaged: 18 },
    learnedThreshold: 0.8,
    baseThreshold: 0.6,
    params: P,
  });
  assert.equal(down.changed, true);
  assert.equal(down.direction, 'down');
  assert.equal(down.newThreshold, 0.75);

  // learned 0.35 + down → 撞 bandMin 0.30 (实变, 到达硬下界)
  const lo = hf.evalHfThreshold({
    stats: { total: 20, engaged: 18 },
    learnedThreshold: 0.35,
    baseThreshold: 0.6,
    params: P,
  });
  assert.equal(lo.changed, true);
  assert.equal(lo.newThreshold, 0.3);
});

test('evalHfThreshold: 双端钳制 clamped-noop (已达硬界仍朝外 → 不变)', (t) => {
  skipNoDist(t);
  // bandMax 0.9 仍上调 → 钳回 0.9 == cur → clamped-noop
  const upAtMax = hf.evalHfThreshold({
    stats: { total: 20, engaged: 1 },
    learnedThreshold: 0.9,
    baseThreshold: 0.6,
    params: P,
  });
  assert.deepEqual(upAtMax, { changed: false, reason: 'clamped-noop' });
  // bandMin 0.3 仍下调 → 钳回 0.3 == cur → clamped-noop
  const dnAtMin = hf.evalHfThreshold({
    stats: { total: 20, engaged: 18 },
    learnedThreshold: 0.3,
    baseThreshold: 0.6,
    params: P,
  });
  assert.deepEqual(dnAtMin, { changed: false, reason: 'clamped-noop' });
});

test('hfCooldownOk: 无记录 (null/undefined) → 立即允许', (t) => {
  skipNoDist(t);
  assert.equal(hf.hfCooldownOk(null, 1000, 100), true);
  assert.equal(hf.hfCooldownOk(undefined, 1000, 100), true);
});

test('hfCooldownOk: 数值边界 (now - last >= cooldown 才允许)', (t) => {
  skipNoDist(t);
  assert.equal(hf.hfCooldownOk(900, 1000, 100), true); // 差 100 == 冷却 → 允许 (临界)
  assert.equal(hf.hfCooldownOk(950, 1000, 100), false); // 差 50 < 100 → 拒绝
  assert.equal(hf.hfCooldownOk(800, 1000, 100), true); // 差 200 ≥ 100 → 允许
});

test('round2: 保留 2 位小数 (四舍五入)', (t) => {
  skipNoDist(t);
  assert.equal(hf.round2(0.075), 0.08);
  assert.equal(hf.round2(0.0749), 0.07);
  assert.equal(hf.round2(0.7000000000000001), 0.7);
  assert.equal(hf.round2(0.3), 0.3);
});

test('classifyHfSend: ok=false → pending (等框架重试, 不改状态)', (t) => {
  skipNoDist(t);
  assert.equal(hf.classifyHfSend({ ok: false, error: 'rate_limit' }), 'pending');
});

test('classifyHfSend: 占位符 (ok:true 但非真发) → suppressed', (t) => {
  skipNoDist(t);
  assert.equal(hf.classifyHfSend({ ok: true, msgId: 'dedup-suppressed' }), 'suppressed');
  assert.equal(hf.classifyHfSend({ ok: true, msgId: 'ack-template-dropped' }), 'suppressed');
  assert.equal(hf.classifyHfSend({ ok: true, msgId: '' }), 'suppressed');
});

test('classifyHfSend: 真发 (vendor 无回 id=undefined / 有 id) → sent', (t) => {
  skipNoDist(t);
  assert.equal(hf.classifyHfSend({ ok: true, msgId: undefined }), 'sent');
  assert.equal(hf.classifyHfSend({ ok: true, msgId: '848526155-179' }), 'sent');
});
