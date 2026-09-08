// tests/unit/heartflow-feedback.test.mjs - v1.6.x HEARTFLOW-FEEDBACK 闭环完整性测试
//
// 文本断言 (照 independent-trigger.test.mjs 范式) 验证 反馈闭环 8 个触点真实存在:
//   DB: 3 表 DDL 唯一途径在 applyMigrations (mysql.ts), dev schema.sql 也补 (仅 dev)
//        adapter 12 方法 + 4 行类型 (types.ts) + 薄封装 (storage/db/heartflow.ts) + barrel (index.ts)
//   config: HeartflowConfig.learning + HF_LEARNING_DEFAULTS + isHfGroupAllowed (heartflow.ts)
//   judge 埋点: handler.ts effCfg override + persistHfJudged + markHfGroupEngaged
//   send 埋点: dispatcher.ts persistHfSendOutcome (msg.trigger === "heartflow")
//   sweep: index.ts loadLearnedThresholds + startHeartflowSweep + /heartflow status learning 摘要
//   schema/accounts: openclaw.plugin.json heartflow.learning schema default enabled=false;
//                    accounts/default.json heartflow.learning.enabled=true (生产显式开)
//
// dev 断言在源码上跑 (即时); DEPLOY 断言只在 deploy-swap 后绿 (与旧版惯例一致 — 它们守护"部署与 dev 同步").
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const DEPLOY = '/root/.openclaw/extensions/wechatpadpro';
const read = (p) => fs.readFileSync(p, 'utf-8');
const src = (rel) => read(`${ROOT}/${rel}`);

// ===== 1. DB 层 =====
test('1. mysql.ts: 3 张 HF 表 DDL 唯一途径在 applyMigrations (生产建表不靠 schema.sql)', () => {
  const m = src('src/storage/db/mysql.ts');
  assert.match(m, /async function applyMigrations\(/, 'applyMigrations 必须存在 (生产建表唯一途径)');
  for (const t of ['wpp_hf_ledger', 'wpp_hf_group_state', 'wpp_hf_threshold_audit']) {
    assert.match(m, new RegExp(`CREATE TABLE IF NOT EXISTS ${t}\\s*\\(`), `mysql.ts 必须含 ${t} DDL`);
  }
  // 三个 CREATE 都在 applyMigrations 函数体内 (起点之后)
  const fnStart = m.indexOf('async function applyMigrations');
  const fnEnd = m.indexOf('\n}\n', fnStart);
  const body = m.slice(fnStart, fnEnd);
  for (const t of ['wpp_hf_ledger', 'wpp_hf_group_state', 'wpp_hf_threshold_audit']) {
    assert.ok(body.includes(t), `${t} DDL 必须在 applyMigrations 函数体内`);
  }
});

test('2. schema.sql (dev): 文末补 3 段 DDL (仅 dev 一致性, 生产由 applyMigrations 建)', () => {
  const s = read(`${ROOT}/db/schema.sql`);
  for (const t of ['wpp_hf_ledger', 'wpp_hf_group_state', 'wpp_hf_threshold_audit']) {
    assert.match(s, new RegExp(`CREATE TABLE IF NOT EXISTS ${t}`), `db/schema.sql 必须含 ${t}`);
  }
});

test('3. types.ts: 12 adapter 方法签名 + 4 HF 行类型', () => {
  const t = src('src/storage/db/types.ts');
  const methods = [
    'recordHfJudged', 'setHfLedgerSent', 'setHfLedgerSuppressed', 'markHfEngaged',
    'closeHfExpiredWindows', 'expireHfStaleJudged', 'getHfClosedRecent',
    'upsertHfGroupState', 'getHfGroupState', 'listHfGroupStates', 'logHfThresholdChange',
    'getHfLedgerDistinctClosedGroups',
  ];
  for (const mth of methods) {
    assert.match(t, new RegExp(`${mth}\\(`), `DbAdapter 必须声明 ${mth}`);
  }
  for (const ty of ['HfLedgerRecord', 'HfGroupStateRecord', 'HfThresholdAuditRecord', 'HfClosedSample']) {
    assert.match(t, new RegExp(`export interface ${ty}`), `types.ts 必须 export ${ty}`);
  }
});

test('4. storage/db/heartflow.ts 薄封装 (全走 getAdapter, 不 import mysql2)', () => {
  const w = src('src/storage/db/heartflow.ts');
  assert.match(w, /getAdapter\(\)\./, '薄封装必须走 getAdapter()');
  assert.doesNotMatch(w, /from "mysql2"/, '薄封装不得直接 import mysql2 (解耦 backend)');
  assert.match(w, /export async function recordHfJudged/, '必须 export recordHfJudged');
  assert.match(w, /export async function getHfLedgerDistinctClosedGroups/, '必须 export getHfLedgerDistinctClosedGroups');
});

test('5. storage/db/index.ts barrel 导出 heartflow 模块', () => {
  const b = src('src/storage/db/index.ts');
  assert.match(b, /from "\.\/heartflow\.js"/, 'barrel 必须导出 heartflow.js 薄封装');
});

// ===== 2. config 层 =====
test('6. heartflow.ts: HeartflowConfig.learning + HF_LEARNING_DEFAULTS 参数全 + isHfGroupAllowed export', () => {
  const h = src('src/inbound/heartflow.ts');
  assert.match(h, /learning\??:\s*HfLearningConfig/, 'HeartflowConfig 必须含 learning?: HfLearningConfig');
  assert.match(h, /HF_LEARNING_DEFAULTS/, 'heartflow.ts 必须定义 HF_LEARNING_DEFAULTS');
  assert.match(h, /export function isHfGroupAllowed/, 'heartflow.ts 必须 export isHfGroupAllowed');
  assert.match(h, /export function resolveHfLearning/, 'heartflow.ts 必须 export resolveHfLearning');
  // 参数表锚点 (与 HF_LEARNING_DEFAULTS 对齐; 测试不锁数值, 只锁键存在 → 防漏键)
  for (const k of ['enabled', 'minSample', 'lowEngageRate', 'highEngageRate', 'step', 'bandMin', 'bandMax', 'sampleWindow', 'observeWindowSec', 'minChangeCooldownSec', 'sweepIntervalSec', 'staleJudgedMaxSec']) {
    assert.match(h, new RegExp(`${k}:`), `HF_LEARNING_DEFAULTS 必须含键 ${k}`);
  }
});

test('7. heartflow.ts: 默认 heartbeat 不含 learning (默认关, 旧行为等价)', () => {
  const h = src('src/inbound/heartflow.ts');
  assert.match(h, /defaultHeartflowConfig/, 'defaultHeartflowConfig 必须存在');
  // default 容器内不设 learning.enabled=true → 无显式 true; 只有 HF_LEARNING_DEFAULTS 里 enabled: false
  assert.match(h, /HF_LEARNING_DEFAULTS\s*[:=][^]*?enabled:\s*false/, 'HF_LEARNING_DEFAULTS.enabled 必须默认 false');
});

// ===== 3. 埋点层 =====
test('8. handler.ts: effCfg override 注入 + persistHfJudged + markHfGroupEngaged', () => {
  const h = src('src/inbound/handler.ts');
  assert.match(h, /resolveThresholdOverride\(m\.accountId, chatId, hfCfg\)/, 'judge 前必须 resolveThresholdOverride');
  assert.match(h, /const effCfg = override === undefined \? hfCfg :/, 'override 无则沿用 hfCfg (零 clone)');
  assert.match(h, /await persistHfJudged\(\{/, 'shouldReply 分支必须 await persistHfJudged');
  assert.match(h, /effective_threshold:\s*effCfg\.replyThreshold \?\? 0\.6/, 'ledger 必须记录 effective_threshold (learned??账号级)');
  assert.match(h, /void markHfGroupEngaged\(/, '人类入站必须 fire-and-forget markHfGroupEngaged');
  assert.match(h, /judge_overall:/, 'ledger 必须含 judge_overall');
});

test('9. dispatcher.ts: send 后 persistHfSendOutcome (仅 msg.trigger==="heartflow", fire-and-forget)', () => {
  const d = src('src/dispatch/dispatcher.ts');
  assert.match(d, /persistHfSendOutcome/, 'dispatcher.ts 必须 import persistHfSendOutcome');
  assert.match(d, /if \(msg\.trigger === "heartflow"\)/, '仅心流发送结果落账');
  assert.match(d, /void persistHfSendOutcome\(/, '异步 fire-and-forget 不阻断 deliver 返回');
  assert.match(d, /HF_LEARNING_DEFAULTS\.observeWindowSec/, '观察窗默认走 HF_LEARNING_DEFAULTS.observeWindowSec');
});

test('10. heartflow-learn.ts: 导出算法 + DB 管线 + sweep', () => {
  const hl = src('src/inbound/heartflow-learn.ts');
  for (const fn of ['evalHfThreshold', 'hfCooldownOk', 'round2', 'classifyHfSend', 'getLearnedThreshold', 'resolveThresholdOverride', 'persistHfJudged', 'persistHfSendOutcome', 'markHfGroupEngaged', 'loadLearnedThresholds', 'resetLearnedThresholdCache', 'runHeartflowSweep', 'startHeartflowSweep']) {
    assert.match(hl, new RegExp(`export (async )?function ${fn}`), `heartflow-learn.ts 必须 export ${fn}`);
  }
  assert.match(hl, /expireHfStaleJudged\(/, 'sweep 需处理 judged 呆账 (expireHfStaleJudged)');
  assert.match(hl, /closeHfExpiredWindows\(/, 'sweep 需关过期观察窗 (closeHfExpiredWindows)');
});

test('11. index.ts: 启动加载 learned + 起 sweep + /heartflow status 只读 learning 摘要', () => {
  const i = src('src/index.ts');
  assert.match(i, /loadLearnedThresholds\(accountId\)/, 'startAccountById 必须 loadLearnedThresholds');
  assert.match(i, /startHeartflowSweep\(state, accountId,/, '必须 startHeartflowSweep (含 getCfg 取热载配置)');
  assert.match(i, /listHfGroupStates\(/, 'status 摘要必须 listHfGroupStates');
  assert.match(i, /learning/, '/heartflow status 分支必须提 learning');
});

// ===== 4. schema / accounts (dev 侧即时绿) =====
test('12. openclaw.plugin.json (dev): heartflow.learning schema 存在, enabled default=false', () => {
  const d = JSON.parse(read(`${ROOT}/openclaw.plugin.json`));
  const learn = d.channelConfigs.wechatpadpro.schema.properties.heartflow.properties.learning;
  assert.ok(learn, 'schema 必须有 heartflow.properties.learning');
  assert.strictEqual(learn.type, 'object');
  assert.strictEqual(learn.properties.enabled.default, false, 'schema default learning.enabled=false (dev 兼容)');
  // 关键参数键在 schema (与代码默认对齐)
  for (const k of ['minSample', 'lowEngageRate', 'highEngageRate', 'step', 'bandMin', 'bandMax', 'observeWindowSec', 'minChangeCooldownSec']) {
    assert.ok(learn.properties[k], `schema learning.properties 必须含 ${k}`);
  }
});

test('13. accounts/default.json (dev): heartflow.learning.enabled=true (生产显式开, 其余走默认)', () => {
  const d = JSON.parse(read(`${ROOT}/accounts/default.json`));
  assert.strictEqual(d.heartflow.learning.enabled, true, 'accounts learning.enabled=true (老板拍板: 自然灰度)');
  assert.equal(d.heartflow.learning.minSample, undefined, 'accounts 不锁参数 (走代码默认, 便于热载调参)');
});

// ===== 5. DEPLOY 完整性 (deploy-swap 后绿; 守护部署与 dev 同步) =====
test('14. DEPLOY dist/inbound/heartflow-learn.js 存在且含纯算法', () => {
  const src = read(`${DEPLOY}/dist/inbound/heartflow-learn.js`);
  assert.match(src, /evalHfThreshold/, 'deploy dist 必须含 evalHfThreshold');
  assert.match(src, /classifyHfSend/, 'deploy dist 必须含 classifyHfSend');
  assert.match(src, /startHeartflowSweep/, 'deploy dist 必须含 startHeartflowSweep');
});

test('15. DEPLOY dist/inbound/heartflow.js 含 learning 解析', () => {
  const src = read(`${DEPLOY}/dist/inbound/heartflow.js`);
  assert.match(src, /resolveHfLearning/, 'deploy heartflow.js 必须含 resolveHfLearning');
  assert.match(src, /isHfGroupAllowed/, 'deploy heartflow.js 必须含 isHfGroupAllowed');
});

test('16. DEPLOY accounts/default.json learning.enabled=true', () => {
  const d = JSON.parse(read(`${DEPLOY}/accounts/default.json`));
  assert.strictEqual(d.heartflow.learning.enabled, true, 'deploy accounts learning.enabled 必须 true');
});

test('17. DEPLOY schema heartflow.learning default enabled=false', () => {
  const d = JSON.parse(read(`${DEPLOY}/openclaw.plugin.json`));
  const learn = d.channelConfigs.wechatpadpro.schema.properties.heartflow.properties.learning;
  assert.ok(learn, 'deploy schema 必须有 learning');
  assert.strictEqual(learn.properties.enabled.default, false, 'deploy schema default 必须 false');
});
