// channel-ui-bridge.test.mjs — OpenClaw Channel 页 ⇄ accounts/<id>.json 桥行为测试
// v1.5.5 (2026-09-10): 双向同步核心语义 + 敏感红线 + 已有文件守卫。
// 只碰 scratch 账号 (cuT*); 绝不读写 accounts/default.json (老板铁律: 生产配置零改动)。
// 需要 dist 编译产物 (npm run build 后跑)。

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const ACCT_DIR = join(ROOT, 'accounts');
const stateDir = await mkdtemp(join(tmpdir(), 'wpp-cui-'));
process.env.OPENCLAW_STATE_DIR = stateDir;

const { extractChannelAccountsBlock, applyChannelBlockToAccount, syncAccountsFromChannelConfig, publishAccountCoreFieldsToChannelConfig, CHANNEL_UI_CORE_FIELDS, channelUiStatus } = await import(pathToFileURL(join(ROOT, 'dist/channel-ui-bridge.js')).href);
delete process.env.WPP_CHANNEL_CFG_MIRROR;

const id = 'cuT1';
const idB = 'cuT2';
const idM = 'cuTmir';
const fp = (a) => join(ACCT_DIR, `${a}.json`);
const rmScratch = async (a) => rm(fp(a), { force: true });
const writeOcj = (o) => writeFile(join(stateDir, 'openclaw.json'), JSON.stringify(o, null, 2));

test('T1 extractChannelAccountsBlock: 平铺→default, accounts 多账号, accounts.default 覆盖', () => {
  const m = extractChannelAccountsBlock({ enabled: true, nickname: '益融', allowFrom: ['a'], accounts: { smoka: { nickname: 'B', agent: 'wpp-b' } } });
  assert.ok(m.has('default') && m.has('smoka'));
  assert.equal(m.get('default').nickname, '益融');
  assert.equal(m.get('smoka').agent, 'wpp-b');
  const b2 = extractChannelAccountsBlock({ nickname: 'flat', accounts: { default: { nickname: 'nested' } } });
  assert.equal(b2.get('default').nickname, 'nested');
});

test('T2 apply: 只写核心键 + 文件缺核心键补写 (gate 移除); 未暴露字段/secret/只读身份永不触碰', async () => {
  await writeFile(fp(id), JSON.stringify({ enabled: false, nickname: 'OLD', selfWxid: 'wxid_real_ef', groupPolicy: 'closed', allowFrom: [], heartflow: { enabled: true, threshold: 0.5, _keep: 'x' }, _notes: 'keep-me', agent: 'wpp-b', tokenKey: 'PLAINTEXT', apiBaseUrl: 'http://127.0.0.1:1' }, null, 2));
  const r = await applyChannelBlockToAccount(id, { enabled: true, nickname: 'NEW', groupPolicy: 'open', allowFrom: ['q1'], agent: 'wpp-b' });
  assert.equal(r.ok, true);
  assert.ok(r.changedFields.includes('enabled') && r.changedFields.includes('nickname') && r.changedFields.includes('groupPolicy') && r.changedFields.includes('allowFrom'), `changed: ${r.changedFields}`);
  let got = JSON.parse(await readFile(fp(id), 'utf8'));
  assert.equal(got.enabled, true);
  assert.equal(got.heartflow.threshold, 0.5, 'unexposed heartflow sibling kept');
  assert.equal(got._notes, 'keep-me', 'unexposed top-level field kept');
  assert.equal(got.tokenKey, 'PLAINTEXT', 'secret field never touched');
  assert.equal(got.selfWxid, 'wxid_real_ef', 'selfWxid untouched when block omits it');

  // schema 已收敛为核心集 → 文件缺顶层核心键现在补写 (老板在页面显式管理这些项)
  const rGate = await applyChannelBlockToAccount(id, { requireAtMention: true, friendCirclePublishEnabled: true, selfWxid: 'wxid_HACK' });
  assert.ok(rGate.changedFields.includes('requireAtMention'), `file-absent core key now written: ${rGate.changedFields}`);
  assert.ok(rGate.changedFields.includes('friendCirclePublishEnabled'), `friendCirclePublishEnabled file-absent now written: ${rGate.changedFields}`);
  assert.ok(!rGate.changedFields.includes('selfWxid'), 'selfWxid readOnly: 永不 block→file');
  got = JSON.parse(await readFile(fp(id), 'utf8'));
  assert.equal(got.requireAtMention, true, 'file-absent core key 补写');
  assert.equal(got.friendCirclePublishEnabled, true, 'friendCircle 补写');
  assert.equal(got.selfWxid, 'wxid_real_ef', 'selfWxid readOnly: 页面改不动身份');

  // 非核心高级键根本不在写回集 → 静默忽略 (UI 对它们无控制; 文件/CLI 侧管理)
  const rAdv = await applyChannelBlockToAccount(id, { debounceMs: 100, sync: true, llmIntentModel: 'x', heartflow: { whitelistGroups: ['g@chatroom'] } });
  assert.deepEqual(rAdv.changedFields, [], 'advanced/unexposed keys never applied');
  assert.equal(JSON.parse(await readFile(fp(id), 'utf8')).heartflow.whitelistGroups, undefined, 'advanced heartflow key untouched');
});

test('T3 no-op when unchanged', async () => {
  const r = await applyChannelBlockToAccount(id, { nickname: 'NEW' });
  assert.deepEqual(r.changedFields, []);
});

test('T4 agent=main refused', async () => {
  const r = await applyChannelBlockToAccount(id, { agent: 'main' });
  assert.equal(r.changedFields.length, 0);
  assert.ok(r.skipped.some((s) => s.startsWith('agent')));
});

test('T5 ill-typed value skipped (allowFrom null)', async () => {
  const before = await readFile(fp(id), 'utf8');
  const r = await applyChannelBlockToAccount(id, { allowFrom: null });
  assert.equal(r.changedFields.length, 0);
  assert.equal(before, await readFile(fp(id), 'utf8'));
});

test('T6 bootstrap: 文件缺失 → 用页面核心字段新建, 不造默认/不发明明文', async () => {
  await rmScratch(idB);
  const r = await applyChannelBlockToAccount(idB, { enabled: true, nickname: 'Fresh', friendCirclePublishEnabled: true, agent: 'wpp-x', allowFrom: ['q1'] });
  assert.equal(r.created, true);
  const got = JSON.parse(await readFile(fp(idB), 'utf8'));
  assert.equal(got.nickname, 'Fresh');
  assert.equal(got.friendCirclePublishEnabled, true, 'core nested-free bool bootstrapped');
  assert.equal(got.tokenKey, undefined, 'no secret invented');
});

test('T7 写回集 = schema 收敛核心集 (~16; 无明文 secret; 含 friendCircle/selfWxid readOnly; 高级参数不回流)', () => {
  const paths = CHANNEL_UI_CORE_FIELDS.map((s) => s.path);
  for (const s of CHANNEL_UI_CORE_FIELDS) {
    assert.ok(!/^(tokenKey|authcode|webhookSecret|webhookPathToken)$/.test(s.path), `no secret path ${s.path}`);
  }
  // schema 已收敛 → UI 不再 96 项 (老板: 配置项太多); 但核心锚点齐全
  assert.ok(CHANNEL_UI_CORE_FIELDS.length >= 14 && CHANNEL_UI_CORE_FIELDS.length <= 20, `core ~16 not overloaded; got ${CHANNEL_UI_CORE_FIELDS.length}`);
  for (const p of ['enabled', 'nickname', 'agent', 'allowFrom', 'groupPolicy', 'heartflow.enabled', 'jargon.enabled', 'affection.enabled']) {
    assert.ok(paths.includes(p), `core path ${p} must be present`);
  }
  // friendCircle 字段 (原 config in file 页面看不到 bug 的修复)
  assert.ok(paths.includes('friendCirclePublishEnabled') && paths.includes('friendCirclePublishAllowFrom'), 'friendCircle 必须在写回集');
  // selfWxid 只读身份
  const wxid = CHANNEL_UI_CORE_FIELDS.find((s) => s.path === 'selfWxid');
  assert.ok(wxid, 'selfWxid 身份字段必须在写回集 (只读展示)');
  assert.equal(wxid.readOnly, true, 'selfWxid 必须 readOnly=true (block→file 永不写)');
  // 高级/AI/阈值/内网地址/*Env 一律不回流 UI (老板 09-10: 其余手动改文件一样生效)
  for (const adv of ['debounceMs', 'sync', 'commandAllowlist', 'keywordTrigger', 'msgTypeTrigger', 'embedIntentEnabled', 'llmIntentModel', 'llmIntentTimeoutMs', 'apiBaseUrl', 'wsUrl', 'webhookHost', 'webhookPort', 'webhookPathToken', 'autoSetWebhook', 'groupContextWindow', 'heartflow.whitelistGroups', 'heartflow.learning.enabled', 'heartflow.maxRetries', 'heartflow.replyThreshold', 'affection.initialGap', 'tokenKeyEnv', 'authcodeEnv', 'webhookSecretEnv']) {
    assert.ok(!paths.includes(adv), `高级参数 ${adv} 不许回流 UI schema/写回集 (文件/CLI 权威)`);
  }
});

test('T8 mirror (accounts 容器): 外部改文件 → openclaw 块同步; 值等幂等; secret 永不 publish; 块缺失不复活; MIRROR=0 关', async () => {
  await rmScratch(idM);
  await writeFile(fp(idM), JSON.stringify({ enabled: true, nickname: 'A', tokenKey: 'PLAINTEXT', agent: 'wpp-b', groupPolicy: 'closed' }, null, 2));
  await writeOcj({ channels: { wechatpadpro: { accounts: { [idM]: { enabled: true, nickname: 'A', agent: 'wpp-b', groupPolicy: 'closed' } } } } });
  let pub = await publishAccountCoreFieldsToChannelConfig(idM);
  assert.equal(pub.ok, true);
  assert.deepEqual(pub.changedFields, [], 'first publish: values equal → zero write');
  // 外部改文件 nickname + 新增 heartflow.enabled
  await writeFile(fp(idM), JSON.stringify({ enabled: true, nickname: 'A2', tokenKey: 'PLAINTEXT', agent: 'wpp-b', groupPolicy: 'closed', heartflow: { enabled: true } }, null, 2));
  pub = await publishAccountCoreFieldsToChannelConfig(idM);
  assert.ok(pub.changedFields.includes('nickname') && pub.changedFields.includes('heartflow.enabled'), `publish fields: ${pub.changedFields}`);
  const ocj = JSON.parse(await readFile(join(stateDir, 'openclaw.json'), 'utf8'));
  const blk = ocj.channels.wechatpadpro.accounts[idM];
  assert.equal(blk.nickname, 'A2');
  assert.equal(blk.heartflow.enabled, true);
  assert.equal(blk.tokenKey, undefined, 'secret NEVER published');
  // 幂等
  pub = await publishAccountCoreFieldsToChannelConfig(idM);
  assert.deepEqual(pub.changedFields, []);
  // 块缺失 → 不复活
  await writeOcj({ channels: {} });
  pub = await publishAccountCoreFieldsToChannelConfig(idM);
  assert.equal(pub.ok, false);
  assert.match(pub.reason ?? '', /absent/);
  // MIRROR=0 → 关
  process.env.WPP_CHANNEL_CFG_MIRROR = '0';
  await writeOcj({ channels: { wechatpadpro: { accounts: { [idM]: {} } } } });
  pub = await publishAccountCoreFieldsToChannelConfig(idM);
  assert.match(pub.reason ?? '', /mirror disabled/);
  delete process.env.WPP_CHANNEL_CFG_MIRROR;
});

test('T9 状态诊断: watcher 默认未起 (未调 watch), block 可探', async () => {
  await writeOcj({ channels: {} });
  const st = channelUiStatus();
  assert.equal(st.watching, false);
  assert.equal(st.coreFields, CHANNEL_UI_CORE_FIELDS.length);
  assert.equal(st.blockPresent, false, 'scratch state dir has no channels block after T8 cleanup');
});

test.after(async () => {
  await rmScratch(id);
  await rmScratch(idB);
  await rmScratch(idM);
  await rm(stateDir, { recursive: true, force: true });
});
