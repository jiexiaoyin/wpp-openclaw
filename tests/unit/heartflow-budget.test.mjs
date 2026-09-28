// tests/unit/heartflow-budget.test.mjs - v1.6.9 心流发言预算 (纯函数 + 进程内状态 + 源级接线)
//
// 为什么有这份测试 (2026-09-26 老板拍板):
//   老板: "群里回复消息的频率太高了" + "如果我不设定下限, 就会一直降低 [阈值]" ⇒
//   结论: **阈值不该兼任频率闸** (自学标量必然漂到边界)。频率约束上移到结构层: 每群最小间隔 /
//   每小时 / 每天上限 + 静默段 (默认关) + 陈旧触发防重放。本文件锁住这套结构约束的每条闸与边界。
//
// 覆盖:
//   1) 参数解析 (缺省 = 老板选的"中等"档; accounts 覆盖; 显式关)
//   2) 桶键/边界: 本地小时/零点与运行时桶键**同口径** (回填不能带上一段的余数)
//   3) 静默段: 普通区间 / 跨零点 / 半开边界 / start===end 视为空段
//   4) checkHfBudget 五条闸各自拦住 + 边界值不误拦 (恰好第 8 条放行)
//   5) 跨小时/跨天滚动 (小时计数归零, 天计数保留)
//   6) 纯函数性 (不改入参) + 进程内状态 (peek/记账/回填/快照/重置)
//   7) 源级接线: 闸在 judge 之前 / 发送成功才占额度 / handler 记人类消息 / 启动回填
//
// dist 缺失 (未 npm run build) → t.skip, 不红 (与 heartflow-learn.test.mjs 同惯例).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const read = (p) => fs.readFileSync(p, 'utf-8');
const src = (rel) => read(`${ROOT}/${rel}`);

/**
 * 取某个顶层声明的完整函数体 (从声明行到下一个顶层声明之前).
 * 不用固定字符窗口 —— 窗口太小会把断言切掉变成"假绿"(match 在窗口外), 太大会把隔壁函数算进来.
 */
function fnBody(rel, decl) {
  const s = src(rel);
  const i = s.indexOf(decl);
  assert.ok(i >= 0, `${rel} 里找不到声明: ${decl}`);
  const rest = s.slice(i + decl.length);
  const next = rest.search(/\n(?:\/\*\*|export (?:async )?function|export const|export interface|const _)/);
  return s.slice(i, next < 0 ? s.length : i + decl.length + next);
}

let B = null;
let loadErr = null;
try {
  B = await import(new URL('../../dist/inbound/heartflow-budget.js', import.meta.url));
} catch (e) {
  loadErr = e;
}

function skipNoDist(t) {
  if (!B) t.skip(`dist/inbound/heartflow-budget.js 缺失 (先 npm run build): ${loadErr?.message ?? ''}`);
}

// 用**本地时间构造函数**取基准, 这样 hfLocalHour 在任何 TZ 下都可预期 (不 hardcode epoch)
const at = (h, m = 0, day = 26) => Math.floor(new Date(2026, 8, day, h, m, 0).getTime() / 1000);
const T = at(12); // 2026-09-26 12:00 本地
const D = B ? B.HF_BUDGET_DEFAULTS : null; // 仅用于断言默认档位
const CFG = B ? B.resolveHfBudget(undefined) : null;

// ===== 1. 参数解析 =====

test('resolveHfBudget: 缺省 = 老板选的「中等」档 (3分钟/8条·小时/60条·天) + 静默段默认关', (t) => {
  skipNoDist(t);
  const c = B.resolveHfBudget(undefined);
  assert.equal(c.enabled, true, '结构约束默认生效 (老板 2026-09-26 选"中等")');
  assert.equal(c.minGapSec, 180, '1 条/3 分钟');
  assert.equal(c.maxPerHour, 8);
  assert.equal(c.maxPerDay, 60);
  assert.equal(c.noConsecutiveWithoutHuman, true);
  assert.deepEqual(c.quietHours, [], '静默段默认**关** (机制做好等 P1 画像按群填)');
});

test('resolveHfBudget: accounts 覆盖逐键生效 (未覆盖的键走默认)', (t) => {
  skipNoDist(t);
  const c = B.resolveHfBudget({ budget: { minGapSec: 600, quietHours: [[23, 7]] } });
  assert.equal(c.minGapSec, 600, '覆盖生效');
  assert.equal(c.maxPerHour, D.maxPerHour, '未覆盖的键走默认');
  assert.equal(c.maxPerDay, D.maxPerDay);
  assert.equal(c.enabled, true);
  assert.deepEqual(c.quietHours, [[23, 7]]);
});

test('resolveHfBudget: enabled=false 是总开关 (可整块关掉预算)', (t) => {
  skipNoDist(t);
  const c = B.resolveHfBudget({ budget: { enabled: false } });
  assert.equal(c.enabled, false);
  const st = B.newHfBudgetState(T);
  assert.deepEqual(B.checkHfBudget({ ...st, hourCount: 999, dayCount: 9999 }, c, T), { allowed: true }, '关了就不拦');
});

// ===== 2. 桶键与边界 (回填口径必须与运行时一致) =====

test('桶键: 本地整点/零点与运行时桶键同口径 (回填不带上一段余数)', (t) => {
  skipNoDist(t);
  for (const h of [0, 7, 12, 23]) {
    const ts = at(h, 37);
    assert.equal(B.hfLocalHour(ts), h, `hfLocalHour(${h}时) 必须等于 ${h}`);
    assert.equal(
      B.hfHourBucketKey(B.hfHourStartSec(ts)),
      B.hfHourBucketKey(ts),
      '整点起点必须落在同一个小时候桶里 (否则回填的小时计数会溢到上一小时)',
    );
    assert.equal(
      B.hfDayBucketKey(B.hfDayStartSec(ts)),
      B.hfDayBucketKey(ts),
      '零点起点必须落在同一个天桶里',
    );
    assert.ok(B.hfHourStartSec(ts) <= ts && B.hfDayStartSec(ts) <= ts, '起点不得晚于当前时刻');
    assert.ok(ts - B.hfHourStartSec(ts) < 3600, '整点起点必须在本小时内');
    assert.ok(ts - B.hfDayStartSec(ts) < 86400, '零点起点必须在今天内');
  }
});

test('桶键: 跨零点 (23:59 → 次日 00:01) 天键与小时键都滚动', (t) => {
  skipNoDist(t);
  const late = at(23, 59, 26);
  const nextDay = at(0, 1, 27);
  assert.notEqual(B.hfDayBucketKey(late), B.hfDayBucketKey(nextDay), '跨零点天键必须变');
  assert.notEqual(B.hfHourBucketKey(late), B.hfHourBucketKey(nextDay), '跨零点小时键必须变');
});

// ===== 3. 静默段 =====

test('isHfQuietHour: 半开区间 [start, end) —— 起点静默, 终点不静默 (相邻段不重叠)', (t) => {
  skipNoDist(t);
  const r = [[9, 12]];
  assert.equal(B.isHfQuietHour(8, r), false);
  assert.equal(B.isHfQuietHour(9, r), true, '起点含');
  assert.equal(B.isHfQuietHour(11, r), true);
  assert.equal(B.isHfQuietHour(12, r), false, '终点不含 (否则与 [12,15) 重叠)');
});

test('isHfQuietHour: 跨零点 [23, 7] 覆盖 23/0/6 但不覆盖 7', (t) => {
  skipNoDist(t);
  const r = [[23, 7]];
  for (const h of [23, 0, 3, 6]) assert.equal(B.isHfQuietHour(h, r), true, `${h} 时应在静默段`);
  for (const h of [7, 12, 22]) assert.equal(B.isHfQuietHour(h, r), false, `${h} 时不应在静默段`);
});

test('isHfQuietHour: 空数组/undefined 不静默; start===end 视为空段 (防 [0,0] 变全天静默)', (t) => {
  skipNoDist(t);
  assert.equal(B.isHfQuietHour(3, []), false);
  assert.equal(B.isHfQuietHour(3, undefined), false);
  assert.equal(B.isHfQuietHour(0, [[0, 0]]), false, 'start===end 不得变成全天静默');
  assert.equal(B.isHfQuietHour(3, [[0, 0]]), false);
});

test('静默段接进 checkHfBudget: 命中即拦 (reason=quiet-hours)', (t) => {
  skipNoDist(t);
  const st = B.newHfBudgetState(at(23, 30));
  const cfg = B.resolveHfBudget({ budget: { quietHours: [[23, 7]] } });
  assert.deepEqual(B.checkHfBudget(st, cfg, at(23, 30)), { allowed: false, reason: "quiet-hours" });
  assert.deepEqual(B.checkHfBudget(st, cfg, at(12)), { allowed: true }, '白天放行 (此状态下无其它闸命中)');
});

// ===== 4. 五条闸 + 边界 =====

test('闸·最小间隔: 上次发言 179s 前拦, 180s 前放行 (边界)', (t) => {
  skipNoDist(t);
  const base = { ...B.newHfBudgetState(T), lastReplyAtSec: T };
  assert.deepEqual(
    B.checkHfBudget(base, CFG, T + 179),
    { allowed: false, reason: "budget-gap" },
    '179s < 180s 必须拦',
  );
  assert.deepEqual(B.checkHfBudget(base, CFG, T + 180), { allowed: true }, '恰好 180s 放行');
});

test('闸·每小时: 已发 7 条放行 (第 8 条能发), 已发 8 条拦第 9 条', (t) => {
  skipNoDist(t);
  const st = B.newHfBudgetState(T);
  assert.deepEqual(B.checkHfBudget({ ...st, hourCount: 7 }, CFG, T), { allowed: true }, '第 8 条不误拦');
  assert.deepEqual(
    B.checkHfBudget({ ...st, hourCount: 8 }, CFG, T),
    { allowed: false, reason: "budget-hour" },
    '满 8 条即拦',
  );
});

test('闸·每天: 已发 59 条放行 (第 60 条能发), 已发 60 条拦第 61 条', (t) => {
  skipNoDist(t);
  const st = B.newHfBudgetState(T);
  assert.deepEqual(B.checkHfBudget({ ...st, dayCount: 59 }, CFG, T), { allowed: true }, '第 60 条不误拦');
  assert.deepEqual(
    B.checkHfBudget({ ...st, dayCount: 60 }, CFG, T),
    { allowed: false, reason: "budget-day" },
    '满 60 条即拦',
  );
});

test('闸·陈旧触发: 候选消息不晚于上次发言 → 拦 (防同批/重试被重复处理)', (t) => {
  skipNoDist(t);
  const st = { ...B.newHfBudgetState(T), lastReplyAtSec: T };
  assert.deepEqual(
    B.checkHfBudget(st, CFG, T + 200, T),
    { allowed: false, reason: "budget-consecutive" },
    '候选与上次发言同时刻 = 重放, 拦',
  );
  assert.deepEqual(
    B.checkHfBudget(st, CFG, T + 200, T - 5),
    { allowed: false, reason: "budget-consecutive" },
    '候选比上次发言旧 = 陈旧, 拦',
  );
  assert.deepEqual(
    B.checkHfBudget(st, CFG, T + 200, T + 1),
    { allowed: true },
    '候选比上次发言新 = 真·新消息, 放行 (真实人类消息不会被误拦)',
  );
  const noReplyYet = B.newHfBudgetState(T);
  assert.deepEqual(
    B.checkHfBudget(noReplyYet, CFG, T, T - 100),
    { allowed: true },
    '还没发过言 ⇒ 无"陈旧"可言',
  );
});

test('闸·优先级: 只报第一条命中的原因 (静默段 > 间隔 > 陈旧 > 小时 > 天)', (t) => {
  skipNoDist(t);
  const st = {
    hourKey: B.hfHourBucketKey(at(23, 30)),
    hourCount: 99,
    dayKey: B.hfDayBucketKey(at(23, 30)),
    dayCount: 999,
    lastReplyAtSec: at(23, 30),
    lastHumanAtSec: null,
  };
  const cfg = B.resolveHfBudget({ budget: { quietHours: [[23, 7]] } });
  assert.equal(B.checkHfBudget(st, cfg, at(23, 30)).reason, "quiet-hours", '多闸同时命中时报最绝对的那条');
  const cfg2 = B.resolveHfBudget({ budget: { minGapSec: 180 } });
  assert.equal(B.checkHfBudget(st, cfg2, at(23, 30)).reason, "budget-gap", '无静默段时报间隔');
});

test('闸·关闭陈旧检查时不影响其它闸', (t) => {
  skipNoDist(t);
  const cfg = B.resolveHfBudget({ budget: { noConsecutiveWithoutHuman: false } });
  const st = { ...B.newHfBudgetState(T), lastReplyAtSec: T };
  assert.deepEqual(B.checkHfBudget(st, cfg, T + 200, T - 100), { allowed: true }, '陈旧检查关了就该放行');
  assert.deepEqual(
    B.checkHfBudget(st, cfg, T + 100, T - 100),
    { allowed: false, reason: "budget-gap" },
    '间隔闸仍在',
  );
});

test('闸·maxPerHour/maxPerDay = 0 视为不限 (不误拦)', (t) => {
  skipNoDist(t);
  const cfg = B.resolveHfBudget({ budget: { maxPerHour: 0, maxPerDay: 0 } });
  const st = { ...B.newHfBudgetState(T), hourCount: 999, dayCount: 9999 };
  assert.deepEqual(B.checkHfBudget(st, cfg, T), { allowed: true });
});

// ===== 5. 滚动 =====

test('rollHfBudgetState: 跨小时清小时计数, 天计数保留; 跨天两个都清', (t) => {
  skipNoDist(t);
  const st = { ...B.newHfBudgetState(T), hourCount: 5, dayCount: 20 };
  const sameHour = B.rollHfBudgetState(st, T + 60);
  assert.equal(sameHour.hourCount, 5, '同小时不动');
  assert.equal(sameHour.dayCount, 20);
  const nextHour = B.rollHfBudgetState(st, at(13));
  assert.equal(nextHour.hourCount, 0, '跨小时清小时计数');
  assert.equal(nextHour.dayCount, 20, '天计数保留');
  const nextDay = B.rollHfBudgetState({ ...st, hourKey: B.hfHourBucketKey(at(23, 30)) }, at(0, 5, 27));
  assert.equal(nextDay.hourCount, 0);
  assert.equal(nextDay.dayCount, 0, '跨天清零');
});

test('纯函数性: check/roll/record 都不改入参对象', (t) => {
  skipNoDist(t);
  const st = { ...B.newHfBudgetState(T), hourCount: 3, dayCount: 7, lastReplyAtSec: T - 10 };
  const snap = JSON.stringify(st);
  B.checkHfBudget(st, CFG, T + 500, T + 1);
  B.rollHfBudgetState(st, at(23, 59, 27));
  B.recordHfBudgetReply(st, T + 500);
  B.recordHfBudgetHuman(st, T + 501);
  assert.equal(JSON.stringify(st), snap, '入参必须原样 (纯函数 ⇒ 可单测/可回放)');
});

test('recordHfBudgetReply/Human: 各自只动自己的字段, 且计数 +1', (t) => {
  skipNoDist(t);
  const st = { ...B.newHfBudgetState(T), hourCount: 2, dayCount: 6 };
  const sent = B.recordHfBudgetReply(st, T + 300);
  assert.equal(sent.hourCount, 3);
  assert.equal(sent.dayCount, 7);
  assert.equal(sent.lastReplyAtSec, T + 300);
  assert.equal(sent.lastHumanAtSec, null, '发言不改人类消息时刻');
  const human = B.recordHfBudgetHuman(st, T + 100);
  assert.equal(human.lastHumanAtSec, T + 100);
  assert.equal(human.hourCount, 2, '人类消息不占额度');
  const older = B.recordHfBudgetHuman({ ...st, lastHumanAtSec: T + 200 }, T + 100);
  assert.equal(older.lastHumanAtSec, T + 200, '更旧的时刻不得把记录往回拨');
});

// ===== 6. 进程内状态 =====

test('peekHfBudget: 判定并计入拦截快照 (门禁零 DB 写)', (t) => {
  skipNoDist(t);
  B.resetHfBudgetCache();
  const acct = "acct-peek";
  const g = "g-peek@chatroom";
  assert.equal(B.peekHfBudget(acct, g, CFG, T).allowed, true, '首次放行');
  B.noteHfReplySent(acct, g, T);
  const blocked = B.peekHfBudget(acct, g, CFG, T + 10);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "budget-gap");
  assert.equal(B.hfBudgetBlockedSnapshot()["budget-gap"], 1, '拦截要计数 (供 /heartflow status 归因)');
  assert.equal(B.hfBudgetTrackedGroups(), 1);
  B.resetHfBudgetCache();
  assert.deepEqual(B.hfBudgetBlockedSnapshot(), {}, '重置清空');
  assert.equal(B.hfBudgetTrackedGroups(), 0);
});

test('peekHfBudget: accountId 缺省退化为 * 桶, 不同账号/不同群互不串账', (t) => {
  skipNoDist(t);
  B.resetHfBudgetCache();
  B.noteHfReplySent("a1", "g1@chatroom", T);
  assert.equal(B.peekHfBudget("a1", "g1@chatroom", CFG, T + 5).allowed, false, '同账号同群受限');
  assert.equal(B.peekHfBudget("a2", "g1@chatroom", CFG, T + 5).allowed, true, '换账号不串账');
  assert.equal(B.peekHfBudget("a1", "g2@chatroom", CFG, T + 5).allowed, true, '换群不串账');
  B.resetHfBudgetCache();
});

test('seedHfBudgetStates: 回填小时/天计数与最近发言时刻; lastHumanAtSec 留空', (t) => {
  skipNoDist(t);
  B.resetHfBudgetCache();
  const n = B.seedHfBudgetStates(
    "acct-seed",
    [
      { group_id: "gA@chatroom", hour_count: 3, day_count: 12, last_sent_at: T - 400 },
      { group_id: "gB@chatroom", hour_count: 0, day_count: 0, last_sent_at: null },
      { group_id: "", hour_count: 5, day_count: 5, last_sent_at: T }, // 脏数据必须被跳过
    ],
    T,
  );
  assert.equal(n, 2, '空 group_id 不计入');
  assert.equal(B.hfBudgetTrackedGroups(), 2);
  const stateA = B.getHfBudgetState("acct-seed", "gA@chatroom", T + 1);
  assert.equal(stateA.hourCount, 3);
  assert.equal(stateA.dayCount, 12);
  assert.equal(stateA.lastReplyAtSec, T - 400);
  assert.equal(stateA.lastHumanAtSec, null, '账本没有人类消息时刻 ⇒ 无法回填');
  // 回填后接着算: 3 条 + 间隔已过 ⇒ 放行 (额度确实被带入)
  assert.equal(B.checkHfBudget(stateA, CFG, T + 1, T + 1).allowed, true);
  const stateA2 = { ...stateA, hourCount: 8 };
  assert.equal(
    B.checkHfBudget(stateA2, CFG, T + 1, T + 1).reason,
    "budget-hour",
    '回填的小时额度必须真的生效 (重启不清零)',
  );
  B.resetHfBudgetCache();
});

test('seedHfBudgetStates: 负数/小数脏值收敛为非负整数', (t) => {
  skipNoDist(t);
  B.resetHfBudgetCache();
  B.seedHfBudgetStates("acct-dirty", [{ group_id: "g@chatroom", hour_count: -3, day_count: 2.7, last_sent_at: null }], T);
  const st = B.getHfBudgetState("acct-dirty", "g@chatroom", T);
  assert.equal(st.hourCount, 0);
  assert.equal(st.dayCount, 2);
  B.resetHfBudgetCache();
});

// ===== 7. 源级接线 (防"实现了但没接上") =====

test('源级守卫自检: fnBody 切片必须被限定在该函数内 (否则守卫是假绿)', (t) => {
  const gate = fnBody('src/inbound/heartflow.ts', 'export function checkHeartflowGate');
  assert.doesNotMatch(gate, /startHeartflowSweep/, '切片越界 = 下面的接线断言全部无意义');
  assert.doesNotMatch(gate, /buildHeartflowPrompt/, '切片越界');
  assert.ok(gate.length > 400 && gate.length < 6000, `checkHeartflowGate 切片长度异常: ${gate.length}`);
  const send = fnBody('src/inbound/heartflow-learn.ts', 'export async function persistHfSendOutcome');
  assert.doesNotMatch(send, /runHeartflowSweep/, '切片越界');
  assert.match(send, /export async function persistHfSendOutcome/, '切片必须含声明本身');
  assert.throws(() => fnBody('src/inbound/heartflow.ts', 'export function 这个函数不存在'), /找不到声明/, '函数被改名时守卫必须报错, 不许静默通过');
});

test('接线: 预算闸在 judge **之前** (checkHeartflowGate 内, 被拦的消息不花 LLM 调用)', (t) => {
  const hf = src('src/inbound/heartflow.ts');
  const gate = fnBody('src/inbound/heartflow.ts', 'export function checkHeartflowGate');
  assert.match(gate, /peekHfBudget\(/, 'checkHeartflowGate 必须调预算判定');
  // 闸必须在 minReplyIntervalSec / minJudgeIntervalSec 之后 ⇒ 才谈得上"在 judge 之前省 LLM 调用"
  assert.ok(
    gate.indexOf('minJudgeIntervalSec') < gate.indexOf('peekHfBudget('),
    '预算闸要挂在既有冷却/judge 频率闸**之后** (顺序反了会让便宜的结构闸被贵的判定绕过)',
  );
  assert.match(gate, /resolveHfBudget\(cfg\)/, '预算参数必须走 resolveHfBudget (缺省 = 中等档)');
  assert.match(gate, /verdict\.reason \?\? "budget"/, '拒绝原因必须透出给调用方');
  // 声明: 预算挂在 HeartflowConfig 上, 且不在 UI schema 里
  assert.match(hf, /budget\?:\s*HfBudgetConfig/, 'HeartflowConfig 必须含 budget?: HfBudgetConfig');
  const manifest = JSON.parse(read(`${ROOT}/openclaw.plugin.json`));
  const hfSchema = manifest.channelConfigs.wechatpadpro.schema.properties.heartflow;
  assert.equal(hfSchema.properties.budget, undefined, '预算不许回流 UI schema (文件/代码默认权威)');
  assert.ok(hfSchema.properties.enabled, 'UI schema 仍只保留总开关');
});

test('接线: 触发侧把账号与消息时刻传进门禁 (陈旧判定要消息时间, 不是墙上时间)', (t) => {
  const tr = src('src/inbound/triggers.ts');
  assert.match(tr, /checkHeartflowGate\([\s\S]{0,300}?msg\.accountId,[\s\S]{0,80}?msg\.ts,/, '必须传 msg.accountId + msg.ts');
});

test('接线: **真发出去**才占额度 (persistHfSendOutcome 的 sent 分支 + 同一条件开窗)', (t) => {
  const fn = fnBody('src/inbound/heartflow-learn.ts', 'export async function persistHfSendOutcome');
  assert.match(fn, /noteHfReplySent\(accountId, opts\.groupId, atSec\)/, 'sent 分支必须记额度');
  assert.match(fn, /_openWindows\.set\(/, '占额度的位置应与开窗同一处 (同一条件: vendor 确认发出)');
  const sentIdx = fn.indexOf('noteHfReplySent');
  const suppressedIdx = fn.indexOf('setHfLedgerSuppressed');
  assert.ok(sentIdx > 0 && sentIdx < suppressedIdx, '记额度必须在 sent 分支内 (suppressed 不占额度)');
});

test('接线: handler 记人类消息 (与接话判定同一处, 零额外 IO)', (t) => {
  const h = src('src/inbound/handler.ts');
  // v1.10.0: 记录点从"开窗群"放宽到**白名单内所有群** —— 旧码挂在 `if (!win) continue` 之后,
  //   于是只有刚被心流回过的群才有 lastHumanAtSec, "群里多久没人说话"这个观测量几乎恒为 null。
  assert.match(h, /noteHfHumanMessage\(m\.accountId, gid, nowSec\)/, 'handler 必须记人类消息时刻 (白名单全量)');
  assert.match(h, /if \(!isHfGroupAllowed\(gid, opts\.heartflow\)\) continue;/, '仍只对白名单群记 (控内存)');
  assert.match(h, /void markHfGroupEngaged\(/, '既有点位不许动 (部署门断言字面量)');
  assert.match(h, /atSec: m\.ts,/, '候选时刻必须用消息自己的 ts (不是 flush 墙上时间)');
});

test('接线: 账号启动回填 + /heartflow status 显示档位与拦截计数', (t) => {
  const i = src('src/index.ts');
  assert.match(i, /loadHfBudgetSeed\(accountId\)/, 'startAccount 必须回填预算计数');
  // v1.9.2: handleFeatureCommand 迁到 src/inbound/filehelper-features.ts —— status 侧断言跟着源码搬家, 意图不变
  const iCmd = src('src/inbound/filehelper-features.ts');
  assert.match(iCmd, /hfBudgetBlockedSnapshot\(\)/, 'status 必须显示本次运行的拦截计数');
  assert.match(iCmd, /resolveHfBudget\(hfCfg\)/, 'status 必须显示生效档位');
  const hl = src('src/inbound/heartflow-learn.ts');
  assert.match(hl, /export async function loadHfBudgetSeed/, 'heartflow-learn 必须 export loadHfBudgetSeed');
  assert.match(hl, /hfHourStartSec\(nowSec\)[\s\S]{0,60}?hfDayStartSec\(nowSec\)/, '回填边界必须用本地整点/零点');
  assert.match(hl, /catch[\s\S]{0,200}?budget seed failed/, '回填失败不得打断账号启动');
});

test('接线: 预算不改既有频率机制 (energy/冷却/judge 闸都还在)', (t) => {
  const hf = src('src/inbound/heartflow.ts');
  assert.match(hf, /minReplyIntervalSec/, '既有冷却保留');
  assert.match(hf, /minJudgeIntervalSec/, '既有 judge 频率闸保留');
  assert.match(hf, /energy/i, 'energy 状态机保留');
  assert.match(hf, /export function checkHeartflowGate/, 'gate 名字不许改 (既有测试/部署门锁死)');
});
