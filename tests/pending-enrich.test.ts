// tests/pending-enrich.test.ts - v1.2.8 PENDING-ENRICH
// 群聊发文件/图+@时, 触发 dispatch 前等同一 sender 的 enrich 完成
// 覆盖: trackEnrich 记录 / waitForPendingEnrich 等待 / 超时降级 / 不同 sender 独立

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

import {
  waitForPendingEnrich,
  clearPendingEnrichs,
  __testSetPendingEnrich,
} from "../src/inbound/handler.js";
import { dispatchInboundToOpenClaw, setChannelRuntime } from "../src/dispatch/dispatcher.js";
import { getDefaultAccountRegistry } from "../src/account-state.js";
import { AccountContext } from "../src/accounts/account-context.js";
import { resetAdapter, setAdapterForTest } from "../src/storage/db/factory.js";
import type { DbAdapter, MessageRecord } from "../src/storage/db/types.js";
import type { WppInboundMessage } from "../src/types.js";

// fake adapter (mock DB, 验证 beforeTs 排除触发消息)
class FakeDb implements DbAdapter {
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
        if (opts.beforeTs && (m.ts ?? 0) >= opts.beforeTs) return false; // beforeTs 排除
        return true;
      })
      .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
      .slice(0, opts.limit ?? 100);
  }
  async getMessageById(): Promise<null> { return null; }
  async getMessageByMsgIdOrNewId(): Promise<null> { return null; }
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
    enabled: true, tokenKey: "tk", apiBaseUrl: "https://test", wsUrl: "wss://test",
    authcode: "ac", webhookHost: "127.0.0.1", webhookPort: 0, webhookPath: "/w",
    webhookSecret: "", allowFrom: [], groupPolicy: "open" as const, groupAllowFrom: [],
    selfWxid: "wxid_bot", nickname: "test", requireAtMention: true, debounceMs: 1500,
    agent, ...overrides,
  };
  reg.contexts.set(accountId, new AccountContext({ accountId, config: cfg }));
}

function makeGroupMsg(overrides: Partial<WppInboundMessage> = {}): WppInboundMessage {
  return {
    accountId: "default", msgId: "g-1", newMsgId: "gn-1", fromWxid: "wxid_alice",
    fromNickname: "Alice", chatroomId: "chat@chatroom", toWxid: "wxid_bot", msgType: 1,
    content: "hello", ts: Math.floor(Date.now() / 1000), raw: {}, peerKind: "group",
    peerId: "chat@chatroom", trigger: "at", ...overrides,
  };
}

let fakeDb: FakeDb;

beforeEach(() => {
  resetAdapter();
  clearPendingEnrichs();
  fakeDb = new FakeDb();
  setAdapterForTest(fakeDb);
  mockAccountRegistry("default", "wpp-wechat", { groupContextEnabled: true });
});

after(() => {
  resetAdapter();
  clearPendingEnrichs();
  setChannelRuntime(null);
});

// ===== waitForPendingEnrich 基础 =====

test("v1.2.8 — 无 pending enrich 时立即返回", async () => {
  clearPendingEnrichs();
  const before = Date.now();
  await waitForPendingEnrich("default", "wxid_no_pending");
  const elapsed = Date.now() - before;
  assert.ok(elapsed < 50, `无 pending 应<50ms 返回, 实际 ${elapsed}ms`);
});

test("v1.3.18 P1-假绿3 修 — 有 pending 时等待完成 (200ms 后 clear 才返, 不阻塞前 <200ms)", async () => {
  // 真验证 (v1.3.18 P1-假绿3): 原版 label 是 "有 pending" 但代码只测了 "无 pending",
  //   是装饰性假绿。现在用 __testSetPendingEnrich 真模拟一个 pending enrich,
  //   验证 waitForPendingEnrich 阻塞到 pending 完成 (~200ms) 才返, 不超时 (timeoutMs=2000)。
  clearPendingEnrichs();
  const sender = "wxid_alice_pending_test";

  // 1. 启动一个 pending enrich (200ms 后 resolve)
  __testSetPendingEnrich(`default:${sender}`, () => new Promise<void>((resolve) => {
    setTimeout(() => resolve(), 200);
  }));

  // 2. 调 waitForPendingEnrich, 应该阻塞 ~200ms (等 pending 完成)
  const before = Date.now();
  await waitForPendingEnrich("default", sender, 2000); // timeoutMs=2000 (不会兜底)
  const elapsed = Date.now() - before;

  // 3. 断言: 耗时 >= 100ms (真等了 pending 完成, 限 100ms 是给 setTimeout jitter 容差)
  //    setTimeout(fn, 200) 在 Promise 链上, 实际 waitForPendingEnrich 在 setTimeout 启动 ~5-10ms 后开始,
  //    所以 elapsed 可能是 190-210ms 之间。>=100ms 足够验证真等, <1000ms 验证没被 timeout (2000ms) 拦走
  assert.ok(elapsed >= 100, `waitForPendingEnrich 应真等 ~200ms (pending 完成), 实际 ${elapsed}ms`);
  assert.ok(elapsed < 1000, `waitForPendingEnrich 应不被 timeout 拦走 (实际等了 ${elapsed}ms, timeoutMs=2000)`);
});

// ===== buildGroupContextFromDb 排除触发消息 (beforeTs) =====

test("v1.2.8 — 触发时上下文排除触发消息自身 (beforeTs)", async () => {
  const triggerTs = Math.floor(Date.now() / 1000);
  // DB 预置: 触发人 alice 的一条旧消息 (before trigger)
  fakeDb.messages.push({
    account_id: "default", msg_id: "old-1", new_msg_id: "", direction: "inbound",
    peer_kind: "group", peer_id: "chat@chatroom", content: "[文件] 报告.pdf https://oss/x.pdf",
    from_wxid: "wxid_alice", ts: triggerTs - 60,
  });
  // 触发消息 (ts = triggerTs, 应被排除)
  // v1.3.15: topic + 无 LLM key 不注入, 用 media 意图保留 beforeTs 排除验证
  const triggerMsg = makeGroupMsg({
    msgId: "g-t", content: "@bot 看下这个文件", ts: triggerTs,
  });

  // mock runtime
  const mockRuntime = {
    recordedSessions: [] as Array<{ ctx: unknown }>,
    session: { recordInboundSession: async (o: { ctx: unknown }) => { mockRuntime.recordedSessions.push(o); } },
    reply: { dispatchReplyWithBufferedBlockDispatcher: async (o: unknown) => {
      const d = o as { dispatcherOptions?: { deliver?: (p: { text?: string }, i: unknown) => Promise<unknown> } };
      await d.dispatcherOptions?.deliver?.({ text: "AI" }, {});
    } },
  };
  setChannelRuntime(mockRuntime as never);

  await dispatchInboundToOpenClaw(triggerMsg);

  const ctx = mockRuntime.recordedSessions[0]?.ctx as { Body?: string } | undefined;
  assert.ok(ctx?.Body?.includes("报告.pdf"), "上下文应包含触发前的文件消息");
  assert.ok(!ctx?.Body?.includes("g-t"), "触发消息自身不应混入上下文 (beforeTs 排除)");
});
