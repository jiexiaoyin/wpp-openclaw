/**
 * tests/unit/handler-hotpath.test.mjs — 2026-10-16 补: src/inbound/handler.ts **行为级**测试
 *
 * 为什么需要这一份 (D7 扣分的头号原因):
 *   handler.ts (970 行, 工厂 createWppInboundHandler) 是**每条入站消息必经**的热路径模块,
 *   但在本次补测之前, 引用它的 9 个测试**全部**是 `readFileSync` 读源码文本 + regex 断言 ——
 *   逻辑改错照样全绿 (最典型的一种假绿)。
 *   (本文件写作时用 node fs 扫过 tests/unit/*.test.mjs 复核: 提到 inbound/handler 的 9 个既有文件,
 *    没有任何一个 import dist/inbound/handler.js, 且 9 个都出现 readFileSync。)
 *   本文件反其道而行: import 编译产物 dist/inbound/handler.js, 真喂 webhook 载荷, 真跑 debouncer flush,
 *   只断言**可观测结果**。
 *
 * 三个观测点 (都不需要真外部依赖):
 *   ① opts.onDispatch —— handler.ts:890 唯一的 dispatch 出口。挂一个记录器 ⇒ "哪些消息真被 dispatch 了"变成数组。
 *   ② flushAll() —— 强制冲刷 debouncer (否则要等 500ms timer, 那才是竞态) ⇒ handle → flush 全程同步可控, 零 sleep。
 *   ③ 注入内存 DB stub —— 见下。顺带让"这条消息有没有落库"也成为可观测量。
 *
 * 为什么必须注入 DB stub (⚠️ 后人别改成"不传 id 绕开 DB"):
 *   去重那段是 `if (m.msgId || m.newMsgId) { await getMessageByMsgIdOrNewId(...) }` (handler.ts:949)。
 *   看似"载荷不给 id 就能绕过", **实际绕不过**: parser 对空 msgId 有随机兜底
 *   (`msgId: rawMsgId || \`${ts}-${random}\``, parser.ts:201) ⇒ m.msgId **恒为非空字符串** ⇒ 该分支必走。
 *   所以这里用 factory.setAdapterForTest() 注入一个纯内存 stub (getMessageByMsgIdOrNewId 恒返 null):
 *   去重结果完全由内存 SeenTracker 决定, 全程零连接、绝不碰生产库 —— 同时"落库几次"变成可断言的事实。
 *
 * 不碰网络/媒体: 全程不传 opts.vendorCtx ⇒ 图片/silk/语音/视频/文件等 enrich 分支整体跳过 (handler.ts:227 起
 *   的每个分支第一个条件都是 opts.vendorCtx)。handler.ts 内没有 saveMessage 调用, 落库只经 enrichBatch → stub。
 *
 * 确定性: 不 sleep、不发网络、不连 DB、不依赖执行顺序 (每个 test 自建 handler ⇒ SeenTracker 天然隔离);
 *   固定 ts (TS 常量) 而非 Date.now(); 载荷一律 structuredClone 后再喂 (handler 会就地改 raw/content,
 *   同一 fixture 复用两次必须互不污染)。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ===== 固定标识 (不依赖任何真实账号/群) =====
const ACCOUNT = 'acct-hotpath';
const BOT = 'wxid_bot_hotpath';
const GROUP = '12345678@chatroom';
const ALICE = 'wxid_alice_hotpath';
const STRANGER = 'wxid_stranger_hotpath';
/** 固定 unix 秒 —— 不用 Date.now(), 断言才可复现 */
const TS = 1750000000;

// ===== 加载编译产物 (与仓库其它测试同规: 测 dist, 不测 src) =====
let handlerMod = null;
let parserMod = null;
let factoryMod = null;
let loadErr = null;
try {
  handlerMod = await import(new URL('../../dist/inbound/handler.js', import.meta.url));
  parserMod = await import(new URL('../../dist/inbound/parser.js', import.meta.url));
  factoryMod = await import(new URL('../../dist/storage/db/factory.js', import.meta.url));
} catch (e) {
  loadErr = e;
}

/**
 * dist 缺失 ⇒ 让测试**红**, 不 skip。
 * 仓库里有测试用 t.skip 掩盖"没编译" (skip 在汇总里长得像通过), 本文件不采用 —— 缺产物必须是显眼的失败。
 */
function needDist() {
  if (!handlerMod || !parserMod || !factoryMod) {
    assert.fail(
      `dist 缺失或加载失败 —— 先跑 npm run build (cwd /root/dev/wechatpadpro-openclaw). 原始错误: ${loadErr?.message ?? String(loadErr)}`,
    );
  }
}

// ===== 载荷 fixture =====
/**
 * v1 载荷外壳。字段与厂商近 24h 生产实测形态**逐字对齐**:
 *   payloadKeys=Wxid,EventType,Timestamp,Data / dataKeys=count,messages,schema / schema=wechatpad.message.v1
 * 保持这个形状本身就是一条约束: 写歪了这批测试就不再代表线上真实入口。
 */
function v1Payload(msg) {
  return {
    Wxid: ACCOUNT,
    EventType: 'sync_message',
    Timestamp: TS,
    Data: { count: 1, schema: 'wechatpad.message.v1', messages: [msg] },
  };
}

/**
 * v1 单条消息骨架 = 一条"合法可交互的群文本" (会被 dispatch 的那类)。
 * 各用例只用 over 覆盖**一个**字段 ⇒ diff 一眼看出"这次变的是哪个输入" (而不是整块载荷重写)。
 */
function v1Msg(over = {}) {
  return {
    content: `@${BOT} 今天下午三点开会`,
    conversation_id: GROUP,
    created_at: TS,
    direction: 'incoming',
    id: 'msg-v1-1',
    is_group: true,
    kind: 'text',
    local_id: 1,
    recipient_id: BOT,
    sender_id: ALICE,
    status: 'sent',
    type: 1,
    ...over,
  };
}

/** 私聊 (v0/wrapped 形态: 顶层 Wxid + Data 内层消息) —— 覆盖 parser 的另一条分支 */
function dmPayload(fromWxid, id) {
  return {
    Wxid: ACCOUNT,
    Data: { fromWxid, toWxid: BOT, content: '你好', msgType: 1, msgId: id },
  };
}

// ===== 内存 DB stub (绝无连接) =====
/**
 * 注入纯内存 adapter。刻意让 getMessageByMsgIdOrNewId **恒返 null**:
 *   DB 层永不去重 ⇒ "同载荷重复投递只 dispatch 一次"这件事只能由内存 SeenTracker 解释 (test 4 钉的就是它)。
 * 未知方法一律抛 (而不是静默返回 undefined) —— 走到没预期的 DB 调用时测试会吵闹地失败, 而不是悄悄绿。
 */
function installStubDb() {
  const state = { lookups: [], saved: [], otherCalls: [] };
  const base = {
    backendName: 'mysql',
    init: async () => {},
    close: async () => {},
    ping: async () => {},
    saveMessage: async (rec) => {
      state.saved.push(rec);
    },
    getMessages: async () => [],
    getMessageById: async () => null,
    getMessageByMsgIdOrNewId: async (msgId, newMsgId, accountId, opts) => {
      state.lookups.push({ msgId, newMsgId, accountId, direction: opts?.direction });
      return null; // 永不命中 ⇒ 去重全部交给内存 SeenTracker
    },
  };
  const adapter = new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return async (...args) => {
        state.otherCalls.push({ prop: String(prop), args });
        throw new Error(`stub DB 未实现: ${String(prop)}`);
      };
    },
  });
  factoryMod.setAdapterForTest(adapter);
  return state;
}

// ===== handler 装配 + 投递 =====
/**
 * 默认配置: 群策略 open、无关键词/msgType/quoteBot 触发、心流关闭。
 * ⇒ 群消息要触发只能靠 @bot (via=at); 私聊靠 allowFrom 白名单。
 * 这样"dispatch 了"就只可能来自被测的那一条路径, 排除配置侧偶然命中。
 */
function makeHandler(over = {}) {
  const dispatched = [];
  const triggerConfig = {
    requireAtMention: false,
    keywordTrigger: { enabled: false, keywords: [], mode: 'contains' },
    msgTypeTrigger: { enabled: false, appMsgTypes: [] },
    quoteBotTrigger: { enabled: false },
    blacklistGroups: [],
    groupPolicy: 'open',
    groupAllowFrom: [],
    heartflow: { enabled: false },
  };
  const triggerCtx = { botWxid: BOT, botNickname: null, allowFrom: [ALICE] };
  const handle = handlerMod.createWppInboundHandler({
    accountId: ACCOUNT,
    triggerConfig,
    triggerCtx,
    enableDispatch: true,
    onDispatch: (msg, batch) => {
      dispatched.push({ msg, batch });
    },
    ...over,
  });
  return { handler: handle, dispatched };
}

/** 投递一份载荷并强制冲刷: handle (入队) → flushAll (触发 onFlush → 判定 → dispatch)。 */
async function deliver(handler, payload) {
  await handler.handle(structuredClone(payload));
  await handler.flushAll();
}

/** 临时接管 console.warn (logger 的 WARN 出口), 用来断言 handler 自己打的归因行。 */
function captureWarn() {
  const lines = [];
  const orig = console.warn;
  console.warn = (...a) => {
    lines.push(a.map((x) => String(x)).join(' '));
  };
  return { lines, restore: () => { console.warn = orig; } };
}

// ============================================================================
// 1. outgoing echo: 机器人自己发出去的消息被 vendor 回推 —— 按设计丢弃
// ============================================================================
/**
 * 这条是生产日志里最常见的一行: `reasons=outgoing-echox1`。
 * 钉两层: ① 归因必须叫 outgoing-echo (不是笼统的"啥也没解析出来" —— 那是排查时最浪费时间的一种);
 *        ② 它绝不能进 dispatch (否则 bot 会对着自己的话自问自答)。
 */
test('1. outgoing echo 被丢弃: onDispatch 0 次 + 0 落库 + 归因 outgoing-echo', async () => {
  needDist();
  const db = installStubDb();
  const { handler, dispatched } = makeHandler();
  const payload = v1Payload(
    v1Msg({
      id: 'msg-out-echo-1',
      direction: 'outgoing',
      sender_id: BOT,
      content: '（机器人自己发出去的回复）收到',
    }),
  );

  // 归因层 (结构化): 丢弃必须带明确 reason, 供上层 "inbound parse dropped" 告警归因
  const detailed = parserMod.parsePayloadDetailed(ACCOUNT, structuredClone(payload));
  assert.equal(detailed.messages.length, 0, 'outgoing echo 不许进入消息流');
  assert.equal(detailed.reasonSummary, 'outgoing-echox1', '丢弃归因必须是 outgoing-echo (对齐生产日志 reasons=outgoing-echox1)');

  // 行为层: 经 handler 全链路
  const warns = captureWarn();
  try {
    await deliver(handler, payload);
  } finally {
    warns.restore();
  }
  assert.equal(dispatched.length, 0, 'outgoing echo 不许触发 AI (自问自答)');
  assert.equal(db.saved.length, 0, '被丢弃的消息不许落库');
  assert.equal(db.lookups.length, 0, '解析阶段就丢了 ⇒ 连去重回查都不该发生');
  assert.ok(
    warns.lines.some((l) => l.includes('inbound parse dropped') && l.includes('reasons=outgoing-echox1')),
    'handler 必须留下可归因的 warn 行 (否则线上"整批被丢"无从排查)',
  );
});

// ============================================================================
// 2. kind=status (系统状态帧) 被丢弃
// ============================================================================
test('2. kind=status 被丢弃: onDispatch 0 次 + 归因 kind-status', async () => {
  needDist();
  const db = installStubDb();
  const { handler, dispatched } = makeHandler();
  const payload = v1Payload(v1Msg({ id: 'msg-status-1', kind: 'status', content: '对方正在输入…' }));

  const detailed = parserMod.parsePayloadDetailed(ACCOUNT, structuredClone(payload));
  assert.equal(detailed.reasonSummary, 'kind-statusx1');

  await deliver(handler, payload);
  assert.equal(dispatched.length, 0, '状态帧不是消息, 不许触发 AI');
  assert.equal(db.saved.length, 0);
});

// ============================================================================
// 3. 一条合法 incoming 群文本被 dispatch (正向主路径) —— 字段逐个钉死
// ============================================================================
test('3. 合法 @bot 群文本被 dispatch 1 次: 字段/内容/trigger/落库全对', async () => {
  needDist();
  const db = installStubDb();
  const { handler, dispatched } = makeHandler();
  const payload = v1Payload(v1Msg({ id: 'msg-ok-1' }));

  await deliver(handler, payload);

  assert.equal(dispatched.length, 1, '合法 @bot 消息必须且只能 dispatch 一次');
  const { msg, batch } = dispatched[0];
  assert.equal(msg.msgId, 'msg-ok-1', 'msgId 必须原样透传 (去重/引用/撤回都依赖它)');
  assert.equal(msg.accountId, ACCOUNT);
  assert.equal(msg.fromWxid, ALICE);
  assert.equal(msg.chatroomId, GROUP);
  assert.equal(msg.peerKind, 'group');
  assert.equal(msg.peerId, GROUP, '群消息 peerId 必须 = groupId (否则群上下文按人拆 → 串台)');
  assert.equal(msg.msgType, 1);
  assert.equal(msg.content, `@${BOT} 今天下午三点开会`, '纯文本消息 content 不得被 enrich 改动');
  assert.equal(msg.trigger, 'at', '触发来源必须回写到 msg.trigger (dispatcher/台账都读它)');
  assert.equal(batch.length, 1, 'batch = 本条 flush 窗口内的全部消息');
  assert.equal(batch[0], msg, 'onDispatch 的 batch 必须含本条自身 (同批上下文依赖此)');

  assert.equal(db.saved.length, 1, '白名单内消息必须落库 (按人查历史依赖它)');
  assert.equal(db.saved[0].msg_id, 'msg-ok-1');
  assert.equal(db.saved[0].peer_id, GROUP);
  assert.equal(db.saved[0].content, msg.content, '落库 content = enrich 后的 content (与 dispatch 看到的一致)');
  assert.deepEqual(db.lookups.map((l) => l.msgId), ['msg-ok-1'], '入库前去重回查恰好一次');
});

// ============================================================================
// 4. 同一载荷重复投递 → 内存 SeenTracker 去重 (vendor 重放 / 多路径入站)
// ============================================================================
/**
 * 为什么必须钉: vendor 会把同一条消息从 webhook / business-callback / WS 多条路径推来。
 * 这里 stub DB 恒返 null ⇒ 若 SeenTracker 失效, dispatched 会变成 2 (真红), 断言无法被"DB 恰好也去重了"掩盖。
 * 后半段是反向保险: 去重 key 不得塌缩到 content-hash (否则不同消息同内容会被误杀 —— buildDedupeKey 注释里的经典坑)。
 */
test('4. 同载荷重复投递被去重: onDispatch 仍 1 次; 不同 msgId 不受影响', async () => {
  needDist();
  const db = installStubDb();
  const { handler, dispatched } = makeHandler();
  const payload = v1Payload(v1Msg({ id: 'msg-dup-1' }));

  await deliver(handler, payload);
  await deliver(handler, payload);
  assert.equal(dispatched.length, 1, '第二次投递必须被内存 SeenTracker 丢掉 (否则重复 AI 回复)');
  // ⚠️ 这里刻意钉"只查了 1 次 DB"而不是 2 次 (写这条时第一版写成了 2 次, 实测红 —— 见文件末尾自检 B/C):
  //   handle 里 SeenTracker 判在 DB 回查**之前** (handler.ts:945 vs 949), 第二次投递在内存层就被 continue 掉
  //   ⇒ DB 回查只发生在第一次。这个次序本身有价值: 重放洪峰不会每条都打一次 DB。
  assert.equal(db.lookups.length, 1, '第二次投递必须在内存层被拦下 (DB 回查不该发生第二次)');
  assert.equal(db.saved.length, 1, '去重后不得二次落库');

  // 反向保险: 同内容不同 id 是**不同消息**, 不许被 content-hash 误杀
  await deliver(handler, v1Payload(v1Msg({ id: 'msg-dup-2' })));
  assert.equal(dispatched.length, 2, '不同 msgId 同内容不得被误去重 (去重 key 不得塌缩到 content)');
});

// ============================================================================
// 5. 畸形 / 空载荷: 不抛异常, 0 dispatch, 0 落库
// ============================================================================
test('5. 畸形/空载荷不抛异常且 0 dispatch (vendor 推空批是常态)', async () => {
  needDist();
  const db = installStubDb();
  const { handler, dispatched } = makeHandler();

  const junk = [
    undefined, null, 0, 42, '', 'not-json', [],
    {},                                             // 完全空对象
    { Wxid: ACCOUNT },                              // 只有账号, 无 EventType/Data
    { Data: {} },                                   // 空 Data
    { EventType: 'sync_message' },                  // 有 EventType 但无 Data
    { EventType: 'sync_message', Data: {} },        // sync_message + 空 Data (结构不识别)
    { EventType: 'sync_message', Data: { messages: [] } },             // vendor 推空批
    { EventType: 'sync_message', Data: { messages: 'nope' } },         // messages 不是数组
    { EventType: 'other', Data: { messages: [null] } },                // 非 sync_message + 垃圾条目
    { EventType: 'sync_message', Data: { Data: { AddMsgs: [{}] } } },  // 旧格式但条目为空
  ];

  for (const p of junk) {
    await deliver(handler, p); // 只要抛异常这里就红 (deliver 不吞错)
  }
  assert.equal(dispatched.length, 0, '垃圾载荷不许触发 AI');
  assert.equal(db.saved.length, 0, '垃圾载荷不许落库');
});

// ============================================================================
// 6. 公众号 (gh_ 前缀 sender) 被丢弃
// ============================================================================
test('6. sender_id 以 gh_ 开头 (公众号) 被丢弃', async () => {
  needDist();
  const db = installStubDb();
  const { handler, dispatched } = makeHandler();
  const payload = v1Payload(v1Msg({ id: 'msg-gh-1', sender_id: 'gh_abcdef1234567890' }));

  const detailed = parserMod.parsePayloadDetailed(ACCOUNT, structuredClone(payload));
  assert.equal(detailed.reasonSummary, 'gh-officialx1');

  await deliver(handler, payload);
  assert.equal(dispatched.length, 0, '公众号推送不参与 AI 对话');
  assert.equal(db.saved.length, 0);
});

// ============================================================================
// 7. type=51 (系统操作) 被丢弃
// ============================================================================
test('7. type=51 被丢弃 + 归因 type-51', async () => {
  needDist();
  const db = installStubDb();
  const { handler, dispatched } = makeHandler();
  const payload = v1Payload(v1Msg({ id: 'msg-t51-1', type: 51 }));

  const detailed = parserMod.parsePayloadDetailed(ACCOUNT, structuredClone(payload));
  assert.equal(detailed.reasonSummary, 'type-51x1');

  await deliver(handler, payload);
  assert.equal(dispatched.length, 0, '系统操作帧不许触发 AI');
  assert.equal(db.saved.length, 0);
});

// ============================================================================
// 8. 私聊白名单 fail-closed (隐私门) —— 顺带覆盖 v0/wrapped 解析分支
// ============================================================================
/**
 * 钉的是"空白名单 = 拒绝所有"的 fail-closed 语义 (防 P0 联系人 fan-out 重演):
 * 白名单外的私聊既不 dispatch 也**不落库** (隐私), 白名单内才放行。
 */
test('8. 私聊: 白名单外不 dispatch 也不落库; 白名单内正常 dispatch', async () => {
  needDist();
  const db = installStubDb();
  const { handler, dispatched } = makeHandler(); // allowFrom = [ALICE]

  await deliver(handler, dmPayload(STRANGER, 'dm-stranger-1'));
  assert.equal(dispatched.length, 0, '白名单外私聊不许触发 AI (fail-closed)');
  assert.equal(db.saved.length, 0, '白名单外私聊不许落库 (隐私)');
  // 去重回查在 handle 阶段, 早于 flush 才做的 blocked 判定 ⇒ 这条注定会被查一次 (第一版断言 0 次, 实测红)。
  // 有意义的是"查了但没落库": 门禁挡在 enrichBatch 之前 (persistBatch 过滤 via==='blocked')。
  assert.deepEqual(db.lookups.map((l) => l.msgId), ['dm-stranger-1'], '去重回查发生 (早于 blocked 判定), 但落库必须被门禁挡下');

  await deliver(handler, dmPayload(ALICE, 'dm-alice-1'));
  assert.equal(dispatched.length, 1, '白名单内私聊必须放行 (视同被 @)');
  assert.equal(dispatched[0].msg.peerKind, 'direct');
  assert.equal(dispatched[0].msg.peerId, ALICE, '私聊 peerId = 对方 wxid');
  assert.equal(dispatched[0].msg.trigger, 'at');
  assert.equal(db.saved.length, 1, '白名单内私聊落库');
});

// ============================================================================
// 9. 混合批: 同载荷里被丢的条目不影响同批其它条目
// ============================================================================
test('9. 混合批: 丢弃条目与合法条目共存时, 合法的照常单独 dispatch', async () => {
  needDist();
  const db = installStubDb();
  const { handler, dispatched } = makeHandler();
  const payload = v1Payload(v1Msg({ id: 'msg-ok-batch' }));
  // 追加一条 outgoing echo (会被 parse 阶段丢掉, 不进 batch)
  payload.Data.messages = [
    v1Msg({ id: 'msg-out-batch', direction: 'outgoing', sender_id: BOT, content: '机器人自述' }),
    v1Msg({ id: 'msg-ok-batch' }),
  ];

  const detailed = parserMod.parsePayloadDetailed(ACCOUNT, structuredClone(payload));
  assert.equal(detailed.messages.length, 1, '只有合法那条进入消息流');
  assert.equal(detailed.reasonSummary, 'outgoing-echox1', '被丢那条的归因照常回收');

  await deliver(handler, payload);
  assert.equal(dispatched.length, 1, '合法条目照常 dispatch');
  assert.equal(dispatched[0].msg.msgId, 'msg-ok-batch');
  assert.equal(dispatched[0].batch.length, 1, 'batch 只含未被丢弃的条目');
  assert.equal(db.saved.length, 1);
});

// ============================================================================
// 10. enableDispatch=false (debug 模式): 照样 enrich/落库, 但不 dispatch
// ============================================================================
/**
 * 契约: "false = debug 模式, enrich 但不 dispatch" (handler.ts:185)。
 * 钉住它 ⇒ 以后有人图省事把 enableDispatch 一并塞进落库条件里 (把 debug 模式变成"啥也不干"),
 *   或者反过来在 debug 模式仍然真发, 都会在这里红。
 */
test('10. enableDispatch=false: 仍落库, 但 onDispatch 0 次', async () => {
  needDist();
  const db = installStubDb();
  const { handler, dispatched } = makeHandler({ enableDispatch: false });

  await deliver(handler, v1Payload(v1Msg({ id: 'msg-debug-1' })));

  assert.equal(db.saved.length, 1, 'debug 模式仍要落库 (enrich 不省)');
  assert.equal(db.saved[0].msg_id, 'msg-debug-1');
  assert.equal(dispatched.length, 0, 'debug 模式不许真发 (onDispatch 不该被调)');
});

// ============================================================================
// 反向注入自检记录 (2026-10-16 实测, 逐条如实 —— 未做过的绝不写进来)
// ----------------------------------------------------------------------------
// 做法: 逐个把断言/输入改成必然不成立的形态 → 跑 node --test → 抄下**实际观察到的**失败 → 改回 → 复跑至全绿。
//
// A) test 3 把 `assert.equal(dispatched.length, 1)` 改成 `2`:
//    实测 → pass 9 / fail 1; 红的正是 test 3, 报
//      `AssertionError [ERR_ASSERTION]: 合法 @bot 消息必须且只能 dispatch 一次 / 1 !== 2`。
//    ⇒ "dispatch 次数"这条断言真的挂在被测行为上 (不是恒真的装饰)。
//
// B) test 1 把 fixture 改成"正常入站" (`direction: 'outgoing'` → `'incoming'` 且 `sender_id: BOT` → `ALICE`):
//    实测 → pass 9 / fail 1; test 1 红在**第一个**断言上:
//      `AssertionError [ERR_ASSERTION]: outgoing echo 不许进入消息流 / 1 !== 0` (parse 层就没丢)。
//    ⇒ "outgoing echo 被丢弃"确由 direction 字段驱动, 不是"载荷本来就进不去主路径"。
//    如实说明: 因为它是该用例的第一个断言, 后面的 `dispatched.length === 0` 没被执行到 —— 没观察到它同时红。
//    (补充实测: 只翻 direction 而不动 sender_id 时该用例仍绿 —— 那条会被 shouldTrigger 的自回环 guard 拦下,
//     所以本次演示必须同时把 sender_id 换成 ALICE, 才能把红打在 parser 的过滤上。)
//
// C) test 4 把"重复投递后"的 `assert.equal(dispatched.length, 1)` 改成 `2`:
//    实测 → pass 9 / fail 1; 报 `1 !== 2`, 消息为 "第二次投递必须被内存 SeenTracker 丢掉"。
//    ⇒ SeenTracker 去重这条锁是真的 (摘掉去重它会红), 不是靠 DB 恰好也命中去重蒙混过关。
//
// D) 最小实验 "若 onDispatch 从不被调用则断言失败": 把 makeHandler 的 `enableDispatch` 改成 `false`
//    (dispatch 出口整体不执行) → 实测 pass 6 / fail 4, 红的是 test 3 / 4 / 8 / 9 四条依赖
//    `dispatched.length` 的用例 (test 10 照旧绿: 它本来断言的就不是 dispatch 发生)。
//    ⇒ 这批断言不会在"啥都没被 dispatch"时静默通过。
//
// ⚠️ 过程中被自检纠正的两处**我自己的错误断言** (已按实测改成正确的锁, 见 test 4 / test 8 行内注释):
//    - 我原先断言"两次投递 ⇒ DB 回查 2 次", 实测是 1 次 —— SeenTracker 判在 DB 回查**之前**。
//    - 我原先断言"白名单外私聊 ⇒ 0 次 DB 回查", 实测是 1 次 —— 去重回查在 handle 阶段, 早于 flush 的 blocked 判定。
//    两条都改成了描述真实次序的断言 (次序本身是有价值的性质: 重放洪峰不会每条都打 DB)。
//
// 以上四处均已改回复跑, 最终 `node --test tests/unit/handler-hotpath.test.mjs` = pass 10 / fail 0。
//
// 没能覆盖到的分支 (需要 DB / 网络 / 真 LLM 才能到, 本文件有意不碰):
//   - vendorCtx 存在的媒体 enrich 全链路 (图片 CdnDownload/DownloadImg、silk 转写、视频、文件 MCP 兜底、
//     小程序卡片封面): 需要真 vendor HTTP + OSS, 不在单测范围。
//   - 引用消息命中 DB 后注入 [引用图片] ossUrl (handler.ts:499-521)、captureQuoteSvrid 的落库副作用。
//   - 心流 judge 分支 (via=heartflow → judgeHeartflow → persistHfJudged): 需 LLM 凭据 + DB 台账。
//   - 接龙强制触发 + 节流 (relayTriggerAt)、红包静默、filehelper 命令回调、DM 配对回调:
//     分支本身可在单测里构造, 但本次以"最热的入站过滤/去重/dispatch 主路径"为限, 未展开。
//   - 定时器到点自动 flush (本文件一律用 flushAll 主动冲刷 ⇒ 零 sleep 竞态; 到点路径由 debouncer.test.mjs 覆盖)。
// ============================================================================
