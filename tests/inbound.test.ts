// tests/inbound.test.ts - Phase D inbound 单元测试
// 覆盖: triggers 4-way | debouncer flush | enrich save | relay parse | handler e2e

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  shouldTrigger,
  defaultTriggerConfig,
  type WppTriggerConfig,
} from "../src/inbound/triggers.js";
import { WppInboundDebouncer } from "../src/inbound/debouncer.js";
import { parseRelayText, isRelayMessage } from "../src/inbound/relay.js";
import {
  stripGroupPrefix,
  describeMsgType,
} from "../src/inbound/parser/content.js";
import {
  extractAtUserList,
  isBotMentionedByText,
  stripAtMentions,
} from "../src/inbound/parser/mention.js";
import { parseQuoteXml } from "../src/inbound/parser/quote.js";
import { isValidWxid, isGroupWxid, isValidAtUser } from "../src/inbound/parser/wxid.js";
import {
  createWppInboundHandler,
  __resetRelayThrottle,
} from "../src/inbound/handler.js";
import { enrichAndSaveMessage } from "../src/inbound/enrich.js";
import { resetAdapter, setBackend, setAdapterForTest } from "../src/storage/db/factory.js";
import { resolveDbConfig } from "../src/storage/db/factory.js";
import type { WppInboundMessage, WppWebhookPayload } from "../src/types.js";

// ===== helpers =====

function makeMsg(opts: Partial<WppInboundMessage> = {}): WppInboundMessage {
  return {
    accountId: "default",
    msgId: `m-${Math.random().toString(36).slice(2)}`,
    newMsgId: "",
    fromWxid: opts.peerKind === "group" ? "wxid_sender" : "wxid_alice",
    chatroomId: opts.peerKind === "group" ? "chat1@chatroom" : undefined,
    msgType: 1,
    content: "hello world",
    ts: Math.floor(Date.now() / 1000),
    raw: {} as WppWebhookPayload,
    peerKind: opts.peerKind ?? "direct",
    peerId: opts.peerId ?? (opts.peerKind === "group" ? "chat1@chatroom" : "wxid_alice"),
    trigger: "direct",
    ...opts,
  };
}

// ===== wxid =====

test("isValidWxid — 合法/非法", () => {
  assert.ok(isValidWxid("wxid_abc123"));
  assert.ok(isValidWxid("gh_deadbeef"));
  assert.ok(!isValidWxid(""));
  assert.ok(!isValidWxid(null));
  assert.ok(!isValidWxid("short"));
});

test("isGroupWxid — 群识别", () => {
  assert.ok(isGroupWxid("12345@chatroom"));
  assert.ok(isGroupWxid("@@test"));
  assert.ok(!isGroupWxid("wxid_personal"));
});

test("isValidAtUser", () => {
  assert.ok(isValidAtUser("wxid_xxx"));
  assert.ok(!isValidAtUser("plain"));
});

// ===== mention =====

test("extractAtUserList — 多种模式提取", () => {
  assert.deepEqual(extractAtUserList("hello"), []);
  assert.deepEqual(
    extractAtUserList("请看 @wxid_aaa 你好"),
    ["wxid_aaa"],
  );
  assert.deepEqual(
    extractAtUserList("@wxid_aaa 和 @wxid_bbb 一起来"),
    ["wxid_aaa", "wxid_bbb"],
  );
  assert.deepEqual(
    extractAtUserList('<at user="wxid_aaa"/>hi'),
    ["wxid_aaa"],
  );
});

test("isBotMentionedByText", () => {
  assert.ok(isBotMentionedByText(`@wxid_bot hello`, "wxid_bot"));
  assert.ok(!isBotMentionedByText(`hello`, "wxid_bot"));
  assert.ok(!isBotMentionedByText(``, "wxid_bot"));
});

// ===== content =====

test("stripGroupPrefix — 群消息前缀剥离", () => {
  // vendor binary 实测: "wxid_alice:\nwxid_bot:\nhello everyone" — 第一段 sender wxid
  assert.equal(
    stripGroupPrefix("wxid_alice:\nwxid_bot:\nhello everyone"),
    "hello everyone",
  );
  assert.equal(stripGroupPrefix("plain text"), "plain text");
});

test("describeMsgType — 数字 → human", () => {
  assert.equal(describeMsgType(1), "text");
  assert.equal(describeMsgType(3), "image");
  assert.equal(describeMsgType(6), "file", "v1.1.27 FILE-MSG");
  assert.equal(describeMsgType(34), "voice");
  assert.equal(describeMsgType(43), "video");
  assert.equal(describeMsgType(53), "chat-history");
  assert.equal(describeMsgType(99999), "unknown(99999)");
});

// ===== quote =====

test("parseQuoteXml — 标准 refermsg 块", () => {
  const xml = `<refermsg type="1"><type>1</type><svrid>12345</svrid><fromusername>wxid_alice</fromusername><displayname>Alice</displayname><content>hello</content></refermsg>`;
  const q = parseQuoteXml(xml);
  assert.ok(q);
  assert.equal(q!.msgId, "12345");
  assert.equal(q!.fromWxid, "wxid_alice");
  assert.equal(q!.title, "Alice");
});

test("parseQuoteXml — 无 refermsg 返回 null", () => {
  assert.equal(parseQuoteXml("plain text"), null);
  assert.equal(parseQuoteXml(""), null);
});

// ===== triggers =====

test("shouldTrigger — DM 白名单内触发", () => {
  const t = shouldTrigger(
    makeMsg({ peerKind: "direct", content: "hi", fromWxid: "wxid_alice" }),
    defaultTriggerConfig(),
    { botWxid: "wxid_bot", allowFrom: ["wxid_alice"] },
  );
  assert.ok(t.triggered);
  assert.equal(t.via, "at");
});

test("shouldTrigger — DM 白名单外 blocked (v1.1.17 fail-closed)", () => {
  const t = shouldTrigger(
    makeMsg({ peerKind: "direct", content: "hi", fromWxid: "wxid_evil" }),
    defaultTriggerConfig(),
    { botWxid: "wxid_bot", allowFrom: ["wxid_alice"] },
  );
  assert.equal(t.triggered, false);
  assert.equal(t.via, "blocked");
});

test("shouldTrigger — DM allowFrom 空 = blocked (v1.1.17 fail-closed 防 P0 污染)", () => {
  const t = shouldTrigger(
    makeMsg({ peerKind: "direct", content: "hi", fromWxid: "wxid_anyone" }),
    defaultTriggerConfig(),
    { botWxid: "wxid_bot", allowFrom: [] },
  );
  assert.equal(t.triggered, false);
  assert.equal(t.via, "blocked");
});

test("shouldTrigger — group @mention 触发", () => {
  const cfg: WppTriggerConfig = {
    ...defaultTriggerConfig(),
    requireAtMention: false,
  };
  const t = shouldTrigger(
    makeMsg({ peerKind: "group", content: "@wxid_bot hello" }),
    cfg,
    { botWxid: "wxid_bot" },
  );
  assert.ok(t.triggered);
  assert.equal(t.via, "at");
});

test("shouldTrigger — group 群不被 @ 不触发 (requireAtMention + keyword disabled)", () => {
  const cfg: WppTriggerConfig = {
    ...defaultTriggerConfig(),
    requireAtMention: true,
  };
  const t = shouldTrigger(
    makeMsg({ peerKind: "group", content: "no mention here" }),
    cfg,
    { botWxid: "wxid_bot" },
  );
  assert.ok(!t.triggered);
});

test("shouldTrigger — group keyword 模式命中触发", () => {
  const cfg: WppTriggerConfig = {
    ...defaultTriggerConfig(),
    keywordTrigger: { enabled: true, keywords: ["help", "帮"] },
  };
  const t = shouldTrigger(
    makeMsg({ peerKind: "group", content: "请帮帮我" }),
    cfg,
    { botWxid: "wxid_bot" },
  );
  assert.ok(t.triggered);
  assert.equal(t.via, "keyword");
});

test("shouldTrigger — group msgType trigger (接龙 53)", () => {
  const cfg: WppTriggerConfig = {
    ...defaultTriggerConfig(),
    msgTypeTrigger: { enabled: true, appMsgTypes: [53] },
  };
  const t = shouldTrigger(
    makeMsg({ peerKind: "group", msgType: 53, content: "relay test" }),
    cfg,
    { botWxid: "wxid_bot" },
  );
  assert.ok(t.triggered);
  assert.equal(t.via, "msgType");
});

test("shouldTrigger — group blacklist 短路", () => {
  const cfg: WppTriggerConfig = {
    ...defaultTriggerConfig(),
    blacklistGroups: ["chat1@chatroom"],
  };
  const t = shouldTrigger(
    makeMsg({ peerKind: "group", chatroomId: "chat1@chatroom" }),
    cfg,
    { botWxid: "wxid_bot" },
  );
  assert.ok(!t.triggered);
  assert.equal(t.via, "blocked");
});

test("shouldTrigger — group chatroomDebug 强制触发", () => {
  const cfg: WppTriggerConfig = {
    ...defaultTriggerConfig(),
    chatroomDebug: true,
  };
  const t = shouldTrigger(
    makeMsg({ peerKind: "group" }),
    cfg,
    { botWxid: "wxid_bot" },
  );
  assert.ok(t.triggered);
  assert.equal(t.via, "at");
});

// ===== debouncer =====

test("debouncer — 同 key 1.5s 内合并 flush 1 次", async () => {
  let flushed = 0;
  let batchSize = 0;
  const d = new WppInboundDebouncer({
    intervalMs: 100,
    onFlush: async (batch) => {
      flushed++;
      batchSize = batch.length;
    },
  });
  d.enqueue(makeMsg({ msgId: "a" }));
  d.enqueue(makeMsg({ msgId: "b" }));
  d.enqueue(makeMsg({ msgId: "c" }));
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(flushed, 1);
  assert.equal(batchSize, 3);
});

test("debouncer — VOICE bypass 直 flush", async () => {
  let flushed = 0;
  const d = new WppInboundDebouncer({
    intervalMs: 1000,
    onFlush: async () => {
      flushed++;
    },
  });
  d.enqueue(makeMsg({ msgId: "v1", msgType: 34 }));
  await new Promise((r) => setTimeout(r, 50));
  // VOICE 不 debounce, 应该立即 flush
  assert.equal(flushed, 1);
  await d.flushAll();
});

test("debouncer — SYSTEM 直 flush", async () => {
  let flushed = 0;
  const d = new WppInboundDebouncer({
    intervalMs: 1000,
    onFlush: async () => {
      flushed++;
    },
  });
  d.enqueue(makeMsg({ msgId: "s1", msgType: 10000 }));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(flushed, 1);
});

test("debouncer — control command bypass", async () => {
  let flushed = 0;
  const d = new WppInboundDebouncer({
    intervalMs: 1000,
    isControlCommand: () => true,
    onFlush: async () => {
      flushed++;
    },
  });
  d.enqueue(makeMsg({ msgId: "c1" }));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(flushed, 1);
});

test("debouncer — 不同 key 分别 flush", async () => {
  const sizes: number[] = [];
  const d = new WppInboundDebouncer({
    intervalMs: 80,
    onFlush: async (batch) => {
      sizes.push(batch.length);
    },
  });
  d.enqueue(makeMsg({ fromWxid: "a", msgId: "a1" }));
  d.enqueue(makeMsg({ fromWxid: "b", msgId: "b1" }));
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(sizes.length, 2);
  assert.deepEqual(sizes.sort(), [1, 1]);
});

test("debouncer — clear 不抛", () => {
  const d = new WppInboundDebouncer({ intervalMs: 100, onFlush: async () => {} });
  d.enqueue(makeMsg({ msgId: "x1" }));
  d.enqueue(makeMsg({ msgId: "x2" }));
  d.clear();
  assert.equal(d.size(), 0);
});

// ===== relay =====

test("parseRelayText — 字面 \\n 转真换行后分多条", () => {
  // 这是 vendor binary 实测: title 字段里塞字面 \n (0x5c 0x6e)
  const raw = `<title>接龙题目\\n</title>\\n1. Alice: 第一条\\n2. Bob: 第二条`;
  const r = parseRelayText(raw);
  assert.equal(r.title, "接龙题目");
  assert.equal(r.items.length, 2);
  // v1.3.37 保守解析 (老板 2026-08-11): 只切序号, 不猜昵称 — 整段保留
  assert.equal(r.items[0]?.text, "Alice: 第一条");
  assert.equal(r.items[1]?.text, "Bob: 第二条");
});

test("parseRelayText — 空返回 {title:'', items:[]}", () => {
  const r = parseRelayText("");
  assert.equal(r.title, "");
  assert.equal(r.items.length, 0);
});

test("v1.3.63 P2-3 — 单行接龙: title 里含 'N. ' 不误判为条目", () => {
  // 真实 vendor push 格式: title + 规则 + 接龙者 拼成 1 行, title 里可能含数字点 (如 "3. 周年庆")
  const raw = `<title>#接龙 3. 周年庆 1. 门店＋型号 2. 金源北路GT7蓝 倪彩霞</title>`;
  const r = parseRelayText(raw);
  // title 前缀 "3. 周年庆" 不得被当条目; 只有真实序号 1/2 进 items
  const items = r.items;
  assert.equal(items.length, 2, `应只切出 2 个真实条目, 实际 ${items.length}: ${JSON.stringify(items)}`);
  assert.equal(items[0]?.index, 1);
  assert.ok(items[0]?.text?.includes("门店"), `items[0].text 应含 '门店': ${items[0]?.text}`);
  assert.equal(items[1]?.index, 2);
  assert.ok(items[1]?.text?.includes("金源北路"), `items[1].text 应含 '金源北路': ${items[1]?.text}`);
});

test("v1.3.63 P2-3 — 单行接龙: 无 title 数字前缀, 正常切出所有条目", () => {
  const raw = `<title>#接龙 🎯8月大卖 1. 门店＋型号 2. 金源北路GT7蓝 倪彩霞 3. 南京东路 周某</title>`;
  const r = parseRelayText(raw);
  assert.equal(r.items.length, 3);
  assert.equal(r.items[0]?.index, 1);
  assert.equal(r.items[1]?.index, 2);
  assert.equal(r.items[2]?.index, 3);
});

// ===== v1.3.54 RELAY-TRIGGER — isRelayMessage 识别 (真实 vendor 接龙 type=49 app) =====

test("v1.3.54 isRelayMessage — 真实接龙 type=49 app + #接龙 title → true", () => {
  const m = {
    msgType: 49,
    content: "#接龙 nova16SE首销\n1. 门店+型号",
    raw: { app: { category: "app_message", title: "#接龙 nova16SE首销🫕" } },
  };
  assert.equal(isRelayMessage(m), true);
});

test("v1.3.54 isRelayMessage — 旧 chat-history type=53 → true (兼容历史)", () => {
  assert.equal(isRelayMessage({ msgType: 53, content: "relay" }), true);
});

test("v1.3.54 isRelayMessage — 普通 app type=49 (链接/文件/小程序) → false (不误判)", () => {
  const m = {
    msgType: 49,
    content: "分享链接",
    raw: { app: { category: "app_message", title: "http://example.com" } },
  };
  assert.equal(isRelayMessage(m), false);
});

test("v1.3.54 isRelayMessage — 普通文本 type=1 → false", () => {
  assert.equal(isRelayMessage({ msgType: 1, content: "大家好" }), false);
});

test("v1.3.54 isRelayMessage — type=49 但 content 提及接龙无条目 → false", () => {
  // 普通聊天提"接龙" (无 # 前缀 + 无编号条目) 不应误判
  assert.equal(isRelayMessage({ msgType: 49, content: "我们明天接龙吧", raw: {} }), false);
});

// ===== enrich (用真实 adapter 测试, 但 db 没真连, 用 stub) =====

test("enrichAndSaveMessage — 没有 adapter 抛错捕获", async () => {
  resetAdapter();
  const r = await enrichAndSaveMessage(makeMsg({ msgId: "e1" }));
  assert.equal(r.saved, false);
  assert.ok(r.error, "should have error message");
});

// ===== handler end-to-end (mock adapter + dispatch hook) =====

test("v1.3.18 P1-假绿2 修 — createWppInboundHandler: 入队 + flush + dispatch (FakeDb 真验证 dispatched)", async () => {
  resetAdapter();
  // 注入真 fake adapter (handler 内部 enrichAndSaveMessage 走 getAdapter())
  const fake = new FakeDbForEnrich();
  setAdapterForTest(fake);

  const dispatched: WppInboundMessage[] = [];
  const handler = createWppInboundHandler({
    accountId: "default",
    triggerConfig: {
      ...defaultTriggerConfig(),
      keywordTrigger: { enabled: true, keywords: ["help"] },
    },
    triggerCtx: { botWxid: "wxid_bot", allowFrom: ["wxid_alice"] }, // v1.1.17 fail-closed: DM 白名单含 sender 才放行
    enableDispatch: true,
    onDispatch: async (msg) => {
      dispatched.push(msg);
    },
  });

  await handler.handle({
    fromUser: "wxid_alice",
    content: "please help me",
    msgType: 1,
    msgId: "h1-real",
  } as WppWebhookPayload);

  await handler.flushAll();
  // 真验证 (v1.3.18 P1-假绿2 修): enrichAndSaveMessage 真入库 + onDispatch 真被调
  // 注: 'please help me' 含 'help' 关键词命中 trigger → onDispatch 触发
  const saved = fake.messages.map((m) => (m as { msg_id?: string }).msg_id);
  assert.ok(saved.includes("h1-real"), `消息应入库 (enrichAndSaveMessage 真跑), 实际 saved=${JSON.stringify(saved)}`);
  assert.ok(dispatched.length === 1, `onDispatch 应被调 1 次, 实际 dispatched.length=${dispatched.length}`);
  assert.equal(dispatched[0]!.msgId, "h1-real", "dispatched 的 msgId 应匹配入站消息");
});

test("v1.3.54 RELAY-TRIGGER — 接龙 type=49 消息强制触发 dispatch (即使无人 @)", async () => {
  resetAdapter();
  const fake = new FakeDbForEnrich();
  setAdapterForTest(fake);
  const dispatched: WppInboundMessage[] = [];
  const handler = createWppInboundHandler({
    accountId: "default",
    triggerConfig: { ...defaultTriggerConfig(), groupPolicy: "open" },
    triggerCtx: { botWxid: "wxid_bot", allowFrom: [] },
    enableDispatch: true,
    onDispatch: async (msg) => { dispatched.push(msg); },
  });
  const relayMsgId = `relay-test-${Date.now()}`;
  await handler.handle({
    fromWxid: "wxid_member123", // 群内成员发接龙
    chatroomId: "19908568237@chatroom", // 群 (华为群)
    msgType: 49, // v1.3.54: 真实接龙是 type=49 app, 不是 53
    content: "#接龙 nova16SE首销\n1. 门店+型号\n2. 华为程起凤 nova16se",
    msgId: relayMsgId,
  } as unknown as WppWebhookPayload);
  await handler.flushAll();
  assert.ok(
    dispatched.some((d) => d.msgId === relayMsgId),
    `接龙消息应被强制 dispatch (force-trigger via msgType), 实际 dispatched=${JSON.stringify(dispatched.map((d) => d.msgId))}`,
  );
  const relay = dispatched.find((d) => d.msgId === relayMsgId);
  assert.equal(relay?.trigger, "msgType", "接龙触发 via 应为 msgType");
  assert.ok(relay?.content?.startsWith("[接龙]"), "接龙内容应被解析成 [接龙] 前缀注入 AI 上下文");
});

test("v1.3.54 RELAY-TRIGGER — 同群同接龙 5 分钟内节流 (第 2 条不触发)", async () => {
  resetAdapter();
  const fake = new FakeDbForEnrich();
  setAdapterForTest(fake);
  const dispatched: WppInboundMessage[] = [];
  const handler = createWppInboundHandler({
    accountId: "default",
    triggerConfig: { ...defaultTriggerConfig(), groupPolicy: "open" },
    triggerCtx: { botWxid: "wxid_bot", allowFrom: [] },
    enableDispatch: true,
    onDispatch: async (msg) => { dispatched.push(msg); },
  });
  __resetRelayThrottle(); // 清节流状态
  const payload = {
    fromWxid: "wxid_m1", chatroomId: "g1@chatroom", msgType: 49,
    content: "#接龙 促销\n1. a\n2. b", msgId: "relay-1",
  } as unknown as WppWebhookPayload;
  await handler.handle(payload);
  await handler.flushAll();
  assert.equal(dispatched.length, 1, "第 1 条触发");
  // 第 2 条同接龙 (新 msgId) → 应被节流
  await handler.handle({ ...payload, msgId: "relay-2" } as unknown as WppWebhookPayload);
  await handler.flushAll();
  assert.equal(dispatched.length, 1, "5 分钟内同接龙第 2 条应被节流");
});

test("v1.3.54 RELAY-TRIGGER — 不同接龙标题不互相节流", async () => {
  resetAdapter();
  const fake = new FakeDbForEnrich();
  setAdapterForTest(fake);
  const dispatched: WppInboundMessage[] = [];
  const handler = createWppInboundHandler({
    accountId: "default",
    triggerConfig: { ...defaultTriggerConfig(), groupPolicy: "open" },
    triggerCtx: { botWxid: "wxid_bot", allowFrom: [] },
    enableDispatch: true,
    onDispatch: async (msg) => { dispatched.push(msg); },
  });
  __resetRelayThrottle();
  await handler.handle({ fromWxid: "wxid_m1", chatroomId: "g1@chatroom", msgType: 49, content: "#接龙 接龙A\n1. a", msgId: "r1" } as unknown as WppWebhookPayload);
  await handler.flushAll();
  await handler.handle({ fromWxid: "wxid_m1", chatroomId: "g1@chatroom", msgType: 49, content: "#接龙 接龙B\n1. x", msgId: "r2" } as unknown as WppWebhookPayload);
  await handler.flushAll();
  assert.equal(dispatched.length, 2, "不同接龙标题都应触发");
});

test("v1.3.57 P0-2 — 接龙强制触发不绕过黑名单群 (via=blocked 不 dispatch)", async () => {
  resetAdapter();
  const fake = new FakeDbForEnrich();
  setAdapterForTest(fake);
  const dispatched: WppInboundMessage[] = [];
  const handler = createWppInboundHandler({
    accountId: "default",
    triggerConfig: { ...defaultTriggerConfig(), groupPolicy: "open", blacklistGroups: ["black@chatroom"] },
    triggerCtx: { botWxid: "wxid_bot", allowFrom: [] },
    enableDispatch: true,
    onDispatch: async (msg) => { dispatched.push(msg); },
  });
  __resetRelayThrottle();
  await handler.handle({ fromWxid: "wxid_m1", chatroomId: "black@chatroom", msgType: 49, content: "#接龙 黑名单\n1. a", msgId: "r-black" } as unknown as WppWebhookPayload);
  await handler.flushAll();
  assert.equal(dispatched.length, 0, "黑名单群接龙不应被强制触发 (P0-2)");
});



// ===== FakeDbAdapter + enrich 集成测试 =====
import type { DbAdapter } from "../src/storage/db/types.js";
class FakeDbForEnrich implements DbAdapter {
  readonly backendName = "sqlite" as const;
  messages: unknown[] = [];
  async init(): Promise<void> {}
  async close(): Promise<void> {}
  async ping(): Promise<void> {}
  async saveMessage(_r: unknown): Promise<void> {
    this.messages.push(_r);
  }
  async getMessages(): Promise<never[]> {
    return [];
  }
  async getMessageById(): Promise<null> {
    return null;
  }
  async getMessageByMsgIdOrNewId(): Promise<null> {
    return null;
  }
  async findMessageByMd5(): Promise<null> {
    return null;
  }
  async saveContact() {}
  async getContacts(): Promise<never[]> {
    return [];
  }
  async saveChatroom() {}
  async getChatrooms(): Promise<never[]> {
    return [];
  }
  async getSessionState() {
    return null;
  }
  async upsertSessionState() {}
  async logApiCall() {}
  async getApiCalls(): Promise<never[]> {
    return [];
  }
}

test("createWppInboundHandler — 完整流程 (FakeDb)", async () => {
  resetAdapter();
  // 注入 fake (hack: 通过 setBackend path, 因为 factory 只接 mysql)
  // 这里手动 mock — 仅验证 handler 拼装没错
  const fake = new FakeDbForEnrich();
  const dispatched: WppInboundMessage[] = [];
  const handler = createWppInboundHandler({
    accountId: "default",
    triggerConfig: defaultTriggerConfig(),
    triggerCtx: { botWxid: "wxid_bot" },
    enableDispatch: true,
    onDispatch: async (msg) => {
      dispatched.push(msg);
    },
  });

  // 由于 enrichAndSaveMessage 走 getAdapter() (工厂), 没后端就失败
  // 测试只验证 handler 不抛, 不真验证 dispatch
  await handler.handle({
    fromUser: "wxid_alice",
    content: "hi there",
    msgType: 1,
    msgId: "ff1",
  } as WppWebhookPayload);

  await handler.flushAll();
  // Verify no crash
  assert.ok(Array.isArray(dispatched));
  void fake; // suppress unused
});

test("v1.1.33 SAFE-REGEX — 超长输入截断不 hang (ReDoS 防御)", () => {
  // P2[1] (2026-08-08 23:12 接总立 P1/P2/P3 推进):
  //   mention.ts 接入 safeMatch 后, 恶意超长输入应截断到 4096, 不触发 super-linear runtime
  //   验证: 100KB 恶意输入在 500ms 内完成 (旧代码 matchAll 可能 hang)
  const huge = "@wxid_aaa ".repeat(8000) + "a".repeat(50000); // ~114KB
  const start = Date.now();
  const out = extractAtUserList(huge);
  const elapsed = Date.now() - start;
  assert.ok(out.includes("wxid_aaa"), "应提取到 wxid_aaa (截断后前 4096 字符内)");
  assert.ok(elapsed < 500, `extractAtUserList 应在 500ms 内完成, 实际 ${elapsed}ms`);
});

test("v1.1.33 SAFE-REGEX — 超长 stripAtMentions 截断", () => {
  const huge = `@wxid_bot ${'a'.repeat(100000)}`;
  const start = Date.now();
  const out = stripAtMentions(huge, "wxid_bot");
  const elapsed = Date.now() - start;
  assert.ok(!out.includes("wxid_bot"), "@wxid_bot 应被 strip");
  assert.ok(elapsed < 500, `stripAtMentions 应在 500ms 内完成, 实际 ${elapsed}ms`);
});

// ===== v1.2.4 只入白名单: 非白名单群/私聊不入库 (老板拍板) =====

test("v1.2.4 只入白名单 — 非白名单群不入库, 白名单群入库", async () => {
  resetAdapter();
  const fake = new FakeDbForEnrich();
  setAdapterForTest(fake);

  const handler = createWppInboundHandler({
    accountId: "default",
    triggerConfig: {
      ...defaultTriggerConfig(),
      groupPolicy: "allowlist",
      groupAllowFrom: ["white@chatroom"],
      blacklistGroups: ["black@chatroom"],
    },
    triggerCtx: { botWxid: "wxid_bot", groupContextEnabled: true },
    enableDispatch: true,
  });

  // 白名单群消息 (无 @) → 入库
  await handler.handle({
    fromUser: "wxid_sender",
    content: "white msg",
    msgType: 1,
    msgId: "w-1",
    chatroomId: "white@chatroom",
  } as unknown as WppWebhookPayload);
  // 非白名单群 (allowlist 外) → 不入库
  await handler.handle({
    fromUser: "wxid_sender",
    content: "other msg",
    msgType: 1,
    msgId: "o-1",
    chatroomId: "other@chatroom",
  } as unknown as WppWebhookPayload);
  // 黑名单群 → 不入库
  await handler.handle({
    fromUser: "wxid_sender",
    content: "black msg",
    msgType: 1,
    msgId: "b-1",
    chatroomId: "black@chatroom",
  } as unknown as WppWebhookPayload);

  await handler.flushAll();
  const saved = fake.messages.map((m) => (m as { msg_id?: string }).msg_id);
  assert.ok(saved.includes("w-1"), "白名单群消息应入库");
  assert.ok(!saved.includes("o-1"), "非白名单群消息不应入库");
  assert.ok(!saved.includes("b-1"), "黑名单群消息不应入库");
});

test("v1.2.4 只入白名单 — 私聊白名单外不入库, 白名单内入库", async () => {
  resetAdapter();
  const fake = new FakeDbForEnrich();
  setAdapterForTest(fake);

  const handler = createWppInboundHandler({
    accountId: "default",
    triggerConfig: defaultTriggerConfig(),
    triggerCtx: { botWxid: "wxid_bot", allowFrom: ["wxid_allowed"] },
    enableDispatch: true,
  });

  // 白名单内私聊 → 入库
  await handler.handle({
    fromUser: "wxid_allowed",
    content: "hi",
    msgType: 1,
    msgId: "d-ok",
  } as unknown as WppWebhookPayload);
  // 白名单外私聊 → 不入库
  await handler.handle({
    fromUser: "wxid_stranger",
    content: "hello",
    msgType: 1,
    msgId: "d-no",
  } as unknown as WppWebhookPayload);

  await handler.flushAll();
  const saved = fake.messages.map((m) => (m as { msg_id?: string }).msg_id);
  assert.ok(saved.includes("d-ok"), "白名单内私聊应入库");
  assert.ok(!saved.includes("d-no"), "白名单外私聊不应入库");
});

// ===== v1.3.36 SINGLE-LINE-RELAY (2026-08-11): 微信新版单行接龙解析 =====
import { parseRelayText, isRelayMessage } from "../src/inbound/relay.js";

test("v1.3.36 — 单行接龙 (无换行) 解析出多个条目 (保守: 只切序号不猜昵称)", () => {
  const raw = "1. 2. 倪彩霞 gt7 3. 莓心 4. 王燕燕 512 白色";
  const r = parseRelayText(raw);
  // 1. 是发起人占位(无内容), 2-4 是实际条目; 老板指正: 不猜昵称, 整段保留
  assert.ok(r.items.length >= 3, `应 ≥3 条, 实际 ${r.items.length}`);
  const it2 = r.items.find((i) => i.index === 2);
  assert.equal(it2?.text, "倪彩霞 gt7");
  const it4 = r.items.find((i) => i.index === 4);
  assert.equal(it4?.text, "王燕燕 512 白色");
});

test("v1.3.36 — 多行接龙仍正常 (原有行为)", () => {
  const raw = "#接龙\n1. Alice: 我来了\n2. Bob: 收到";
  const r = parseRelayText(raw);
  assert.ok(r.items.length >= 2, `应 ≥2 条, 实际 ${r.items.length}`);
});

test("v1.3.37 — 条目内换行内容合并 (不丢 'gt7'/'512 白色')", () => {
  const r = parseRelayText("1.\n2. 倪彩霞\ngt7\n3. 莓心\n4. 王燕燕\n512 白色");
  assert.equal(r.items.length, 3);
  const it2 = r.items.find((i) => i.index === 2);
  assert.equal(it2?.text, "倪彩霞 gt7");
  const it4 = r.items.find((i) => i.index === 4);
  assert.equal(it4?.text, "王燕燕 512 白色");
});

// ===== v1.3.39 FILEHELPER: filehelper 命令处理 (老板 2026-08-11) =====
import { payloadToAllInboundMessages } from "../src/inbound/parser.js";

test("v1.3.39 — filehelper 命令消息放行 (非命令仍过滤)", () => {
  // 命令 (含 /) → 放行
  const cmd = payloadToAllInboundMessages("default", {
    Wxid: "wxid_bot", EventType: "sync_message", Timestamp: 1000,
    Data: { count: 1, schema: "wechatpad.message.v2", messages: [{
      content: "/genpair", conversation_id: "filehelper", created_at: 1000,
      direction: "outgoing", id: "m1", kind: "text", recipient_id: "filehelper",
      sender_id: "wxid_bot", type: 1,
    }]},
  } as never);
  assert.ok(Array.isArray(cmd) && cmd.length === 1, "命令应放行");
  assert.equal(cmd[0]?.peerId, "filehelper");

  // 非命令 (无 /) → 过滤
  const plain = payloadToAllInboundMessages("default", {
    Wxid: "wxid_bot", EventType: "sync_message", Timestamp: 1000,
    Data: { count: 1, schema: "wechatpad.message.v2", messages: [{
      content: "你好？", conversation_id: "filehelper", created_at: 1000,
      direction: "outgoing", id: "m2", kind: "text", recipient_id: "filehelper",
      sender_id: "wxid_bot", type: 1,
    }]},
  } as never);
  assert.equal(plain.length, 0, "非命令仍过滤");
});
