// tests/unit/group-policy.test.mjs — 群聊策略门禁 (open/disabled/allowlist/closed) 行为级回归
//
// 为什么: checkGroupPolicy 决定"这条群消息能不能进 dispatch"。四种模式里三种是拒绝语义,
//   一旦 allowlist 的空列表被当成"没配 = 全放", 或者 disabled/closed 被写成放行, 生产上
//   的表现是"机器人突然在陌生群里开口" —— 只能从行为断言上守。
//   四种模式 × (空配置 / 白名单未命中 / @ 未命中 / chatroomId 缺失) 的边界全部钉住。
//
// 真实群 ID / wxid 一律不进本文件 (公开仓红线), 样本全是构造的。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkGroupPolicy } from '../../dist/inbound/group-policy.js';

const BOT = 'wxid_bot_test';

/** 造一条最小可用的入站群消息 */
const gm = (content, over = {}) => ({
  accountId: 'acct_test',
  msgId: 'msg_test',
  newMsgId: 'msg_test',
  fromWxid: 'wxid_sender',
  chatroomId: 'room_test@chatroom',
  msgType: 1,
  content,
  ts: 0,
  raw: {},
  peerKind: 'group',
  peerId: 'room_test@chatroom',
  trigger: 'at',
  ...over,
});

/** 四种模式的统一调用入口 (默认不要求 @, 便于隔离 group 级策略) */
const check = (policy, msg, over = {}) =>
  checkGroupPolicy({
    msg,
    policy,
    groupAllowFrom: [],
    requireAtMention: false,
    selfWxid: BOT,
    ...over,
  });

// ── 1. open: 不设群白名单, 只受 @ 要求约束 ────────────────────────────────

test('open + 不要求 @ → 放行, 且不带 cleanedContent 字段 (content 未变化)', () => {
  const r = check('open', gm('大家好'));
  assert.deepEqual(r, { allowed: true }, 'content 无变化时不得塞 cleanedContent 键');
});

test('open + 要求 @ 但没 @ 到 bot → 拒绝, reason 指明是 @ 缺失', () => {
  const r = check('open', gm('大家好'), { requireAtMention: true });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'requireAtMention but bot not @-ed');
});

test('open + 要求 @ + 命中 @bot → 放行', () => {
  const r = check('open', gm(`@${BOT} 大家好`), { requireAtMention: true });
  assert.equal(r.allowed, true);
});

test('open + 要求 @ 但 selfWxid 为 null → 拒绝 (无自我身份时不得盲放)', () => {
  const r = check('open', gm(`@${BOT} 大家好`), { requireAtMention: true, selfWxid: null });
  assert.equal(r.allowed, false, 'selfWxid 未知时 isBotMentionedByText 恒 false → 必须拒绝');
  assert.equal(r.reason, 'requireAtMention but bot not @-ed');
});

test('open + 要求 @ + 只 @ 了别人 (不是 bot) → 拒绝', () => {
  const r = check('open', gm('@wxid_someoneelse 看下'), { requireAtMention: true });
  assert.equal(r.allowed, false, '别人被 @ 不等于 bot 被 @');
});

test('open + 要求 @ + 命中 → 带 sender 前缀与 @bot 的 content 被清洗后回传', () => {
  const raw = `wxid_sender:\n@${BOT} 明天开会`;
  const r = check('open', gm(raw), { requireAtMention: true });
  assert.equal(r.allowed, true);
  assert.equal(r.cleanedContent, '明天开会', '给 AI 看的正文应去掉 wxid 前缀与 @bot');
  assert.notEqual(r.cleanedContent, raw);
});

test('open + 要求 @ + content 里 @bot 但无 sender 前缀 → cleanedContent 只去 @bot', () => {
  const r = check('open', gm(`@${BOT} 明天开会`), { requireAtMention: true });
  assert.equal(r.allowed, true);
  assert.equal(r.cleanedContent, '明天开会');
});

// ── 2. disabled / closed: 无条件拒绝 (最高优先级) ─────────────────────────

test('disabled → 一律拒绝, 即使 @ 到 bot 且有白名单命中', () => {
  for (const content of ['大家好', `@${BOT} 大家好`]) {
    const r = check('disabled', gm(content), {
      requireAtMention: false,
      groupAllowFrom: ['room_test@chatroom'],
    });
    assert.equal(r.allowed, false, `disabled 必须拒绝 (content=${content})`);
    assert.equal(r.reason, 'groupPolicy=disabled');
  }
});

test('closed → 一律拒绝 (未实现模式的 fail-closed, 不得当作 open 放行)', () => {
  const r = check('closed', gm(`@${BOT} 大家好`), {
    requireAtMention: false,
    groupAllowFrom: ['room_test@chatroom'],
  });
  assert.equal(r.allowed, false);
  assert.match(r.reason, /closed/);
});

// ── 3. allowlist: 空列表 = 拒绝所有 (fail-closed) ────────────────────────

test('allowlist + 空白名单 → 拒绝所有群 (空配置不等于全放)', () => {
  const r = check('allowlist', gm('大家好'), { groupAllowFrom: [] });
  assert.equal(r.allowed, false, 'P0-2: allowlist 空列表必须拒绝所有');
  assert.match(r.reason, /groupAllowFrom mismatch/);
});

test('allowlist + 白名单非空但本群未命中 → 拒绝, reason 带出群 ID', () => {
  const r = check('allowlist', gm('大家好'), { groupAllowFrom: ['room_other@chatroom'] });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'groupAllowFrom mismatch: room_test@chatroom');
});

test('allowlist + 本群命中 + 不要求 @ → 放行', () => {
  const r = check('allowlist', gm('大家好'), { groupAllowFrom: ['room_test@chatroom'] });
  assert.equal(r.allowed, true);
});

test('allowlist + 本群命中 + 多项白名单 (命中最后一项也放行)', () => {
  const r = check('allowlist', gm('大家好'), {
    groupAllowFrom: ['room_a@chatroom', 'room_b@chatroom', 'room_test@chatroom'],
  });
  assert.equal(r.allowed, true);
});

test('allowlist + 本群命中 + 要求 @ 但没 @ → 仍拒绝 (@ 是白名单之外的独立闸门)', () => {
  const r = check('allowlist', gm('大家好'), {
    groupAllowFrom: ['room_test@chatroom'],
    requireAtMention: true,
  });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'requireAtMention but bot not @-ed', '白名单命中不得跳过 @ 检查');
});

test('allowlist + 本群命中 + 要求 @ + 命中 → 放行 (两道闸门都过)', () => {
  const r = check('allowlist', gm(`@${BOT} 大家好`), {
    groupAllowFrom: ['room_test@chatroom'],
    requireAtMention: true,
  });
  assert.equal(r.allowed, true);
});

test('allowlist 优先级: 未命中的群即便 @ 到 bot 也拒绝 (顺序不得颠倒)', () => {
  const r = check('allowlist', gm(`@${BOT} 大家好`), {
    groupAllowFrom: ['room_other@chatroom'],
    requireAtMention: true,
  });
  assert.equal(r.allowed, false, '白名单必须在 @ 检查之前判, 否则未授权群可借 @ 混入');
  assert.equal(r.reason, 'groupAllowFrom mismatch: room_test@chatroom');
});

// ⚠️ 已核实的 fail-open 漏洞 (只记录, 未修):
//   allowlist 分支的条件是 `chatroomId && !includes(chatroomId)` —— chatroomId 为空串/undefined
//   时 `&&` 左侧为 falsy, 整个条件短路为 false, 白名单校验被**整体跳过**。
//   即: 群白名单模式下, 一条没有 chatroomId 的消息会绕过白名单直达 @ 检查;
//   若 requireAtMention=false, 直接放行。已在报告列为待修项。
//   修复后这两条断言应改为 allowed === false。
test('漏洞记录: allowlist + chatroomId 为空串 → 白名单被短路跳过 (fail-open)', () => {
  const r = check('allowlist', gm('大家好', { chatroomId: '' }), {
    groupAllowFrom: ['room_other@chatroom'],
    requireAtMention: false,
  });
  assert.equal(r.allowed, true, '当前实现放行 —— 空 chatroomId 绕过白名单, 已在报告列出');
});

test('漏洞记录: allowlist + chatroomId 缺失 (undefined) → 同样绕过白名单', () => {
  const r = check('allowlist', gm('大家好', { chatroomId: undefined }), {
    groupAllowFrom: ['room_other@chatroom'],
    requireAtMention: false,
  });
  assert.equal(r.allowed, true, '当前实现放行 —— undefined chatroomId 绕过白名单, 已在报告列出');
});

// ── 4. 返回形态契约 ─────────────────────────────────────────────────────

test('返回形态: 拒绝分支必带非空 reason; 放行分支 reason 为 undefined', () => {
  const denied = check('disabled', gm('x'));
  assert.equal(typeof denied.reason, 'string');
  assert.ok(denied.reason.length > 0, 'reason 不得为空 — caller 靠它落日志定位');

  const ok = check('open', gm('x'));
  assert.equal(ok.reason, undefined);
  assert.equal(ok.cleanedContent, undefined);
});

test('返回形态: 只有 @ 分支才清洗 — 不要求 @ 时 content 原样透传 (不带 cleanedContent)', () => {
  // cleanedContent 只在 requireAtMention 分支里产出。不要求 @ 的模式下即使正文含 @bot,
  // 也不做清洗 —— 钉住这个不对称: 若将来有人在 @ 分支外也清洗, 这里会先报出来。
  const r = check('open', gm(`wxid_sender:\n@${BOT} hi`), { requireAtMention: false });
  assert.deepEqual(r, { allowed: true }, '不要求 @ 时不得带 cleanedContent');
});

test('纯函数: 不修改入参 msg.content (清洗只作用在返回值)', () => {
  const raw = `wxid_sender:\n@${BOT} 明天开会`;
  const msg = gm(raw);
  check('open', msg, { requireAtMention: true });
  assert.equal(msg.content, raw, 'msg.content 必须保持原样 (持久化路径依赖原始内容)');
});

test('边界: content 为空串时, 要求 @ → 拒绝 (不因空内容放行)', () => {
  const r = check('open', gm(''), { requireAtMention: true });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'requireAtMention but bot not @-ed');
});
