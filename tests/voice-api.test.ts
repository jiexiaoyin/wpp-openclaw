// tests/voice-api.test.ts - v1.3.74 P2-2: Voice 工厂 API 覆盖 (messageTranscribe/result/transcribe)
// 背景: 审阅 P2-2 voice.ts 35.6% 覆盖低 — 工厂方法字段构造无直接测试
// 对齐 send-voice-silk.test.ts 的 MockAgent 模式 (method + path 函数 + persist)

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";

import { makeWppVoice } from "../src/send/voice.js";

const MOCK_ORIGIN = "https://mock-voice.test";
let mockAgent: MockAgent;
let realDispatcher: ReturnType<typeof getGlobalDispatcher>;
let requests: Array<{ path: string; body: string }> = [];

before(() => {
  realDispatcher = getGlobalDispatcher();
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
});

after(() => {
  setGlobalDispatcher(realDispatcher);
});

beforeEach(() => {
  requests.length = 0;
  mockAgent.get(MOCK_ORIGIN)
    .intercept({ method: "POST", path: (p) => p.startsWith("/api/Voice/") })
    .reply(200, (ctx) => {
      requests.push({ path: ctx.path, body: ctx.body as string });
      return JSON.stringify({ Code: 0, Data: { text: "ok" } });
    })
    .persist();
});

function makeApi() {
  return makeWppVoice({
    baseUrl: MOCK_ORIGIN,
    tokenKey: "tk",
    authcode: "ac",
    accountId: "default",
  });
}

test("v1.3.74 P2-2 — messageTranscribe: 请求体字段对齐 vendor (silk 参数 + 引用字段)", async () => {
  const api = makeApi();
  const r = await api.messageTranscribe("m1", "nm1", "wxid_sender", "chat@room", "cm1", "v1", 2000);
  assert.equal(r.Code, 0, "MockAgent 应返 Code:0");
  assert.equal(requests.length, 1, "应发起 1 次请求");
  const body = JSON.parse(requests[0]!.body) as Record<string, unknown>;
  assert.equal(body.msg_id, "m1");
  assert.equal(body.new_msg_id, "nm1");
  assert.equal(body.from_user_name, "wxid_sender");
  assert.equal(body.chat_room_name, "chat@room");
  assert.equal(body.file_type, 2, "silk 类型");
  assert.equal(body.sample_rate, 16000);
});

test("v1.3.74 P2-2 — result: 请求体含 voice_id", async () => {
  const api = makeApi();
  await api.result("voice-123");
  assert.equal(requests.length, 1);
  const body = JSON.parse(requests[0]!.body) as Record<string, unknown>;
  assert.equal(body.voice_id, "voice-123");
});

test("v1.3.74 P2-2 — transcribe: 请求体含 audio_base64 + silk 默认参数", async () => {
  const api = makeApi();
  await api.transcribe("audio-base64", "from-user", "to-user");
  assert.equal(requests.length, 1);
  const body = JSON.parse(requests[0]!.body) as Record<string, unknown>;
  assert.equal(body.audio_base64, "audio-base64");
  assert.equal(body.from_user_name, "from-user");
  assert.equal(body.to_user_name, "to-user");
  assert.equal(body.file_type, 2, "silk");
  assert.equal(body.chunk_size, 4096);
});
