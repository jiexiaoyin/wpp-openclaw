// tests/unit/heartflow-trace.test.mjs - v1.6.1 「judge 跑了但没回」留痕 (2026-09-13)
//
// 事故背景: 2026-09-11 心流 judge 静默瘫 3 天, 日志只有 "judge failed after 2 attempts: unparseable: ",
//   台账最后一行停在 09-10 —— 因为旧码**只在 shouldReply=true 时**落 ledger, 于是
//   「judge 跑了但没过阈值」在日志与 DB 里**零留痕**, 外观与「群里压根没消息」完全一致.
//
// 本测试锁三件事 (任一回退即 FAIL):
//   1. judge 未过阈值 → 也落一行, 状态机 judged → suppressed(reason='below-threshold')
//   2. 落行失败必须**吞掉** (非致命), 不许把异常抛进 dispatch 路径
//   3. 该行为**不得**污染阈值学习样本 (suppressed 行不在 status='closed' AND engaged IS NOT NULL 里)
//
// dist 缺失 (未 npm run build) → t.skip, 不红 (产物由 deploy 门禁负责).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const DEPLOY = '/root/.openclaw/extensions/wechatpadpro';

let learn = null;
let factory = null;
let loadErr = null;
try {
  learn = await import(new URL('../../dist/inbound/heartflow-learn.js', import.meta.url));
  factory = await import(new URL('../../dist/storage/db/factory.js', import.meta.url));
} catch (e) {
  loadErr = e;
}

function skipNoDist(t) {
  if (!learn || !factory) t.skip(`dist 缺失 (先 npm run build): ${loadErr?.message ?? ''}`);
}

const RECORD = {
  account_id: 'acct-1',
  inbound_msg_id: 'msg-1',
  group_id: 'g@chatroom',
  content_head: '你好',
  judge_overall: 0.42,
  dim_r: 4,
  dim_w: 3,
  dim_s: 5,
  dim_t: 6,
  dim_c: 2,
  effective_threshold: 0.6,
  energy: 1,
  judged_at: 1757700000,
};

/** 假 adapter: 只实现被调到的两个方法, 记录调用序 */
function fakeAdapter({ throwOn } = {}) {
  const calls = [];
  const mk = (name) => async (...args) => {
    calls.push({ name, args });
    if (throwOn === name) throw new Error(`boom:${name}`);
  };
  return {
    calls,
    recordHfJudged: mk('recordHfJudged'),
    setHfLedgerSuppressed: mk('setHfLedgerSuppressed'),
  };
}

// ===== 1. 状态机 + 参数 =====
test('1. judge 未过阈值 → INSERT(judged) 后立即 suppress(reason=below-threshold)', async (t) => {
  skipNoDist(t);
  const a = fakeAdapter();
  factory.setAdapterForTest(a);

  await learn.persistHfJudgedBelowThreshold(RECORD, 1757700123);

  assert.equal(a.calls.length, 2, '必须是两步: 先 INSERT 再 UPDATE (复用既有 judged→suppressed 状态机)');
  assert.equal(a.calls[0].name, 'recordHfJudged', '第一步必须是 recordHfJudged');
  assert.deepEqual(a.calls[0].args[0], RECORD, 'recordHfJudged 必须原样收到 ledger 行 (分数/维度/阈值全留痕)');
  assert.equal(a.calls[1].name, 'setHfLedgerSuppressed', '第二步必须是 setHfLedgerSuppressed');
  assert.deepEqual(
    a.calls[1].args,
    ['acct-1', 'msg-1', 'below-threshold', 1757700123],
    "suppress 参数必须是 (account_id, inbound_msg_id, 'below-threshold', atSec)",
  );
});

test('2. reason 必须区分于 sweep 呆账 (no-deliver-outcome) 与发送期抑制', async (t) => {
  skipNoDist(t);
  const a = fakeAdapter();
  factory.setAdapterForTest(a);
  await learn.persistHfJudgedBelowThreshold(RECORD, 1);
  const reason = a.calls[1].args[2];
  for (const other of ['no-deliver-outcome', 'dedup', 'empty-text', 'ack-template', 'unknown']) {
    assert.notEqual(reason, other, `judge 未过阈值的 reason 不许复用 "${other}" (否则运维面分不清沉默原因)`);
  }
});

// ===== 2. 吞错 (非致命) =====
test('3. INSERT 抛错 → 不 reject, 且不再执行 suppress (半成品不留)', async (t) => {
  skipNoDist(t);
  const a = fakeAdapter({ throwOn: 'recordHfJudged' });
  factory.setAdapterForTest(a);
  await assert.doesNotReject(
    () => learn.persistHfJudgedBelowThreshold(RECORD, 1),
    '落台账失败必须吞掉 — 不许把异常抛进 dispatch 路径',
  );
  assert.equal(a.calls.length, 1, 'INSERT 失败后不得继续 UPDATE');
});

test('4. UPDATE 抛错 → 不 reject (半成品留作 judged, 由 sweep 呆账收敛)', async (t) => {
  skipNoDist(t);
  const a = fakeAdapter({ throwOn: 'setHfLedgerSuppressed' });
  factory.setAdapterForTest(a);
  await assert.doesNotReject(() => learn.persistHfJudgedBelowThreshold(RECORD, 1));
  assert.equal(a.calls.length, 2);
});

// ===== 3. 学习闭环零污染 (这是"可以安全加这一行"的依据) =====
test("5. mysql.ts: 两个学习样本查询都要求 status='closed' AND engaged IS NOT NULL ⇒ suppressed 天然被排除", () => {
  const m = fs.readFileSync(`${ROOT}/src/storage/db/mysql.ts`, 'utf-8');
  for (const fn of ['getHfClosedRecent', 'getHfLedgerDistinctClosedGroups']) {
    const start = m.indexOf(`async ${fn}(`);
    assert.ok(start >= 0, `mysql.ts 必须含 ${fn}`);
    const body = m.slice(start, m.indexOf('},', start));
    assert.match(
      body,
      /status = 'closed' AND engaged IS NOT NULL/,
      `${fn} 必须带 status='closed' AND engaged IS NOT NULL (suppressed 行不进学习样本)`,
    );
  }
  // 反面: 我的 suppress 写入 status='suppressed' 且不动 engaged → 上面两条过滤天然排除
  const supStart = m.indexOf('async setHfLedgerSuppressed(');
  const supBody = m.slice(supStart, m.indexOf('},', supStart));
  assert.match(supBody, /SET status = 'suppressed'/, "suppressed 写入必须置 status='suppressed'");
  assert.doesNotMatch(supBody, /engaged/, 'suppressed 写入不得碰 engaged (保持 NULL ⇒ 被学习样本查询排除)');
});

// ===== 4. 运维面可见 =====
test('6. mysql.ts: countHfLedgerByStatus 按 status+suppressed_reason 聚合, 带时间窗 (只读)', () => {
  const m = fs.readFileSync(`${ROOT}/src/storage/db/mysql.ts`, 'utf-8');
  const start = m.indexOf('async countHfLedgerByStatus(');
  assert.ok(start >= 0, 'mysql.ts 必须实现 countHfLedgerByStatus');
  const body = m.slice(start, m.indexOf('async setHfLedgerSent(', start));
  assert.match(body, /GROUP BY status, suppressed_reason/, '必须按 status + suppressed_reason 分组 (否则分不清沉默原因)');
  assert.match(body, /judged_at >= \?/, '必须带时间窗 (judged_at >= ?)');
  assert.doesNotMatch(body, /INSERT|UPDATE|DELETE/i, 'countHfLedgerByStatus 必须只读');
});

test('7. /heartflow status 打印 近24h台账 (judge 未过阈值在运维面可见)', () => {
  const src = fs.readFileSync(`${ROOT}/src/index.ts`, 'utf-8');
  assert.match(src, /countHfLedgerByStatus/, '/heartflow status 必须调 countHfLedgerByStatus');
  assert.match(src, /近24h台账/, '必须打印"近24h台账"行 (沉默也可见)');
  assert.match(src, /bySuppressedReason/, '必须展示沉默原因分解');
});

// ===== 5. 埋点接线 (dev 源 + deploy 产物 双查) =====
test('8. handler.ts: shouldReply=false 分支调用留痕; true 分支不调 (dev)', () => {
  const src = fs.readFileSync(`${ROOT}/src/inbound/handler.ts`, 'utf-8');
  assert.match(src, /import \{[\s\S]*?persistHfJudgedBelowThreshold[\s\S]*?\} from "\.\/heartflow-learn\.js"/, 'handler.ts 必须 import persistHfJudgedBelowThreshold');
  // 取 shouldReply 判定的整段 (含其前的 markHeartflowJudged + hfRecord 构造)
  const start = src.indexOf('markHeartflowJudged(chatId, nowMs);', src.indexOf('const judgeResult = await judgeHeartflow('));
  assert.ok(start >= 0, 'handler.ts 必须含心流 judge 段');
  const end = src.indexOf('} catch (e) {', start);
  const seg = src.slice(start, end);
  const elseIdx = seg.indexOf('} else {');
  assert.ok(elseIdx > 0, '必须有 else 分支');
  const thenBranch = seg.slice(0, elseIdx);
  const elseBranch = seg.slice(elseIdx);
  assert.match(elseBranch, /persistHfJudgedBelowThreshold\(/, 'else 分支 (未过阈值) 必须留痕');
  assert.doesNotMatch(thenBranch, /persistHfJudgedBelowThreshold/, 'shouldReply 分支不得调 below-threshold 留痕 (走 persistHfJudged)');
  // judgeResult=null (judge 崩了) 不落台账: 已有 warn 留痕, 落行会与"判定未过"混淆
  assert.match(seg, /const hfRecord = judgeResult\s*\n?\s*\?/, '台账行必须仅在 judgeResult 非空时构造');
});

test('9. deploy 产物含留痕 (dist/inbound/handler.js + heartflow-learn.js + storage)', () => {
  for (const rel of ['dist/inbound/handler.js', 'dist/inbound/heartflow-learn.js', 'dist/storage/db/heartflow.js', 'dist/storage/db/index.js', 'dist/index.js']) {
    assert.ok(fs.existsSync(`${DEPLOY}/${rel}`), `deploy 必须含 ${rel}`);
  }
  assert.match(
    fs.readFileSync(`${DEPLOY}/dist/inbound/heartflow-learn.js`, 'utf-8'),
    /below-threshold/,
    'deploy heartflow-learn.js 必须含 below-threshold 留痕',
  );
  assert.match(
    fs.readFileSync(`${DEPLOY}/dist/inbound/handler.js`, 'utf-8'),
    /persistHfJudgedBelowThreshold/,
    'deploy handler.js 必须真的调用留痕 (仅 src 改了不算)',
  );
});
