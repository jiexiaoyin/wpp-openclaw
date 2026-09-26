// tests/unit/heartflow-observe.test.mjs - v1.9.0 观测复盘 + 占比外环 (P3) 单元测试
//
// 两条最容易"假绿"的地方, 这里都钉住:
//   ① 占比分子必须能数到 bot 自己 —— 出站行 chat_id 为 NULL, 归群靠 COALESCE(NULLIF(chat_id,''), peer_id);
//      写错的话分子恒 0、占比永远显示 0%, **且不报任何错** (外环永不触发)。故这里有一条 SQL 源级断言。
//   ② 外环只能"收紧": 与画像收紧复合后必须仍 ≤ 各自单独收紧的结果 (历史教训: v1.6.6 正反馈飞轮)。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const read = (p) => fs.readFileSync(p, 'utf-8');

let o = null;
let loadErr = null;
try {
  o = await import(new URL('../../dist/inbound/heartflow-observe.js', import.meta.url));
} catch (e) {
  loadErr = e;
}
let budget = null;
try {
  budget = await import(new URL('../../dist/inbound/heartflow-budget.js', import.meta.url));
} catch {
  /* skip */
}
let dedupe = null;
try {
  dedupe = await import(new URL('../../dist/inbound/heartflow-dedupe.js', import.meta.url));
} catch {
  /* skip */
}

function skipNoDist(t) {
  if (!o) t.skip(`dist/inbound/heartflow-observe.js 缺失 (先 npm run build): ${loadErr?.message ?? ''}`);
}

const now = 1_800_000_000; // 固定时刻 (测试不依赖真实时钟)
const SG = { ...o?.HF_SHARE_GUARD_DEFAULTS };
const BASE = { enabled: true, minGapSec: 180, maxPerHour: 8, maxPerDay: 60, noConsecutiveWithoutHuman: true, quietHours: [] };

test('1. hfBotShare: 分母 = 群消息总数 (人类+bot); 空群 0 而不是 NaN/∞', (t) => {
  skipNoDist(t);
  assert.equal(o.hfBotShare(210, 30), 30 / 240);
  assert.equal(o.hfBotShare(0, 0), 0);
  assert.equal(o.hfBotShare(0, 3), 1, '群里只有 bot 说话 = 100% 占比 (外环该管这种)');
  assert.equal(o.hfBotShare(10, 0), 0);
  assert.equal(o.fmtHfShare(210, 30), '12.5% (30/240)', '格式必须带原始条数, 口径不能藏起来');
});

test('2. 占比分子能数到 bot: SQL 必须 COALESCE 归群 (chat_id 为 NULL 的出站行)', (t) => {
  const m = read(`${ROOT}/src/storage/db/mysql.ts`);
  const i = m.indexOf('async listHfBotMsgShare(');
  const body = m.slice(i, m.indexOf('async listHfOutboundTexts('));
  assert.ok(i >= 0, 'adapter 必须实现 listHfBotMsgShare');
  assert.match(body, /COALESCE\(NULLIF\(chat_id, ''\), peer_id\)/, '必须先按 chat_id 再回落 peer_id 归群');
  assert.match(body, /GROUP BY gid, direction/, '必须按群 × 方向分组 (分子=outbound)');
  assert.match(body, /peer_kind = 'group'/, '只统计群聊 (私聊会污染分母)');
  assert.doesNotMatch(body, /JOIN/i, '单表 (跨表 collation 冲突)');
  // 出站文本素材同样要归群 (重复率是按群比对的)
  const oi = m.indexOf('async listHfOutboundTexts(');
  const obody = m.slice(oi, m.indexOf('async upsertHfGroupState('));
  assert.match(obody, /COALESCE\(NULLIF\(chat_id, ''\), peer_id\)/, '重复率素材也必须 COALESCE 归群');
  assert.match(obody, /direction = 'outbound'/, '素材只取出站 (bot 自己说的话)');
  assert.doesNotMatch(obody, /JOIN/i, '单表');
});

test('3. hfEngagementLift: 本底过冷 ⇒ null (不除零, 也不吹成天文数字)', (t) => {
  skipNoDist(t);
  assert.equal(o.hfEngagementLift(0.3, 0.009), null, '本底 <0.01 ⇒ 不算 lift');
  assert.ok(Math.abs(o.hfEngagementLift(0.3, 0.05) - 6) < 1e-9, '0.3 / 0.05 = 6× (浮点: 5.999…)');
  assert.equal(o.hfEngagementLift(0.3, 0), null);
  assert.equal(o.hfEngagementLift(NaN, 0.5), null);
  assert.equal(o.hfVetoRate(0, 0), null, '无样本 ⇒ null (不是 0)');
  assert.equal(o.hfVetoRate(2, 10), 0.2);
});

test('4. hfEngagementSummary: 逐样本用它**自己那一小时**的本底过滤 (不是当前小时)', (t) => {
  skipNoDist(t);
  // 两条样本: 一条落在夜里 (本底 0, 沉默=可信), 一条落在白天 (本底 0.9, 沉默=不可信)
  const nightTs = Math.floor(new Date(2026, 0, 5, 3, 0, 0).getTime() / 1000);
  const dayTs = Math.floor(new Date(2026, 0, 5, 15, 0, 0).getTime() / 1000);
  const ambient = new Map([
    ['g1|3', 0],
    ['g1|15', 0.9],
  ]);
  const samples = [
    { group_id: 'g1', engaged: 0, engage_signal: 'silence', sent_at: nightTs },
    { group_id: 'g1', engaged: 0, engage_signal: 'silence', sent_at: dayTs },
  ];
  const s = o.hfEngagementSummary(samples, ambient, 0.5);
  assert.equal(s.usable, 1, '夜里那条可采信, 白天那条被本底过滤');
  assert.equal(s.skipped, 1);
  assert.equal(s.engaged, 0);
  assert.equal(s.rate, 0, '可采信样本里 0 条被接话');
  assert.equal(s.ambientP, 0, '本底均值取可采信样本 (夜里 = 0)');
  assert.equal(o.hfEngagementSummary([], ambient, 0.5).rate, null, '无样本 ⇒ null');
});

test('5. hfRepeatRate: 与闸同源 —— 数出来的重复 = 闸会拦下的条数', (t) => {
  skipNoDist(t);
  const cfg = { ...dedupe.HF_DEDUPE_DEFAULTS };
  dedupe.resetHfDedupeStore();
  const long = '这款手机现在活动价是3999元，支持分期免息，可以到店自提也可以发顺丰';
  const items = [
    { groupId: 'g1', text: long, atSec: 1000 },
    { groupId: 'g1', text: '另外提醒一下周末门店营业到晚上九点哦', atSec: 1100 }, // 不同内容
    { groupId: 'g1', text: long, atSec: 1200 }, // 与第一条重复
    { groupId: 'g2', text: long, atSec: 1300 }, // 不同群 ⇒ 不算重复
    { groupId: 'g1', text: '好的', atSec: 1400 }, // 短句豁免
  ];
  const r = o.hfRepeatRate(items, cfg);
  assert.equal(r.total, 5);
  assert.equal(r.repeats, 1, '只有第 3 条算重复 (同群 + 窗口内 + 相似)');
  assert.equal(r.prefix, 1);
  assert.equal(r.similar, 0);
  // 闸视角: 按时间顺序喂给闸, 应当恰好只在第 3 条命中
  let blocked = 0;
  for (const it of [...items].sort((a, b) => a.atSec - b.atSec)) {
    const v = dedupe.checkHfRepeat('acct', it.groupId, it.text, cfg, it.atSec);
    if (v) blocked++;
    else dedupe.noteHfRecentReply('acct', it.groupId, it.text, it.atSec, cfg);
  }
  assert.equal(blocked, r.repeats, '闸拦下的条数必须等于日报的重复条数 (两套口径=假收口)');
  dedupe.resetHfDedupeStore();
});

test('6. hfShareTighten: 边界 —— 恰好目标值不收紧 / 样本不足不收紧', (t) => {
  skipNoDist(t);
  assert.equal(o.hfShareTighten(BASE, SG.targetShare, { total: 100, botSends: 20 }, SG), null, '恰好 5% 不收紧');
  assert.equal(o.hfShareTighten(BASE, 0.051, { total: 39, botSends: 20 }, SG), null, '消息数不够不收紧');
  assert.equal(o.hfShareTighten(BASE, 0.051, { total: 100, botSends: 4 }, SG), null, 'bot 条数不够不收紧');
  assert.equal(o.hfShareTighten(BASE, 0.051, { total: 100, botSends: 20 }, { ...SG, enabled: false }), null, '开关关掉不收紧');
  const r = o.hfShareTighten(BASE, 0.15, { total: 240, botSends: 36 }, SG);
  assert.ok(r, '远超目标 (15%) 必须收紧');
  assert.equal(r.minGapSec, 360, '间隔 180 → 360');
  assert.equal(r.maxPerHour, 4, '8 → 4');
  assert.equal(r.maxPerDay, 30, '60 → 30');
});

test('7. hfShareTighten: 收紧值不越 cap/floor; "不限"档也能被收紧', (t) => {
  skipNoDist(t);
  const huge = { ...BASE, minGapSec: 1200, maxPerHour: 1, maxPerDay: 5 };
  const r = o.hfShareTighten(huge, 0.5, { total: 500, botSends: 200 }, SG);
  assert.equal(r.minGapSec, o.HF_SHARE_MIN_GAP_CAP_SEC, '间隔封顶 900s (不能收紧到半小时不说话)');
  assert.equal(r.maxPerHour, o.HF_SHARE_MAX_PER_HOUR_FLOOR, '每小时 ≥2 条');
  assert.equal(r.maxPerDay, o.HF_SHARE_MAX_PER_DAY_FLOOR, '每天 ≥10 条');
  // 0 = 不限: 用 floor 而不是 0÷2=0 (否则 tightenHfBudget 会把 0 当成"未指定"回落成不限 = 外环静默失效)
  const unlimited = { ...BASE, minGapSec: 0, maxPerHour: 0, maxPerDay: 0 };
  const r2 = o.hfShareTighten(unlimited, 0.2, { total: 500, botSends: 100 }, SG);
  assert.equal(r2.maxPerHour, o.HF_SHARE_MAX_PER_HOUR_FLOOR);
  assert.equal(r2.maxPerDay, o.HF_SHARE_MAX_PER_DAY_FLOOR);
  assert.equal(r2.minGapSec, 0, '原本不限间隔 ⇒ 0×2 = 0 (仍然不限, 但每小时/每天已封住)');
});

test('8. 复合: 外环收紧与画像收紧叠加后仍然只收紧 (取更严的一侧)', (t) => {
  skipNoDist(t);
  const share = o.hfShareTighten(BASE, 0.15, { total: 400, botSends: 60 }, SG);
  const profile = { enabled: true, minGapSec: 300, maxPerHour: 3, maxPerDay: 40 };
  const a = budget.tightenHfBudget(BASE, share); // 外环
  const b = budget.tightenHfBudget(BASE, profile); // 画像
  const both = budget.tightenHfBudget(a, profile); // 外环 ∩ 画像
  const both2 = budget.tightenHfBudget(b, share); // 顺序无关
  assert.deepEqual(both, both2, '两层收紧与顺序无关');
  assert.ok(both.minGapSec >= Math.max(a.minGapSec, b.minGapSec), '间隔取更严');
  assert.ok(both.maxPerHour <= Math.min(a.maxPerHour, b.maxPerHour), '上限取更小');
  assert.ok(both.maxPerDay <= Math.min(a.maxPerDay, b.maxPerDay), '上限取更小');
  assert.ok(both.maxPerHour <= BASE.maxPerHour, '永不放宽');
  // 反向: 外环返回的档位绝不能让预算变松 (即便画像档更松)
  const loose = { enabled: true, minGapSec: 10, maxPerHour: 99, maxPerDay: 999 };
  const composed = budget.tightenHfBudget(share, loose);
  assert.equal(composed.minGapSec, 360, '更松的画像档不生效');
  assert.equal(composed.maxPerHour, 4);
});

test('9. 外环状态: 按本地日失效 (昨天的超标不锁今天的嘴)', (t) => {
  skipNoDist(t);
  o.resetHfShareGuard();
  const t0 = Math.floor(new Date(2026, 4, 10, 14, 0, 0).getTime() / 1000);
  const t1 = Math.floor(new Date(2026, 4, 11, 9, 0, 0).getTime() / 1000); // 次日
  o.noteHfGroupShare('acct', 'g1', t0, { total: 400, botSends: 60 }, 0.15);
  const hit = o.getHfShareTighten('acct', 'g1', BASE, undefined, t0);
  assert.ok(hit, '当日必须收紧');
  assert.equal(hit.maxPerHour, 4);
  assert.equal(o.getHfShareTighten('acct', 'g1', BASE, undefined, t1), null, '跨日 ⇒ 无数据, 不收紧');
  assert.equal(o.getHfShareTighten('acct', 'g2', BASE, undefined, t0), null, '没数据的群不收紧');
  assert.equal(o.getHfShareTighten('other', 'g1', BASE, undefined, t0), null, '别的账号不串');
  // 快照 (报告用) 只列命中的群
  const snap = o.hfShareGuardSnapshot('acct', BASE, undefined, t0);
  assert.equal(snap.length, 1);
  assert.equal(snap[0].groupId, 'g1');
  assert.equal(snap[0].to.maxPerHour, 4);
  assert.equal(o.hfShareGuardSnapshot('acct', BASE, undefined, t1).length, 0, '跨日快照为空');
  o.resetHfShareGuard();
});

test('10. buildHfDigest: 六节齐全 + 逐节口径标注 + 硬 cap 3500', (t) => {
  skipNoDist(t);
  const inp = {
    nowSec: now,
    days: 7,
    shares: [{ groupId: 'groupA', inbound: 350, outbound: 54, share: 54 / 404 }],
    engagement: { usable: 45, skipped: 12, rate: 0.31, ambientP: 0.04 },
    stopped: { negative: 1, veto: 2, total: 20 },
    repeat: { total: 54, repeats: 15, rate: 15 / 54, prefix: 10, similar: 5 },
    repeatSampleTotal: 54,
    layers: [{ groupId: 'groupA', layerKey: '18-24', n: 41, engaged: 4, rate: 0.098, suggestion: 0.65, applied: false }],
    budget: { 'budget-gap': 12, 'budget-hour': 3 },
    shareGuard: [{ groupId: 'groupA', share: 0.154, total: 404, botSends: 54, from: BASE, to: { minGapSec: 360, maxPerHour: 4, maxPerDay: 30 } }],
  };
  const text = o.buildHfDigest(inp);
  for (const sec of ['【发言占比】', '【接话率】', '【被制止率】', '【重复率】', '【分层 群×时段】', '【预算拦截】', '【占比外环】']) {
    assert.ok(text.includes(sec), `缺小节: ${sec}`);
  }
  assert.match(text, /ts 口径/, '占比/重复率必须标 ts 口径');
  assert.match(text, /judged_at 口径/, '被制止率必须标 judged_at 口径 (与上两节不同窗)');
  assert.match(text, /lift 7\.8×/, '本底 0.04 ⇒ lift = 0.31/0.04 = 7.75 ≈ 7.8×');
  assert.match(text, /未生效/, '影子分层必须标"未生效"');
  assert.match(text, /gap 12/, '预算拦截计数要显示');
  assert.ok(text.includes('54/404'), '占比必须带原始条数');
  assert.ok(text.length <= o.HF_DIGEST_MAX_CHARS, `正文不得超过硬 cap (实测 ${text.length})`);

  // 极端: 200 个群 + 大量素材 ⇒ 仍然 ≤ 3500 且带截断标记
  const big = {
    ...inp,
    shares: Array.from({ length: 200 }, (_, i) => ({ groupId: `group${i}@chatroom`, inbound: 100, outbound: 30, share: 0.23 })),
    layers: Array.from({ length: 200 }, (_, i) => ({ groupId: `group${i}@chatroom`, layerKey: '18-24', n: 90, engaged: 9, rate: 0.1, suggestion: 0.7, applied: true })),
    shareGuard: Array.from({ length: 50 }, (_, i) => ({ groupId: `group${i}@chatroom`, share: 0.2, total: 400, botSends: 80, from: BASE, to: { minGapSec: 360, maxPerHour: 4, maxPerDay: 30 } })),
  };
  const bigText = o.buildHfDigest(big);
  assert.ok(bigText.length <= o.HF_DIGEST_MAX_CHARS, `硬 cap 必须生效 (实测 ${bigText.length})`);
  assert.match(bigText, /…其余 \d+ 群/, '群多了要折叠而不是全列');
});

test('11. 报告出口: 走 filehelper (不经 sendAiReply), 且被卡在 3500 以内', (t) => {
  const idx = read(`${ROOT}/src/index.ts`);
  const i = idx.indexOf('if (feature === "heartflow" && arg === "report")');
  assert.ok(i >= 0, '/heartflow report 必须存在');
  const body = idx.slice(i, idx.indexOf('// 未知 action: 提示用法'));
  assert.match(body, /await send\(text\)/, '必须用注入的 send (filehelper 出口)');
  assert.doesNotMatch(body, /sendAiReply/, '日报不是"回复", 不得走 sendAiReply (会进 sha1 去重/落心流台账)');
  assert.match(body, /buildHfDigest\(/, '正文必须由 buildHfDigest 生成 (含硬 cap)');
  assert.match(body, /Math\.min\(Math\.max\(Math\.floor\(raw\), 1\), 30\)/, '天数必须钳到 1..30');
  assert.match(idx, /listHfOutboundTexts\(accountId, since, 2000\)/, '重复率素材必须有条数上限');
  assert.match(idx, /report \[天数\]/, '用法提示里要有 report');
});

test('12. 外环接在 triggers 的预算合成链上 (两层都只能收紧)', (t) => {
  const tr = read(`${ROOT}/src/inbound/triggers.ts`);
  assert.match(tr, /getHfShareTighten\(/, 'triggers 必须读外环收紧档');
  assert.match(tr, /tightenHfBudget\(budgetBase, shareTighten\)/, '外环必须走 tightenHfBudget 复合 (不是直接替换预算)');
  const iShare = tr.indexOf('getHfShareTighten(');
  const iGate = tr.indexOf('checkHeartflowGate(');
  assert.ok(iShare > 0 && iGate > iShare, '必须在 gate 之前算出有效预算');
  // sweep 侧: DB 聚合在 learn.ts, judge 侧零 DB IO
  const ln = read(`${ROOT}/src/inbound/heartflow-learn.ts`);
  assert.match(ln, /maybeRecomputeHfShareGuard\(/, 'sweep 必须重算占比');
  assert.match(ln, /listHfBotMsgShare\(accountId, hfDayStartSec\(nowSec\)\)/, '当日窗口必须用本地零点');
  assert.match(ln, /pruneHfRecentReplies\(nowSec/, 'sweep 必须裁重复历史 (防内存增长)');
  // 判定顺序: 外环 pass 必须在自动调阈闸之前 (与画像/分层同级, 不依赖调阈开关)
  assert.ok(
    ln.indexOf('maybeRecomputeHfShareGuard(') < ln.indexOf('if (!L.enabled) return;'),
    '外环 pass 必须在 learning.enabled 判定之前',
  );
});

test('13. 配置面: shareGuard 只在 HeartflowConfig + 模块默认, 不进默认容器/UI schema', (t) => {
  const hf = read(`${ROOT}/src/inbound/heartflow.ts`);
  assert.match(hf, /shareGuard\?: HfShareGuardConfig/);
  assert.match(hf, /import type \{ HfShareGuardConfig \}/, '必须 import type (值导入会与 observe ↔ heartflow 成环)');
  const defIdx = hf.indexOf('export function defaultHeartflowConfig(');
  assert.doesNotMatch(hf.slice(defIdx, hf.indexOf('\n}', defIdx)), /shareGuard/);
  const obs = read(`${ROOT}/src/inbound/heartflow-observe.ts`);
  assert.doesNotMatch(obs, /from "\.\/heartflow-learn\.js"/, 'observe 不得 import learn (成环)');
  assert.doesNotMatch(obs, /heartflow-layer\.js/, 'observe 不得依赖 layer (keeper 单一: 观测只吃现成数据)');
});

test('14. 状态面: /heartflow status 能看到重复闸拦下数与外环收紧名单', (t) => {
  const idx = read(`${ROOT}/src/index.ts`);
  assert.match(idx, /重复闸: \$\{DED\.enabled/, 'status 必须显示重复闸状态');
  assert.match(idx, /占比外环: \$\{SG\.enabled/, 'status 必须显示外环状态');
  assert.match(idx, /近24h拦下: \$\{suppressed\["repeat"\] \?\? 0\}/, '必须显示近 24h 被闸拦下的条数 (误杀信号)');
  assert.match(idx, /心流 on\/off\/status\/report/, '命令面板 desc 必须有 report');
});

test('15. 时间口径: 一切按群聚合都走 ts, 不用遗留死列 create_time', (t) => {
  // 2026-09-26 生产只读实测 (数字不进仓): wpp_messages.create_time 是遗留死列 —— 当前代码只读不写,
  //   2026-08-11 之后的行全为 NULL; 更早的非空值形如 20260811094227 (YYYYMMDDHHMMSS), **不是 epoch**。
  //   把它当秒用 ⇒ 那些行被算成公元 643000 年 ⇒ 分桶/排序/窗口全错且**不报错**。
  //   本门钉住"别再写回去"。当前窗口 (≤30 天) 恰好够不到那些行, 属埋着的雷, 已一并拆除。
  const m = read(`${ROOT}/src/storage/db/mysql.ts`);
  assert.doesNotMatch(m, /COALESCE\(create_time/, '任何聚合/排序都不得回退到 create_time (值不是 epoch)');
  for (const fn of ['listHfGroupMsgHourBuckets', 'getHfGroupMessageStats', 'listHfOutboundTexts']) {
    const i = m.indexOf(`async ${fn}(`);
    assert.ok(i > 0, `${fn} 必须存在`);
    const body = m.slice(i, i + 2200);
    assert.match(body, /UNIX_TIMESTAMP\(ts\)/, `${fn} 必须用 UNIX_TIMESTAMP(ts) 取绝对 epoch`);
    assert.doesNotMatch(body, /create_time/, `${fn} 不得再引用 create_time`);
  }
  // 出站行归群必须 COALESCE(NULLIF(chat_id,''), peer_id): 生产实测出站行的这两列**全部为空**
  assert.match(m, /COALESCE\(NULLIF\(chat_id, ''\), peer_id\) AS gid/, '出站归群必须 COALESCE 兜底 (否则分子恒 0)');
});
