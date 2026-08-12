// tests/v1.3.18-core-correctness.test.ts
// v1.3.18 三组核心 + 正确性 fix 测试 (2026-08-10 接总立)
//   P1-核心1: 13 meta 文件 lazy-evaluate ctx (execute 时拿真 baseUrl/tokenKey)
//   P1-核心3 + F2: outbound.ts isSendOk 双重判据 (Code + BaseResponse.ret) + sendImage 顺序
//   P1-核心2: getMessageByMsgIdOrNewId direction 参数化 (引用解析可查 outbound)

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

import { AGENT_TOOLS } from "../src/dispatch/agent-tools/index.js";
import { resetDefaultRegistry, getDefaultAccountRegistry } from "../src/account-state.js";
import { sendImage } from "../src/dispatch/outbound.js";
import { resetAdapter, setAdapterForTest } from "../src/storage/db/factory.js";
import type { DbAdapter, MessageRecord } from "../src/storage/db/types.js";

// ===== fake DB adapter (捕获 saveMessage, 模拟 getMessageByMsgIdOrNewId) =====
class FakeDb implements DbAdapter {
  readonly backendName = "sqlite" as const;
  saved: MessageRecord[] = [];
  /** mock data for getMessageByMsgIdOrNewId — 按 (msgId|newMsgId) 索引 */
  records: MessageRecord[] = [];
  async init(): Promise<void> {}
  async close(): Promise<void> {}
  async ping(): Promise<void> {}
  async saveMessage(record: MessageRecord): Promise<void> {
    this.saved.push(record);
  }
  async getMessages(): Promise<never[]> { return []; }
  async getMessageById(): Promise<null> { return null; }
  async getMessageByMsgIdOrNewId(
    msgId: string | undefined,
    newMsgId: string | undefined,
    _accountId: string,
    opts?: { direction?: "inbound" | "outbound" | "any" },
  ): Promise<MessageRecord | null> {
    const dir = opts?.direction ?? "inbound";
    for (const r of this.records) {
      const idMatch = (msgId && r.msg_id === msgId) || (newMsgId && r.new_msg_id === newMsgId);
      if (!idMatch) continue;
      if (dir === "any") return r;
      if (r.direction === dir) return r;
    }
    return null;
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

let fakeDb: FakeDb;

beforeEach(() => {
  resetDefaultRegistry();
  resetAdapter();
  fakeDb = new FakeDb();
  setAdapterForTest(fakeDb);
});

after(() => {
  resetAdapter();
});

// ============ P1-核心1: agent tools 真 ctx ============

test("v1.3.18 P1-核心1 fix — agent tools 真 ctx: 已注册账号 → tool execute 用真 baseUrl/tokenKey (非空 ctx)", async () => {
  // 注册一个真账号到 default registry
  await getDefaultAccountRegistry().start("default", {
    enabled: true,
    tokenKey: "real-token-key",
    apiBaseUrl: "http://real-vendor:8062",
    wsUrl: "ws://real-vendor:8062/ws",
    authcode: "real-authcode",
    webhookHost: "127.0.0.1",
    webhookPort: 8099,
    webhookPath: "/wpp/webhook",
    webhookSecret: "s",
    allowFrom: ["*"],
    groupPolicy: "open",
    groupAllowFrom: [],
    selfWxid: "wxid_bot",
    nickname: "bot",
    requireAtMention: true,
    debounceMs: 1500,
  });

  // AGENT_TOOLS 应该都已 build (不是空)
  assert.ok(AGENT_TOOLS.length > 0, "AGENT_TOOLS 应该已 build");

  // 找一个工具 → execute → 应该尝试调 vendor, 拿到真 ctx (fetch 会失败但 error 含真 baseUrl, 不含 empty)
  const getContractList = AGENT_TOOLS.find((t) => t.name === "getContactList");
  assert.ok(getContractList, "getContactList 工具应存在");
  const r = await getContractList!.execute("call-1", {});
  const text = r.content[0]?.text ?? "";

  // 错误信息应含真 ctx (registry 真账号)
  //   "Error: fetch failed" — 真 URL
  //   不含 "account_id=\"\"" (那是空 ctx 入库的标志)
  assert.ok(!text.includes("account_id=\"\""), `error 不应含 account_id="" (空 ctx 入库标志): ${text.slice(0, 200)}`);
});

test("v1.3.18 P1-核心1 fix — agent tools: 未注册账号 → throw 明确 error (不静默失败)", async () => {
  // 没注册 default 账号 → getMsgApi() 应该 throw
  const getChatRoomInfo = AGENT_TOOLS.find((t) => t.name === "getChatroomInfo");
  assert.ok(getChatRoomInfo, "getChatroomInfo 工具应存在");
  const r = await getChatRoomInfo!.execute("call-1", { QID: "test@chatroom" });
  const text = r.content[0]?.text ?? "";
  assert.ok(text.includes("account not found"), `应含 "account not found": ${text}`);
});

// ============ P1-核心3 + F2: outbound isSendOk + sendImage 顺序 ============

test("v1.3.18 P1-核心3 fix — sendImage: vendor Code=0 + BaseResponse.ret=-2 → ok:false (不是误报成功)", async () => {
  await getDefaultAccountRegistry().start("default", {
    enabled: true,
    tokenKey: "t",
    apiBaseUrl: "http://127.0.0.1:1", // 无效地址
    wsUrl: "ws://127.0.0.1:1/ws",
    authcode: "",
    webhookHost: "127.0.0.1",
    webhookPort: 8099,
    webhookPath: "/wpp/webhook",
    webhookSecret: "s",
    allowFrom: ["*"],
    groupPolicy: "open",
    groupAllowFrom: [],
    selfWxid: "wxid_b",
    nickname: "b",
    requireAtMention: true,
    debounceMs: 1500,
  });

  // 注入 mock apiClient 返 Code=0 + BaseResponse.ret=-2 (vendor 真实失败模式)
  const state = getDefaultAccountRegistry().get("default");
  assert.ok(state);
  state!.apiClient.sendImage = async () => ({
    Code: 0,
    CodeValue: "OK",
    Data: { BaseResponse: { ret: -2, errMsg: { string: "vendor reject" } }, msgId: 999, newMsgId: 998 },
    raw: null,
  });

  const r = await sendImage("default", "wxid_alice", "http://x/y.jpg");
  assert.equal(r.ok, false, "Code=0 + ret=-2 应判 ok:false (不是误报成功)");
  assert.match(r.error!, /ret=-2/);

  // F2 fix: 失败不入库 (之前先 persist 后判)
  assert.equal(fakeDb.saved.length, 0, `失败不应入库, 但 saved=${JSON.stringify(fakeDb.saved)}`);
});

test("v1.3.18 P1-核心3 fix — sendImage: vendor Code=0 + BaseResponse.ret=0 → ok:true + 入库", async () => {
  await getDefaultAccountRegistry().start("default", {
    enabled: true,
    tokenKey: "t",
    apiBaseUrl: "http://127.0.0.1:1",
    wsUrl: "ws://127.0.0.1:1/ws",
    authcode: "",
    webhookHost: "127.0.0.1",
    webhookPort: 8099,
    webhookPath: "/wpp/webhook",
    webhookSecret: "s",
    allowFrom: ["*"],
    groupPolicy: "open",
    groupAllowFrom: [],
    selfWxid: "wxid_b",
    nickname: "b",
    requireAtMention: true,
    debounceMs: 1500,
  });
  const state = getDefaultAccountRegistry().get("default");
  assert.ok(state);
  state!.apiClient.sendImage = async () => ({
    Code: 0,
    Data: { BaseResponse: { ret: 0 }, msgId: 111, newMsgId: 222 },
    raw: null,
  });

  const r = await sendImage("default", "wxid_alice", "http://x/y.jpg");
  assert.equal(r.ok, true, `应 ok:true, got: ${JSON.stringify(r)}`);
  assert.equal(String(r.msgId), "111");
  assert.equal(fakeDb.saved.length, 1, "成功应入库");
  assert.equal(fakeDb.saved[0]?.account_id, "default");
  assert.equal(fakeDb.saved[0]?.direction, "outbound");
  assert.equal(fakeDb.saved[0]?.msg_type, "image");
});

test("v1.3.18 P1-核心3 fix — sendImage: 缺 BaseResponse (老 vendor) → 兜底按成功处理", async () => {
  await getDefaultAccountRegistry().start("default", {
    enabled: true,
    tokenKey: "t",
    apiBaseUrl: "http://127.0.0.1:1",
    wsUrl: "ws://127.0.0.1:1/ws",
    authcode: "",
    webhookHost: "127.0.0.1",
    webhookPort: 8099,
    webhookPath: "/wpp/webhook",
    webhookSecret: "s",
    allowFrom: ["*"],
    groupPolicy: "open",
    groupAllowFrom: [],
    selfWxid: "wxid_b",
    nickname: "b",
    requireAtMention: true,
    debounceMs: 1500,
  });
  const state = getDefaultAccountRegistry().get("default");
  assert.ok(state);
  state!.apiClient.sendImage = async () => ({
    Code: 0,
    Data: { msgId: 333, newMsgId: 444 }, // 无 BaseResponse
    raw: null,
  });

  const r = await sendImage("default", "wxid_alice", "http://x/y.jpg");
  assert.equal(r.ok, true, `缺 BaseResponse 应兜底成功: ${JSON.stringify(r)}`);
  assert.equal(String(r.msgId), "333");
});

// ============ P1-核心2: getMessageByMsgIdOrNewId direction ============

test("v1.3.18 P1-核心2 fix — getMessageByMsgIdOrNewId: 默认 (无 opts) → 只查 inbound", async () => {
  fakeDb.records = [
    { account_id: "default", msg_id: "m-1", new_msg_id: "nm-1", direction: "inbound", peer_kind: "direct", peer_id: "wxid_alice", content: "inbound msg" },
    { account_id: "default", msg_id: "m-2", new_msg_id: "nm-2", direction: "outbound", peer_kind: "direct", peer_id: "wxid_alice", content: "outbound msg" },
  ];
  const adapter = fakeDb as unknown as DbAdapter;
  // 默认 inbound (向后兼容, dedup 路径)
  const r1 = await adapter.getMessageByMsgIdOrNewId("m-1", undefined, "default");
  assert.equal(r1?.direction, "inbound");
  // 默认 inbound, 查 m-2 (outbound) 应返 null
  const r2 = await adapter.getMessageByMsgIdOrNewId("m-2", undefined, "default");
  assert.equal(r2, null);
});

test("v1.3.18 P1-核心2 fix — getMessageByMsgIdOrNewId: direction=any → 查到 outbound (引用 bot 自己消息)", async () => {
  fakeDb.records = [
    { account_id: "default", msg_id: "m-1", new_msg_id: "nm-1", direction: "inbound", peer_kind: "direct", peer_id: "wxid_alice", content: "inbound msg" },
    { account_id: "default", msg_id: "m-2", new_msg_id: "nm-2", direction: "outbound", peer_kind: "direct", peer_id: "wxid_alice", content: "outbound msg" },
  ];
  const adapter = fakeDb as unknown as DbAdapter;
  // direction=any (引用解析路径)
  const r = await adapter.getMessageByMsgIdOrNewId("m-2", undefined, "default", { direction: "any" });
  assert.ok(r, "direction=any 应能找到 outbound 消息");
  assert.equal(r?.direction, "outbound");
  assert.equal(r?.content, "outbound msg");
});

test("v1.3.18 P1-核心2 fix — getMessageByMsgIdOrNewId: direction=outbound → 只查 outbound", async () => {
  fakeDb.records = [
    { account_id: "default", msg_id: "m-1", new_msg_id: "nm-1", direction: "inbound", peer_kind: "direct", peer_id: "wxid_alice", content: "inbound" },
    { account_id: "default", msg_id: "m-2", new_msg_id: "nm-2", direction: "outbound", peer_kind: "direct", peer_id: "wxid_alice", content: "outbound" },
  ];
  const adapter = fakeDb as unknown as DbAdapter;
  // 查 m-1 inbound) → null (指定 outbound)
  const r1 = await adapter.getMessageByMsgIdOrNewId("m-1", undefined, "default", { direction: "outbound" });
  assert.equal(r1, null);
  // 查 m-2 outbound) → 命中
  const r2 = await adapter.getMessageByMsgIdOrNewId("m-2", undefined, "default", { direction: "outbound" });
  assert.equal(r2?.direction, "outbound");
});

test("v1.3.18 P1-核心2 fix — getMessageByMsgIdOrNewId: 都缺 id → null (不查)", async () => {
  const adapter = fakeDb as unknown as DbAdapter;
  const r = await adapter.getMessageByMsgIdOrNewId(undefined, undefined, "default", { direction: "any" });
  assert.equal(r, null);
});