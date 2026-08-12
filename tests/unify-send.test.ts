// tests/unify-send.test.ts - v1.3.19 UNIFY-SEND 双实现收口
// 验证: (1) api-client 委托到 send/ 层 (sendText→msg.sendTxt, sendImage→msg.sendImage)
//       (2) persist 参数: api-client 委托时 persist:false (防双入库, outbound persistOutbound 负责)
//       (3) msg.sendImage 新方法 (URL/base64 → base64 → /Msg/UploadImg)
// 用 undici MockAgent mock vendor HTTP, 捕获请求体验证行为。

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";

import { WechatpadproApiClient } from "../src/api-client.js";
import { makeWppMsg } from "../src/send/msg.js";
import { resetAdapter, setAdapterForTest } from "../src/storage/db/factory.js";
import type { DbAdapter, MessageRecord } from "../src/storage/db/types.js";

const MOCK_ORIGIN = "https://mock-unify.test";
const MOCK_CFG = {
  enabled: true,
  tokenKey: "tk",
  apiBaseUrl: MOCK_ORIGIN,
  wsUrl: "wss://mock-unify.test/ws",
  authcode: "ac",
  webhookHost: "127.0.0.1",
  webhookPort: 0,
  webhookPath: "/w",
  webhookSecret: "",
  allowFrom: [],
  groupPolicy: "open" as const,
  groupAllowFrom: [],
  selfWxid: "wxid_bot",
  nickname: "test",
  requireAtMention: true,
  debounceMs: 1500,
  agent: "wpp-wechat",
};

// fake adapter 捕获 saveMessage (验证入库行为)
class FakeDb implements DbAdapter {
  readonly backendName = "sqlite" as const;
  saved: MessageRecord[] = [];
  async init(): Promise<void> {}
  async close(): Promise<void> {}
  async ping(): Promise<void> {}
  async saveMessage(record: MessageRecord): Promise<void> { this.saved.push(record); }
  async getMessages(): Promise<never[]> { return []; }
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

let mockAgent: MockAgent;
let realDispatcher: ReturnType<typeof getGlobalDispatcher>;
const requests: Array<{ path: string; body: string }> = [];

before(() => {
  realDispatcher = getGlobalDispatcher();
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
});

after(() => {
  setGlobalDispatcher(realDispatcher);
  resetAdapter();
});

beforeEach(() => {
  requests.length = 0;
  resetAdapter();
  const fakeDb = new FakeDb();
  setAdapterForTest(fakeDb);
  // 默认: 所有 POST 返回 Code:0 (捕获请求体)
  mockAgent
    .get(MOCK_ORIGIN)
    .intercept({ method: "POST", path: (p: string) => p.startsWith("/api/") })
    .reply(200, (ctx) => {
      requests.push({ path: ctx.path, body: ctx.body as string });
      return JSON.stringify({ Code: 0, Data: { msgId: 111, newMsgId: "222" } });
    })
    .persist();
});

// ===== 委托正确性 =====

test("v1.3.19 — apiClient.sendText 委托 msg.sendTxt (→/Msg/SendTxt, persist:false 不入库)", async () => {
  const client = new WechatpadproApiClient(MOCK_CFG);
  const r = await client.sendText("wxid_a", "hello", ["wxid_b"]);
  assert.equal(r.Code, 0);
  // 请求体含 Content + At 逗号串 + Type:1
  const req = requests[0]!;
  assert.ok(req.path.includes("/api/Msg/SendTxt"), `expected SendTxt, got ${req.path}`);
  const body = JSON.parse(req.body);
  assert.equal(body.Content, "hello");
  assert.equal(body.At, "wxid_b");
  assert.equal(body.Type, 1);
});

test("v1.3.19 — apiClient.sendImage 委托 msg.sendImage (base64 → /Msg/UploadImg, persist:false)", async () => {
  const client = new WechatpadproApiClient(MOCK_CFG);
  const b64 = "aGVsbG8td29ybGQ="; // 已是纯 base64
  const r = await client.sendImage("wxid_a", b64);
  assert.equal(r.Code, 0);
  const req = requests[0]!;
  assert.ok(req.path.includes("/api/Msg/UploadImg"), `expected UploadImg, got ${req.path}`);
  const body = JSON.parse(req.body);
  assert.equal(body.Base64, b64);
});

test("v1.3.19 + v1.3.52 — apiClient.sendVoice 委托 msg.sendVoice (silk 透传 Type=4)", async () => {
  // v1.3.52 SILK-ONLY: vendor /Msg/SendVoice 只收 silk (Type=4)。silk 输入直接透传, mp3 走转码。
  // 用 data:audio/silk 输入避免网络下载 + 验证 Type=4
  const client = new WechatpadproApiClient(MOCK_CFG);
  const b64 = "aGVsbG8td29ybGQ=";
  const r = await client.sendVoice("wxid_a", `data:audio/silk;base64,${b64}`, 3000);
  assert.equal(r.Code, 0);
  const req = requests[0]!;
  assert.ok(req.path.includes("/api/Msg/SendVoice"), `expected SendVoice, got ${req.path}`);
  const body = JSON.parse(req.body);
  assert.equal(body.Base64, b64);
  assert.equal(body.Type, 4);
  assert.equal(body.VoiceTime, 3000);
});

test("v1.3.53 — apiClient.sendVoice 非法输入 → 降级文件也失败返 Code=-2 (不直传 vendor)", async () => {
  // v1.3.53 VOICE-DEGRADE: mp3 转 silk 失败 → 降级发文件; 文件降级也失败 → 返 Code=-2 (绝不调 /Msg/SendVoice)
  const client = new WechatpadproApiClient(MOCK_CFG);
  const r = await client.sendVoice("wxid_a", "not-a-valid-mp3-input");
  assert.equal(r.Code, -2);
  assert.equal(requests.length, 0, "转码/降级失败不应调 vendor /Msg/SendVoice");
});

test("v1.3.19 — msg.sendImage (makeWppMsg 默认 persist:true → 收口入库)", async () => {
  const fakeDb = (() => {
    const d = new FakeDb();
    setAdapterForTest(d);
    return d;
  })();
  const api = makeWppMsg({ baseUrl: MOCK_ORIGIN, tokenKey: "tk", authcode: "ac", accountId: "default" });
  await api.sendImage("wxid_a", "aGVsbG8td29ybGQ=");
  // dispatch 收口 → persistOutboundMsg 入库 (agent-tools 场景)
  assert.equal(fakeDb.saved.length, 1, "makeWppMsg 默认 persist:true 应入库");
  assert.equal(fakeDb.saved[0]!.account_id, "default");
  assert.equal(fakeDb.saved[0]!.msg_type, "image");
});

test("v1.3.19 — apiClient.sendText persist:false → 委托不走 dispatch 收口入库", async () => {
  const fakeDb = (() => {
    const d = new FakeDb();
    setAdapterForTest(d);
    return d;
  })();
  const client = new WechatpadproApiClient(MOCK_CFG);
  await client.sendText("wxid_a", "hello");
  // api-client 委托 persist:false → 不入库 (outbound.ts 的 persistOutbound 负责)
  assert.equal(fakeDb.saved.length, 0, "apiClient.sendText 委托 persist:false 不应入库 (防双入库)");
});
