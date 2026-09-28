// tests/unit/dm-policy.test.mjs — 私聊白名单门禁 (安全边界, fail-closed) 行为级回归
//
// 为什么这批要单独立门:
//   checkDmPolicy 是"陌生人能不能把消息送进 dispatch"的最后一道闸。它返的是对象
//   ({allowed, reason} / {allowed, isAdmin}) 而不是 boolean —— 一旦有人把 allowFrom
//   的判断写反 (或误把 adminUsers 当成豁免名单), 编译期毫无提示, 只会在生产里静默放行。
//   本文件把每条准入/拒绝路径钉成行为断言, 包含字符串匹配的三种边界
//   (大小写 / 前缀 / 空串), 这三种是白名单实现最容易悄悄放宽的地方。
//
// 真实 wxid 一律不进本文件 (公开仓红线), 样本全是构造的。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDmPolicy } from '../../dist/inbound/dm-policy.js';

/** 造一条最小可用的入站私聊消息 (只填 checkDmPolicy 会读的字段) */
const dm = (fromWxid, over = {}) => ({
  accountId: 'acct_test',
  msgId: 'msg_test',
  newMsgId: 'msg_test',
  fromWxid,
  chatroomId: undefined,
  msgType: 1,
  content: '你好',
  ts: 0,
  raw: {},
  peerKind: 'dm',
  peerId: fromWxid,
  trigger: 'direct',
  ...over,
});

// ── 1. allowFrom 为空 = 开放私聊 (当前默认行为) ────────────────────────────

test('白名单为空 → 放行任意 sender (开放 DM 是当前默认), 非管理员 isAdmin=false', () => {
  const r = checkDmPolicy({ msg: dm('wxid_anyone'), allowFrom: [], adminUsers: [] });
  assert.deepEqual(r, { allowed: true, isAdmin: false }, '空白名单必须放行, 且不得谎报 isAdmin');
});

test('白名单为空 → 放行的同时仍能正确标出 isAdmin', () => {
  const r = checkDmPolicy({
    msg: dm('wxid_boss'),
    allowFrom: [],
    adminUsers: ['wxid_boss'],
  });
  assert.deepEqual(r, { allowed: true, isAdmin: true });
});

// ── 2. 白名单非空 = fail-closed 闸门 ──────────────────────────────────────

test('白名单非空 + 未授权 sender → 拒绝, 且 reason 带出具体 wxid (可定位)', () => {
  const r = checkDmPolicy({
    msg: dm('wxid_stranger'),
    allowFrom: ['wxid_boss'],
    adminUsers: [],
  });
  assert.equal(r.allowed, false, '不在白名单的 sender 必须被拒 (fail-closed)');
  assert.equal(r.reason, 'allowFrom mismatch: wxid_stranger');
  assert.equal(r.isAdmin, undefined, '拒绝分支不得携带 isAdmin 字段');
});

test('白名单非空 + 授权 sender → 放行', () => {
  const r = checkDmPolicy({
    msg: dm('wxid_boss'),
    allowFrom: ['wxid_boss'],
    adminUsers: [],
  });
  assert.deepEqual(r, { allowed: true, isAdmin: false });
});

test('白名单多项: 命中任意一项即放行 (不是只认第一项)', () => {
  for (const who of ['wxid_a', 'wxid_b', 'wxid_c']) {
    const r = checkDmPolicy({
      msg: dm(who),
      allowFrom: ['wxid_a', 'wxid_b', 'wxid_c'],
      adminUsers: [],
    });
    assert.equal(r.allowed, true, `${who} 在白名单第三位也必须放行`);
  }
});

// ── 3. admin 不是白名单豁免 (最容易写反的一条) ───────────────────────────

test('安全边界: adminUsers 里的 wxid 若不在 allowFrom → 仍拒绝 (admin 不豁免 DM 白名单)', () => {
  const r = checkDmPolicy({
    msg: dm('wxid_boss'),
    allowFrom: ['wxid_other'],
    adminUsers: ['wxid_boss'],
  });
  assert.equal(r.allowed, false, 'admin 身份不得绕过 allowFrom — 否则白名单形同虚设');
  assert.equal(r.reason, 'allowFrom mismatch: wxid_boss');
});

test('白名单非空且 sender 同时是 admin → 放行且 isAdmin=true (身份识别照常生效)', () => {
  const r = checkDmPolicy({
    msg: dm('wxid_boss'),
    allowFrom: ['wxid_boss'],
    adminUsers: ['wxid_boss'],
  });
  assert.deepEqual(r, { allowed: true, isAdmin: true });
});

// ── 4. 字符串匹配边界: 大小写 / 前缀 / 空串 ───────────────────────────────

test('边界: 大小写敏感 — 白名单大写, sender 小写 → 拒绝 (不得悄悄 toLowerCase)', () => {
  const r = checkDmPolicy({
    msg: dm('wxid_demo'),
    allowFrom: ['WXID_Demo'],
    adminUsers: [],
  });
  assert.equal(r.allowed, false, 'wxid 大小写是不同身份, 精确匹配才安全');
});

test('边界: 精确匹配而非前缀 — wxid_demo2 不得被 wxid_demo 放行', () => {
  const r = checkDmPolicy({
    msg: dm('wxid_demo2'),
    allowFrom: ['wxid_demo'],
    adminUsers: [],
  });
  assert.equal(r.allowed, false, '前缀命中放行 = 白名单被放大, 必须精确');
});

test('边界: 反向也不得前缀命中 — 白名单 wxid_demo2 不放行 wxid_demo', () => {
  const r = checkDmPolicy({
    msg: dm('wxid_demo'),
    allowFrom: ['wxid_demo2'],
    adminUsers: [],
  });
  assert.equal(r.allowed, false);
});

test('边界: 空白差异 (前后空格) 不视为同一身份', () => {
  const r = checkDmPolicy({
    msg: dm('wxid_demo '),
    allowFrom: ['wxid_demo'],
    adminUsers: [],
  });
  assert.equal(r.allowed, false, '带尾随空格的 wxid 是另一个字符串, 不得 trim 后放行');
});

test('边界: 空串 sender 在白名单非空且无空串项时 → 拒绝', () => {
  const r = checkDmPolicy({
    msg: dm(''),
    allowFrom: ['wxid_boss'],
    adminUsers: [],
  });
  assert.equal(r.allowed, false, '缺 sender 的消息不得因为"不匹配"以外的理由放行');
  assert.equal(r.reason, 'allowFrom mismatch: ');
});

// ⚠️ 已核实的配置卫生隐患 (只记录, 未修): 白名单里混入空串项 ("") 时,
//    空 fromWxid 会被放行 ('' === '' 命中 includes)。单条断言钉住当前行为, 避免有人
//    以为这里已经防住了。修法是在配置加载层过滤空项, 不在本模块 (见报告)。
test("隐患记录: 白名单含空串项 → 空 fromWxid 被放行 (''==='' 命中)", () => {
  const r = checkDmPolicy({
    msg: dm(''),
    allowFrom: [''],
    adminUsers: [],
  });
  assert.equal(r.allowed, true, '当前实现会放行 —— 这是白名单空项导致的 fail-open, 已在报告列出');
});

// ── 5. 返回形态契约 (caller 依赖它做分支) ─────────────────────────────────

test('返回形态: allowed=false 分支必带非空 reason; allowed=true 分支必带 boolean isAdmin', () => {
  const denied = checkDmPolicy({ msg: dm('x'), allowFrom: ['y'], adminUsers: [] });
  assert.equal(typeof denied.reason, 'string');
  assert.ok(denied.reason.length > 0, 'reason 不得为空 — caller 靠它落日志定位');

  const ok = checkDmPolicy({ msg: dm('x'), allowFrom: [], adminUsers: [] });
  assert.equal(typeof ok.isAdmin, 'boolean');
  assert.equal(ok.reason, undefined, '放行分支不得携带 reason');
});

test('纯函数: 同一入参重复调用结果稳定, 且不修改入参 (allowFrom 不被消耗)', () => {
  const allowFrom = ['wxid_boss'];
  const msg = dm('wxid_boss');
  const first = checkDmPolicy({ msg, allowFrom, adminUsers: [] });
  const second = checkDmPolicy({ msg, allowFrom, adminUsers: [] });
  assert.deepEqual(first, second);
  assert.deepEqual(allowFrom, ['wxid_boss'], '入参数组不得被改动');
  assert.equal(msg.fromWxid, 'wxid_boss');
});
