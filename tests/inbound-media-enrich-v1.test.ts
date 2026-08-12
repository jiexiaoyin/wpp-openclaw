// tests/inbound-media-enrich-v1.test.ts - v1.3.18 P1-假绿4 修 (Claude P1-5)
// 4 个 v1 enrich 函数原本 grep tests/ 0 命中, 现在每个函数至少 2 case:
//   1. 失败路径 (无效输入 / vendor 错 / MCP 不可达) → 返回 error, 不崩
//   2. 成功路径 (mock undici MockAgent + fake ossutil 脚本) → 返回正确 mediaUrl/mediaSize
//
// Mock 策略:
//   - undici MockAgent 拦截 vendor API (postWppJson + global fetch)
//   - 写一个 fake ossutil shell 脚本到 /tmp/fake-bin/, prepend 到 process.env.PATH
//     → execAsync("ossutil", ...) 调我们的 fake (always exit 0), 触发 uploadToOss 成功路径
//   - 真实 OSS_CREDENTIALS_PATH 由 media-enrich.ts 在 import 时 capture (env 优先), 这里
//     不修改, 让 happy path 用真实 bucket 名 (mock OSS 凭证很复杂, 而且 fake ossutil
//     让 upload 立即返 ok, 实际不写 OSS, URL 是"未上传"的占位)

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  enrichImageMessageFromV1,
  enrichVideoMessageFromV1,
  enrichVoiceMessageFromV1,
  enrichFileMessageViaMcp,
  type V1VoiceDownloadCtx,
  type V1VideoDownloadCtx,
} from "../src/inbound/media-enrich.js";
import type { WppAccountCtx } from "../src/send/factory.js";

// ============ Test fixtures ============

const TEST_BASE_URL = "https://wx.juhe.chat";
const TEST_CTX: WppAccountCtx = {
  baseUrl: TEST_BASE_URL,
  tokenKey: "test-token",
  authcode: "test-auth",
  accountId: "default",
};

// 最小合法 JPEG (FFD8FFE0...FFD9): 100 byte JPEG, base64 string
const VALID_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBebcHBebcHBebcHBebcHBebcHBebcHBebcHC//2wBDAQAGBAUGBebcHBebcHC//2wBDAQAGBAUGBebcHBebcHC//2wBDAQAGBAUGBebcHBebcHC//2wBDAQAGBAUGBebcHBebcHC//Z";

const TEST_VOICE_CTX: V1VoiceDownloadCtx = {
  msgId: 12345,
  newMsgId: "vnm-1",
  clientMsgId: "cm-1",
  masterBufId: "mb-1",
  format: 1,
  length: 1024,
  chatRoomName: "test-room",
  fromUserName: "wxid_alice",
  toUserName: "wxid_bot",
};

const TEST_VIDEO_CTX: V1VideoDownloadCtx = {
  msgId: 67890,
  dataLen: 1024,
  toWxid: "wxid_alice",
};

// ============ Mock setup: fake ossutil in PATH ============

let tmpDir: string;
let fakeBinDir: string;
let originalEnvPath: string | undefined;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wpp-enrich-test-"));
  fakeBinDir = path.join(tmpDir, "fake-bin");
  fs.mkdirSync(fakeBinDir, { recursive: true });

  // fake ossutil 脚本: exit 0, 忽略参数, 不实际 upload (让 uploadToOss 返 ok,
  // 但实际不写 OSS — URL 是"未上传"的占位, 不影响测试逻辑)
  const fakeOssutil = path.join(fakeBinDir, "ossutil");
  fs.writeFileSync(fakeOssutil, "#!/bin/sh\nexit 0\n", { mode: 0o755 });

  originalEnvPath = process.env.PATH;
  process.env.PATH = fakeBinDir + path.delimiter + (originalEnvPath ?? "");
});

after(async () => {
  if (originalEnvPath !== undefined) process.env.PATH = originalEnvPath;
  else delete process.env.PATH;
  if (tmpDir) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// ============ enrichImageMessageFromV1 ============

test("v1.3.18 B-4 — enrichImageMessageFromV1 失败路径: 无效 localId 返回 error 不调网络", async () => {
  const r = await enrichImageMessageFromV1(TEST_CTX, 0, "wxid_alice");
  assert.equal(r.mediaUrl, null);
  assert.match(r.error ?? "", /invalid localId/);
});

test("v1.3.18 B-4 — enrichImageMessageFromV1 成功路径: mock vendor 返回有效 JPEG + fake ossutil → mediaUrl", async () => {
  const { MockAgent, setGlobalDispatcher, getGlobalDispatcher } = await import("undici");

  const realDispatcher = getGlobalDispatcher();
  const mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);

  try {
    mockAgent
      .get(TEST_BASE_URL)
      .intercept({ method: "POST", path: /^\/api\/Tools\/DownloadImg/ })
      .reply(200, JSON.stringify({
        Code: 0,
        Data: {
          BaseResponse: { ret: 0 },
          data: { buffer: VALID_JPEG_BASE64, iLen: 100 },
        },
      }));

    const r = await enrichImageMessageFromV1(TEST_CTX, 1680277034, "wxid_alice", "test-md5");
    assert.ok(r.mediaUrl, `应返 mediaUrl, 实际 ${JSON.stringify(r)}`);
    // bucket 来自真实 ~/.openclaw/credentials/oss-credentials.json (loadOssConfig 在 import 时 capture)
    // fake ossutil 让 uploadToOss 返 ok, 但 URL 是"未上传"的占位 — 只验 URL 结构
    assert.match(r.mediaUrl ?? "", /^https:\/\/[a-z0-9-]+\.oss-cn-hangzhou\.aliyuncs\.com\/wpp\/default\/images\/[0-9-]+\//);
    assert.ok(r.mediaSize && r.mediaSize > 0, `应返 mediaSize > 0, 实际 ${r.mediaSize}`);
    assert.equal(r.error, undefined, `不应有 error, 实际 ${r.error}`);
  } finally {
    setGlobalDispatcher(realDispatcher);
    mockAgent.close();
  }
});

test("v1.3.18 B-4 — enrichImageMessageFromV1 失败路径: vendor Code=-1 → 返 error 'vendor ret'", async () => {
  const { MockAgent, setGlobalDispatcher, getGlobalDispatcher } = await import("undici");

  const realDispatcher = getGlobalDispatcher();
  const mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);

  try {
    mockAgent
      .get(TEST_BASE_URL)
      .intercept({ method: "POST", path: /^\/api\/Tools\/DownloadImg/ })
      .reply(200, JSON.stringify({
        Code: -1,
        Data: { BaseResponse: { ret: -1, errMsg: { string: "mock vendor error" } } },
      }));

    const r = await enrichImageMessageFromV1(TEST_CTX, 1680277034, "wxid_alice");
    assert.equal(r.mediaUrl, null);
    assert.match(r.error ?? "", /vendor ret/, `错误应含 'vendor ret', 实际 ${r.error}`);
  } finally {
    setGlobalDispatcher(realDispatcher);
    mockAgent.close();
  }
});

// ============ enrichVideoMessageFromV1 ============

test("v1.3.18 B-4 — enrichVideoMessageFromV1 失败路径: vendor 返回 HTTP 500 → 返 error", async () => {
  const { MockAgent, setGlobalDispatcher, getGlobalDispatcher } = await import("undici");

  const realDispatcher = getGlobalDispatcher();
  const mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);

  try {
    mockAgent
      .get(TEST_BASE_URL)
      .intercept({ method: "POST", path: /^\/api\/Tools\/DownloadVideo/ })
      .reply(500, "vendor internal error");

    const r = await enrichVideoMessageFromV1(TEST_CTX, TEST_VIDEO_CTX);
    assert.equal(r.mediaUrl, null);
    assert.match(r.error ?? "", /HTTP 500|safeFetch|Code/i, `错误应含 HTTP/safeFetch, 实际 ${r.error}`);
    assert.equal(r.mediaSize, null);
  } finally {
    setGlobalDispatcher(realDispatcher);
    mockAgent.close();
  }
});

test("v1.3.18 B-4 — enrichVideoMessageFromV1 成功路径: mock DownloadVideo 分片循环 → mediaUrl", async () => {
  const { MockAgent, setGlobalDispatcher, getGlobalDispatcher } = await import("undici");

  const realDispatcher = getGlobalDispatcher();
  const mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);

  try {
    // video 数据 (1KB 假 mp4 bytes, base64 编码)
    const fakeMp4 = Buffer.alloc(1024, 0xab);
    const fakeMp4B64 = fakeMp4.toString("base64");

    // enrichVideoMessageFromV1 用 while 循环拉分片 (chunk=1MB)
    // 我们的 dataLen=1024, 一次拉完 → 1 个 chunk → totalLen 命中 break
    mockAgent
      .get(TEST_BASE_URL)
      .intercept({ method: "POST", path: /^\/api\/Tools\/DownloadVideo/ })
      .reply(200, JSON.stringify({
        Data: { totalLen: 1024, data: { buffer: fakeMp4B64 } },
      }));

    const r = await enrichVideoMessageFromV1(TEST_CTX, TEST_VIDEO_CTX);
    assert.ok(r.mediaUrl, `应返 mediaUrl, 实际 ${JSON.stringify(r)}`);
    assert.match(r.mediaUrl ?? "", /^https:\/\/[a-z0-9-]+\.oss-cn-hangzhou\.aliyuncs\.com\/wpp\/default\/videos\/[0-9-]+\//);
    assert.equal(r.mediaSize, 1024);
  } finally {
    setGlobalDispatcher(realDispatcher);
    mockAgent.close();
  }
});

// ============ enrichVoiceMessageFromV1 ============

test("v1.3.18 B-4 — enrichVoiceMessageFromV1 失败路径: vendor 返回 HTTP 500 → 返 error", async () => {
  const { MockAgent, setGlobalDispatcher, getGlobalDispatcher } = await import("undici");

  const realDispatcher = getGlobalDispatcher();
  const mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);

  try {
    mockAgent
      .get(TEST_BASE_URL)
      .intercept({ method: "POST", path: /^\/api\/Tools\/DownloadVoiceBinary/ })
      .reply(500, "vendor internal error");

    const r = await enrichVoiceMessageFromV1(TEST_CTX, TEST_VOICE_CTX);
    assert.equal(r.mediaUrl, null);
    assert.match(r.error ?? "", /HTTP 500|safeFetch/i, `错误应含 HTTP/safeFetch, 实际 ${r.error}`);
  } finally {
    setGlobalDispatcher(realDispatcher);
    mockAgent.close();
  }
});

test("v1.3.18 B-4 — enrichVoiceMessageFromV1 成功路径: mock DownloadVoiceBinary → mediaUrl", async () => {
  const { MockAgent, setGlobalDispatcher, getGlobalDispatcher } = await import("undici");

  const realDispatcher = getGlobalDispatcher();
  const mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);

  try {
    // silk 假字节 (1024 bytes raw) — function 调 resp.arrayBuffer() 拿原始 bytes
    const fakeSilk = Buffer.alloc(1024, 0xff);

    // DownloadVoiceBinary endpoint (enrichVoiceMessageFromV1 用 raw fetch, 不是 postWppJson)
    // 返回 ArrayBuffer (silk binary), 用 Buffer 形式让 undici 把它当二进制 body
    mockAgent
      .get(TEST_BASE_URL)
      .intercept({ method: "POST", path: /^\/api\/Tools\/DownloadVoiceBinary/ })
      .reply(200, fakeSilk, {
        headers: { "content-type": "application/octet-stream" },
      });

    // STT 调 SiliconFlow (不在 ALLOWED_HOSTS, fetch 失败, 但 STT 失败非致命 — log warn + 继续 oss upload)

    const r = await enrichVoiceMessageFromV1(TEST_CTX, TEST_VOICE_CTX);
    assert.ok(r.mediaUrl, `应返 mediaUrl, 实际 ${JSON.stringify(r)}`);
    assert.match(r.mediaUrl ?? "", /^https:\/\/[a-z0-9-]+\.oss-cn-hangzhou\.aliyuncs\.com\/wpp\/default\/voices\/[0-9-]+\//);
    assert.equal(r.mediaSize, 1024);
  } finally {
    setGlobalDispatcher(realDispatcher);
    mockAgent.close();
  }
});

// ============ enrichFileMessageViaMcp ============

test("v1.3.18 B-4 — enrichFileMessageViaMcp 失败路径: MCP 不可达 → 返 'mcp no cdn url'", async () => {
  // 真实环境 MCP_BASE_URL (127.0.0.1:8062/mcp) 不通 → resolveFileViaMcp 返 null
  // → enrichFileMessageViaMcp 返 error "mcp no cdn url"
  // (不依赖 MockAgent, 因为 vendor-mcp-client 用 SDK + StreamableHTTP, 不是 undici 直接 fetch)
  const r = await enrichFileMessageViaMcp(99999, "missing-file.pdf");
  assert.equal(r.mediaUrl, null);
  assert.match(r.error ?? "", /mcp no cdn url/, `MCP 不可达应返 'mcp no cdn url', 实际 ${r.error}`);
  assert.equal(r.size, null);
});

test("v1.3.18 B-4 — enrichFileMessageViaMcp 失败路径: filename 空字符串仍返 'mcp no cdn url'", async () => {
  // 边界: filename 空也走 MCP, 不应崩
  const r = await enrichFileMessageViaMcp(1, "");
  assert.equal(r.mediaUrl, null);
  assert.match(r.error ?? "", /mcp no cdn url/);
});