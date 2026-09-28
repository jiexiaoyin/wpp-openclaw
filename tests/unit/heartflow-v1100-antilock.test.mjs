// tests/unit/heartflow-v1100-antilock.test.mjs - v1.10.0 心流"阈值自锁"防复发
//
// 事故 (2026-09-26 → 09-28): 心流**整整停摆 3 天**, 群里零主动回复, 而所有既有埋点都是绿的
//   (judge_calls 照涨 / 台账照写 / 状态页照显示 0.6)。三重成因, 本文件逐条钉住:
//     ① 画像 `botRole`/`summary` 里的**禁言令** ("基本不该插话的旁观者" / "不主动闲聊") 被当证据喂进
//        五维裁判 ⇒ 离线 A/B 复放实测均分 0.322 (原始 0.72), 20/23 条被判"不该回"(占权重 65%);
//     ② **阈值被印进 judge prompt** 当及格线 ⇒ 反馈闭环自我锚定 (裁判向阈值靠, 阈值再涨);
//     ③ 画像 band 是**无上界硬地板** (生产 0.70/0.85/0.85/0.90), 高于裁判给"明显该回"档的实测上限 0.82
//        ⇒ 几何上不可能过阈。
//
// 本文件的断言分三层, 层次即修复的可信度:
//   A. 纯函数行为 (真的算对了)
//   B. 接线 (真的接上了 —— 源码级, 因为热路径函数带 DB/内存状态, 单测不得碰生产库)
//   C. 不变量 (真的**再也不会**以旧形状回来: 硬地板消失 / 单一算法入口)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const src = (rel) => fs.readFileSync(`${ROOT}/${rel}`, 'utf-8');

let L = null;
let P = null;
let HF = null;
try {
  L = await import(new URL('../../dist/inbound/heartflow-learn.js', import.meta.url));
  P = await import(new URL('../../dist/inbound/heartflow-profile.js', import.meta.url));
  HF = await import(new URL('../../dist/inbound/heartflow.js', import.meta.url));
} catch (e) {
  console.error(`[heartflow-v1100] dist 缺失: ${e.message}`);
}
function skipNoDist(t, m) {
  if (!m) t.skip('dist 缺失 (先 npm run build)');
}

/** 取某个顶层声明的完整函数体 (与 heartflow-budget.test.mjs 同款) */
function fnBody(rel, decl) {
  const s = src(rel);
  const i = s.indexOf(decl);
  assert.ok(i >= 0, `${rel} 里找不到声明: ${decl}`);
  const rest = s.slice(i + decl.length);
  const next = rest.search(/\n(?:\/\*\*|export (?:async )?function|export const|export interface|const _|function |\/\/ =)/);
  return s.slice(i, next < 0 ? s.length : i + decl.length + next);
}

const BASE_CFG = { enabled: true, replyThreshold: 0.6 };

// ============================================================================
// A. 纯函数
// ============================================================================

test('A1: 画像 band 只抬不降, 且抬升**有上界** (+0.10) —— 0.85 不再成为及格线', (t) => {
  skipNoDist(t, P);
  const r = P.resolveHfProfileBandEffect(0.6, 0.85);
  assert.equal(r.capped, true, '画像要 0.85 而基线 0.6 ⇒ 必须被截断 (这正是 09-26 的起火点)');
  assert.ok(Math.abs(r.threshold - 0.7) < 1e-9, `生效值应为 0.6+0.10=0.70, 实得 ${r.threshold}`);
  assert.ok(r.threshold < 0.82, '生效阈值必须低于裁判"明显该回"档的实测上限 0.82, 否则又是几何不可能');
});

test('A2: band 低于锚点 ⇒ 不得下压 (画像无权放宽约束)', (t) => {
  skipNoDist(t, P);
  const r = P.resolveHfProfileBandEffect(0.7, 0.55);
  assert.equal(r.threshold, 0.7, '画像说"可以更主动" 不生效 —— 只抬不降');
  assert.equal(r.capped, false);
});

test('A3: 无 band / 非法值 ⇒ 锚点原样过硬区间, 不算"被截断"', (t) => {
  skipNoDist(t, P);
  for (const band of [null, undefined, NaN]) {
    const r = P.resolveHfProfileBandEffect(0.6, band);
    assert.equal(r.threshold, 0.6);
    assert.equal(r.capped, false, '没有画像建议就无所谓截断 (否则会天天误报 warn)');
  }
});

test('A4: 抬升后再与硬区间 [bandMin, bandMax] 取交 (双保险不互相绕过)', (t) => {
  skipNoDist(t, P);
  const lo = P.resolveHfProfileBandEffect(0.4, null, { bandMin: 0.5, bandMax: 0.9 });
  assert.equal(lo.threshold, 0.5, '低于 bandMin 必须被抬到地板 (老板 09-16 定的质量底线)');
  const hi = P.resolveHfProfileBandEffect(0.88, 0.95, { bandMin: 0.5, bandMax: 0.9 });
  assert.ok(hi.threshold <= 0.9, '不得越过 bandMax');
});

test('A5: 可自定义 maxRaise (配置化, 不硬编码 0.10)', (t) => {
  skipNoDist(t, P);
  const r = P.resolveHfProfileBandEffect(0.6, 0.9, { maxRaise: 0.05 });
  assert.ok(Math.abs(r.threshold - 0.65) < 1e-9);
  assert.equal(r.capped, true);
});

test('A6: 禁言令过滤 —— 画像的"别插话"文本进不了 judge prompt', (t) => {
  skipNoDist(t, P);
  // 生产四条画像的真实措辞 (台账/画像表里逐字抄来的)
  const mutes = [
    '基本不该插话的旁观者，只在被点名时出现',
    '保持旁观者心态，不主动闲聊',
    '不要插话，除非有人直接问',
    '尽量沉默，少说话，围观者角色',
    '不主动参与讨论',
    '禁言模式：保持沉默',
  ];
  for (const m of mutes) {
    assert.equal(P.stripHfMutePhrases(m), '', `禁言令必须被整条丢掉: ${m}`);
  }
  // 正向: 身份+口吻文本必须**原样保留** (09-26 复盘证明这类文本是资产, 不是负债)
  const keeps = [
    '群里懂手机的熟人，说话简短直接',
    '像店里的老伙计，别人问价就应一声',
  ];
  for (const k of keeps) assert.equal(P.stripHfMutePhrases(k), k, `身份/口吻文本不得被误杀: ${k}`);
});

test('A7: guardHfProfileForPrompt 只过滤两个"否决票"字段, 话题清单不动', (t) => {
  skipNoDist(t, P);
  const p = {
    nature: '手机零售商售后群',
    style: '短句、口语',
    botRole: '基本不该插话的旁观者',
    summary: '不该说话，除非被点名',
    engage: ['售后', '报价'],
    avoid: ['吵架'],
  };
  const g = P.guardHfProfileForPrompt(p);
  assert.equal(g.botRole, '', 'bot_role 是禁言令 ⇒ 清空');
  assert.equal(g.summary, '', 'summary 是禁言令 ⇒ 清空');
  assert.deepEqual(g.engage, ['售后', '报价'], 'engage 是话题清单, 不扫 (扫了就是把资产也删了)');
  assert.deepEqual(g.avoid, ['吵架']);
  assert.equal(p.botRole, '基本不该插话的旁观者', '不得改原对象 —— /heartflow profile 要看得到真相');
});

test('A8: 可达性天花板 = 最高分 + 一步, 且不破 bandMin 地板', (t) => {
  skipNoDist(t, L);
  const p = { minSample: 3, step: 0.05, bandMin: 0.5 };
  // 09-26 生产实况: 38 条判定最高 0.39, 生效阈值 0.85 ⇒ 这就是"关闸", 必须被压回
  const r = L.hfReachabilityCap([0.39, 0.32, 0.18, 0.35], 0.85, p);
  assert.ok(r, '阈值 0.85 而最高分 0.39 ⇒ 必须给出天花板');
  assert.ok(Math.abs(r.cap - 0.5) < 1e-9, `0.39+0.05=0.44 低于地板 ⇒ 抬到 bandMin 0.5, 实得 ${r.cap}`);
  assert.ok(Math.abs(r.maxScore - 0.39) < 1e-9, '要报出判据 (最高分), 否则告警无法被人复核');
  assert.equal(r.n, 4);
  // 正常滞回: 最高分 0.58 + 0.05 = 0.63 > 阈值 0.60 ⇒ 不起作用 ("刚好差一点"是健康态)
  assert.equal(L.hfReachabilityCap([0.58, 0.5, 0.55], 0.6, p), null);
});

test('A9: 可达性天花板 —— 样本不足 / 够得着 / 空集 一律不设', (t) => {
  skipNoDist(t, L);
  const p = { minSample: 5, step: 0.05, bandMin: 0.5 };
  assert.equal(L.hfReachabilityCap([0.2, 0.3, 0.31, 0.2], 0.85, p), null, 'n<minSample ⇒ 不设 (冷清群本来就该少说话)');
  assert.equal(L.hfReachabilityCap([0.2, 0.3, 0.31, 0.2, 0.9], 0.85, p), null, '有一条够得着 ⇒ 阈值可达, 不需护栏');
  assert.equal(L.hfReachabilityCap([], 0.85, p), null);
  // 非有限值不参与计数 (DB 里 decimal 可能是 null/NaN 化的行): 有效样本 0.2/0.3 两条
  //   ⇒ 够 minSample=2 ⇒ 应给出天花板 max(0.5, 0.35)=0.5 —— 也就是说"脏值不会把样本量灌水"
  const dirty = L.hfReachabilityCap([NaN, null, undefined, 0.2, 0.3], 0.85, { ...p, minSample: 2 });
  assert.ok(dirty && dirty.n === 2, `非有限值不得计入样本量, 实得 n=${dirty?.n}`);
  assert.ok(Math.abs(dirty.cap - 0.5) < 1e-9, '0.3+0.05=0.35 低于地板 ⇒ 抬到 bandMin 0.5');
});

test('A10: judge prompt 里**不再出现阈值数字** (切断自我锚定闭环)', (t) => {
  skipNoDist(t, HF);
  const input = {
    chatId: 'g1',
    botNickname: '小助理',
    content: '这个多少钱',
    senderName: '张三',
    chatContext: '',
    recentMessages: [],
    lastBotReply: '',
    secondsSinceLastReply: 0,
    energy: 1,
  };
  const out = HF.buildHeartflowPrompt(input, { enabled: true, replyThreshold: 0.6 });
  assert.ok(!/回复阈值/.test(out), 'prompt 里不得再有"回复阈值"这一行');
  assert.ok(!/0\.6/.test(out), 'prompt 里不得出现阈值数字 (0.6) —— 裁判只按五维尺度打分');
  // 反面对照: 换一个阈值也不该出现
  const out2 = HF.buildHeartflowPrompt(input, { enabled: true, replyThreshold: 0.85 });
  assert.ok(!/0\.85/.test(out2), '阈值 0.85 同样不得被印进 prompt');
});

// ============================================================================
// B. 接线 (源码级)
// ============================================================================

test('B1: 生效阈值只有**一个算法入口** —— judge 与状态页共用', (t) => {
  const h = src('src/inbound/handler.ts');
  assert.match(h, /resolveHfEffectiveThreshold\(/, 'judge 侧必须走统一入口');
  assert.doesNotMatch(h, /resolveHfProfileBandEffectFor\(/, 'judge 侧不得再自己拼 band 逻辑 (旧的三段内联)');
  assert.doesNotMatch(h, /clampHfThresholdToReachability\(/, '可达性钳制也要在统一入口里做');
  const f = src('src/inbound/filehelper-features.ts');
  assert.match(f, /resolveHfEffectiveThreshold\(/, '/heartflow status/why 必须与 judge 同源');
  assert.match(f, /last === null|last == null/, '状态页必须处理"从未发过"');
});

test('B2: resolveHfEffectiveThreshold 的链路顺序 = 学习覆盖 → 画像有界抬升 → 可达性天花板', (t) => {
  const body = fnBody('src/inbound/heartflow-learn.ts', 'export function resolveHfEffectiveThreshold(');
  const iOverride = body.indexOf('resolveThresholdOverride(');
  const iBand = body.indexOf('resolveHfProfileBandEffectFor(');
  const iCap = body.indexOf('clampHfThresholdToReachability(');
  assert.ok(iOverride > 0 && iBand > iOverride && iCap > iBand, '顺序错了会得出与 judge 不同的值');
  assert.match(body, /bandCapped: bandEff\.capped/, '被截断这件事必须传出去 (状态页/告警要用)');
});

test('B3: sweep 每轮刷新可达性天花板 —— 且**不受 learning.enabled 影响**', (t) => {
  const body = fnBody('src/inbound/heartflow-learn.ts', 'async function refreshHfReachabilityCaps(');
  // 生效阈值必须与 judge 完全同源, 否则护栏量错对象
  assert.match(body, /resolveThresholdOverride\(accountId, groupId, cfg, nowSec\)/, 'sweep 必须用判定同款学习值');
  assert.match(body, /resolveHfProfileBandEffectFor\(accountId, groupId, anchor, cfg\)/, 'sweep 必须算上画像抬升');
  assert.match(body, /hfReachabilityCap\(scores, eff, \{/, '判据是"生效阈值"而不是账号级基线');
  assert.match(body, /if \(!r\) \{[\s\S]{0,200}?_reachCaps\.delete\(key\)/, '够得着后必须**清掉**旧天花板, 否则压住值永不恢复');
  assert.match(body, /!L\.recoverUnreachable[\s\S]{0,300}_reachCaps\.delete\(k\)/, '关掉开关必须真能关 (清缓存)');

  const sweep = fnBody('src/inbound/heartflow-learn.ts', 'export async function runHeartflowSweep(');
  assert.match(sweep, /refreshHfReachabilityCaps\(/, 'sweep 必须调用护栏');
  const iCap = sweep.indexOf('await refreshHfReachabilityCaps(');
  const iDisabled = sweep.indexOf('if (!L.enabled)');
  assert.ok(iCap > 0 && iDisabled > 0 && iCap < iDisabled,
    '护栏必须在 `if (!L.enabled) return` **之前**跑 (老板关掉自动调阈时阈值仍可能被画像设到够不着)');
});

test('B4: 停摆金丝雀 —— 每轮 sweep 无条件刷新"距上次真发言"', (t) => {
  const sweep = fnBody('src/inbound/heartflow-learn.ts', 'export async function runHeartflowSweep(');
  const iCanary = sweep.indexOf('setLastSendAgeSec(');
  const iDisabled = sweep.indexOf('if (!L.enabled)');
  assert.ok(iCanary > 0 && iDisabled > 0 && iCanary < iDisabled, '金丝雀必须在提前 return 之前');
  assert.match(sweep, /getHfLastSentAtSec\(accountId\)/, '必须读 sent_at (真发言), 不是 judged_at');
  assert.match(sweep, /last == null \? -1 :/, '从未发过必须用 -1 (0 会被读成"刚刚发过", 是最糟的误导方向)');
});

test('B5: 可达性告警**节流** (首现/值变/每小时), 否则每 300s 一轮把 journal 刷满', (t) => {
  const body = fnBody('src/inbound/heartflow-learn.ts', 'async function refreshHfReachabilityCaps(');
  assert.match(body, /const shouldWarn = !prev \|\| prev\.cap !== r\.cap \|\| nowSec - prev\.atSec >= 3600/, '必须有节流条件');
  assert.match(body, /if \(shouldWarn\)[\s\S]{0,120}incReachCapApplied\(\)/, '节流内的告警才计数 (计数=真实告警数)');
  assert.match(body, /threshold unreachable/, '告警文案要能被人 grep 到');
});

test('B6: 预算是**每群**的, 但同批同群只能出一条 (批内闸)', (t) => {
  const h = src('src/inbound/handler.ts');
  assert.match(h, /const hfBatchReplied = new Set<string>\(\)/, '批内闸状态必须存在');
  const iCheck = h.indexOf('hfBatchReplied.has(hfBatchKey)');
  const iAdd = h.indexOf('hfBatchReplied.add(hfBatchKey)');
  assert.ok(iCheck > 0 && iAdd > iCheck, '必须先查后加 (顺序反了 = 第一个候选就出局)');
  assert.match(h, /同批同群已回复/, '跳过要留 debug 痕迹');
});

test('B7: 收敛标记精确到**台账行** (一个信号不得同时给两条 sent 行记账)', (t) => {
  // 收窄发生在 learn 层 (handler 只按群聚合候选, 由 learn 决定"是哪一行 sent 在开窗")
  const body = fnBody('src/inbound/heartflow-learn.ts', 'export async function markHfGroupEngaged(');
  assert.ok(/markHfEngaged\([^)]*w\.inboundMsgId\)/s.test(body),
    'markHfGroupEngaged 必须把开窗记录的 inboundMsgId 一起传下去 (否则一个信号给两条 sent 行记账)');
  const mbody = fnBody('src/storage/db/mysql.ts', 'async markHfEngaged(');
  assert.ok(/rowScope = inboundMsgId \? " AND inbound_msg_id = \?" : ""/.test(mbody),
    'SQL 必须按 inbound_msg_id 收窄');
  assert.ok(/rowArg/.test(mbody), '收窄参数要真的绑进两条 UPDATE (只声明不绑 = 假收窄)');
  const w = fnBody('src/inbound/heartflow-learn.ts', 'export async function persistHfSendOutcome(');
  assert.ok(/inboundMsgId/.test(w), '开窗时必须记下"是哪条人类消息让我回的"');
});

test('B8: 人类消息时间戳对**所有白名单群**记录 (不限"有开窗"的群)', (t) => {
  const h = src('src/inbound/handler.ts');
  // 旧码把 noteHfHumanMessage 塞在"有开窗"的循环里 ⇒ 没回过话的群永远没有 minGap 数据
  const calls = [...h.matchAll(/noteHfHumanMessage\(/g)];
  assert.ok(calls.length >= 1, 'noteHfHumanMessage 必须被调用');
  const idx = h.indexOf('noteHfHumanMessage(');
  const around = h.slice(Math.max(0, idx - 900), idx + 300);
  assert.ok(/isHfGroupAllowed\(/.test(around), '只对白名单群记 (非白名单群的流量不该进内存)');
  assert.ok(/fromWxid === opts\.triggerCtx\.botWxid/.test(around), '必须排除 bot 自己的消息 (自问自答不是人类的沉默)');
  assert.ok(/msgType === MsgType\.SYSTEM/.test(around), '系统通知不算人类消息');
  // 关键不变量: 它不得再挂在"该群有开窗"的分支里 (旧形状 = 只有刚回过话的 10 分钟才记录)
  const iWindowGate = around.lastIndexOf('if (!win)');
  const iNote = around.lastIndexOf('noteHfHumanMessage(');
  assert.ok(iNote > iWindowGate, 'noteHfHumanMessage 必须在开窗判断**之外** (旧码挂在 win 分支里 ⇒ 指标恒 null)');
});

test('B9: 指标预声明 —— 零值序列从进程启动就存在', (t) => {
  const m = src('src/monitor/metrics.ts');
  for (const name of ['hf_judge_passed_total', 'hf_judge_below_total', 'hf_sends_total', 'hf_reach_cap_applied_total']) {
    assert.match(m, new RegExp(`declareCounter\\("${name}"\\)`), `${name} 必须预声明`);
  }
  for (const name of ['hf_last_send_age_sec', 'hf_effective_threshold_max', 'hf_threshold_ceiling_groups', 'hf_reachable_groups']) {
    assert.match(m, new RegExp(`declareGauge\\("${name}"\\)`), `${name} 必须预声明 (否则"值为 0"与"埋点没接上"分不开)`);
  }
  // 金丝雀用 -1 表示"从未", 不能用 0
  assert.match(m, /setLastSendAgeSec: \(sec: number\) => setGauge\("hf_last_send_age_sec", sec\)/);
});

test('B10: 画像生成 prompt 里加了硬约束 (源头就别写禁言令 / 别写 0.85)', (t) => {
  const body = fnBody('src/inbound/heartflow-profile.ts', 'export function buildHfProfilePrompt(');
  assert.match(body, /身份与口吻/, 'bot_role 的语义要写成"身份与口吻" (旧: 角色定位 ⇒ 模型往"该不该说话"上写)');
  assert.match(body, /不主动|别插话|不该插话/, '必须有"不要写禁言结论"的反例约束');
  assert.match(body, /0\.55|0\.70/, 'band 必须给出合理区间 (0.55-0.70), 否则模型照着旧画像的 0.9 抄');
});

test('B11: 注入前过滤 —— 缓存装载时就剥掉禁言令, 并留 warn', (t) => {
  const body = fnBody('src/inbound/heartflow-profile.ts', 'export function loadHfProfilesIntoCache(');
  assert.match(body, /guardHfProfileForPrompt\(/, '装载即过滤 (渲染层再过滤就晚了 —— 缓存里已是毒文本)');
  assert.match(body, /mute-phrase stripped/, '剥掉要留痕 (否则"画像为什么没生效"无从查起)');
});

// ============================================================================
// C. 不变量: 旧形状不得回归
// ============================================================================

test('C1: 全仓不得再有"无上界的画像硬地板"', (t) => {
  for (const rel of ['src/inbound/handler.ts', 'src/inbound/filehelper-features.ts',
                     'src/inbound/heartflow-learn.ts', 'src/inbound/heartflow-profile.ts']) {
    const s = src(rel);
    assert.doesNotMatch(s, /Math\.max\([^)]*getHfProfileBandFloor|getHfProfileBandFloor\([^)]*\)\s*\)/,
      `${rel}: 画像 band 不得直接参与 Math.max (旧的点火器)`);
  }
});

test('C2: 阈值不得回流到 judge prompt 构造里', (t) => {
  const body = fnBody('src/inbound/heartflow.ts', 'export function buildHeartflowPrompt(');
  assert.doesNotMatch(body, /replyThreshold/, '不要把阈值写回 prompt (模块头注释里的复盘除外)');
});

test('C3: 台账 sent 状态跃迁放宽 —— 被预算/去重拦过的行也能补记真发', (t) => {
  const body = fnBody('src/storage/db/mysql.ts', 'async setHfLedgerSent(');
  assert.match(body, /status = 'judged' OR \(status = 'suppressed' AND sent_at IS NULL\)/,
    'suppressed→sent 的补记必须允许 (否则占位符行永远停在 suppressed, 学习样本缺口)');
});

test('C4: DDL/接口一致 —— 新查询在 types/mysql/barrel 三处齐全', (t) => {
  assert.match(src('src/storage/db/types.ts'), /listHfRecentJudgedScores/, 'DbAdapter 接口必须有');
  assert.match(src('src/storage/db/mysql.ts'), /async listHfRecentJudgedScores\(/, 'mysql 实现必须有');
  assert.match(src('src/storage/db/index.ts'), /listHfRecentJudgedScores/, 'barrel 必须导出');
  assert.ok(/LIMIT \?/.test(src('src/storage/db/mysql.ts')), '聚合查询必须有行上限 (表会一直长)');
  assert.ok(/ORDER BY judged_at DESC, id DESC\s+LIMIT \?/.test(src('src/storage/db/mysql.ts')),
    '取"最近"必须带稳定排序 (judged_at 秒级会撞, 必须 id DESC 兜底)');
});

test('B12: 生效预算也收口为唯一入口 (账号档 → 画像 → 占比外环, 三层只许变严)', async (t) => {
  // 行为: 无画像/无外环状态 (刚启动) ⇒ 生效值 === 账号档, 且不抛
  const TG = await import(new URL('../../dist/inbound/triggers.js', import.meta.url)).catch(() => null);
  if (!TG) return t.skip('dist/inbound/triggers.js 缺失 (先 npm run build)');
  const cfg = { enabled: true, replyThreshold: 0.6, budget: { enabled: true, minGapSec: 600, maxPerHour: 3, maxPerDay: 15 } };
  const eff = TG.resolveHfEffectiveBudget('acct-none', 'group-none', cfg, 1_760_000_000);
  assert.equal(eff.minGapSec, 600, '无画像/无外环 ⇒ 生效 = 账号档');
  assert.equal(eff.maxPerHour, 3);
  // 接线: 判定与展示共用同一个函数 (禁止再出现第二份 "画像→外环" 内联链)
  const tg = src('src/inbound/triggers.ts');
  const body = fnBody('src/inbound/triggers.ts', 'export function shouldTrigger(');
  assert.ok(/resolveHfEffectiveBudget\(msg\.accountId, chatId, cfg\.heartflow/.test(body),
    'shouldTrigger 必须走统一入口');
  assert.ok(!/getHfShareTighten\(/.test(body), '判定侧不得再内联占比外环收紧 (已在入口内)');
  assert.ok(/export function resolveHfEffectiveBudget\(/.test(tg), '入口必须导出 (状态页要用)');
  assert.match(src('src/inbound/filehelper-features.ts'), /resolveHfEffectiveBudget\(accountId, g, hfCfg, nowSec\)/,
    '/heartflow status 必须显示**生效**预算, 而不是账号档');
});
