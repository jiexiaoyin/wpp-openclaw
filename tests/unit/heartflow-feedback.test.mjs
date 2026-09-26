// tests/unit/heartflow-feedback.test.mjs - v1.6.x HEARTFLOW-FEEDBACK 闭环完整性测试
//
// 文本断言 (照 independent-trigger.test.mjs 范式) 验证 反馈闭环 8 个触点真实存在:
//   DB: 5 表 DDL 唯一途径在 applyMigrations (mysql.ts), dev schema.sql 也补 (仅 dev)
//        adapter 23 方法 + 12 行类型 (types.ts) + 薄封装 (storage/db/heartflow.ts) + barrel (index.ts)
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

/** v1.7.0: 新增 wpp_hf_group_profile; v1.8.0: 新增 wpp_hf_layer_stat —— 三处 DDL 断言共用一份清单 (加表只改这里) */
const HF_TABLES = ['wpp_hf_ledger', 'wpp_hf_group_state', 'wpp_hf_threshold_audit', 'wpp_hf_group_profile', 'wpp_hf_layer_stat'];

// ===== 1. DB 层 =====
test('1. mysql.ts: 5 张 HF 表 DDL 唯一途径在 applyMigrations (生产建表不靠 schema.sql)', () => {
  const m = src('src/storage/db/mysql.ts');
  assert.match(m, /async function applyMigrations\(/, 'applyMigrations 必须存在 (生产建表唯一途径)');
  for (const t of HF_TABLES) {
    assert.match(m, new RegExp(`CREATE TABLE IF NOT EXISTS ${t}\\s*\\(`), `mysql.ts 必须含 ${t} DDL`);
  }
  // 四个 CREATE 都在 applyMigrations 函数体内 (起点之后)
  const fnStart = m.indexOf('async function applyMigrations');
  const fnEnd = m.indexOf('\n}\n', fnStart);
  const body = m.slice(fnStart, fnEnd);
  for (const t of HF_TABLES) {
    assert.ok(body.includes(t), `${t} DDL 必须在 applyMigrations 函数体内`);
  }
});

test('2. schema.sql (dev): 文末补 5 段 DDL (仅 dev 一致性, 生产由 applyMigrations 建)', () => {
  const s = read(`${ROOT}/db/schema.sql`);
  for (const t of HF_TABLES) {
    assert.match(s, new RegExp(`CREATE TABLE IF NOT EXISTS ${t}`), `db/schema.sql 必须含 ${t}`);
  }
});

test('3. types.ts: 25 adapter 方法签名 + 14 HF 行类型', () => {
  const t = src('src/storage/db/types.ts');
  const methods = [
    'recordHfJudged', 'setHfLedgerSent', 'setHfLedgerSuppressed', 'markHfEngaged',
    'closeHfExpiredWindows', 'expireHfStaleJudged', 'getHfClosedRecent',
    'upsertHfGroupState', 'getHfGroupState', 'listHfGroupStates', 'logHfThresholdChange',
    'getHfLedgerDistinctClosedGroups',
    // v1.6.8 换标签: 信号分布统计 (可观测) + 同小时段素材 (反事实基线)
    'countHfEngageSignals', 'listHfGroupMsgHourBuckets',
    // v1.6.9 发言预算回填
    'listHfSentCountsRecent',
    // v1.7.0 群画像 (4) + 台账单行追溯 (1)
    'getHfLedgerLast', 'upsertHfGroupProfile', 'getHfGroupProfile', 'listHfGroupProfiles',
    'getHfGroupMessageStats',
    // v1.8.0 分层统计 (群×时段): 输入样本批量取 + 落库 + 启动预热 + 一键否决
    'listHfClosedSince', 'upsertHfLayerStat', 'listHfLayerStats', 'markHfLedgerVeto',
    // v1.9.0 观测复盘: 每群发言占比素材 + 重复率素材 (两条都是只读单表 wpp_messages)
    'listHfBotMsgShare', 'listHfOutboundTexts',
  ];
  for (const mth of methods) {
    assert.match(t, new RegExp(`${mth}\\(`), `DbAdapter 必须声明 ${mth}`);
  }
  for (const ty of ['HfLedgerRecord', 'HfGroupStateRecord', 'HfThresholdAuditRecord', 'HfClosedSample', 'HfGroupHourBucket', 'HfSentCountRow', 'HfLedgerTrace', 'HfGroupProfileRecord', 'HfGroupMsgStats', 'HfLayerSampleRow', 'HfLayerStatRecord', 'HfVetoResult', 'HfGroupShareRow', 'HfOutboundTextRow']) {
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
  for (const k of ['enabled', 'minSample', 'lowEngageRate', 'highEngageRate', 'step', 'bandMin', 'bandMax', 'sampleWindow', 'observeWindowSec', 'minChangeCooldownSec', 'sweepIntervalSec', 'staleJudgedMaxSec', 'labelWindowSec', 'ambientMax']) {
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
  // v1.8.0 保名加参: 分层要按"当前时段"取值 ⇒ 第 4 参 nowSec (照 markHfGroupEngaged 的先例)
  assert.match(
    h,
    /resolveThresholdOverride\(m\.accountId, chatId, hfCfg(,|\))/,
    'judge 前必须 resolveThresholdOverride',
  );
  assert.match(h, /resolveThresholdOverride\(m\.accountId, chatId, hfCfg, Math\.floor\(nowMs \/ 1000\)\)/, 'v1.8.0 必须传当前时刻 (分层按段取值)');
  // v1.7.0: 有效阈值 = max(learned override ?? 账号阈值, 画像下限) —— 画像只能抬高, 不能下压
  assert.match(h, /const profileFloor = getHfProfileBandFloor\(m\.accountId, chatId\)/, 'v1.7.0 必须取画像阈值下限');
  assert.match(
    h,
    /const effThreshold =[\s\S]{0,120}?Math\.max\(baseThreshold, profileFloor\)/,
    '画像下限只能取 max (画像不许把阈值往下压)',
  );
  // 零 clone 不变: 有效阈值与账号阈值相同 ⇒ 沿用 hfCfg 本体 (不每次 judge 都造新对象)
  assert.match(h, /const effCfg =\s*\n?\s*effThreshold === hfCfg\.replyThreshold \? hfCfg :/, '无变化则沿用 hfCfg (零 clone)');
  // v1.6.1: ledger 行字段上提为 hfRecord ({judgeResult ? {...} : null}), 两分支共用 → 断言改形不移牙
  assert.match(h, /await persistHfJudged\(hfRecord\)/, 'shouldReply 分支必须 await persistHfJudged(hfRecord)');
  assert.match(h, /const hfRecord = judgeResult[\s\S]{0,40}\? \{/, 'ledger 行必须仅在 judgeResult 非空时构造 (judge 崩了不落台账)');
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
  for (const fn of ['evalHfThreshold', 'hfCooldownOk', 'round2', 'classifyHfSend', 'clampHfThresholdToBand', 'getLearnedThreshold', 'resolveThresholdOverride', 'persistHfJudged', 'persistHfSendOutcome', 'markHfGroupEngaged', 'loadLearnedThresholds', 'resetLearnedThresholdCache', 'runHeartflowSweep', 'startHeartflowSweep',
    // v1.8.0 分层决策 + 一键否决
    'resolveHfThresholdDecision', 'hfLayerAnchorFor', 'hfLayerStep', 'forgetHfOpenWindow']) {
    assert.match(hl, new RegExp(`export (async )?function ${fn}`), `heartflow-learn.ts 必须 export ${fn}`);
  }
  assert.match(hl, /expireHfStaleJudged\(/, 'sweep 需处理 judged 呆账 (expireHfStaleJudged)');
  assert.match(hl, /closeHfExpiredWindows\(/, 'sweep 需关过期观察窗 (closeHfExpiredWindows)');
});

test('11b. v1.6.6 硬地板: bandMin 默认 0.5 + 读取侧钳制接线', () => {
  const h = src('src/inbound/heartflow.ts');
  assert.match(h, /bandMin:\s*0\.5/, 'HF_LEARNING_DEFAULTS.bandMin 必须为 0.5 (老板 2026-09-16: 阈值最低不能低于 0.5)');
  const hl = src('src/inbound/heartflow-learn.ts');
  assert.match(
    hl,
    /const eff = clampHfThresholdToBand\(learned, bandMin, bandMax\)/,
    'resolveThresholdOverride 必须读时钳制 (死区时 evalHfThreshold 不走到钳制, 旧值会绕过地板)',
  );
  assert.match(hl, /const \{ bandMin, bandMax \} = resolveHfLearning\(hfCfg\)/, '钳制边界必须取自 resolveHfLearning(hfCfg)');
});

test('11. index.ts: 启动加载 learned + 起 sweep + /heartflow status 只读 learning 摘要', () => {
  const i = src('src/index.ts');
  assert.match(i, /loadLearnedThresholds\(accountId\)/, 'startAccountById 必须 loadLearnedThresholds');
  assert.match(i, /startHeartflowSweep\(state, accountId,/, '必须 startHeartflowSweep (含 getCfg 取热载配置)');
  assert.match(i, /listHfGroupStates\(/, 'status 摘要必须 listHfGroupStates');
  assert.match(i, /learning/, '/heartflow status 分支必须提 learning');
  // v1.8.0: 启动预热分层缓存 (judge 热路径零 DB 读) + status 显示分层模式 + layers/veto 子命令
  assert.match(i, /loadHfLayerStats\(accountId\)/, 'startAccountById 必须预热分层缓存');
  assert.match(i, /listHfLayerStats\(/, 'status 分层摘要必须 listHfLayerStats');
  assert.match(i, /arg === "layers"/, '必须实现 /heartflow layers 子命令');
  assert.match(i, /arg === "veto"/, '必须实现 /heartflow veto 子命令');
  assert.match(i, /forgetHfOpenWindow\(/, 'veto 必须删内存开窗 (否则随后的引用会把 veto 覆盖成 engaged=1)');
});

// ===== 4. schema / accounts (dev 侧即时绿) =====
// 09-10 老板拍板: UI 只留核心配置, learning/阈值等高级参数文件侧管理, 不回流 UI schema。
// 运行时权威仍在 accounts/default.json (显式开) + 代码默认 (默认关)。schema 仅守护 UI 暴露面=核心。
test('12. openclaw.plugin.json (dev): schema heartflow 只暴露 enabled (learning 不回流 UI schema)', () => {
  const d = JSON.parse(read(`${ROOT}/openclaw.plugin.json`));
  const hf = d.channelConfigs.wechatpadpro.schema.properties.heartflow;
  assert.ok(hf && hf.properties && hf.properties.enabled, 'schema heartflow 必须保留总开关 enabled');
  assert.equal(hf.properties.learning, undefined, 'learning 不许回流 UI schema (文件/代码默认权威)');
  assert.equal(hf.properties.maxRetries, undefined, '高级参数 maxRetries 不许回流 UI schema');
  assert.equal(hf.properties.replyThreshold, undefined, '高级参数 replyThreshold 不许回流 UI schema');
  assert.equal(hf.properties.whitelistGroups, undefined, 'whitelistGroups 不许回流 UI schema');
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

test('17. DEPLOY schema heartflow 只暴露 enabled (learning 不回流 UI schema)', () => {
  const d = JSON.parse(read(`${DEPLOY}/openclaw.plugin.json`));
  const hf = d.channelConfigs.wechatpadpro.schema.properties.heartflow;
  assert.ok(hf && hf.properties && hf.properties.enabled, 'deploy schema heartflow 必须保留 enabled');
  assert.equal(hf.properties.learning, undefined, 'deploy learning 不许回流 UI schema');
});
