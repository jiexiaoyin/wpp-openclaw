// channel-list-comma-v1150.test.mjs — v1.15.0 Channel 页五个 wxid 列表 = 「逗号分隔单框」
//
// 双形态契约 (本版核心):
//   - manifest channel schema / openclaw.json#channels.wechatpadpro 块侧 = **string** (逗号串)
//     —— 类型是唯一杠杆: 框架 control-ui 只按 schema type 分派控件, array 恒为逐行增删编辑器,
//        string 恒为单行 input; uiHints 没有 widget/format/csv/separator 这类开关。
//   - accounts/<id>.json (唯一真值) 与**所有运行期消费点** = 仍是 **string[]**。
//   - 桥双向转换; config.ts 读时归一 (coerceStringArrayList) 作单一收口。
//   ⚠️ 为什么必须收口: 字符串形态一旦漏到消费点, `.includes(x)` 退化成**子串匹配**且不抛错
//      ⇒ 静默误授权；`blacklistGroups` 清空 = 全放行、白名单清空 = 全拒, 两个方向都致命。
//
// 只碰 scratch 账号 (cl*); 绝不读写 accounts/default.json (老板铁律: 生产配置零改动)。
// 需要 dist 编译产物 (npm run build 后跑)。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const DEPLOY = '/root/.openclaw/extensions/wechatpadpro';
const ACCT_DIR = join(ROOT, 'accounts');
const FIVE = ['adminUsers', 'allowFrom', 'groupAllowFrom', 'blacklistGroups', 'friendCirclePublishAllowFrom'];

const stateDir = await mkdtemp(join(tmpdir(), 'wpp-comma-'));
process.env.OPENCLAW_STATE_DIR = stateDir;

const BRIDGE = await import(pathToFileURL(join(ROOT, 'dist/channel-ui-bridge.js')).href);
const CFG = await import(pathToFileURL(join(ROOT, 'dist/config.js')).href);
delete process.env.WPP_CHANNEL_CFG_MIRROR;

const fp = (a) => join(ACCT_DIR, `${a}.json`);
const rmScratch = (a) => rm(fp(a), { force: true });
const writeAcct = (a, obj) => writeFile(fp(a), JSON.stringify(obj, null, 2), 'utf8');
const readAcct = async (a) => JSON.parse(await readFile(fp(a), 'utf8'));
const writeOcj = (o) => writeFile(join(stateDir, 'openclaw.json'), JSON.stringify(o, null, 2));
const NEW_ACCT = { enabled: true, nickname: 'COMMA', agent: 'wpp-b', groupPolicy: 'closed' };

function manifestAt(root, tag) {
  const m = JSON.parse(fs.readFileSync(join(root, 'openclaw.plugin.json'), 'utf8'));
  return [m, m.channelConfigs.wechatpadpro.schema.properties, tag];
}

/** 五个属性必须是 string + 无 items + 描述写明逗号分隔 (dev 与部署副本共用判据) */
function assertFiveStrings(props, tag) {
  for (const k of FIVE) {
    const node = props[k];
    assert.ok(node, `${tag}: channel schema 缺 ${k}`);
    assert.equal(node.type, 'string', `${tag}: ${k}.type 必须是 string (array 会渲染成逐行增删编辑器)`);
    assert.equal(node.items, undefined, `${tag}: ${k} 不许再留 items 子块 (留了 = 形状自相矛盾)`);
    assert.ok(
      typeof node.description === 'string' && node.description.includes('逗号分隔'),
      `${tag}: ${k}.description 必须写明逗号分隔 (UI 文案的唯一来源)`,
    );
  }
}

// ---------------------------------------------------------------------------
// V1 — manifest: 类型是唯一杠杆
// ---------------------------------------------------------------------------
test('V1 dev manifest: 五个列表字段 = string, 无 items, 描述含逗号分隔, 且 uiHints 标签未被改坏', () => {
  const [m, props] = manifestAt(ROOT, 'dev');
  assertFiveStrings(props, 'dev');
  // uiHints 五个 label 从 v1.3.x 起就写着「（逗号分隔）」—— 改完类型它们才第一次名副其实
  for (const k of FIVE) {
    assert.ok(
      m.channelConfigs.wechatpadpro.uiHints[k]?.label?.includes('逗号分隔'),
      `dev: uiHints.${k}.label 必须仍写明逗号分隔`,
    );
  }
  // 顶层 configUiHints 是 **plugin 配置页** (plugins.entries.*) 的提示, 那条路本来就是逗号串口径 —— 不碰
  assert.equal(m.configUiHints.allowFrom.label, '私聊白名单 (逗号分隔)', '顶层 configUiHints 未被顺手改掉');
  assert.equal(m.version, '1.15.0');
});

test('V1b 部署副本同判据 (部署前故意红, 与 P2-4.2 同族门禁)', () => {
  const [, props] = manifestAt(DEPLOY, 'deploy');
  assertFiveStrings(props, 'deploy');
});

test('V1c 反证: 其余字段类型未被动过 (只有这五个从 array 变 string)', () => {
  const [, props] = manifestAt(ROOT, 'dev');
  const strings = Object.entries(props)
    .filter(([, v]) => v.type === 'string')
    .map(([k]) => k)
    .sort();
  const expected = ['agent', 'allowFrom', 'adminUsers', 'blacklistGroups', 'friendCirclePublishAllowFrom', 'groupAllowFrom', 'groupPolicy', 'nickname', 'selfWxid'].sort();
  assert.deepEqual(strings, expected, `string 型属性集合必须恰好是这 9 个; 实得 ${strings.join(',')}`);
  assert.equal(props.enabled.type, 'boolean');
  assert.equal(props.heartflow.type, 'object');
  assert.equal(props.selfWxid.readOnly, true, 'selfWxid 仍只读');
});

// ---------------------------------------------------------------------------
// V2 — 漂移锁: 插件常量 ⇄ manifest ⇄ 派生的文件侧 kind
// ---------------------------------------------------------------------------
test('V2 漂移锁: COMMA_LIST_FIELDS == 核心字段集里 kind=stringArray 的那五个, 且都真在 manifest 里', () => {
  assert.ok(BRIDGE.COMMA_LIST_FIELDS instanceof Set, 'COMMA_LIST_FIELDS 必须是导出常量');
  assert.deepEqual([...BRIDGE.COMMA_LIST_FIELDS].sort(), [...FIVE].sort(), '常量必须恰好是这五个名字');

  const byPath = new Map(BRIDGE.CHANNEL_UI_CORE_FIELDS.map((s) => [s.path, s]));
  for (const k of FIVE) {
    const spec = byPath.get(k);
    assert.ok(spec, `核心字段集缺 ${k}`);
    assert.equal(
      spec.kind,
      'stringArray',
      `${k} 的文件侧 kind 必须是 stringArray —— 一旦退回 string, 桥会把逗号字符串写进账号文件, 所有 .includes() 退化成子串匹配 = 静默误授权`,
    );
  }
  // 反向锁: 核心字段集里**没有别的** stringArray 被误当成逗号列表
  const derived = BRIDGE.CHANNEL_UI_CORE_FIELDS.filter((s) => s.kind === 'stringArray').map((s) => s.path).sort();
  assert.deepEqual(derived, [...FIVE].sort(), `派生出的 stringArray 集合必须恰好是这五个; 实得 ${derived.join(',')}`);

  // 常量必须与 manifest 同名 (漂移方向: manifest 改名/删字段 → 这里红)
  const [, props] = manifestAt(ROOT, 'dev');
  for (const k of FIVE) assert.ok(props[k], `manifest 缺 ${k} (COMMA_LIST_FIELDS 已漂移)`);

  // cfg 侧常量同源
  assert.deepEqual([...CFG.COMMA_LIST_KEYS].sort(), [...FIVE].sort(), 'config.ts 的 COMMA_LIST_KEYS 必须同集合');
});

// ---------------------------------------------------------------------------
// V3 — 运行期归一 (单一收口)
// ---------------------------------------------------------------------------
test('V3 coerceStringArrayList: 数组清洗 / 逗号串拆分 / 空串与异常形态为空', () => {
  const f = CFG.coerceStringArrayList;
  assert.deepEqual(f(['a', ' b ', '', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(f(['a', 42, null, 'b']), ['a', 'b'], '非字符串元素丢弃 (不 stringify)');
  assert.deepEqual(f('a, b ,,c'), ['a', 'b', 'c'], '逗号串拆分 + trim + 丢空段');
  assert.deepEqual(f(''), [], '空串 = 空列表');
  assert.deepEqual(f('  ,  , '), [], '只有分隔符 = 空列表');
  assert.deepEqual(f('solo'), ['solo'], '单值无逗号也合法');
  assert.deepEqual(f(undefined), []);
  assert.deepEqual(f(null), []);
  assert.deepEqual(f(7), []);
  assert.deepEqual(f({ a: 1 }), []);
});

test('V4 loadAccountConfig: 手改文件写逗号串/空串/数组三种形态都被归一 (缓存层同样干净)', async () => {
  const id = `clrt${process.pid}`;
  const cleanup = () => {
    fs.rmSync(fp(id), { force: true });
    CFG.invalidateConfigCache(id);
  };
  try {
    // nicknake 决定是否命中 cache 层 (与 hmac-fix 同约定), 故三条都带 nickname
    await writeAcct(id, { ...NEW_ACCT, allowFrom: 'q1, q2 ,,q3', groupAllowFrom: ['g1@chatroom', ' g2@chatroom '] });
    CFG.invalidateConfigCache(id);
    let cfg = await CFG.loadAccountConfig(id);
    assert.deepEqual(cfg.allowFrom, ['q1', 'q2', 'q3'], '逗号串 → string[] (手改文件也生效)');
    assert.deepEqual(cfg.groupAllowFrom, ['g1@chatroom', 'g2@chatroom'], '数组 → 清洗');

    // 命中缓存的分支也必须干净 (缓存里存的是归一后的对象)
    const cached = await CFG.loadAccountConfig(id);
    assert.deepEqual(cached.allowFrom, ['q1', 'q2', 'q3'], 'cache 层不许把字符串原样发出去');
    assert.ok(Array.isArray(cached.allowFrom), '运行期消费点拿到的永远是数组');

    // 空串 / 空数组 / 缺键
    await writeAcct(id, { ...NEW_ACCT, allowFrom: '', blacklistGroups: [], adminUsers: '  ' });
    CFG.invalidateConfigCache(id);
    cfg = await CFG.loadAccountConfig(id);
    assert.deepEqual(cfg.allowFrom, [], '空串 → []');
    assert.deepEqual(cfg.blacklistGroups, [], '空数组 → []');
    assert.deepEqual(cfg.adminUsers, [], '纯空白 → []');
    assert.equal(cfg.friendCirclePublishAllowFrom, undefined, '缺键不凭空造值');
  } finally {
    cleanup();
  }
});

test('V5 六个 CLI mutator 不再把逗号串当成空数组 (旧写法会静默截断原有条目)', async () => {
  const id = `clmut${process.pid}`;
  const cleanup = () => {
    fs.rmSync(fp(id), { force: true });
    CFG.invalidateConfigCache(id);
  };
  try {
    await writeAcct(id, {
      ...NEW_ACCT,
      allowFrom: 'a1,a2',
      groupAllowFrom: 'g1@chatroom',
      blacklistGroups: 'bad1@chatroom,bad2@chatroom',
      heartflow: { enabled: true, whitelistGroups: 'h1@chatroom' },
    });
    CFG.invalidateConfigCache(id);

    const r1 = await CFG.appendAllowFrom(id, 'a3');
    assert.deepEqual(r1.allowFrom, ['a1', 'a2', 'a3'], `append 不许截断 (实得 ${JSON.stringify(r1.allowFrom)})`);
    const r2 = await CFG.appendGroupAllowFrom(id, 'g2@chatroom');
    assert.deepEqual(r2.groupAllowFrom, ['g1@chatroom', 'g2@chatroom']);
    const r3 = await CFG.removeAllowFrom(id, 'a2');
    assert.deepEqual(r3.allowFrom, ['a1', 'a3']);
    const r4 = await CFG.removeGroupAllowFrom(id, 'g1@chatroom');
    assert.deepEqual(r4.groupAllowFrom, ['g2@chatroom']);
    const r5 = await CFG.updateHeartflowGroups(id, 'add', 'h2@chatroom');
    assert.deepEqual(r5.whitelistGroups, ['h1@chatroom', 'h2@chatroom']);
    const r6 = await CFG.updateBlacklistGroups(id, 'add', ['bad3@chatroom']);
    assert.deepEqual(r6.blacklist, ['bad1@chatroom', 'bad2@chatroom', 'bad3@chatroom']);
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// V6 — 桥: 块侧逗号串 ⇄ 账号文件 string[]
// ---------------------------------------------------------------------------
test('V6 块→文件解码: 逗号串拆分 / 空串清空 / null 与数字仍拒绝 (T5 语义保留)', async () => {
  const id = `clbd${process.pid}`;
  await rmScratch(id);
  try {
    await writeAcct(id, { ...NEW_ACCT, allowFrom: ['old'] });
    let r = await BRIDGE.applyChannelBlockToAccount(id, {
      allowFrom: 'q1, q2 ,,q3',
      adminUsers: 'boss1',
      groupAllowFrom: '',
      blacklistGroups: 'bad@chatroom',
      friendCirclePublishAllowFrom: 'fc1, fc2',
    });
    assert.ok(FIVE.every((k) => r.changedFields.includes(k)), `五个字段都该写回: ${r.changedFields}`);
    let got = await readAcct(id);
    assert.deepEqual(got.allowFrom, ['q1', 'q2', 'q3'], '块侧逗号串 → 文件侧 string[]');
    assert.deepEqual(got.adminUsers, ['boss1']);
    assert.deepEqual(got.groupAllowFrom, [], '空串 = 清空列表 (旧版会被跳过 ⇒ 永远清不掉)');
    assert.deepEqual(got.blacklistGroups, ['bad@chatroom']);
    assert.deepEqual(got.friendCirclePublishAllowFrom, ['fc1', 'fc2']);
    for (const k of FIVE) assert.ok(Array.isArray(got[k]), `文件里 ${k} 必须是数组`);

    // 文件侧仍然是数组 ⇒ 运行期读点拿到的也是数组
    CFG.invalidateConfigCache(id);
    const cfg = await CFG.loadAccountConfig(id);
    assert.deepEqual(cfg.allowFrom, ['q1', 'q2', 'q3']);
    assert.ok(cfg.allowFrom.includes('q1') && !cfg.allowFrom.includes('q'), '不是子串匹配 (".includes" 语义未被污染)');

    // 幂等: 同样的块再来一次 → 零写
    const before = await readFile(fp(id), 'utf8');
    r = await BRIDGE.applyChannelBlockToAccount(id, {
      allowFrom: 'q1, q2 ,,q3',
      adminUsers: 'boss1',
      groupAllowFrom: '',
      blacklistGroups: 'bad@chatroom',
      friendCirclePublishAllowFrom: 'fc1, fc2',
    });
    assert.deepEqual(r.changedFields, [], '值等价 ⇒ 零写');
    assert.equal(before, await readFile(fp(id), 'utf8'), '文件逐字节未变');

    // T5 语义保留: null / 数字 仍被拒绝, 文件不动
    const snap = await readFile(fp(id), 'utf8');
    for (const bad of [null, 5, { a: 1 }]) {
      const rr = await BRIDGE.applyChannelBlockToAccount(id, { allowFrom: bad });
      assert.deepEqual(rr.changedFields, [], `ill-typed ${JSON.stringify(bad)} 必须跳过`);
      assert.equal(snap, await readFile(fp(id), 'utf8'));
    }
  } finally {
    await rmScratch(id);
  }
});

test('V7 全量同步 (页面保存路径): 逗号串块 → 账号文件数组', async () => {
  const id = `clsync${process.pid}`;
  await rmScratch(id);
  try {
    await writeOcj({
      channels: { wechatpadpro: { accounts: { [id]: { enabled: true, nickname: 'S', allowFrom: 'x1,x2', blacklistGroups: '' } } } },
    });
    const results = await BRIDGE.syncAccountsFromChannelConfig();
    const mine = results.find((r) => r.accountId === id);
    assert.ok(mine, '该账号应被同步');
    const got = await readAcct(id);
    assert.deepEqual(got.allowFrom, ['x1', 'x2']);
    assert.deepEqual(got.blacklistGroups, []);
  } finally {
    await rmScratch(id);
  }
});

test('V8 文件→块编码: 数组编码成逗号串, 幂等零写, 遗留数组块自愈', async () => {
  const id = `clenc${process.pid}`;
  await rmScratch(id);
  try {
    await writeAcct(id, { ...NEW_ACCT, allowFrom: ['a', 'b'], blacklistGroups: [] });
    // 块里已是编码后的形态 ⇒ 零写 (迁移后的稳态, 回路断得住)
    await writeOcj({ channels: { wechatpadpro: { accounts: { [id]: { enabled: true, nickname: 'COMMA', agent: 'wpp-b', groupPolicy: 'closed', allowFrom: 'a,b', blacklistGroups: '' } } } } });
    let pub = await BRIDGE.publishAccountCoreFieldsToChannelConfig(id);
    assert.equal(pub.ok, true);
    assert.deepEqual(pub.changedFields, [], `编码后等价 ⇒ 零写; 实得 ${pub.changedFields}`);

    // 文件变 → 块被重写为逗号串
    await writeAcct(id, { ...NEW_ACCT, allowFrom: ['a', ' c '], blacklistGroups: [] });
    pub = await BRIDGE.publishAccountCoreFieldsToChannelConfig(id);
    assert.ok(pub.changedFields.includes('allowFrom'), `实得 ${pub.changedFields}`);
    let blk = JSON.parse(await readFile(join(stateDir, 'openclaw.json'), 'utf8')).channels.wechatpadpro.accounts[id];
    assert.equal(blk.allowFrom, 'a,c', '文件 string[] → 块逗号串 (trim 后 join)');
    assert.equal(typeof blk.allowFrom, 'string', '块侧必须是字符串 (否则 UI 又变回逐行编辑器)');
    assert.equal(blk.blacklistGroups, '', '空数组 → 空串 (不是 [] )');

    // 迁移前遗留的**数组**块 → 自愈成逗号串
    await writeOcj({ channels: { wechatpadpro: { accounts: { [id]: { enabled: true, nickname: 'COMMA', agent: 'wpp-b', groupPolicy: 'closed', allowFrom: ['a', 'c'], blacklistGroups: [] } } } } });
    pub = await BRIDGE.publishAccountCoreFieldsToChannelConfig(id);
    assert.ok(pub.changedFields.includes('allowFrom') && pub.changedFields.includes('blacklistGroups'), `遗留数组块必须被自愈: ${pub.changedFields}`);
    blk = JSON.parse(await readFile(join(stateDir, 'openclaw.json'), 'utf8')).channels.wechatpadpro.accounts[id];
    assert.equal(blk.allowFrom, 'a,c');
    assert.equal(blk.blacklistGroups, '');
    // 自愈后进入稳态: 再跑一次零写
    pub = await BRIDGE.publishAccountCoreFieldsToChannelConfig(id);
    assert.deepEqual(pub.changedFields, [], '自愈后必须稳态零写');
  } finally {
    await rmScratch(id);
  }
});

test.after(async () => {
  await rm(stateDir, { recursive: true, force: true });
});
