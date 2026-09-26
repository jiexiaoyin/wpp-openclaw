// tests/unit/heartflow-dedupe.test.mjs - v1.9.0 心流重复内容闸 (P3) 单元测试
//
// 为什么这批测试重要: 闸是**唯一会主动拦下 bot 发言**的机制 ⇒ 误杀的代价比漏放高。
//   误杀信号 = 群里明显该接的话 bot 装死; 老板看到的是"bot 变笨了", 而不是"闸太严了"。
//   故这里把三道误杀防护 (前缀优先 / minChars 豁免 / 数字差异) 逐个钉死。
//
// 还有一条**结构性**断言: 闸与"重复率"观测必须共用 hfRepeatVerdict —— 若各写一套,
//   日报说重复率很高而闸一条都没拦, "观测驱动收口"就是假的。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const read = (p) => fs.readFileSync(p, 'utf-8');

let d = null;
let loadErr = null;
try {
  d = await import(new URL('../../dist/inbound/heartflow-dedupe.js', import.meta.url));
} catch (e) {
  loadErr = e;
}
let learn = null;
try {
  learn = await import(new URL('../../dist/inbound/heartflow-learn.js', import.meta.url));
} catch {
  /* 由具体测试自己 skip */
}

function skipNoDist(t) {
  if (!d) t.skip(`dist/inbound/heartflow-dedupe.js 缺失 (先 npm run build): ${loadErr?.message ?? ''}`);
}

const CFG = { ...d?.HF_DEDUPE_DEFAULTS };

test('1. normHfText: 去 emoji/@/全角/标点/空白, 小写; 数字保留 (数字是语义, 不是噪声)', (t) => {
  skipNoDist(t);
  assert.equal(d.normHfText('你好，世界！'), '你好世界');
  assert.equal(d.normHfText('@张三 在吗？'), '在吗');
  assert.equal(d.normHfText('iPhone 15 多少钱'), 'iphone15多少钱');
  assert.equal(d.normHfText('ＡＢＣ　１２３'), 'abc123'); // 全角字母/数字 + 全角空格
  assert.equal(d.normHfText('收到 👌🎉'), '收到');
  assert.equal(d.normHfText(''), '');
  // 换行/多空格不该造成差异 (同一句话换个排版不算两句)
  assert.equal(d.normHfText('好的\n  \n我看看'), d.normHfText('好的 我看看'));
});

test('2. hfJaccard: 交集/并集, 空集不凭空相似', (t) => {
  skipNoDist(t);
  assert.equal(d.hfJaccard(new Set(['a', 'b']), new Set(['a', 'b'])), 1);
  assert.equal(d.hfJaccard(new Set(['a', 'b']), new Set(['c', 'd'])), 0);
  assert.equal(d.hfJaccard(new Set(), new Set(['a'])), 0);
  assert.equal(d.hfJaccard(new Set(['a']), new Set()), 0);
  // 1/3: {a,b,c} ∩ {a,x,y} = 1, ∪ = 5
  assert.ok(Math.abs(d.hfJaccard(new Set(['a', 'b', 'c']), new Set(['a', 'x', 'y'])) - 0.2) < 1e-9);
});

test('3. hfRepeatVerdict: 归一化前缀命中 (即使尾部不同) ⇒ prefix', (t) => {
  skipNoDist(t);
  // 归一化后公共前缀 = "亲这款现在有现货的哦今天下单明天到" (17 字 > minChars 12) —— 只有尾部不同
  const hist = [{ text: '亲，这款现在有现货的哦今天下单明天到，可以拍下', atSec: 1000 }];
  const v = d.hfRepeatVerdict('亲，这款现在有现货的哦今天下单明天到，要的话直接拍就行', hist, CFG, 1100);
  assert.ok(v, '前 12 字相同必须命中');
  assert.equal(v.kind, 'prefix');
  assert.equal(v.prevAt, 1000);
});

test('4. hfRepeatVerdict: 前缀不同但全体高度相似 ⇒ similar (3-gram Jaccard ≥0.85)', (t) => {
  skipNoDist(t);
  // 长回复 + 只在开头多两个字 ⇒ 前 12 字不同 (前缀判定不中), 但整体 3-gram 相似度仍 ≥0.85
  const body = '这款手机现在活动价是3999元，支持分期免息，可以到店自提也可以发顺丰，需要我帮您留一台吗';
  const a = `您问的${body}`;
  const b = `老板您问的${body}`;
  const v = d.hfRepeatVerdict(b, [{ text: a, atSec: 500 }], CFG, 600);
  assert.ok(v, '整体相似必须命中 (否则长回复换个称呼就复读了)');
  assert.equal(v.kind, 'similar');
  assert.ok(v.sim >= CFG.simThreshold, `sim=${v.sim?.toFixed(3)}`);
  // 前缀判定确实没中 (证明这条测的是 similar 分支而不是被 prefix 抢走)
  assert.notEqual(d.normHfText(a).slice(0, CFG.minChars), d.normHfText(b).slice(0, CFG.minChars));
});

test('5. 误杀防护①: 短句豁免 (minChars) —— "好的/收到" 不进判定', (t) => {
  skipNoDist(t);
  const hist = [{ text: '好的', atSec: 100 }, { text: '收到👌', atSec: 200 }];
  assert.equal(d.hfRepeatVerdict('好的', hist, CFG, 300), null);
  assert.equal(d.hfRepeatVerdict('收到', hist, CFG, 300), null);
  // 反过来: 历史里的短句也不参与 (与闸/日报两侧对称)
  assert.equal(d.hfRepeatVerdict('好的好的好的好的好的', [{ text: '好的', atSec: 100 }], CFG, 300), null);
});

test('6. 误杀防护②: 只差型号数字 ⇒ 不算重复 (保留数字的意义)', (t) => {
  skipNoDist(t);
  const a = 'iPhone 15 128G 现在报价是4599元';
  const b = 'iPhone 16 128G 现在报价是4599元';
  assert.equal(d.hfRepeatVerdict(b, [{ text: a, atSec: 100 }], CFG, 200), null, '型号不同必须放行');
});

test('7. 误杀防护③: 窗口外不命中 (6 小时前的旧话不算复读)', (t) => {
  skipNoDist(t);
  const hist = [{ text: '这款现在有现货哦，可以拍下', atSec: 1000 }];
  assert.ok(d.hfRepeatVerdict('这款现在有现货哦，可以拍下', hist, CFG, 1000 + CFG.windowSec), '窗口边界内仍命中');
  assert.equal(
    d.hfRepeatVerdict('这款现在有现货哦，可以拍下', hist, CFG, 1001 + CFG.windowSec),
    null,
    '超出 windowSec 必须放行',
  );
});

test('8. checkHfRepeat: 只比同群; 不同群各自独立 (含开关与 proactiveOnly)', (t) => {
  skipNoDist(t);
  d.resetHfDedupeStore();
  const cfg = { ...CFG };
  const t0 = 10_000;
  d.noteHfRecentReply('acct', 'groupA', '这款现在有现货哦，可以拍下', t0, cfg);
  assert.equal(d.hfRecentCount('acct', 'groupA'), 1);
  assert.equal(d.hfRecentCount('acct', 'groupB'), 0);
  assert.ok(d.checkHfRepeat('acct', 'groupA', '这款现在有现货哦，可以拍下', cfg, t0 + 60), '同群必须命中');
  assert.equal(d.checkHfRepeat('acct', 'groupB', '这款现在有现货哦，可以拍下', cfg, t0 + 60), null, '不同群不互比');
  assert.equal(
    d.checkHfRepeat('acct2', 'groupA', '这款现在有现货哦，可以拍下', cfg, t0 + 60),
    null,
    '不同账号不互比',
  );
  // 开关: enabled=false ⇒ 一律放行 (热重载即生效)
  assert.equal(d.checkHfRepeat('acct', 'groupA', '这款现在有现货哦，可以拍下', { ...cfg, enabled: false }, t0 + 60), null);
  // proactiveOnly: 非主动插话 (被 @/引用叫到) 不拦
  assert.equal(
    d.checkHfRepeat('acct', 'groupA', '这款现在有现货哦，可以拍下', cfg, t0 + 60, { proactive: false }),
    null,
  );
  d.resetHfDedupeStore();
});

test('9. noteHfRecentReply: 短句不进历史; historyMax 裁剪按窗口/条数双限', (t) => {
  skipNoDist(t);
  d.resetHfDedupeStore();
  const cfg = { ...CFG, historyMax: 3 };
  d.noteHfRecentReply('a', 'g', '好的', 100, cfg);
  assert.equal(d.hfRecentCount('a', 'g'), 0, '短句不进历史 (否则"好的"会互相判重)');
  for (let i = 0; i < 6; i++) d.noteHfRecentReply('a', 'g', `第${i}条不同内容的较长发言内容`, 100 + i, cfg);
  assert.equal(d.hfRecentCount('a', 'g'), 3, 'historyMax 生效');
  // 窗口裁剪: 推进到窗口外再记一条 ⇒ 旧的按窗口裁掉 (只留新的)
  d.noteHfRecentReply('a', 'g', '很久以后的一条完全不同发言', 100 + cfg.windowSec + 10, cfg);
  assert.equal(d.hfRecentCount('a', 'g'), 1, '窗口外的历史必须被裁掉');
  d.resetHfDedupeStore();
});

test('10. pruneHfRecentReplies: sweep 清理过期历史 (防长跑内存增长)', (t) => {
  skipNoDist(t);
  d.resetHfDedupeStore();
  const cfg = { ...CFG };
  d.noteHfRecentReply('a', 'g1', '这是一条够长的发言内容甲', 1000, cfg);
  d.noteHfRecentReply('a', 'g2', '这是一条够长的发言内容乙', 1000, cfg);
  d.pruneHfRecentReplies(1000 + cfg.windowSec, cfg); // 边界内保留
  assert.equal(d.hfRecentCount('a', 'g1'), 1);
  d.pruneHfRecentReplies(1001 + cfg.windowSec, cfg);
  assert.equal(d.hfRecentCount('a', 'g1'), 0);
  assert.equal(d.hfRecentCount('a', 'g2'), 0);
  d.resetHfDedupeStore();
});

test('11. resolveHfDedupeCfg: 非法值回落默认, 档位与 HF_DEDUPE_DEFAULTS 一致', (t) => {
  skipNoDist(t);
  const r = d.resolveHfDedupeCfg(undefined);
  assert.deepEqual(r, d.HF_DEDUPE_DEFAULTS);
  assert.equal(r.windowSec, 21600, '6 小时窗 (老板拍板)');
  assert.equal(r.simThreshold, 0.85, '相似阈值 0.85 (老板拍板)');
  assert.equal(r.proactiveOnly, true, '只对心流主动插话生效');
  // 非法: 相似度 0/1.5/NaN ⇒ 回落; 窗口 0/负 ⇒ 回落
  const bad = d.resolveHfDedupeCfg({ dedupe: { simThreshold: 1.5, windowSec: 0, minChars: -3, historyMax: 9999 } });
  assert.equal(bad.simThreshold, 0.85);
  assert.equal(bad.windowSec, 21600);
  assert.equal(bad.minChars, 12);
  assert.equal(bad.historyMax, 500, 'historyMax 必须被钳到 500 上限');
});

test('12. 结构性: 闸与重复率观测共用同一个判定函数 (否则观测驱动收口是假的)', (t) => {
  const obs = read(`${ROOT}/src/inbound/heartflow-observe.ts`);
  assert.match(obs, /import \{[^}]*hfRepeatVerdict[^}]*\} from "\.\/heartflow-dedupe\.js"/s, 'hfRepeatRate 必须调 hfRepeatVerdict');
  assert.match(obs, /for \(const it of sorted\)/, '重复率必须逐条走同一判定 (不能另写一套相似度)');
  assert.doesNotMatch(obs, /hfJaccard\(/, '重复率不得自己算 Jaccard (那就是第二套判定)');
});

test('13. 闸拦下 = 既不占预算也不开观察窗 (源级: suppressed 分支不含这两件事)', (t) => {
  const src = read(`${ROOT}/src/inbound/heartflow-learn.ts`);
  assert.equal(learn?.classifyHfSend({ ok: true, msgId: 'repeat-suppressed' }), 'suppressed', '必须判为 suppressed');
  const body = src.slice(src.indexOf('export async function persistHfSendOutcome('));
  const sentIdx = body.indexOf('if (outcome === "sent")');
  const supIdx = body.indexOf('if (outcome === "suppressed")');
  assert.ok(sentIdx >= 0 && supIdx > sentIdx, '两个分支必须都在');
  const supBody = body.slice(supIdx, body.indexOf('// pending: 不动'));
  assert.doesNotMatch(supBody, /noteHfReplySent\(/, 'suppressed 分支不得占预算额度');
  assert.doesNotMatch(supBody, /_openWindows\.set\(/, 'suppressed 分支不得开观察窗');
  assert.doesNotMatch(supBody, /noteHfRecentReply\(/, 'suppressed 分支不得进重复历史 (没说出口的话不能拦下一句)');
  // reason 映射必须认这条路 (否则台账里全是 unknown)
  assert.match(supBody, /"repeat-suppressed"\s*\?\s*"repeat"/, 'reason 必须映射成 repeat');
});

test('14. 钩子点: 闸在 deliver 回调里、await sendAiReply **之前**; 且只对心流主动插话', (t) => {
  const dp = read(`${ROOT}/src/dispatch/dispatcher.ts`);
  const iGate = dp.indexOf('checkHfRepeat(');
  const iSend = dp.indexOf('await sendAiReply(', iGate); // 从闸的位置往后找 (文件前面还有别的 sendAiReply 调用)
  assert.ok(iGate >= 0, 'deliver 回调必须调 checkHfRepeat');
  assert.ok(iSend > iGate, '闸必须在 sendAiReply 之前 (发出去了才发现重复就晚了)');
  assert.match(dp, /if \(msg\.trigger === "heartflow" && text\)/, '只对心流路径生效');
  assert.match(dp, /msgId: "repeat-suppressed"/, '拦下时必须走既有占位符通道 (classifyHfSend 才能认)');
  assert.match(dp, /logHfRepeatSkip\(/, '拦下必须留日志 (误杀要看得见)');
  // 不得塞进 sendAiReply (dispatcher.ts 里的账号级公共出口: filehelper/私聊/日报都走它)
  const ai = dp.slice(dp.indexOf('async function sendAiReply('), dp.indexOf('async function sendAiReply(') + 8000);
  assert.doesNotMatch(ai, /checkHfRepeat|hfRepeatVerdict/, 'sendAiReply 里不得有重复闸 (语义会与 sha1 去重互相盖)');
});

test('15. 无环 + 零 jieba 依赖: 本模块不 import heartflow-learn (反向依赖会成环)', (t) => {
  const src = read(`${ROOT}/src/inbound/heartflow-dedupe.ts`);
  assert.doesNotMatch(src, /from "\.\/heartflow-learn\.js"/, '不得 import heartflow-learn (成环)');
  // 只看 import 行 (头注释里提到 jargon/jieba 是在解释"为什么不用它", 不该被自己误判)
  const importLines = src.split('\n').filter((l) => /^\s*import\b/.test(l)).join('\n');
  assert.doesNotMatch(importLines, /jieba|jargon/, '不得依赖分词 (ngramTokens 未导出且会滤空短句)');
  assert.match(src, /import type \{[^}]*HeartflowConfig[^}]*\}/s, '配置类型必须 import type (值导入成环)');
});

test('16. 配置面: dedupe 不进默认容器 / 不进 UI schema', (t) => {
  const hf = read(`${ROOT}/src/inbound/heartflow.ts`);
  assert.match(hf, /dedupe\?: HfDedupeConfig/, 'HeartflowConfig 必须有 dedupe 块');
  const defIdx = hf.indexOf('export function defaultHeartflowConfig(');
  const defBody = hf.slice(defIdx, hf.indexOf('\n}', defIdx));
  assert.doesNotMatch(defBody, /dedupe|shareGuard/, '默认容器不得带新子块 (与 P1/P2 同规矩)');
  assert.doesNotMatch(read(`${ROOT}/openclaw.plugin.json`), /dedupe|shareGuard/, '不得进 UI schema (channel-ui-bridge 计数门)');
});
