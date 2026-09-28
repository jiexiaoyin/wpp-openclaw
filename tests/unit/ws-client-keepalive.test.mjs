// tests/unit/ws-client-keepalive.test.mjs — ws 保活与重连行为级回归
//
// 为什么必须补这一课 (真实故障教训):
//   src/ws-client.ts 曾经每 10 分钟被 vendor idle timeout 断连 (code=1005)。根因是只调 HTTP
//   /Login/HeartBeatLong, 而 vendor 的 idle 计时挂在 /ws/sync **长连接本身**上 —— HTTP 调用
//   不产生 ws 层流量, 计时器根本不会重置。修复 = 加 this.ws.ping() 帧 (ws 层真流量)。
//
//   这个文件此前**零测试**, 于是"保活帧被删掉/挪到守卫后面/被 try 吞掉"这类回退不会报警,
//   只会再次表现为"每 10 分钟重启账号、心流 sweep 被打断"。本文件就是那道闸。
//
// 测法: 不起用真 vendor, 用 ws 包自带的 WebSocketServer 起一个本地服务端 ——
//   服务端能直接观测到 ping 帧 (state.pings) 与连接次数 (state.connections),
//   所以断言的是**真的发出了 ws 层流量**, 而不是"代码里出现了 ping() 字样"。
//   私有成员 (ws/connected/stopped) 在编译产物里是普通属性, 守卫分支用假 ws 直接驱动,
//   保证确定性 (不靠 sleep 抢时序)。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const WS = await import(new URL(`file://${ROOT}/dist/ws-client.js`).href).catch(() => null);
const skipNoDist = (t) => {
  if (!WS) {
    t.skip('dist 未构建 (先 npm run build)');
    return true;
  }
  return false;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 轮询等待条件成立 (超时即失败, 并带上 label 便于定位) */
const waitFor = async (pred, timeoutMs, label) => {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (pred()) return true;
    await sleep(10);
  }
  assert.fail(`超时 ${timeoutMs}ms 未满足: ${label}`);
};

/** 起一个本地 ws 服务端; state 记录连接数 / ping 帧数 / 存活 socket */
const startServer = async () => {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await once(wss, 'listening');
  const state = { connections: 0, pings: 0, sockets: new Set(), lastSocket: null };
  wss.on('connection', (sock) => {
    state.connections++;
    state.lastSocket = sock;
    state.sockets.add(sock);
    sock.on('ping', () => {
      state.pings++;
    });
    sock.on('close', () => state.sockets.delete(sock));
  });
  const port = wss.address().port;
  return {
    url: `ws://127.0.0.1:${port}/ws/sync`,
    state,
    async close() {
      for (const s of state.sockets) s.terminate();
      await new Promise((r) => wss.close(r));
    },
  };
};

/** 假 apiClient: 记录每次 HTTP call, 可注入自定义返回/抛错 */
const makeApi = (handler) => {
  const calls = [];
  return {
    calls,
    paths: () => calls.map((c) => c.path),
    countOf: (p) => calls.filter((c) => c.path === p).length,
    call: async (path, body) => {
      calls.push({ path, body });
      if (handler) return handler(path, body);
      return { Code: 0 };
    },
  };
};

/** 假 ws: 只实现被断言的那一个方法, 用于确定性地驱动守卫分支 */
const makeFakeWs = () => ({
  pingCount: 0,
  ping() {
    this.pingCount++;
  },
});

const makeClient = (url, api, over = {}) =>
  new WS.WechatpadproWsClient(url, 'test_authcode', {
    apiClient: api,
    accountId: 'acct_ws_test',
    fallbackSyncMs: 0, // 关掉兜底同步定时器: 它只关心中继, 会污染本文件的断言
    onInboundMessage: () => {},
    ...over,
  });

// ══════════════════════════════════════════════════════════════════════
// 1. open → 开启 vendor 自动心跳
// ══════════════════════════════════════════════════════════════════════

test('ws open 时必须调用 /Login/AutoHeartBeat (vendor 侧自动心跳开关)', async (t) => {
  if (skipNoDist(t)) return;
  const srv = await startServer();
  const api = makeApi();
  const c = makeClient(srv.url, api, { heartbeatMs: 0 });
  try {
    await c.start();
    await waitFor(() => c.isConnected(), 3000, 'ws 未连上');
    await waitFor(
      () => api.paths().includes('/Login/AutoHeartBeat'),
      2000,
      'open 后未调用 /Login/AutoHeartBeat',
    );
    assert.equal(srv.state.connections, 1);
    assert.equal(api.countOf('/Login/AutoHeartBeat'), 1, '只应开一次, 不得重复调用');
  } finally {
    await c.stop();
    await srv.close();
  }
});

test('AutoHeartBeat 调用失败 → 不影响连接状态 (仅 warn, 不炸)', async (t) => {
  if (skipNoDist(t)) return;
  const srv = await startServer();
  const api = makeApi(() => {
    throw new Error('vendor AutoHeartBeat 500');
  });
  const c = makeClient(srv.url, api, { heartbeatMs: 0 });
  try {
    await c.start();
    await waitFor(() => c.isConnected(), 3000, 'ws 未连上');
    await waitFor(() => api.countOf('/Login/AutoHeartBeat') === 1, 2000, '未发起 AutoHeartBeat');
    await sleep(50);
    assert.equal(c.isConnected(), true, 'AutoHeartBeat 失败不得把连接判死');
    assert.equal(srv.state.connections, 1, '也不得因此触发重连');
  } finally {
    await c.stop();
    await srv.close();
  }
});

test('每次重连都会重新开启 AutoHeartBeat (新 ws 会话需重新告知 vendor)', async (t) => {
  if (skipNoDist(t)) return;
  const srv = await startServer();
  const api = makeApi();
  const c = makeClient(srv.url, api, {
    heartbeatMs: 0,
    wsReconnect: { initialDelayMs: 20, maxDelayMs: 50, multiplier: 1 },
  });
  try {
    await c.start();
    await waitFor(() => api.countOf('/Login/AutoHeartBeat') === 1, 3000, '首次未开启');

    for (const s of srv.state.sockets) s.terminate(); // 服务端踢掉 → 客户端应重连
    await waitFor(() => srv.state.connections >= 2, 3000, '未重连');
    await waitFor(
      () => api.countOf('/Login/AutoHeartBeat') >= 2,
      2000,
      '重连后未重新开启 AutoHeartBeat',
    );
    assert.equal(c.isConnected(), true);
  } finally {
    await c.stop();
    await srv.close();
  }
});

// ══════════════════════════════════════════════════════════════════════
// 2. 核心回归: 心跳必须发出 ws 层 ping 帧
// ══════════════════════════════════════════════════════════════════════

test('回归主轴: heartbeatMs 到期时必须发出 ws 层 ping 帧 (服务端可观测)', async (t) => {
  if (skipNoDist(t)) return;
  const srv = await startServer();
  const api = makeApi();
  const c = makeClient(srv.url, api, { heartbeatMs: 40 });
  try {
    await c.start();
    await waitFor(() => c.isConnected(), 3000, 'ws 未连上');
    await waitFor(() => srv.state.pings >= 2, 3000, '未收到 ws ping 帧');
    assert.ok(
      srv.state.pings >= 2,
      `心跳到期必须发 ping 帧 (实际 ${srv.state.pings}) — 这正是 10min 断连的根因修复点`,
    );
  } finally {
    await c.stop();
    await srv.close();
  }
});

test('ping 是周期性持续发送的 (不是只在某一拍发一次)', async (t) => {
  if (skipNoDist(t)) return;
  const srv = await startServer();
  const c = makeClient(srv.url, makeApi(), { heartbeatMs: 30 });
  try {
    await c.start();
    await waitFor(() => c.isConnected(), 3000, 'ws 未连上');
    await waitFor(() => srv.state.pings >= 1, 2000, '首拍未发 ping');
    const first = srv.state.pings;
    await waitFor(() => srv.state.pings > first, 2000, '后续拍未继续发 ping');
    assert.ok(srv.state.pings > first, '心跳必须是持续的, 否则 idle 计时照样累积');
  } finally {
    await c.stop();
    await srv.close();
  }
});

test('stop() 后不再发 ping (定时器已清, 且 stopped 守卫生效)', async (t) => {
  if (skipNoDist(t)) return;
  const srv = await startServer();
  const c = makeClient(srv.url, makeApi(), { heartbeatMs: 30 });
  try {
    await c.start();
    await waitFor(() => c.isConnected(), 3000, 'ws 未连上');
    await waitFor(() => srv.state.pings >= 1, 2000, '首拍未发 ping');

    await c.stop();
    const after = srv.state.pings;
    await sleep(150); // 留足 5 个心跳周期
    assert.equal(srv.state.pings, after, 'stop 后残留心跳定时器 = 向已关闭连接发帧');
  } finally {
    await srv.close();
  }
});

test('heartbeatMs=0 → 不启动心跳定时器 (显式关闭能力)', async (t) => {
  if (skipNoDist(t)) return;
  const srv = await startServer();
  const c = makeClient(srv.url, makeApi(), { heartbeatMs: 0 });
  try {
    await c.start();
    await waitFor(() => c.isConnected(), 3000, 'ws 未连上');
    await sleep(120);
    assert.equal(srv.state.pings, 0, 'heartbeatMs=0 时不得有任何 ping');
  } finally {
    await c.stop();
    await srv.close();
  }
});

// ══════════════════════════════════════════════════════════════════════
// 3. 守卫分支: 不该发的时候一个都不能发 (用假 ws 确定性驱动)
// ══════════════════════════════════════════════════════════════════════

test('守卫: ws 未连接 (connected=false) → 不 ping, 也不调 HTTP 心跳', async (t) => {
  if (skipNoDist(t)) return;
  const api = makeApi();
  const c = makeClient('ws://127.0.0.1:1/never', api, { heartbeatMs: 0 });
  const fake = makeFakeWs();
  c.ws = fake;
  c.connected = false;

  await c.sendHeartbeat();
  assert.equal(fake.pingCount, 0, '未连接时 ping 无意义 (会抛 WebSocket is not open)');
  assert.equal(api.countOf('/Login/HeartBeatLong'), 0, '未连接时也不该白调 HTTP 心跳');
});

test('守卫: ws 为 null → 不 ping, 不抛错', async (t) => {
  if (skipNoDist(t)) return;
  const api = makeApi();
  const c = makeClient('ws://127.0.0.1:1/never', api, { heartbeatMs: 0 });
  c.connected = true; // 极端不一致状态: 标记连着但句柄没了
  c.ws = null;

  await c.sendHeartbeat(); // 不得抛 TypeError
  assert.equal(api.countOf('/Login/HeartBeatLong'), 0, 'ws 句柄缺失时不该继续走 HTTP 心跳');
});

test('守卫: stopped=true → 不 ping, 不调 HTTP (停机后彻底静默)', async (t) => {
  if (skipNoDist(t)) return;
  const api = makeApi();
  const c = makeClient('ws://127.0.0.1:1/never', api, { heartbeatMs: 0 });
  const fake = makeFakeWs();
  c.ws = fake;
  c.connected = true;
  c.stopped = true;

  await c.sendHeartbeat();
  assert.equal(fake.pingCount, 0, 'stopped 后必须静默');
  assert.equal(api.countOf('/Login/HeartBeatLong'), 0);
});

test('守卫: 三条件齐备 (connected && ws && !stopped) → 恰好 ping 一次', async (t) => {
  if (skipNoDist(t)) return;
  const api = makeApi();
  const c = makeClient('ws://127.0.0.1:1/never', api, { heartbeatMs: 0 });
  const fake = makeFakeWs();
  c.ws = fake;
  c.connected = true;
  c.stopped = false;

  await c.sendHeartbeat();
  assert.equal(fake.pingCount, 1, '每次心跳恰好一帧, 不多不少');
  assert.equal(api.countOf('/Login/HeartBeatLong'), 1, 'HTTP 双保险也应发一次');
});

// ══════════════════════════════════════════════════════════════════════
// 4. HTTP 心跳失败不得中断主流程 (= 不得妨碍 ping 与后续心跳)
// ══════════════════════════════════════════════════════════════════════

test('HTTP 心跳抛错 → sendHeartbeat 仍 resolve, 且 ping 已先发出', async (t) => {
  if (skipNoDist(t)) return;
  const order = [];
  const api = makeApi(() => {
    order.push('http');
    throw new Error('vendor /Login/HeartBeatLong 500');
  });
  const c = makeClient('ws://127.0.0.1:1/never', api, { heartbeatMs: 0 });
  const fake = makeFakeWs();
  fake.ping = function () {
    order.push('ping');
    this.pingCount++;
  };
  c.ws = fake;
  c.connected = true;

  await assert.doesNotReject(() => c.sendHeartbeat(), 'HTTP 抛错必须被吞掉 (否则打死心跳定时器)');
  assert.equal(fake.pingCount, 1, 'HTTP 失败不得连累 ping — ping 才是保活的关键');
  assert.deepEqual(order, ['ping', 'http'], 'ping 必须先于 HTTP (HTTP 抛错时它已经发出去了)');
});

test('HTTP 心跳返回非 0 Code → 仅 warn, 不抛错, ping 照发', async (t) => {
  if (skipNoDist(t)) return;
  const api = makeApi((p) => (p === '/Login/HeartBeatLong' ? { Code: 500, CodeValue: 'ABNORMAL' } : { Code: 0 }));
  const c = makeClient('ws://127.0.0.1:1/never', api, { heartbeatMs: 0 });
  const fake = makeFakeWs();
  c.ws = fake;
  c.connected = true;

  await assert.doesNotReject(() => c.sendHeartbeat());
  assert.equal(fake.pingCount, 1);
  assert.equal(api.countOf('/Login/HeartBeatLong'), 1);
});

test('HTTP 心跳失败后, 连续多拍 ping 仍持续 (定时器没被打死)', async (t) => {
  if (skipNoDist(t)) return;
  const srv = await startServer();
  const api = makeApi((p) => {
    if (p === '/Login/HeartBeatLong') throw new Error('vendor down');
    return { Code: 0 };
  });
  const c = makeClient(srv.url, api, { heartbeatMs: 30 });
  try {
    await c.start();
    await waitFor(() => c.isConnected(), 3000, 'ws 未连上');
    await waitFor(() => srv.state.pings >= 3, 3000, 'HTTP 持续失败时 ping 应继续');
    assert.ok(srv.state.pings >= 3, 'HTTP 心跳失败不能让 ws 保活停摆 (这正是原故障的形态)');
  } finally {
    await c.stop();
    await srv.close();
  }
});

// ══════════════════════════════════════════════════════════════════════
// 5. ping 异常不得逃逸 (ws 已半关闭时 ping 会抛)
// ══════════════════════════════════════════════════════════════════════

test('ws.ping() 抛错 → 被吞掉, 仍继续走 HTTP 双保险', async (t) => {
  if (skipNoDist(t)) return;
  const api = makeApi();
  const c = makeClient('ws://127.0.0.1:1/never', api, { heartbeatMs: 0 });
  const fake = {
    pingCount: 0,
    ping() {
      this.pingCount++;
      throw new Error('WebSocket is not open: readyState 2 (CLOSING)');
    },
  };
  c.ws = fake;
  c.connected = true;

  await assert.doesNotReject(() => c.sendHeartbeat(), 'ping 抛错必须被吞 (连接半死是常态)');
  assert.equal(fake.pingCount, 1, '确实尝试过 ping');
  assert.equal(api.countOf('/Login/HeartBeatLong'), 1, 'ping 失败后 HTTP 双保险仍应发出');
});

// ══════════════════════════════════════════════════════════════════════
// 6. close → scheduleRetry, 且长退避 (300_000ms) 不被 maxRetryDelay 截断
// ══════════════════════════════════════════════════════════════════════

test('close 触发重连, 正常退避受 maxRetryDelay 约束', async (t) => {
  if (skipNoDist(t)) return;
  const srv = await startServer();
  const c = makeClient(srv.url, makeApi(), {
    heartbeatMs: 0,
    wsReconnect: { initialDelayMs: 20, maxDelayMs: 50, multiplier: 1 },
  });
  try {
    await c.start();
    await waitFor(() => c.isConnected(), 3000, 'ws 未连上');

    for (const s of srv.state.sockets) s.terminate();
    await waitFor(() => srv.state.connections >= 2, 3000, 'close 后未 scheduleRetry 重连');
  } finally {
    await c.stop();
    await srv.close();
  }
});

test('stop() 后 close 不得再重连 (stopped 守卫)', async (t) => {
  if (skipNoDist(t)) return;
  const srv = await startServer();
  const c = makeClient(srv.url, makeApi(), {
    heartbeatMs: 0,
    wsReconnect: { initialDelayMs: 20, maxDelayMs: 50, multiplier: 1 },
  });
  try {
    await c.start();
    await waitFor(() => c.isConnected(), 3000, 'ws 未连上');
    await c.stop();

    for (const s of srv.state.sockets) s.terminate();
    await sleep(200);
    assert.equal(srv.state.connections, 1, 'stop 之后不得再建连 (否则停机永远停不干净)');
  } finally {
    await srv.close();
  }
});

test('集成: vendor 连续 502 → 触发 5min 长退避, 且不被 maxRetryDelay 截断', async (t) => {
  if (skipNoDist(t)) return;

  // 真起一个对 Upgrade 回 502 的 HTTP 服务端: 目的是验证 ws 客户端认得的**真实**错误文案
  // ("Unexpected server response: 502") 确实命中 /502|503|504/ 这个判断。
  // 若 vendor/ws 换了文案, 智能退避会静默失效 —— 这条就是防这个。
  const httpSrv = http.createServer();
  httpSrv.on('upgrade', (_req, socket) => {
    socket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    socket.destroy();
  });
  httpSrv.listen(0, '127.0.0.1');
  await once(httpSrv, 'listening');
  const port = httpSrv.address().port;

  // 记录 scheduleRetry 真正请求的延时 —— 退避值的唯一可信来源 (读日志不算, 要看实际排程)
  const realSetTimeout = globalThis.setTimeout;
  const realSleep = (ms) => new Promise((r) => realSetTimeout(r, ms));
  const requested = [];
  globalThis.setTimeout = (fn, ms, ...args) => {
    const h = realSetTimeout(fn, ms, ...args);
    requested.push({ ms, handle: h });
    return h;
  };

  const c = makeClient(`ws://127.0.0.1:${port}/ws/sync`, makeApi(), {
    heartbeatMs: 0,
    wsReconnect: { initialDelayMs: 5, maxDelayMs: 10, multiplier: 1 },
  });

  try {
    await c.start();
    // 本测试内的等待必须走 realSleep, 否则 waitFor 的 10ms 睡眠会混进 requested
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !requested.some((r) => r.ms >= 300000)) {
      await realSleep(10);
    }

    const long = requested.filter((r) => r.ms >= 300000);
    assert.ok(
      long.length > 0,
      `连续 502 后必须排程长退避; 实际请求的延时=${JSON.stringify(requested.map((r) => r.ms))}`,
    );
    assert.equal(long[0].ms, 300_000, '长退避必须是 300000ms (5min)');
    assert.notEqual(long[0].ms, 10, 'maxRetryDelay=10 不得把长退避压成 10ms — 这正是被修掉的缺陷');

    // 长退避之前的常规重试仍应受 maxRetryDelay 约束 (该截断的还是要截断)
    const normal = requested.filter((r) => r.ms < 300000);
    assert.ok(normal.length >= 4, `应至少有 4 次常规重试, 实际 ${normal.length}`);
    assert.ok(
      normal.every((r) => r.ms <= 10),
      `常规退避必须 <= maxRetryDelay=10, 实际 ${JSON.stringify(normal.map((r) => r.ms))}`,
    );
  } finally {
    globalThis.setTimeout = realSetTimeout;
    await c.stop();
    // 关键: 5 分钟的重试定时器不能留着 —— 它会吊住事件循环让整个测试进程卡住 5 分钟
    for (const r of requested) {
      if (r.ms >= 60000) clearTimeout(r.handle);
    }
    await new Promise((r) => httpSrv.close(() => r()));
  }
});

test('502 计数在重连成功后归零 (vendor 恢复即结束长退避)', async (t) => {
  if (skipNoDist(t)) return;
  const srv = await startServer();
  const c = makeClient(srv.url, makeApi(), {
    heartbeatMs: 0,
    wsReconnect: { initialDelayMs: 20, maxDelayMs: 50, multiplier: 1 },
  });
  try {
    await c.start();
    await waitFor(() => c.isConnected(), 3000, 'ws 未连上');

    // 把真实错误文案投递给已注册的 error handler (服务端回 502 时 ws 用的就是这一句)
    for (let i = 0; i < 5; i++) {
      c.ws.emit('error', new Error('Unexpected server response: 502'));
    }
    assert.equal(c.consecutive502, 5, '5 次 502 必须累计到阈值');
    assert.equal(c.retryDelay, 300_000, '到阈值后 retryDelay 必须跳到 300000ms');

    // 第 6 次仍应是长退避 (计数不归零 → 持续 5min 重试, 不打爆 vendor)
    c.ws.emit('error', new Error('Unexpected server response: 502'));
    assert.equal(c.consecutive502, 6);
    assert.equal(c.retryDelay, 300_000, '阈值之后每次失败都保持长退避');

    // 非 5xx 错误不得把计数清零 (否则阈值永远攒不满)
    c.ws.emit('error', new Error('read ECONNRESET'));
    assert.equal(c.consecutive502, 6, '非 5xx 错误不影响 502 计数');

    // 成功连上 (open) → 计数归零 + 退避回到初始档
    c.ws.emit('open');
    assert.equal(c.consecutive502, 0, '重连成功后 502 计数必须归零');
    assert.equal(c.retryDelay, 20, '退避回到 initialDelayMs');
  } finally {
    await c.stop();
    await srv.close();
  }
});

// ══════════════════════════════════════════════════════════════════════
// 7. 消息帧路由: connection_ready 跳过, 其他帧触发同步
// ══════════════════════════════════════════════════════════════════════

test('消息路由: 畸形帧不打死连接; connection_ready 不触发同步; 其他帧触发同步', async (t) => {
  if (skipNoDist(t)) return;
  const srv = await startServer();
  const c = makeClient(srv.url, makeApi(), { heartbeatMs: 0 });

  const warns = [];
  const realWarn = console.warn;
  console.warn = (...a) => {
    warns.push(a.map(String).join(' '));
  };
  try {
    await c.start();
    await waitFor(() => c.isConnected(), 3000, 'ws 未连上');
    await waitFor(() => srv.state.lastSocket !== null, 3000, '服务端未持有 socket');
    const sock = srv.state.lastSocket;

    // (a) 畸形帧: parseJsonText 返回 null → 读取字段时抛错 → 被 catch → warn, 连接必须活着
    warns.length = 0;
    sock.send('this-is-not-json');
    await waitFor(() => warns.some((w) => w.includes('ws message parse error')), 2000, '畸形帧未告警');
    assert.equal(c.isConnected(), true, '畸形帧不得打死连接');

    // (b) 握手帧 connection_ready: 必须被跳过, 不得触发同步拉取
    warns.length = 0;
    sock.send(JSON.stringify({ Code: 0, Success: true, Data: { type: 'connection_ready' } }));
    await sleep(120);
    assert.equal(c.isConnected(), true);
    assert.equal(
      warns.some((w) => w.includes('ws sync')),
      false,
      'connection_ready 是握手 ack, 不该触发 SyncMessage 拉取',
    );

    // (c) 普通推送帧: 必须走 triggerSync (本测试环境 DB 未初始化 → 同步失败并 warn, 这正好证明被路由到了)
    warns.length = 0;
    sock.send(JSON.stringify({ Data: { type: 'new_msg', newMsgId: '1' } }));
    await waitFor(() => warns.some((w) => w.includes('ws sync')), 2000, '普通推送帧未触发同步');
    assert.equal(c.isConnected(), true, '同步失败不得连累 ws 连接');
  } finally {
    console.warn = realWarn;
    await c.stop();
    await srv.close();
  }
});

// ══════════════════════════════════════════════════════════════════════
// 8. 构造与状态
// ══════════════════════════════════════════════════════════════════════

test('isConnected 初值为 false; start 前 stop 不得抛错', async (t) => {
  if (skipNoDist(t)) return;
  const c = makeClient('ws://127.0.0.1:1/never', makeApi(), { heartbeatMs: 0 });
  assert.equal(c.isConnected(), false);
  await c.stop(); // 未 start 就 stop: 不得抛
  assert.equal(c.isConnected(), false);
});

test('authcode 以 URL 编码形式带上连接串 (特殊字符不得破坏 URL)', async (t) => {
  if (skipNoDist(t)) return;
  const srv = await startServer();
  const c = new WS.WechatpadproWsClient(srv.url, 'ac=1&b 2/+', {
    apiClient: makeApi(),
    accountId: 'acct_ws_test',
    fallbackSyncMs: 0,
    heartbeatMs: 0,
    onInboundMessage: () => {},
  });
  try {
    await c.start();
    await waitFor(() => c.isConnected(), 3000, 'ws 未连上');
    assert.equal(c.isConnected(), true, '含特殊字符的 authcode 不得导致握手失败');
  } finally {
    await c.stop();
    await srv.close();
  }
});
