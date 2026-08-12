// tests/e2e-helper.ts - v1.1.9-P1-1 e2e mock fallback helper
// 设计: 3 env (WECHATPRO_DB_PASSWORD + WECHATPRO_TOKEN_KEY + WECHATPRO_AUTHCODE) 都有 → 真凭证
//        否则 → mock server (本地 http, 返 Code=0)
// e2e tests 不再 skip, 0 skip always

import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";

export const HAS_REAL_CREDS = !!(
  process.env.WECHATPRO_DB_PASSWORD &&
  process.env.WECHATPRO_TOKEN_KEY &&
  process.env.WECHATPRO_AUTHCODE
);

// v1.1.33 TEST-FIX (2026-08-08 23:08 接总立 P1[4] 推进):
//   默认强制 mock — dev 环境 prod gateway 常驻 (webhook 4398 + 真 MariaDB),
//   e2e 测试若走真实分支会跟 prod 冲突 (EADDRINUSE / setBackend already initialized)
//   真实 e2e 需要隔离环境: 显式 WPP_E2E_REAL=1 + 停 prod gateway 才能跑
// fix: USE_MOCK 默认 true, 只有 WPP_E2E_REAL=1 才走真实分支
export const USE_MOCK = process.env.WPP_E2E_REAL !== "1";

let mockServer: Server | null = null;
let mockBaseUrl = "";

/** 启动 mock server (if not started), 返 base url */
export function ensureMockServer(): string {
  if (mockServer && mockBaseUrl) return mockBaseUrl;
  if (USE_MOCK) {
    mockServer = createServer((req, res) => {
      const url = req.url ?? "/";
      if (req.method !== "POST") {
        res.statusCode = 404;
        res.end("not found");
        return;
      }
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        // mock 简化: 全返 Code=0 + 基础 Data
        const data: Record<string, unknown> = { ok: true };
        if (url.startsWith("/api/User/GetContractProfile")) {
          data.userName = "e2e-mock-user";
          data.nickName = "Mock User";
          data.wxid = "wxid_mock";
        } else if (url.startsWith("/api/Msg/SendTxt")) {
          data.msgId = "mock-msg-1";
        }
        res.end(JSON.stringify({ Code: 0, Data: data }));
      });
    });
    // sync 启动 (在 test before() 内调, await 不需要)
  }
  return mockBaseUrl;
}

/** 异步启动 mock server (test before() await this) */
export async function startMockServer(): Promise<string> {
  if (mockServer && mockBaseUrl) return mockBaseUrl;
  if (!USE_MOCK) return "";
  mockServer = createServer((req, res) => {
    const url = req.url ?? "/";
    if (req.method !== "POST") {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      const data: Record<string, unknown> = { ok: true };
      if (url.startsWith("/api/User/GetContractProfile")) {
        data.userName = "e2e-mock-user";
        data.nickName = "Mock User";
        data.wxid = "wxid_mock";
      } else if (url.startsWith("/api/Msg/SendTxt")) {
        data.msgId = "mock-msg-1";
      }
      res.end(JSON.stringify({ Code: 0, Data: data }));
    });
  });
  await new Promise<void>((resolve) => {
    mockServer!.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = mockServer!.address() as AddressInfo;
  mockBaseUrl = `http://127.0.0.1:${addr.port}`;
  return mockBaseUrl;
}

export function stopMockServer(): void {
  if (mockServer) {
    mockServer.close();
    mockServer = null;
    mockBaseUrl = "";
  }
}

/** 返真或 mock 的 base url (测试用) */
export function getTestBaseUrl(): string {
  if (USE_MOCK) return mockBaseUrl;
  return "https://wx.juhe.chat";
}
