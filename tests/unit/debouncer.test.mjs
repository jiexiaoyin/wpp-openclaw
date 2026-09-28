// tests/unit/debouncer.test.mjs — 1.5s 合批器行为级回归
//
// 为什么这批要行为级 (不是文本断言):
//   debouncer 的正确性全在"时间 + 分组"两件事上 —— 合批键算错 = 不同人的消息串到一批,
//   reset 逻辑写错 = 用户连发时永远 flush 不出去 (或每次只 flush 一条),
//   bypass 分支写错 = 语音/系统消息被延迟 1.5s (语音转写链路会明显卡顿)。
//   这些都不会在类型检查或文本断言里露出来, 只能真跑 timer。
//
// 本文件用真实 setTimeout + 极短 intervalMs (20–40ms), 不用假时钟:
//   被断言的正是"timer 真的会 fire 且真的会 reset", 假时钟会把这个前提抹掉。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WppInboundDebouncer } from '../../dist/inbound/debouncer.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 造一条最小入站消息 (key = accountId:peerKind:peerId:fromWxid) */
const msg = (over = {}) => ({
  accountId: 'acct_a',
  msgId: `m_${Math.random().toString(36).slice(2)}`,
  newMsgId: 'n1',
  fromWxid: 'wxid_alice',
  msgType: 1,
  content: 'hi',
  ts: 0,
  raw: {},
  peerKind: 'dm',
  peerId: 'wxid_alice',
  trigger: 'direct',
  ...over,
});

/** 收集 flush 的批次 (深拷贝批次长度与内容, 便于断言) */
const collector = () => {
  const batches = [];
  return {
    batches,
    onFlush: (b) => {
      batches.push(b);
    },
    flat: () => batches.flat().map((m) => m.msgId),
  };
};

// ── 1. 基本合批 ─────────────────────────────────────────────────────────

test('单条入队 → 不立即 flush, intervalMs 到期后 flush 一批 1 条', async () => {
  const c = collector();
  const d = new WppInboundDebouncer({ intervalMs: 30, onFlush: c.onFlush });
  const m = msg();
  d.enqueue(m);

  assert.equal(c.batches.length, 0, '入队瞬间不得 flush (合批窗口还没到)');
  assert.equal(d.size(), 1, 'size() 必须即时反映缓冲条数');

  await sleep(80);
  assert.equal(c.batches.length, 1, '窗口到期必须 flush 一次');
  assert.equal(c.batches[0].length, 1);
  assert.equal(c.batches[0][0].msgId, m.msgId);
  assert.equal(d.size(), 0, 'flush 后缓冲必须清空');
});

test('同一 key 连发 3 条 → 合并成一批 3 条 (只 flush 一次)', async () => {
  const c = collector();
  const d = new WppInboundDebouncer({ intervalMs: 40, onFlush: c.onFlush });
  d.enqueue(msg({ msgId: 'm1' }));
  d.enqueue(msg({ msgId: 'm2' }));
  d.enqueue(msg({ msgId: 'm3' }));

  assert.equal(d.size(), 3);
  await sleep(100);

  assert.equal(c.batches.length, 1, '同一 key 只允许一次 flush');
  assert.deepEqual(c.flat(), ['m1', 'm2', 'm3'], '同批内必须保持入队顺序');
});

test('不同 key → 各自成批 (不得跨发送者串批)', async () => {
  const c = collector();
  const d = new WppInboundDebouncer({ intervalMs: 30, onFlush: c.onFlush });
  d.enqueue(msg({ msgId: 'dm1', peerId: 'wxid_alice', fromWxid: 'wxid_alice' }));
  d.enqueue(msg({ msgId: 'dm2', peerId: 'wxid_bob', fromWxid: 'wxid_bob' }));
  d.enqueue(
    msg({ msgId: 'g1', peerKind: 'group', peerId: 'room_x@chatroom', fromWxid: 'wxid_alice' }),
  );

  await sleep(80);
  assert.equal(c.batches.length, 3, '3 个不同 key 必须是 3 批');
  assert.deepEqual(c.flat().sort(), ['dm1', 'dm2', 'g1']);
  for (const b of c.batches) assert.equal(b.length, 1, '不同 key 的消息不得混进同一批');
});

test('合批键含 accountId: 同 peer 不同账号不得串批 (防跨账号串号)', async () => {
  const c = collector();
  const d = new WppInboundDebouncer({ intervalMs: 30, onFlush: c.onFlush });
  d.enqueue(msg({ msgId: 'a1', accountId: 'acct_a' }));
  d.enqueue(msg({ msgId: 'a2', accountId: 'acct_b' }));

  await sleep(80);
  assert.equal(c.batches.length, 2, 'accountId 必须进合批键');
  assert.deepEqual(c.flat().sort(), ['a1', 'a2']);
});

test('合批键含 peerKind: 同 ID 的 dm 与 group 不得串批', async () => {
  const c = collector();
  const d = new WppInboundDebouncer({ intervalMs: 30, onFlush: c.onFlush });
  d.enqueue(msg({ msgId: 'x1', peerKind: 'dm', peerId: 'same', fromWxid: 'same' }));
  d.enqueue(msg({ msgId: 'x2', peerKind: 'group', peerId: 'same', fromWxid: 'same' }));

  await sleep(80);
  assert.equal(c.batches.length, 2, 'peerKind 必须进合批键');
});

// ── 2. timer reset: 连发不得提前 flush, 也不得永远不 flush ──────────────

test('窗口内追加 → timer 被 reset, 不提前 flush', async () => {
  const c = collector();
  const d = new WppInboundDebouncer({ intervalMs: 60, onFlush: c.onFlush });
  d.enqueue(msg({ msgId: 'r1' }));
  await sleep(40); // 过第一个窗口的一半
  d.enqueue(msg({ msgId: 'r2' })); // 应重置计时

  await sleep(40); // 距首条已 80ms (>60), 但距第二条只有 40ms → 不该 flush
  assert.equal(c.batches.length, 0, 'reset 未生效的话这里会提前 flush 出 r1');

  await sleep(60);
  assert.equal(c.batches.length, 1);
  assert.deepEqual(c.flat(), ['r1', 'r2'], '连发必须合成一批, 不得丢消息');
});

test('持续连发不会永久饿死 flush (每轮 reset 后终会到期)', async () => {
  const c = collector();
  const d = new WppInboundDebouncer({ intervalMs: 30, onFlush: c.onFlush });
  for (let i = 0; i < 5; i++) {
    d.enqueue(msg({ msgId: `s${i}` }));
    await sleep(10); // 每次都在窗口内 (10 < 30)
  }
  assert.equal(c.batches.length, 0, '连发期间不得 flush');
  await sleep(60);
  assert.equal(c.batches.length, 1);
  assert.deepEqual(c.flat(), ['s0', 's1', 's2', 's3', 's4'], '5 条一条都不能丢');
});

// ── 3. bypass: 语音 / 系统 / control 立即 flush ─────────────────────────

test('VOICE (msgType=34) 立即 flush, 不等窗口', () => {
  const c = collector();
  const d = new WppInboundDebouncer({ intervalMs: 5000, onFlush: c.onFlush });
  d.enqueue(msg({ msgId: 'v1', msgType: 34 }));

  assert.equal(c.batches.length, 1, '语音必须同步 bypass (等 5s 会卡死转写链路)');
  assert.equal(c.batches[0][0].msgId, 'v1');
  assert.equal(d.size(), 0, 'bypass 的消息不得进缓冲');
});

test('系统消息 (10000 / 10002) 立即 flush', () => {
  for (const t of [10000, 10002]) {
    const c = collector();
    const d = new WppInboundDebouncer({ intervalMs: 5000, onFlush: c.onFlush });
    d.enqueue(msg({ msgId: `sys${t}`, msgType: t }));
    assert.equal(c.batches.length, 1, `msgType=${t} 必须立即 flush`);
    assert.equal(d.size(), 0);
  }
});

test('isControlCommand 命中 → 立即 flush (绕过合批窗口)', () => {
  const c = collector();
  const d = new WppInboundDebouncer({
    intervalMs: 5000,
    onFlush: c.onFlush,
    isControlCommand: (m) => m.content.startsWith('/'),
  });
  d.enqueue(msg({ msgId: 'c1', content: '/reset' }));

  assert.equal(c.batches.length, 1, 'control 命令必须立即 flush');
  assert.equal(d.size(), 0);
});

test('isControlCommand 未命中 → 走正常合批 (bypass 不得误伤普通消息)', async () => {
  const c = collector();
  const d = new WppInboundDebouncer({
    intervalMs: 30,
    onFlush: c.onFlush,
    isControlCommand: (m) => m.content.startsWith('/'),
  });
  d.enqueue(msg({ msgId: 'n1', content: '普通消息' }));

  assert.equal(c.batches.length, 0, '普通消息不得被 bypass 误判');
  await sleep(80);
  assert.equal(c.batches.length, 1);
});

test('未传 isControlCommand 时不得抛错 (可选回调)', async () => {
  const c = collector();
  const d = new WppInboundDebouncer({ intervalMs: 20, onFlush: c.onFlush });
  d.enqueue(msg({ msgId: 'o1' }));
  await sleep(60);
  assert.equal(c.batches.length, 1);
});

// ── 4. 错误传播: onFlush 抛错不得打死后续 flush ─────────────────────────

test('onFlush 抛错 → 调 onError(err, batch), 且后续消息仍能正常 flush', async () => {
  const seen = [];
  let calls = 0;
  const d = new WppInboundDebouncer({
    intervalMs: 20,
    onFlush: () => {
      calls++;
      if (calls === 1) throw new Error('handler 内部炸了');
    },
    onError: (err, batch) => seen.push([err.message, batch.length]),
  });

  d.enqueue(msg({ msgId: 'e1' }));
  await sleep(60);
  assert.deepEqual(seen, [['handler 内部炸了', 1]], 'onError 必须拿到原始 err 与该批消息');

  d.enqueue(msg({ msgId: 'e2' }));
  await sleep(60);
  assert.equal(calls, 2, '一次 flush 失败不得让 debouncer 失效');
  assert.equal(d.size(), 0);
});

test('onFlush 抛错但未传 onError → 不抛到调用方 (仅 warn 日志)', async () => {
  const d = new WppInboundDebouncer({
    intervalMs: 20,
    onFlush: () => {
      throw new Error('no onError configured');
    },
  });
  d.enqueue(msg({ msgId: 'e3' }));
  await sleep(60); // 若异常逃逸到 timer 回调, node 会以 uncaughtException 打死本进程
  assert.equal(d.size(), 0, '消息仍应从缓冲清掉, 不得卡死');
});

test('onFlush 为 async 且 reject → 同样走 onError, 不产生 unhandledRejection', async () => {
  const seen = [];
  const d = new WppInboundDebouncer({
    intervalMs: 20,
    onFlush: async () => {
      throw new Error('async flush failed');
    },
    onError: (err) => seen.push(err.message),
  });
  d.enqueue(msg({ msgId: 'e4' }));
  await sleep(80);
  assert.deepEqual(seen, ['async flush failed']);
});

// ── 5. flushAll / clear ────────────────────────────────────────────────

test('flushAll → 立即 flush 全部 key (shutdown 不丢在途消息)', async () => {
  const c = collector();
  const d = new WppInboundDebouncer({ intervalMs: 5000, onFlush: c.onFlush });
  d.enqueue(msg({ msgId: 'f1', accountId: 'acct_a' }));
  d.enqueue(msg({ msgId: 'f2', accountId: 'acct_b' }));
  assert.equal(c.batches.length, 0);

  await d.flushAll();
  assert.equal(c.batches.length, 2, '两个 key 都要被 flush');
  assert.deepEqual(c.flat().sort(), ['f1', 'f2']);
  assert.equal(d.size(), 0);
});

test('flushAll 幂等: 再调一次不得重复 flush', async () => {
  const c = collector();
  const d = new WppInboundDebouncer({ intervalMs: 5000, onFlush: c.onFlush });
  d.enqueue(msg({ msgId: 'i1' }));
  await d.flushAll();
  await d.flushAll();
  assert.equal(c.batches.length, 1, '重复 flushAll 不得重放已 flush 的消息');
});

test('flushAll 后原 timer 不得再触发一次 (clearTimeout 生效)', async () => {
  const c = collector();
  const d = new WppInboundDebouncer({ intervalMs: 30, onFlush: c.onFlush });
  d.enqueue(msg({ msgId: 't1' }));
  await d.flushAll();
  await sleep(80);
  assert.equal(c.batches.length, 1, '手动 flush 后残留 timer 再 fire = 重复处理');
});

test('clear() → 丢弃全部 pending, 且之后不 flush (测试用清理语义)', async () => {
  const c = collector();
  const d = new WppInboundDebouncer({ intervalMs: 30, onFlush: c.onFlush });
  d.enqueue(msg({ msgId: 'cl1' }));
  d.clear();

  assert.equal(d.size(), 0, 'clear 必须清空缓冲');
  await sleep(80);
  assert.equal(c.batches.length, 0, 'clear 后残留 timer 不得再 flush');
});

test('空缓冲上 flushAll / size 不抛错', async () => {
  const c = collector();
  const d = new WppInboundDebouncer({ intervalMs: 20, onFlush: c.onFlush });
  await d.flushAll();
  assert.equal(d.size(), 0);
  assert.equal(c.batches.length, 0);
});
