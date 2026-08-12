// tests/dispatcher-group-context.test.ts - v1.2.4 GROUP-CONTEXT-DB
// 群聊触发时从 DB 查触发人最近消息注入 AI 上下文 (老板拍板: 删内存缓冲, DB 按人查)
// 覆盖: DB 按人查 / @指定除外 / 图片≤3 / groupContextEnabled 开关 / 群间隔离

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

import {
  dispatchInboundToOpenClaw,
  setChannelRuntime,
  type WppChannelRuntime,
} from "../src/dispatch/dispatcher.js";
import { getDefaultAccountRegistry } from "../src/account-state.js";
import { AccountContext } from "../src/accounts/account-context.js";
import { resetAdapter, setAdapterForTest } from "../src/storage/db/factory.js";
import type { DbAdapter, MessageRecord } from "../src/storage/db/types.js";
import type { WppInboundMessage } from "../src/types.js";

// ===== fake adapter (mock DB, getMessages 按 from_wxid/peer_id 过滤) =====
class FakeGroupDb implements DbAdapter {
  readonly backendName = "sqlite" as const;
  messages: MessageRecord[] = [];
  async init(): Promise<void> {}
  async close(): Promise<void> {}
  async ping(): Promise<void> {}
  async saveMessage(record: MessageRecord): Promise<void> {
    this.messages.push(record);
  }
  async getMessages(opts: Parameters<DbAdapter["getMessages"]>[0]): Promise<MessageRecord[]> {
    return this.messages
      .filter((m) => {
        if (opts.accountId && m.account_id !== opts.accountId) return false;
        if (opts.peerKind && m.peer_kind !== opts.peerKind) return false;
        if (opts.peerId && m.peer_id !== opts.peerId) return false;
        if (opts.fromWxid && m.from_wxid !== opts.fromWxid) return false;
        return true;
      })
      .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
      .slice(0, opts.limit ?? 100);
  }
  async getMessageById(): Promise<null> { return null; }
  async getMessageByMsgIdOrNewId(msgId?: string, newMsgId?: string): Promise<MessageRecord | null> {
    return this.messages.find((m) =>
      (msgId && (m.msg_id === msgId || m.new_msg_id === msgId)) ||
      (newMsgId && (m.new_msg_id === newMsgId || m.msg_id === newMsgId)),
    ) ?? null;
  }
  async findMessageByMd5(): Promise<null> { return null; }
  async saveContact() {}
  async getContacts(): Promise<never[]> { return []; }
  async saveChatroom() {}
  async getChatrooms(): Promise<never[]> { return []; }
  async getSessionState() { return null; }
  async upsertSessionState() {}
  async logApiCall() {}
  async getApiCalls(): Promise<never[]> { return []; }
  async upsertAccount() {}
  async getAccounts(): Promise<never[]> { return []; }
  async getAccount(): Promise<null> { return null; }
  async saveSvridMapping() {}
  async getSvridByMd5(): Promise<null> { return null; }
  async saveSynckey() {}
  async getSynckey(): Promise<null> { return null; }
}

function mockAccountRegistry(accountId: string, agent: string, overrides: Record<string, unknown> = {}): void {
  const reg = getDefaultAccountRegistry() as unknown as { contexts: Map<string, AccountContext> };
  const cfg = {
    enabled: true,
    tokenKey: "test-token",
    apiBaseUrl: "https://test",
    wsUrl: "wss://test",
    authcode: "test-auth",
    webhookHost: "0.0.0.0",
    webhookPort: 0,
    webhookPath: "/test",
    webhookSecret: "",
    allowFrom: [],
    groupPolicy: "open" as const,
    groupAllowFrom: [],
    selfWxid: "wxid_bot",
    nickname: "test",
    requireAtMention: true,
    debounceMs: 1500,
    agent,
    ...overrides,
  };
  const ctx = new AccountContext({ accountId, config: cfg });
  reg.contexts.set(accountId, ctx);
}

function makeMockRuntime(): WppChannelRuntime & {
  recordedSessions: Array<{ storePath: string; sessionKey: string; ctx: unknown }>;
} {
  const runtime = {
    recordedSessions: [] as Array<{ storePath: string; sessionKey: string; ctx: unknown }>,
    session: {
      recordInboundSession: async (opts: { storePath: string; sessionKey: string; ctx: unknown }) => {
        runtime.recordedSessions.push(opts);
      },
    },
    reply: {
      dispatchReplyWithBufferedBlockDispatcher: async (opts: unknown) => {
        const o = opts as { dispatcherOptions?: { deliver?: (p: { text?: string }, i: unknown) => Promise<unknown> } };
        await o.dispatcherOptions?.deliver?.({ text: "AI reply" }, {});
      },
    },
  };
  return runtime;
}

function makeGroupMsg(overrides: Partial<WppInboundMessage> = {}): WppInboundMessage {
  return {
    accountId: "default",
    msgId: "g-1",
    newMsgId: "gn-1",
    fromWxid: "wxid_alice",
    fromNickname: "Alice",
    chatroomId: "chat-1@chatroom",
    toWxid: "wxid_bot",
    msgType: 1,
    content: "hello group",
    ts: Math.floor(Date.now() / 1000),
    raw: {},
    peerKind: "group",
    peerId: "chat-1@chatroom",
    trigger: "at",
    ...overrides,
  };
}

function dbRecord(msg: WppInboundMessage): MessageRecord {
  return {
    account_id: msg.accountId,
    msg_id: msg.msgId,
    new_msg_id: msg.newMsgId,
    direction: "inbound",
    peer_kind: msg.peerKind,
    peer_id: msg.peerId,
    peer_name: msg.fromNickname,
    msg_type: String(msg.msgType),
    content: msg.content,
    from_wxid: msg.fromWxid,
    ts: msg.ts,
  };
}

let mockRuntime: ReturnType<typeof makeMockRuntime>;
let fakeDb: FakeGroupDb;

beforeEach(() => {
  // v1.3.18 B-1 fix: 测试污染防护 (2026-08-10)
  //   不清空 → embedding/LLM 兜底 → v1.3.15 "topic + 无 key 不注入" 测试 fail
  //   干净环境 (unset MINIMAX_API_KEY BAILIAN_EMBEDDING_API_KEY) 验证: 632/632 全绿
  delete process.env.MINIMAX_API_KEY;
  delete process.env.BAILIAN_EMBEDDING_API_KEY;
  delete process.env.MINIMAX_API_BASE;
  setChannelRuntime(null);
  resetAdapter();
  fakeDb = new FakeGroupDb();
  setAdapterForTest(fakeDb);
  mockAccountRegistry("default", "wpp-wechat", { groupContextEnabled: true });
  mockRuntime = makeMockRuntime();
  setChannelRuntime(mockRuntime);
});

after(() => {
  setChannelRuntime(null);
  resetAdapter();
});

// ===== 核心: 触发时从 DB 查触发人最近消息 (图片直接 MediaUrls) =====
test("v1.2.4 — 触发时 DB 查触发人最近消息 → 注入上下文含图 (MediaUrls)", async () => {
  // 预置 DB: alice 发的图 (enrich 后 content 含 [图片] URL)
  fakeDb.messages.push(dbRecord(makeGroupMsg({
    msgId: "img-1",
    msgType: 3,
    content: "收到一张图片\n[图片] https://oss.example.com/img.jpg",
  })));

  const triggerMsg = makeGroupMsg({ msgId: "g-text", content: "@bot 看看这个" });
  await dispatchInboundToOpenClaw(triggerMsg);

  assert.equal(mockRuntime.recordedSessions.length, 1);
  const ctx = mockRuntime.recordedSessions[0]!.ctx as { Body: string; MediaUrls: string[] };
  assert.ok(ctx.Body.includes("[系统提示-群聊上下文]"), "Body should include group ctx marker");
  assert.ok(ctx.Body.includes("https://oss.example.com/img.jpg"), "Body should include image OSS URL");
  assert.ok(ctx.Body.includes("wxid_alice"), "Body should include sender");
  assert.ok(ctx.MediaUrls.includes("https://oss.example.com/img.jpg"), "MediaUrls should carry image for multimodal");
});

// ===== v1.3.4 群内媒体查询: 不限发送人, 含别人发的媒体 =====
// v1.3.15: 原 topic 触发"看下这个方案"在无 LLM key 下不注入 (不强拉), 改为 media 意图
//   验证"群内媒体不限发送人" (media 兜底只注入媒体, 含 alice/bob 的图)
test("v1.3.4 — 群内媒体查: alice/bob 都有图, 触发看图 → 都注入 (含 bob)", async () => {
  fakeDb.messages.push(dbRecord(makeGroupMsg({
    msgId: "a-1", fromWxid: "wxid_alice", content: "收到一张图片\n[图片] https://oss/a.jpg",
  })));
  fakeDb.messages.push(dbRecord(makeGroupMsg({
    msgId: "b-1", fromWxid: "wxid_bob", fromNickname: "Bob", content: "收到一张图片\n[图片] https://oss/b.jpg",
  })));

  await dispatchInboundToOpenClaw(makeGroupMsg({ msgId: "g-t", fromWxid: "wxid_alice", content: "@bot 看下这个图" }));

  const ctx = mockRuntime.recordedSessions[0]!.ctx as { Body: string };
  assert.ok(ctx.Body.includes("https://oss/a.jpg"), "应注入 alice 的图");
  assert.ok(ctx.Body.includes("https://oss/b.jpg"), "v1.3.4 群内查询应注入 bob 的图 (不限发送人)");
});

// ===== @指定除外 (media 场景): 触发 @wxid_bob 看图 → 群内媒体都注入 =====
test("v1.2.4 — @指定除外: 触发 @wxid_bob 看图 → 群内媒体都注入", async () => {
  fakeDb.messages.push(dbRecord(makeGroupMsg({
    msgId: "a-1", fromWxid: "wxid_alice", content: "收到一张图片\n[图片] https://oss/a.jpg",
  })));
  fakeDb.messages.push(dbRecord(makeGroupMsg({
    msgId: "b-1", fromWxid: "wxid_bob", fromNickname: "Bob", content: "收到一张图片\n[图片] https://oss/b.jpg",
  })));

  await dispatchInboundToOpenClaw(makeGroupMsg({
    msgId: "g-t",
    fromWxid: "wxid_alice",
    content: "@wxid_bob 看图",
  }));

  const ctx = mockRuntime.recordedSessions[0]!.ctx as { Body: string };
  assert.ok(ctx.Body.includes("https://oss/a.jpg"), "应注入 alice 的图");
  assert.ok(ctx.Body.includes("https://oss/b.jpg"), "@指定 bob 看图 → 群内媒体都注入");
});

// ===== 图片 ≤3 张 =====
test("v1.2.4 — 图片≤3 张: DB 5 张图 → 只注入最近 3 张", async () => {
  for (let i = 1; i <= 5; i++) {
    fakeDb.messages.push(dbRecord(makeGroupMsg({
      msgId: `img-${i}`,
      msgType: 3,
      content: `收到一张图片\n[图片] https://oss.example.com/img${i}.jpg`,
      ts: Math.floor(Date.now() / 1000) - (5 - i),
    })));
  }
  await dispatchInboundToOpenClaw(makeGroupMsg({ msgId: "g-t", content: "@bot 看图" }));

  const ctx = mockRuntime.recordedSessions[0]!.ctx as { Body: string };
  for (let i = 3; i <= 5; i++) {
    assert.ok(ctx.Body.includes(`img${i}.jpg`), `应注入 img${i}`);
  }
  for (let i = 1; i <= 2; i++) {
    assert.ok(!ctx.Body.includes(`img${i}.jpg`), `不应注入最旧 img${i}`);
  }
});

// ===== groupContextEnabled=false → 不注入 =====
test("v1.2.4 — groupContextEnabled=false → 不注入群聊上下文", async () => {
  resetAdapter();
  fakeDb = new FakeGroupDb();
  setAdapterForTest(fakeDb);
  mockAccountRegistry("default", "wpp-wechat", { groupContextEnabled: false }); // 默认关
  fakeDb.messages.push(dbRecord(makeGroupMsg({ msgId: "a-1", content: "A-context" })));

  await dispatchInboundToOpenClaw(makeGroupMsg({ msgId: "g-t", content: "@bot 看下这个方案" }));

  const ctx = mockRuntime.recordedSessions[0]!.ctx as { Body: string };
  assert.ok(!ctx.Body.includes("[系统提示-群聊上下文]"), "groupContextEnabled=false → 不注入");
});

// ===== v1.3.14 QUOTE-FORCE-CONTEXT: 引用消息 = 明确指定上下文 (老板拍板) =====

test("v1.3.14 — 触发消息引用 app.reference → 只注入被引用消息 (不看其它上下文)", async () => {
  // 被引用图 (msg_id = app.reference.new_msg_id)
  fakeDb.messages.push(dbRecord(makeGroupMsg({
    msgId: "5739862881048543172",
    msgType: 3,
    content: "收到一张图片\n[图片] https://oss.example.com/quoted.jpg",
  })));
  // 其它无关上下文 (不应注入)
  fakeDb.messages.push(dbRecord(makeGroupMsg({ msgId: "ctx-1", content: "上下文无关A" })));
  fakeDb.messages.push(dbRecord(makeGroupMsg({ msgId: "ctx-2", content: "上下文无关B" })));

  const triggerMsg = makeGroupMsg({
    msgId: "g-quote",
    content: "@bot 这个图里是什么",
    raw: {
      app: { category: "quote", reference: { new_msg_id: "5739862881048543172", svr_id: "x", msg_type: 3 } },
    },
  });
  await dispatchInboundToOpenClaw(triggerMsg);

  const ctx = mockRuntime.recordedSessions[0]!.ctx as { Body: string; MediaUrls: string[] };
  assert.ok(ctx.Body.includes("quoted.jpg"), "应注入被引用图 URL");
  assert.ok(ctx.Body.includes("用户明确引用了以下 1 条消息"), "应标记引用=明确指定");
  assert.ok(!ctx.Body.includes("上下文无关A"), "引用时不应注入其它上下文 A");
  assert.ok(!ctx.Body.includes("上下文无关B"), "引用时不应注入其它上下文 B");
  assert.ok(ctx.MediaUrls.includes("https://oss.example.com/quoted.jpg"), "MediaUrls 应带被引用图");
});

test("v1.3.14 — 引用 reply_context (旧路径) 同样只注入被引用消息", async () => {
  fakeDb.messages.push(dbRecord(makeGroupMsg({
    msgId: "ref-99",
    content: "这是被引用的文本\n引用测试内容",
  })));
  fakeDb.messages.push(dbRecord(makeGroupMsg({ msgId: "ctx-1", content: "不应注入的上下文" })));

  const triggerMsg = makeGroupMsg({
    msgId: "g-quote2",
    content: "@bot 这段文字怎么理解",
    raw: { reply_context: { msg_id: 1, new_msg_id: "ref-99", svr_id: "svr99", msg_type: 1 } },
  });
  await dispatchInboundToOpenClaw(triggerMsg);

  const ctx = mockRuntime.recordedSessions[0]!.ctx as { Body: string };
  assert.ok(ctx.Body.includes("引用测试内容"), "应注入被引用文本内容");
  assert.ok(!ctx.Body.includes("不应注入的上下文"), "引用 reply_context 时不应注入其它上下文");
});

// ===== 群间隔离 (peer_id 过滤, media 场景) =====
test("v1.2.4 — 不同群 DB 隔离 (群 A 媒体不泄漏进群 B)", async () => {
  fakeDb.messages.push(dbRecord(makeGroupMsg({
    msgId: "ga-1",
    chatroomId: "chatA@chatroom",
    peerId: "chatA@chatroom",
    content: "收到一张图片\n[图片] https://oss/a.jpg",
  })));
  fakeDb.messages.push(dbRecord(makeGroupMsg({
    msgId: "gb-1",
    chatroomId: "chatB@chatroom",
    peerId: "chatB@chatroom",
    content: "收到一张图片\n[图片] https://oss/b.jpg",
  })));

  await dispatchInboundToOpenClaw(makeGroupMsg({
    msgId: "ga-t",
    chatroomId: "chatA@chatroom",
    peerId: "chatA@chatroom",
    content: "@bot 看下这个图",
  }));
  const ctx = mockRuntime.recordedSessions[0]!.ctx as { Body: string };
  assert.ok(ctx.Body.includes("https://oss/a.jpg"), "group A should see A media");
  assert.ok(!ctx.Body.includes("https://oss/b.jpg"), "group A should NOT see B media");
});

// ===== v1.3.15 GROUP-CONTEXT-NO-FORCE: topic 不强拉 =====
test("v1.3.15 — topic 意图 + 无 LLM key → 不注入上下文 (不强拉)", async () => {
  fakeDb.messages.push(dbRecord(makeGroupMsg({ msgId: "ctx-1", content: "无关上下文1" })));
  fakeDb.messages.push(dbRecord(makeGroupMsg({ msgId: "ctx-2", content: "无关上下文2" })));

  await dispatchInboundToOpenClaw(makeGroupMsg({ msgId: "g-t", content: "@bot 看下这个方案" }));

  const ctx = mockRuntime.recordedSessions[0]!.ctx as { Body: string };
  assert.ok(!ctx.Body.includes("[系统提示-群聊上下文]"), "topic + 无 key → 不注入上下文");
  assert.ok(!ctx.Body.includes("无关上下文"), "不应注入无关上下文");
  assert.ok(ctx.Body.includes("看下这个方案"), "触发消息本身内容仍在 Body (优先)");
});
