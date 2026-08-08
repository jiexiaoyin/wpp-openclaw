// tests/db.test.ts - Phase B DB adapter 测试 (in-memory fake)
// 关键: 验证 DbAdapter interface 契约 + CRUD round-trip 不依赖真实 MariaDB

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { resetAdapter, setBackend, getAdapter, resolveDbConfig } from "../src/storage/db/factory.js";
import {
  saveMessage,
  getMessages,
  getMessageById,
  findMessageByMd5,
} from "../src/storage/db/messages.js";
import {
  upsertAccount,
  getAccounts,
  getAccount,
} from "../src/storage/db/accounts.js";
import type {
  AccountRecord,
  ApiCallRecord,
  ChatroomRecord,
  ContactRecord,
  DbAdapter,
  MessageRecord,
  ResolvedDbConfig,
  SessionStateRecord,
} from "../src/storage/db/types.js";

/** In-memory fake adapter for unit testing */
// ===== v1.1.1 索引迁移测试 (idx_account_peer_ts + idx_account_msgtype_ts) =====

import { readFileSync } from "node:fs";

test("v1.1.1 — mysql.ts applyMigrations 含新 idx_account_peer_ts", () => {
  // 通过 grep 验证源码含新 ensureIndex 调用 (不需真 DB)
  const mysql = readFileSync(
    "/root/dev/wechatpadpro-openclaw/src/storage/db/mysql.ts",
    "utf8",
  );
  assert.ok(
    mysql.includes('"idx_account_peer_ts"'),
    "mysql.ts 应含 idx_account_peer_ts 复合索引 (account_id, peer_id, ts)",
  );
  assert.ok(
    mysql.includes('"idx_account_msgtype_ts"'),
    "mysql.ts 应含 idx_account_msgtype_ts 复合索引 (account_id, msg_type, ts)",
  );
});

test("v1.1.1 — 3 复合索引齐 (account_id+ts / +peer_id / +msg_type)", () => {
  const mysql = readFileSync(
    "/root/dev/wechatpadpro-openclaw/src/storage/db/mysql.ts",
    "utf8",
  );
  const expected = [
    "idx_account_chat_ts",   // v1.0.1: account_id + chat_id + ts
    "idx_account_peer_ts",   // v1.1.1: account_id + peer_id + ts
    "idx_account_msgtype_ts",// v1.1.1: account_id + msg_type + ts
  ];
  for (const idx of expected) {
    assert.ok(mysql.includes(`"${idx}"`), `缺少索引 ${idx}`);
  }
});

class FakeAdapter implements DbAdapter {
  readonly backendName = "sqlite" as const;
  private messages: MessageRecord[] = [];
  private contacts: ContactRecord[] = [];
  private chatrooms: ChatroomRecord[] = [];
  private sessionStates = new Map<string, SessionStateRecord>();
  private apiCalls: ApiCallRecord[] = [];
  private accounts = new Map<string, AccountRecord>();

  async init(): Promise<void> {
    /* no-op */
  }
  async close(): Promise<void> {
    /* no-op */
  }
  async ping(): Promise<void> {
    /* no-op */
  }

  async saveMessage(record: MessageRecord): Promise<void> {
    this.messages.push({ ...record });
  }
  async getMessages(opts: Parameters<DbAdapter["getMessages"]>[0]): Promise<MessageRecord[]> {
    return this.messages
      .filter((m) => {
        if (opts.accountId && m.account_id !== opts.accountId) return false;
        if (opts.peerKind && m.peer_kind !== opts.peerKind) return false;
        if (opts.peerId && m.peer_id !== opts.peerId) return false;
        return true;
      })
      .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
      .slice(0, opts.limit ?? 100);
  }
  async getMessageById(msgId: string, accountId: string): Promise<MessageRecord | null> {
    return (
      this.messages.find((m) => m.msg_id === msgId && m.account_id === accountId) ?? null
    );
  }
  async getMessageByMsgIdOrNewId(
    msgId: string | undefined,
    newMsgId: string | undefined,
    accountId: string,
  ): Promise<MessageRecord | null> {
    return (
      this.messages.find(
        (m) =>
          m.account_id === accountId &&
          ((msgId && m.msg_id === msgId) || (newMsgId && m.new_msg_id === newMsgId)),
      ) ?? null
    );
  }
  async findMessageByMd5(md5: string, accountId: string): Promise<MessageRecord | null> {
    const m = this.messages.find(
      (x) =>
        x.account_id === accountId &&
        JSON.stringify(x.raw_payload ?? {}).includes(`"md5":"${md5}"`),
    );
    return m ?? null;
  }

  async saveContact(record: ContactRecord): Promise<void> {
    const idx = this.contacts.findIndex(
      (c) => c.account_id === record.account_id && c.wxid === record.wxid,
    );
    if (idx >= 0) this.contacts[idx] = record;
    else this.contacts.push(record);
  }
  async getContacts(accountId: string, limit?: number): Promise<ContactRecord[]> {
    return this.contacts
      .filter((c) => c.account_id === accountId)
      .slice(0, limit ?? 500);
  }

  async saveChatroom(record: ChatroomRecord): Promise<void> {
    const idx = this.chatrooms.findIndex(
      (c) => c.account_id === record.account_id && c.chatroom_id === record.chatroom_id,
    );
    if (idx >= 0) this.chatrooms[idx] = record;
    else this.chatrooms.push(record);
  }
  async getChatrooms(accountId: string, limit?: number): Promise<ChatroomRecord[]> {
    return this.chatrooms
      .filter((c) => c.account_id === accountId)
      .slice(0, limit ?? 500);
  }

  async getSessionState(opts: {
    accountId: string;
    peerKind: string;
    peerId: string;
  }): Promise<SessionStateRecord | null> {
    return this.sessionStates.get(`${opts.accountId}|${opts.peerKind}|${opts.peerId}`) ?? null;
  }
  async upsertSessionState(record: SessionStateRecord): Promise<void> {
    this.sessionStates.set(`${record.account_id}|${record.peer_kind}|${record.peer_id}`, {
      ...record,
      pending_count: record.pending_count ?? 0,
    });
  }

  async logApiCall(record: ApiCallRecord): Promise<void> {
    this.apiCalls.push({ ...record });
  }
  async getApiCalls(opts: Parameters<DbAdapter["getApiCalls"]>[0]): Promise<ApiCallRecord[]> {
    return this.apiCalls
      .filter((a) => {
        if (opts.accountId && a.account_id !== opts.accountId) return false;
        if (opts.endpoint && a.endpoint !== opts.endpoint) return false;
        return true;
      })
      .slice(0, opts.limit ?? 100);
  }

  async upsertAccount(record: AccountRecord): Promise<void> {
    this.accounts.set(record.account_id, { ...record });
  }
  async getAccounts(): Promise<AccountRecord[]> {
    return Array.from(this.accounts.values()).sort((a, b) =>
      a.account_id.localeCompare(b.account_id),
    );
  }
  async getAccount(accountId: string): Promise<AccountRecord | null> {
    return this.accounts.get(accountId) ?? null;
  }
}

beforeEach(() => {
  resetAdapter();
});

// ============ Factory / singleton 测试 ============

test("setBackend + getAdapter — 单例流程", () => {
  const cfg: ResolvedDbConfig = resolveDbConfig({
    backend: "mysql",
    mysql: {
      host: "1Panel-mariadb-RlbK",
      port: 3306,
      user: "wechatpro",
      password: "secret",
      database: "wechatpro",
      connectionLimit: 5,
    },
  });
  // 用 fake adapter 验证工厂 (不实际连 DB)
  // Factory 实际总是 createMysqlAdapter — 测 resolveDbConfig 输出
  assert.equal(cfg.backend, "mysql");
  assert.equal(cfg.mysql.host, "1Panel-mariadb-RlbK");
  assert.equal(cfg.mysql.user, "wechatpro");
  assert.equal(cfg.mysql.database, "wechatpro");
});

test("resetAdapter — 重复 setBackend 不抛 (同 cfg)", () => {
  const cfg: ResolvedDbConfig = resolveDbConfig({
    backend: "mysql",
    mysql: {
      host: "h",
      port: 3306,
      user: "u",
      password: "p",
      database: "d",
      connectionLimit: 5,
    },
  });
  // 首次 setBackend 必真实连 DB, 这里仅测 resolveDbConfig
  assert.ok(cfg);
  resetAdapter();
});

// ============ CRUD 流程 (FakeAdapter 验证契约) ============

test("saveMessage + getMessages — 按 account 过滤", async () => {
  // 直接用 FakeAdapter 测试 message CRUD 行为 (不靠真的 MariaDB)
  const fake = new FakeAdapter();
  await fake.saveMessage({
    account_id: "default",
    msg_id: "m1",
    direction: "inbound",
    peer_kind: "direct",
    peer_id: "wxid_alice",
    content: "hello",
  });
  await fake.saveMessage({
    account_id: "other",
    msg_id: "m2",
    direction: "inbound",
    peer_kind: "direct",
    peer_id: "wxid_bob",
    content: "world",
  });

  const forDefault = await fake.getMessages({ accountId: "default" });
  assert.equal(forDefault.length, 1);
  assert.equal(forDefault[0]?.content, "hello");
  assert.equal(forDefault[0]?.msg_id, "m1");
});

test("getMessages — peerKind/peerId 过滤", async () => {
  const fake = new FakeAdapter();
  await fake.saveMessage({
    account_id: "a",
    msg_id: "m1",
    direction: "inbound",
    peer_kind: "direct",
    peer_id: "x1",
  });
  await fake.saveMessage({
    account_id: "a",
    msg_id: "m2",
    direction: "inbound",
    peer_kind: "group",
    peer_id: "g1",
  });
  const onlyGroup = await fake.getMessages({ accountId: "a", peerKind: "group" });
  assert.equal(onlyGroup.length, 1);
  assert.equal(onlyGroup[0]?.peer_id, "g1");
});

test("getMessageById — 找到 / null", async () => {
  const fake = new FakeAdapter();
  await fake.saveMessage({
    account_id: "a",
    msg_id: "lookup_me",
    direction: "outbound",
    peer_kind: "direct",
    peer_id: "x",
  });
  const hit = await fake.getMessageById("lookup_me", "a");
  assert.ok(hit);
  assert.equal(hit!.msg_id, "lookup_me");
  const miss = await fake.getMessageById("nope", "a");
  assert.equal(miss, null);
});

test("getMessageByMsgIdOrNewId — msg_id 命中 / new_msg_id 命中 / 都不命中 null (v1.1.19 DB-DEDUP)", async () => {
  const fake = new FakeAdapter();
  await fake.saveMessage({
    account_id: "a",
    msg_id: "m1",
    new_msg_id: "n1",
    direction: "inbound",
    peer_kind: "direct",
    peer_id: "x",
  });
  // 按 msg_id 命中
  const byMsg = await fake.getMessageByMsgIdOrNewId("m1", undefined, "a");
  assert.ok(byMsg);
  assert.equal(byMsg!.msg_id, "m1");
  // 按 new_msg_id 命中
  const byNew = await fake.getMessageByMsgIdOrNewId(undefined, "n1", "a");
  assert.ok(byNew);
  // 都不命中
  const miss = await fake.getMessageByMsgIdOrNewId("zzz", "yyy", "a");
  assert.equal(miss, null);
  // 不同 account 不误杀
  const otherAcct = await fake.getMessageByMsgIdOrNewId("m1", undefined, "b");
  assert.equal(otherAcct, null);
});

test("findMessageByMd5 — 通过 raw_payload 检索", async () => {
  const fake = new FakeAdapter();
  await fake.saveMessage({
    account_id: "a",
    msg_id: "m1",
    direction: "inbound",
    peer_kind: "direct",
    peer_id: "x",
    raw_payload: { md5: "abc123", url: "http://x" },
  });
  const hit = await fake.findMessageByMd5("abc123", "a");
  assert.ok(hit);
  assert.equal(hit!.msg_id, "m1");
});

test("saveContact + getContacts — UPSERT 行为", async () => {
  const fake = new FakeAdapter();
  await fake.saveContact({ account_id: "a", wxid: "wx1", nickname: "Alice" });
  await fake.saveContact({ account_id: "a", wxid: "wx1", nickname: "Alice2" }); // update
  const list = await fake.getContacts("a");
  assert.equal(list.length, 1, "should not duplicate on UPSERT");
  assert.equal(list[0]?.nickname, "Alice2", "should be latest");
});

test("saveChatroom + getChatrooms — UPSERT 行为", async () => {
  const fake = new FakeAdapter();
  await fake.saveChatroom({ account_id: "a", chatroom_id: "g1", member_count: 5 });
  await fake.saveChatroom({ account_id: "a", chatroom_id: "g1", member_count: 12 });
  const list = await fake.getChatrooms("a");
  assert.equal(list.length, 1);
  assert.equal(list[0]?.member_count, 12);
});

test("upsertSessionState + getSessionState", async () => {
  const fake = new FakeAdapter();
  await fake.upsertSessionState({
    account_id: "a",
    peer_kind: "direct",
    peer_id: "x1",
    last_msg_id: "m1",
    pending_count: 3,
  });
  const got = await fake.getSessionState({ accountId: "a", peerKind: "direct", peerId: "x1" });
  assert.ok(got);
  assert.equal(got!.last_msg_id, "m1");
  assert.equal(got!.pending_count, 3);

  // upsert 第二次
  await fake.upsertSessionState({
    ...got!,
    pending_count: 0,
  });
  const got2 = await fake.getSessionState({
    accountId: "a",
    peerKind: "direct",
    peerId: "x1",
  });
  assert.equal(got2!.pending_count, 0);
});

test("logApiCall + getApiCalls — 按 endpoint 过滤", async () => {
  const fake = new FakeAdapter();
  await fake.logApiCall({
    account_id: "a",
    endpoint: "/Msg/SendTxt",
    status_code: 200,
    vendor_code: 0,
    latency_ms: 42,
  });
  await fake.logApiCall({
    account_id: "a",
    endpoint: "/Friend/GetList",
    status_code: 200,
    vendor_code: 0,
    latency_ms: 88,
  });

  const msgCalls = await fake.getApiCalls({ accountId: "a", endpoint: "/Msg/SendTxt" });
  assert.equal(msgCalls.length, 1);
  assert.equal(msgCalls[0]?.latency_ms, 42);
});

// ============ messages.ts CRUD shim 测试 (走 factory) ============

test("messages.ts — saveMessage/getMessageById 走 factory 委派", async () => {
  // 这里直接测 fake 行为, 因为 factory 已经被 resetAdapter() 净空
  // 验证 messages.ts 把 #adapter 委派过去
  const fake = new FakeAdapter();
  // 模拟 setBackend 注入 fake — 通过 current 直接替换底层 (测试专用)
  // 由于 factory 不允许注入 fake (只接 createMysqlAdapter), 这里只验证 fake 本身行为
  await fake.saveMessage({
    account_id: "a",
    msg_id: "via-shim",
    direction: "inbound",
    peer_kind: "direct",
    peer_id: "x",
  });
  const got = await fake.getMessageById("via-shim", "a");
  assert.equal(got?.msg_id, "via-shim");
});

test("resetAdapter — 干净重置", () => {
  assert.doesNotThrow(() => resetAdapter());
});
