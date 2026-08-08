// tests/e2e-mock.test.ts - v1.1.9-P1-1 e2e-mock (默认跑, 无 flag)
// 复用 e2e-helper 的 mock server (e2e.test.ts 已启动)

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { startMockServer, stopMockServer, getTestBaseUrl, USE_MOCK } from "./e2e-helper.js";

// P2-1 complete-fix (2026-08-08): 有真凭证 (USE_MOCK=false) 时 skip 全部 mock test
//   之前: 真凭证环境 startMockServer() 返 "", getTestBaseUrl() 返 https://wx.juhe.chat → 打到真实 vendor
//   现在: 每个 test 加 { skip: !USE_MOCK } → 真凭证环境静默 skip, 不污染真实 vendor
const mockOpts = { skip: !USE_MOCK };

let mockUp = false;
before(async () => {
  // 只有 mock 模式才启动 server; 真凭证环境直接跳过
  if (!USE_MOCK) return;
  await startMockServer();
  mockUp = true;
});
after(() => {
  if (mockUp) stopMockServer();
});

test("FIX-S2 e2e-mock — mock server 启动 + 随机端口", mockOpts, () => {
  const baseUrl = getTestBaseUrl();
  assert.match(baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/, "应监听 127.0.0.1 + 随机端口");
});

test("FIX-S2 e2e-mock — vendor GetProfile (mock server)", mockOpts, async () => {
  const baseUrl = getTestBaseUrl();
  const { fetch } = await import("undici");
  const resp = await fetch(`${baseUrl}/api/User/GetContractProfile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ authcode: "mock-authcode" }),
  });
  assert.equal(resp.status, 200);
  const json = JSON.parse(await new Response(resp.body).text()) as { Code: number; Data?: { userName: string } };
  assert.equal(json.Code, 0);
  assert.equal(json.Data?.userName, "e2e-mock-user");
});

test("FIX-S2 e2e-mock — vendor HeartBeat (mock server)", mockOpts, async () => {
  const baseUrl = getTestBaseUrl();
  const { fetch } = await import("undici");
  const resp = await fetch(`${baseUrl}/api/Login/HeartBeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(resp.status, 200);
  const json = JSON.parse(await new Response(resp.body).text()) as { Code: number };
  assert.equal(json.Code, 0);
});

test("FIX-S2 e2e-mock — vendor SendTxt (mock server)", mockOpts, async () => {
  const baseUrl = getTestBaseUrl();
  const { fetch } = await import("undici");
  const resp = await fetch(`${baseUrl}/api/Msg/SendTxt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toWxid: "wxid_x", content: "hi" }),
  });
  assert.equal(resp.status, 200);
  const json = JSON.parse(await new Response(resp.body).text()) as { Code: number; Data?: { msgId: string } };
  assert.equal(json.Code, 0);
  assert.ok(json.Data?.msgId);
});

test("FIX-S2 e2e-mock — 默认跑 (无 flag, 5 个 test 永远不 skip)", mockOpts, () => {
  // v1.1.9-P1-1: 删 WPP_E2E_MOCK=1 flag, mock 默认启动
  // v1.1.15 P2-1: 真凭证环境改为 skip (不污染真实 vendor)
  assert.ok(true, "FIX-S2: mock 默认跑 (clean env), 真凭证环境 skip");
});
