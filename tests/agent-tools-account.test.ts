// tests/agent-tools-account.test.ts - v1.3.59 agent-tools 账号感知
// 验证 accountContext.run(accountId) 下执行 agent-tool → 用该账号的凭证 (非 default)
// 这是多账号 (v1.3.56) 核心特性, 之前只测了 default fallback, 未测账号选择

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

import { getDefaultAccountRegistry } from "../src/account-state.js";
import { AccountContext } from "../src/accounts/account-context.js";
import { accountContext } from "../src/dispatch/account-context.js";
import { AGENT_TOOLS_META } from "../src/dispatch/agent-tools/index.js";
import type { WppAccountConfig } from "../src/types.js";

function makeCfg(accountId: string, tokenKey: string, apiBaseUrl: string): WppAccountConfig {
  return {
    enabled: true, tokenKey, apiBaseUrl, wsUrl: `${apiBaseUrl}/ws`,
    authcode: `ac-${accountId}`, webhookHost: "127.0.0.1", webhookPort: 0, webhookPath: "/w",
    webhookSecret: "", allowFrom: [], groupPolicy: "open", groupAllowFrom: [],
    selfWxid: `wxid_${accountId}`, nickname: accountId, requireAtMention: true, debounceMs: 1500,
    agent: `wpp-${accountId}`,
  };
}

beforeEach(() => {
  const reg = getDefaultAccountRegistry() as unknown as { contexts: Map<string, AccountContext> };
  reg.contexts.clear();
  // 两个账号: default (token=tk-default) + accB (token=tk-accB)
  reg.contexts.set("default", new AccountContext({ accountId: "default", config: makeCfg("default", "tk-default", "http://default") }));
  reg.contexts.set("accB", new AccountContext({ accountId: "accB", config: makeCfg("accB", "tk-accB", "http://accB") }));
});

after(() => {
  const reg = getDefaultAccountRegistry() as unknown as { contexts: Map<string, AccountContext> };
  reg.contexts.clear();
});

test("v1.3.59 — accountContext.run(accB) 下 getMsgApi 用 accB 凭证", async () => {
  // 用 msg-meta 的 sendText 工具: getMsgApi() → getCurrentAccountId() ?? "default"
  // 验证: 在 run("accB") 下执行时, 工具请求打到 accB 的 apiBaseUrl (http://accB), 非 default (http://default)
  const { makeWppMsg } = await import("../src/send/msg.js");
  const { postWppJson } = await import("../src/api/client.js");

  // 拦截 postWppJson 捕获 baseUrl (getMsgApi 用 state.config.apiBaseUrl 构造)
  const { warn: _w, error: _e, formatErr } = await import("../src/core/logger.js");
  let capturedBaseUrl: string | undefined;

  // 用 sendText 工具, 但拦截底层 HTTP: 直接验证 getMsgApi 构造的 ctx
  // 更直接: 检查 msg-meta 在 accB 上下文下, getDefaultAccountRegistry().get 返回 accB
  const { getMsgApi } = await import("../src/dispatch/agent-tools/msg-meta.js");
  const entry = AGENT_TOOLS_META.sendText as [string, unknown, (...args: unknown[]) => Promise<unknown>];

  // 实际: 工具 fn → getMsgApi().sendTxt → postWppJson(baseUrl=accB.apiBaseUrl)。拦截 postWppJson。
  // 用 mock 全局 fetch 捕获请求 host
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url: unknown, init?: unknown) => {
    capturedBaseUrl = String((url as URL).href ?? url);
    return new Response(JSON.stringify({ Code: 0, Data: { msgId: 1 } }), { status: 200 });
  };
  try {
    await accountContext.run("accB", async () => {
      await entry[2]("wxid_x", "hello");
    });
    assert.ok(capturedBaseUrl, "应发请求");
    assert.ok(capturedBaseUrl!.startsWith("http://accB"), `accB 上下文下应请求 accB baseUrl, 实际=${capturedBaseUrl}`);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("v1.3.59 — 无 accountContext 时工具 fallback 到 default", async () => {
  const entry = AGENT_TOOLS_META.sendText as [string, unknown, (...args: unknown[]) => Promise<unknown>];
  const origFetch = globalThis.fetch;
  let capturedBaseUrl: string | undefined;
  globalThis.fetch = async (url: unknown, init?: unknown) => {
    capturedBaseUrl = String((url as URL).href ?? url);
    return new Response(JSON.stringify({ Code: 0, Data: { msgId: 1 } }), { status: 200 });
  };
  try {
    // 无 run → getCurrentAccountId() undefined → fallback default → 请求 http://default
    await entry[2]("wxid_x", "hello");
    assert.ok(capturedBaseUrl, "应发请求");
    assert.ok(capturedBaseUrl!.startsWith("http://default"), `无上下文应 fallback default, 实际=${capturedBaseUrl}`);
  } finally {
    globalThis.fetch = origFetch;
  }
});
