// tests/send-voice-silk.test.ts - v1.3.59 mp3→silk 成功路径
// SILK-ONLY (v1.3.52) 核心 happy path: mp3 → ffprobe 时长 → ffmpeg PCM 24kHz → silk encoder → Type=4
// 依赖 /root/silk_decoder/silk/encoder + ffmpeg (环境有 → 真测; 无 → skip)
// 用 MockAgent 拦截 vendor (SendVoice Type=4)

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";
import { existsSync } from "node:fs";

import { WechatpadproApiClient } from "../src/api-client.js";

const SILK_ENCODER = "/root/silk_decoder/silk/encoder";
const hasSilkEncoder = existsSync(SILK_ENCODER);

const MOCK_ORIGIN = "https://mock-voice-silk.test";
const MOCK_CFG = {
  enabled: true, tokenKey: "tk", apiBaseUrl: MOCK_ORIGIN, wsUrl: "wss://mock-voice-silk.test/ws",
  authcode: "ac", webhookHost: "127.0.0.1", webhookPort: 0, webhookPath: "/w",
  webhookSecret: "", allowFrom: [], groupPolicy: "open" as const, groupAllowFrom: [],
  selfWxid: "wxid_bot", nickname: "test", requireAtMention: true, debounceMs: 1500,
  agent: "wpp-wechat",
};

let mockAgent: MockAgent;
let realDispatcher: ReturnType<typeof getGlobalDispatcher>;
const requests: Array<{ path: string; body: string }> = [];

before(() => {
  process.env.WPP_VENDOR_HOST = "mock-voice-silk.test";
  realDispatcher = getGlobalDispatcher();
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
});

after(() => {
  setGlobalDispatcher(realDispatcher);
  delete process.env.WPP_VENDOR_HOST;
});

beforeEach(() => {
  requests.length = 0;
  // SendVoice 拦截 (断言 Type=4)
  mockAgent.get(MOCK_ORIGIN)
    .intercept({ method: "POST", path: (p) => p.startsWith("/api/Msg/SendVoice") })
    .reply(200, (ctx) => {
      requests.push({ path: ctx.path, body: ctx.body as string });
      return JSON.stringify({ Code: 0, Data: { msgId: 555, newMsgId: "666" } });
    })
    .persist();
});

test("v1.3.59 — mp3 URL → silk 成功路径 (ffprobe+ffmpeg+silk encoder → SendVoice Type=4)", async (t) => {
  if (!hasSilkEncoder) {
    t.skip("silk encoder 缺失, 跳过成功路径测试");
    return;
  }
  // 用一个极短真实 mp3 (2s 静音) 生成到临时, 走 encodeMp3ToSilk 成功链路
  // 用 data URI 避免网络下载 (resolveImageToBase64 支持)
  // 实际上 encodeMp3ToSilk 走 fetchToBuffer(data:) → 解码 → ffprobe → ffmpeg → silk
  // 生成一个合法 mp3: 用 ffmpeg 现场生成
  const { execAsync } = await import("../src/util/exec.js");
  const os = await import("node:os");
  const path = await import("node:path");
  const fs = await import("node:fs");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wpp-silk-test-"));
  const mp3Path = path.join(tmpDir, "test.mp3");
  try {
    // 生成 1s 静音 mp3
    const gen = await execAsync("ffmpeg", ["-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "1", "-q:a", "9", mp3Path, "-y"], { timeoutMs: 10000 });
    assert.equal(gen.code, 0, "ffmpeg 生成测试 mp3 失败");
    // 读 mp3 → 发语音 (本地路径 → 走 encodeMp3ToSilk)
    const b64 = fs.readFileSync(mp3Path).toString("base64");
    const client = new WechatpadproApiClient(MOCK_CFG);
    const r = await client.sendVoice("wxid_a", `data:audio/mpeg;base64,${b64}`, 1000);
    assert.equal(r.Code, 0, "mp3→silk 成功路径应发 SendVoice");
    const sendVoiceReq = requests.find((q) => q.path.includes("/api/Msg/SendVoice"));
    assert.ok(sendVoiceReq, "应调 SendVoice");
    const body = JSON.parse(sendVoiceReq?.body ?? "{}");
    assert.equal(body.Type, 4, "silk 发送 Type 应为 4");
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});
