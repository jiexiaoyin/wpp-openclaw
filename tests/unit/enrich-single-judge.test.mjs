// tests/unit/enrich-single-judge.test.mjs - 2026-09-13
//
// 取代原 independent-trigger.test.mjs (它守护的功能已被删除)。本次修的问题:
//
//   v1.5.0 B-fix 加的「enrich 路径独立心流 trigger」是一条**死路**, 且带一个双烧 bug:
//     a. 它只 log 决策, **从不发送、从不落台账** ⇒ 对心流行为零影响 (ledger 31 行全部由
//        handler.ts 的 via="heartflow" 路径写出);
//     b. 判定走**账号级**阈值 (不经 resolveThresholdOverride) ⇒ 与真实决策的 per-群 learned
//        阈值不一致 (华为群 learned=0.30 vs 账号级 0.6);
//     c. 它先调 markHeartflowJudged() 消耗 judge 冷却, 真路径共用该冷却 ⇒ minJudgeIntervalSec>0
//        时会把真路径整个闸死;
//     d. ⚠️ **每条群消息被 judge 两次**: enrichBatch 先 map(enrichAndSaveMessage) (内部已 fire 一次),
//        末尾又 for 循环 fire 一次。**实测证据**: 2026-09-13 10:06:10 华为群一条 via=msgType 的
//        接龙消息, 在同一次 handler 调用内 (relay detected 只出现 1 次) 产生 **2 条**
//        `judge failed after 2 attempts` (10:06:17)。该消息的 handler 心流分支并未执行
//        (via=msgType), 故 2 条只能来自 enrich 侧的双 fire。
//     e. 设计前提「非@群消息到不了 handler 心流分支」不成立 —— requireAtMention 从未在
//        shouldTrigger 内实现 (见 triggers.ts 注释), 非@消息本来就会走到心流分支。
//
// 本测试锁「不许复活」+「handler 是唯一心流写入方」, 任一条回退即 FAIL。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const DEPLOY = '/root/.openclaw/extensions/wechatpadpro';
const read = (p) => fs.readFileSync(p, 'utf-8');

// ⚠️ 本次删除在文件头**注释**里写明了被删符号名 (tryIndependentTrigger 等) 作为「为什么删」的记录。
//   tsc 默认保留注释 ⇒ 裸 assert.doesNotMatch(raw, /tryIndependentTrigger/) 会命中注释假红。
//   故「不许引用符号」类断言一律先剥注释, 只看**代码行**; 「必须记录决策」类断言才用 raw。
function stripComments(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => {
      const i = line.indexOf('//');
      return i >= 0 ? line.slice(0, i) : line;
    })
    .join('\n');
}

// ===== 1. 死路已拆除 =====
test('1. enrich.ts 不再触发心流 (无 trigger/judge/心跳, 与 heartflow 零 import)', () => {
  const src = read(`${ROOT}/src/inbound/enrich.ts`);
  const code = stripComments(src);
  for (const sym of ['tryIndependentTrigger', 'tryHeartflowAfterEnrich', 'judgeHeartflow', 'resolveJudgeCreds']) {
    assert.doesNotMatch(code, new RegExp(sym), `enrich.ts 代码不得再引用 ${sym}`);
  }
  assert.doesNotMatch(code, /from "\.\/heartflow(-trigger)?\.js"/, 'enrich.ts 不得 import heartflow (直连/桥)');
  // 文件头必须留下"为什么删"的记录, 否则下一个人还会照旧版加回来 (此断言看 raw, 注释即内容)
  assert.match(src, /2026-09-13 变更/, 'enrich.ts 文件头必须记录本次删除决策');
  assert.match(src, /tryIndependentTrigger/, '文件头必须点名被删的符号, 否则下一个人不知道删了什么');
});

test('2. enrichBatch 已修掉双 fire: 只剩 1 处落库调用, 无第二次触发循环', () => {
  const src = read(`${ROOT}/src/inbound/enrich.ts`);
  // 唯一一次 per-message 入口
  const calls = src.match(/enrichAndSaveMessage\(/g) ?? [];
  assert.equal(calls.length, 2, `enrichAndSaveMessage 应只出现 2 次 (定义 + batch 调用), 实际 ${calls.length}`);
  assert.doesNotMatch(src, /for \(const msg of batch\)/, 'enrichBatch 末尾的二次触发循环必须已删除');
  // 双 fire 的机理: map 内已 fire + 循环再 fire ⇒ 现在两者都不该有
  assert.doesNotMatch(src, /void\s+\w+\(msg,/, 'enrich 路径不许再有 fire-and-forget per-msg 调用');
});

test('3. heartflow-trigger.ts 桥文件已删除; tryIndependentTrigger / independentTrigger 字段已移除', () => {
  assert.ok(!fs.existsSync(`${ROOT}/src/inbound/heartflow-trigger.ts`), 'heartflow-trigger.ts 必须已删除');
  const h = read(`${ROOT}/src/inbound/heartflow.ts`);
  assert.doesNotMatch(h, /tryIndependentTrigger|IndependentTriggerOpts|IndependentTriggerResult/, 'heartflow.ts 不得再有独立 trigger 入口');
  assert.doesNotMatch(h, /independentTrigger/, 'HeartflowConfig / defaultHeartflowConfig 不得再有 independentTrigger');
});

test('4. deploy 产物同步 (dist 不得残留独立 trigger / 桥)', () => {
  // dist 由 tsc 产出, 同样保留注释 ⇒ 一律剥注释看代码
  const d = stripComments(read(`${DEPLOY}/dist/inbound/enrich.js`));
  assert.doesNotMatch(d, /heartflow/, 'deploy enrich.js 代码不得引用 heartflow');
  assert.ok(!fs.existsSync(`${DEPLOY}/dist/inbound/heartflow-trigger.js`), 'deploy 不得残留 heartflow-trigger.js');
  assert.doesNotMatch(stripComments(read(`${DEPLOY}/dist/inbound/heartflow.js`)), /tryIndependentTrigger/, 'deploy heartflow.js 不得残留独立 trigger');
});

test('5. accounts (dev + deploy) 不得再有 independentTrigger 键 (留着=看着生效实则无效)', () => {
  for (const f of [`${ROOT}/accounts/default.json`, `${DEPLOY}/accounts/default.json`]) {
    const d = JSON.parse(read(f));
    assert.strictEqual(d.heartflow.independentTrigger, undefined, `${f} 必须已移除 heartflow.independentTrigger`);
    assert.strictEqual(d.heartflow._independentTrigger_note, undefined, `${f} 必须已移除 _independentTrigger_note`);
  }
});

// ===== 2. handler 是唯一心流判定 + 台账写入方 =====
test('6. 全库唯一 persistHfJudged 调用点 = handler.ts (真回复只此一条路)', () => {
  // 只看 .ts 源 (src/ 下另有历史遗留的编译产物 .js, 不参与运行时, 见文件末尾说明)
  const hits = execSync(`grep -rln "persistHfJudged\\|persistHfJudgedBelowThreshold" ${ROOT}/src --include=*.ts || true`, { encoding: 'utf-8' })
    .split('\n').filter(Boolean);
  // ⚠️ 判据必须是**真正调用语句** `await persistHfJudgedXxx(...)`, 不能写成 /await persistHf/ ——
  //   反向注入实测: 删掉发送路径的 `await persistHfJudged(hfRecord)` 后, 下面的 below-threshold 调用
  //   仍命中 /await persistHf/ ⇒ 该守卫假绿 (漏掉「sent 行永远不写」这种静默失效)。
  const CALL = /await persistHfJudged[A-Za-z]*\(/;
  for (const f of hits) {
    if (CALL.test(stripComments(read(f)))) {
      assert.match(f, /src\/inbound\/handler\.ts$/, `心流台账只许 handler.ts 写, 但 ${f} 也在写`);
    }
  }
  const h = stripComments(read(`${ROOT}/src/inbound/handler.ts`));
  // 发送路径 (`shouldReply`) 必须真的落 judged 行 —— 它是 ledger 里唯一能进学习样本的来源
  assert.match(h, /await persistHfJudged\(hfRecord\)/, 'handler.ts 必须仍在回复路径写 persistHfJudged(hfRecord) (sent 行唯一来源)');
  assert.match(h, /await persistHfJudgedBelowThreshold\(hfRecord/, 'handler.ts 必须仍在沉默路径写 below-threshold 台账');
});

test('7. 唯一 judge 入口仍是 handler.ts 的 via="heartflow" 分支 (别误删真路径)', () => {
  const h = read(`${ROOT}/src/inbound/handler.ts`);
  assert.match(h, /else if \(t\.via === "heartflow" && opts\.heartflow\?\.enabled\)/, 'handler.ts 必须保留 via=heartflow 分支');
  assert.match(h, /await judgeHeartflow\(/, 'handler.ts 必须仍调 judgeHeartflow');
  assert.match(h, /resolveThresholdOverride\(m\.accountId, chatId, hfCfg\)/, 'learned per-群阈值 override 必须仍在');
});

test('8. heartflow.ts 仍保留 judge 主体 (删除只针对独立入口)', () => {
  const h = read(`${ROOT}/src/inbound/heartflow.ts`);
  for (const fn of ['judgeHeartflow', 'checkHeartflowGate', 'defaultHeartflowConfig']) {
    assert.match(h, new RegExp(`export (async )?function ${fn}`), `heartflow.ts 必须保留 ${fn}`);
  }
});
