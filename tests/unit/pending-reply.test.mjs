// tests/unit/pending-reply.test.mjs — msgId → 路由上下文 Map 行为级回归
//
// 为什么这批要单独立门:
//   resolveTargetWxid 是"AI 回复发到哪儿"的兜底。它出错的表现不是报错, 而是**发错人**:
//     - 群 @ 的消息被当成私聊 → bot 私聊回了群友 (而不是回群);
//     - 跨账号串号 → A 账号的消息用 B 账号的群 ID 回复 (发到别人的群);
//   这两条都是不可撤销的外部动作, 必须在测试里钉死。
//
// 模块级 Map 是进程内单例 (src 里就是模块作用域变量), 所以本文件:
//   - 每个用例用**本文件独有的 id 前缀**, 避免互相污染;
//   - 不依赖用例执行顺序; 需要"干净状态"的地方一律用新 id。
// 时间相关的 TTL 用临时替换 Date.now 来推进 (10 分钟真等不起), 用完立即还原。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rememberReply,
  lookupReply,
  rememberLastGroupMention,
  resolveTargetWxid,
  cleanupPendingReplies,
} from '../../dist/dispatch/pending-reply.js';

/** 本文件专用 id 生成 (防与其它测试/用例串号) */
let seq = 0;
const uid = (tag) => `pr_${tag}_${process.pid}_${++seq}`;

const entry = (over = {}) => ({
  isGroup: true,
  roomId: 'room_x@chatroom',
  senderId: 'wxid_sender',
  accountId: 'acct_a',
  ...over,
});

/** 临时把 Date.now 推进 ms 毫秒执行 fn, 之后立即还原 (TTL 测试专用) */
const withTimeShift = (ms, fn) => {
  const real = Date.now;
  try {
    Date.now = () => real() + ms;
    return fn();
  } finally {
    Date.now = real;
  }
};

// ── 1. rememberReply / lookupReply 基本往返 ────────────────────────────

test('rememberReply → lookupReply 原样取回全部字段 (含 accountId)', () => {
  const id = uid('rt');
  rememberReply(id, entry({ accountId: 'acct_rt' }));
  const got = lookupReply(id);
  assert.equal(got.isGroup, true);
  assert.equal(got.roomId, 'room_x@chatroom');
  assert.equal(got.senderId, 'wxid_sender');
  assert.equal(got.accountId, 'acct_rt');
  assert.equal(typeof got.__storedAt, 'number', '必须打上写入时间戳 (TTL 依赖它)');
});

test('lookupReply 未记录 → undefined (不是 null / 空对象)', () => {
  assert.equal(lookupReply(uid('missing')), undefined);
});

test('rememberReply 空 msgId → 不落库 (lookup 仍为 undefined)', () => {
  rememberReply('', entry());
  assert.equal(lookupReply(''), undefined, '空 msgId 写入会制造永远查不到的脏数据');
});

test('重复 rememberReply 同一 msgId → 后者覆盖 (且时间戳刷新)', () => {
  const id = uid('dup');
  rememberReply(id, entry({ senderId: 'wxid_first' }));
  const t1 = lookupReply(id).__storedAt;
  rememberReply(id, entry({ senderId: 'wxid_second' }));
  assert.equal(lookupReply(id).senderId, 'wxid_second', '后写必须覆盖前写');
  assert.ok(lookupReply(id).__storedAt >= t1);
});

test('私聊上下文 (isGroup=false) 也能存取', () => {
  const id = uid('dm');
  rememberReply(id, entry({ isGroup: false, senderId: 'wxid_dm', roomId: '' }));
  assert.equal(lookupReply(id).isGroup, false);
});

// ── 2. resolveTargetWxid: msgId 路由优先 ──────────────────────────────

test('群上下文 → 回复目标还原为群 ID, isGroup=true (不得回给 sender)', () => {
  const id = uid('g');
  rememberReply(id, entry({ isGroup: true, roomId: 'room_target@chatroom', senderId: 'wxid_sender' }));
  const r = resolveTargetWxid('acct_a', id, 'wxid_fallback');
  assert.deepEqual(r, { toWxid: 'room_target@chatroom', isGroup: true });
  assert.notEqual(r.toWxid, 'wxid_sender', '群消息回给 sender = 把人私聊了, 是最严重的错法');
});

test('私聊上下文 → 回复目标为 senderId, isGroup=false', () => {
  const id = uid('d');
  rememberReply(id, entry({ isGroup: false, senderId: 'wxid_dm_target', accountId: 'acct_a' }));
  const r = resolveTargetWxid('acct_a', id, 'wxid_fallback');
  assert.deepEqual(r, { toWxid: 'wxid_dm_target', isGroup: false });
});

// ── 3. 跨账号隔离 (发到别人群里 = 不可撤销事故) ────────────────────────

test('安全边界: msgId 记录属于别的账号 → 回退 fallback, 绝不复用别人的群 ID', () => {
  const id = uid('xacct');
  rememberReply(id, entry({ accountId: 'acct_OTHER', isGroup: true, roomId: 'room_other@chatroom' }));
  const r = resolveTargetWxid('acct_mine', id, 'wxid_fallback');
  assert.deepEqual(r, { toWxid: 'wxid_fallback', isGroup: false }, '跨账号必须整体回退');
});

test('安全边界: 跨账号时 isGroup 由 fallback 自身形态决定, 不得继承记录的 isGroup', () => {
  const id = uid('xacct2');
  rememberReply(id, entry({ accountId: 'acct_OTHER', isGroup: true, roomId: 'room_other@chatroom' }));
  const r = resolveTargetWxid('acct_mine', id, 'room_fallback@chatroom');
  assert.equal(r.toWxid, 'room_fallback@chatroom');
  assert.equal(r.isGroup, true, '此处 isGroup 来自 fallback 后缀, 不是来自那条别人的记录');
});

test('安全边界: 跨账号记录存在时, 不得 fall through 到本账号的"群最近@"', () => {
  const acct = uid('acctGuard');
  const other = uid('acctOther');
  const id = uid('fthru');
  rememberLastGroupMention(acct, 'room_recent@chatroom', uid('mention'));
  rememberReply(id, entry({ accountId: other, isGroup: true, roomId: 'room_other@chatroom' }));

  const r = resolveTargetWxid(acct, id, 'wxid_fallback');
  assert.equal(r.toWxid, 'wxid_fallback', '有跨账号记录时应直接回退, 不得借用本账号的群@');
  assert.equal(r.isGroup, false);
});

// ── 4. 群最近 @ 兜底 (仅本账号) ───────────────────────────────────────

test('msgId 完全无记录 → 用本账号"群最近@"兜底, isGroup=true', () => {
  const acct = uid('acctM');
  rememberLastGroupMention(acct, 'room_recent@chatroom', uid('msg'));
  const r = resolveTargetWxid(acct, uid('norecord'), 'wxid_fallback');
  assert.deepEqual(r, { toWxid: 'room_recent@chatroom', isGroup: true });
});

test('群最近@ 只认本账号: 别的账号的 @ 记录不得被借用', () => {
  const acctA = uid('acctA');
  const acctB = uid('acctB');
  rememberLastGroupMention(acctA, 'room_of_A@chatroom', uid('msg'));
  const r = resolveTargetWxid(acctB, uid('norecord'), 'wxid_fallback');
  assert.equal(r.toWxid, 'wxid_fallback', 'B 账号不得复用 A 账号的群 ID');
  assert.equal(r.isGroup, false);
});

test('群最近@ 会被同账号的新记录覆盖 (只保留最近一次)', () => {
  const acct = uid('acctLast');
  rememberLastGroupMention(acct, 'room_old@chatroom', uid('m1'));
  rememberLastGroupMention(acct, 'room_new@chatroom', uid('m2'));
  const r = resolveTargetWxid(acct, uid('norecord'), 'wxid_fallback');
  assert.equal(r.toWxid, 'room_new@chatroom');
});

test('msgId 为 undefined → 直接回退, 连群最近@ 都不查', () => {
  const acct = uid('undefMsg');
  rememberLastGroupMention(acct, 'room_recent@chatroom', uid('msg'));
  const r = resolveTargetWxid(acct, undefined, 'wxid_fallback');
  assert.deepEqual(r, { toWxid: 'wxid_fallback', isGroup: false });
});

test('msgId 为空串 → 同样直接回退 (空串是 falsy, 连群最近@ 也不查)', () => {
  const acct = uid('emptyMsg');
  rememberLastGroupMention(acct, 'room_recent@chatroom', uid('msg'));
  const r = resolveTargetWxid(acct, '', 'wxid_fallback');
  assert.deepEqual(r, { toWxid: 'wxid_fallback', isGroup: false }, '空串与 undefined 同路径');
});

// ── 5. fallback 的 isGroup 判定 (后缀) ────────────────────────────────

test('无任何记录 → 返回 fallback, isGroup 由 @chatroom 后缀判定', () => {
  const acct = uid('fb');
  assert.deepEqual(resolveTargetWxid(acct, uid('none'), 'wxid_plain'), {
    toWxid: 'wxid_plain',
    isGroup: false,
  });
  assert.deepEqual(resolveTargetWxid(acct, uid('none'), 'room_plain@chatroom'), {
    toWxid: 'room_plain@chatroom',
    isGroup: true,
  });
});

test('后缀大小写敏感: @ChatRoom / @chatroom_extra 不得被判成群', () => {
  const acct = uid('fbcase');
  assert.equal(resolveTargetWxid(acct, uid('none'), 'room@ChatRoom').isGroup, false);
  assert.equal(resolveTargetWxid(acct, uid('none'), 'room@chatroomx').isGroup, false);
});

// ── 6. TTL 过期 (10 分钟) ─────────────────────────────────────────────

test('TTL: 超过 10 分钟的 msgId 记录 → lookup 返回 undefined 并顺手删除', () => {
  const id = uid('ttl');
  rememberReply(id, entry());
  assert.notEqual(lookupReply(id), undefined, '刚写入必须能查到');

  withTimeShift(10 * 60 * 1000 + 1, () => {
    assert.equal(lookupReply(id), undefined, '过期必须查不到');
    // 再查一次仍应是 undefined (说明是真的删了, 不是每次现算时间)
    assert.equal(lookupReply(id), undefined);
  });

  // 时间还原后仍然查不到 (条目已被删除)
  assert.equal(lookupReply(id), undefined);
});

test('TTL: 9 分钟内的记录仍有效 (不得提前过期)', () => {
  const id = uid('ttl9');
  rememberReply(id, entry());
  withTimeShift(9 * 60 * 1000, () => {
    assert.notEqual(lookupReply(id), undefined, '9 分钟必须还在');
  });
});

test('TTL: 过期的群最近@ 不得被兜底使用 (防止回错到很久以前的群)', () => {
  const acct = uid('ttlMention');
  rememberLastGroupMention(acct, 'room_stale@chatroom', uid('msg'));
  withTimeShift(10 * 60 * 1000 + 1, () => {
    const r = resolveTargetWxid(acct, uid('none'), 'wxid_fallback');
    assert.deepEqual(r, { toWxid: 'wxid_fallback', isGroup: false });
  });
});

// ── 7. cleanupPendingReplies ──────────────────────────────────────────

test('cleanupPendingReplies 返回被清理条数, 且不误删未过期条目', () => {
  const fresh = uid('clean');
  rememberReply(fresh, entry());
  const removed = cleanupPendingReplies();
  assert.equal(typeof removed, 'number');
  assert.ok(removed >= 0, '返回值必须是非负计数');
  assert.notEqual(lookupReply(fresh), undefined, '未过期条目不得被清掉');
});

test('cleanupPendingReplies 在过期后至少清掉 1 条 (计数真实反映工作量)', () => {
  const stale = uid('cleanStale');
  rememberReply(stale, entry());
  withTimeShift(10 * 60 * 1000 + 1, () => {
    const removed = cleanupPendingReplies();
    assert.ok(removed >= 1, `应至少清掉刚过期的那条, 实际 removed=${removed}`);
  });
  assert.equal(lookupReply(stale), undefined);
});

test('压力: 写入 501 条触发写时清理, 不抛错且最新条目仍可读回', () => {
  const ids = [];
  for (let i = 0; i < 501; i++) {
    const id = uid('bulk');
    ids.push(id);
    rememberReply(id, entry({ accountId: 'acct_bulk' }));
  }
  assert.notEqual(lookupReply(ids[ids.length - 1]), undefined, '最新写入必须仍可读回');
});
