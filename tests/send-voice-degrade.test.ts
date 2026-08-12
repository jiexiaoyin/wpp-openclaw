// tests/send-voice-degrade.test.ts - v1.3.53 VOICE-DEGRADE (2026-08-12 接总立 P3-1)
// mp3 语音转 silk 失败 → 降级为文件消息 (老板 6-12 16:36 偏好: 成功发语音, 失败降级文件)
//
// 覆盖:
//   1. mp3 URL 转码失败 (ffprobe 失败) → 降级发文件 (sendFileViaApp: UploadFile + ShareLink type=6)
//   2. 绝不调 /Msg/SendVoice (vendor 只收 silk, 直传 mp3 必失败)
//
// 用 undici MockAgent:
//   - GET 语音 URL → 返回垃圾字节 (ffprobe 必失败 → 触发降级)
//   - POST /api/Tools/UploadFile → mediaId (sendFileViaApp 前置)
//   - POST /api/Msg/ShareLink → Code:0 (文件消息成功)

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";

import { WechatpadproApiClient } from "../src/api-client.js";
import { getDefaultAccountRegistry } from "../src/account-state.js";
import { AccountContext } from "../src/accounts/account-context.js";
import { resetAdapter, setAdapterForTest } from "../src/storage/db/factory.js";
import type { DbAdapter, MessageRecord } from "../src/storage/db/types.js";

const MOCK_ORIGIN = "https://mock-voice-degrade.test";
const MOCK_CFG = {
  enabled: true,
  tokenKey: "tk",
  apiBaseUrl: MOCK_ORIGIN,
  wsUrl: "wss://mock-voice-degrade.test/ws",
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
  // 让 safeFetchWithCap 放行 mock host (动态读 env)
  process.env.WPP_VENDOR_HOST = "mock-voice-degrade.test";
  realDispatcher = getGlobalDispatcher();
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
});

after(() => {
  setGlobalDispatcher(realDispatcher);
  delete process.env.WPP_VENDOR_HOST;
  resetAdapter();
});

beforeEach(() => {
  requests.length = 0;
  resetAdapter();
  setAdapterForTest(new FakeDb());
  // 注册 default 账号 (降级路径 sendFileViaAppFromUrl 要从 registry 取 apiClient)
  const reg = getDefaultAccountRegistry() as unknown as { contexts: Map<string, AccountContext> };
  reg.contexts.clear();
  const ctx = new AccountContext({ accountId: "default", config: MOCK_CFG });
  (ctx as unknown as { apiClient: unknown }).apiClient = new WechatpadproApiClient(MOCK_CFG);
  reg.contexts.set("default", ctx);
  // 1. 语音 URL GET → 垃圾字节 (ffprobe 必失败 → 触发降级)
  mockAgent.get(MOCK_ORIGIN)
    .intercept({ method: "GET", path: (p) => p.startsWith("/voice/bad.mp3") })
    .reply(200, "NOT_A_REAL_MP3", { headers: { "content-type": "audio/mpeg" } })
    .persist();
  // 2. UploadFile → mediaId (sendFileViaApp 前置)
  mockAgent.get(MOCK_ORIGIN)
    .intercept({ method: "POST", path: (p) => p.startsWith("/api/Tools/UploadFile") })
    .reply(200, (ctx) => {
      requests.push({ path: ctx.path, body: ctx.body as string });
      return JSON.stringify({ Code: 0, Data: { mediaId: "mid-voice-degrade" } });
    })
    .persist();
  // 3. ShareLink → Code:0 (文件消息成功)
  mockAgent.get(MOCK_ORIGIN)
    .intercept({ method: "POST", path: (p) => p.startsWith("/api/Msg/ShareLink") })
    .reply(200, (ctx) => {
      requests.push({ path: ctx.path, body: ctx.body as string });
      return JSON.stringify({ Code: 0, Data: { msgId: 777, newMsgId: "888" } });
    })
    .persist();
  // 4. SendVoice → 记录 (断言绝不被调用)
  mockAgent.get(MOCK_ORIGIN)
    .intercept({ method: "POST", path: (p) => p.startsWith("/api/Msg/SendVoice") })
    .reply(200, (ctx) => {
      requests.push({ path: ctx.path, body: ctx.body as string });
      return JSON.stringify({ Code: 0, Data: { msgId: 999 } });
    })
    .persist();
});

test("v1.3.53 — mp3 URL 转码失败 → 降级发文件 (ShareLink type=6), 绝不调 SendVoice", async () => {
  const client = new WechatpadproApiClient(MOCK_CFG);
  const r = await client.sendVoice("wxid_a", `${MOCK_ORIGIN}/voice/bad.mp3`, 3000);
  // 降级成功 → Code=0 (文件消息), 不是语音
  assert.equal(r.Code, 0);
  assert.ok(
    requests.some((q) => q.path.includes("/api/Msg/ShareLink")),
    "应走文件降级 (ShareLink type=6)",
  );
  assert.ok(
    !requests.some((q) => q.path.includes("/api/Msg/SendVoice")),
    "绝不应调 /Msg/SendVoice (vendor 只收 silk)",
  );
  const share = requests.find((q) => q.path.includes("/api/Msg/ShareLink"));
  const body = JSON.parse(share?.body ?? "{}");
  assert.equal(body.Type, 6, "文件降级应发 appmsg type=6");
});

test("v1.3.53 — silk 输入仍直接透传 (Type=4, 不走降级)", async () => {
  const client = new WechatpadproApiClient(MOCK_CFG);
  const b64 = "aGVsbG8td29ybGQ=";
  const r = await client.sendVoice("wxid_a", `data:audio/silk;base64,${b64}`, 3000);
  assert.equal(r.Code, 0);
  const req = requests.find((q) => q.path.includes("/api/Msg/SendVoice"));
  assert.ok(req, "silk 输入应直接调 /Msg/SendVoice");
  const body = JSON.parse(req?.body ?? "{}");
  assert.equal(body.Type, 4, "silk 透传 Type=4");
});
