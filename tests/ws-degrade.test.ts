// tests/ws-degrade.test.ts - v1.1.41 WS-DEGRADE
// 验证 enableWsClient/enableHttpFallback 字段控制 WS + HTTP 兜底启用

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveSyncConfig } from "../src/core/runtime-config.js";
import type { WppAccountConfig } from "../src/types.js";

const baseCfg = (overrides: Partial<WppAccountConfig["sync"]> = {}): WppAccountConfig => ({
  enabled: true,
  tokenKey: "tk",
  apiBaseUrl: "http://test",
  wsUrl: "ws://test",
  authcode: "ac",
  webhookHost: "0.0.0.0",
  webhookPort: 4398,
  webhookPath: "/test",
  webhookSecret: "",
  allowFrom: [],
  groupPolicy: "open",
  groupAllowFrom: [],
  selfWxid: "wxid_bot",
  nickname: "bot",
  requireAtMention: true,
  debounceMs: 1500,
  agent: "wpp-wechat",
  sync: overrides as WppAccountConfig["sync"],
});

describe("v1.1.41 WS-DEGRADE (resolveSyncConfig)", () => {
  test("默认: enableWsClient=true + enableHttpFallback=true", () => {
    const r = resolveSyncConfig(baseCfg({}));
    assert.equal(r.enableWsClient, true);
    assert.equal(r.enableHttpFallback, true);
    assert.equal(r.fallbackSyncMs, 60_000); // 默认 60s 兜底
  });

  test("enableWsClient=false → 仅 callback + HTTP 兜底", () => {
    const r = resolveSyncConfig(baseCfg({ enableWsClient: false }));
    assert.equal(r.enableWsClient, false);
    assert.equal(r.enableHttpFallback, true); // 兜底保留
    assert.equal(r.fallbackSyncMs, 60_000);
  });

  test("enableHttpFallback=false → fallbackSyncMs=0 (ws-client.start 跳过 timer)", () => {
    const r = resolveSyncConfig(baseCfg({ enableHttpFallback: false }));
    assert.equal(r.enableWsClient, true);
    assert.equal(r.enableHttpFallback, false);
    assert.equal(r.fallbackSyncMs, 0); // 关键: 0 = 跳过 setInterval
  });

  test("两个都 false → 仅 callback (无 WS 无 HTTP)", () => {
    const r = resolveSyncConfig(baseCfg({ enableWsClient: false, enableHttpFallback: false }));
    assert.equal(r.enableWsClient, false);
    assert.equal(r.enableHttpFallback, false);
    assert.equal(r.fallbackSyncMs, 0);
  });

  test("fallbackSyncMs 自定义值 + enableHttpFallback=true 生效", () => {
    const r = resolveSyncConfig(baseCfg({ fallbackSyncMs: 30_000 }));
    assert.equal(r.fallbackSyncMs, 30_000);
  });

  test("fallbackSyncMs 自定义 + enableHttpFallback=false 仍为 0 (enableHttpFallback 优先级高)", () => {
    const r = resolveSyncConfig(baseCfg({ fallbackSyncMs: 30_000, enableHttpFallback: false }));
    assert.equal(r.fallbackSyncMs, 0);
  });

  test("sync 字段未设 → 全用默认值 (行为不变)", () => {
    const cfg = baseCfg();
    delete cfg.sync;
    const r = resolveSyncConfig(cfg);
    assert.equal(r.enableWsClient, true);
    assert.equal(r.enableHttpFallback, true);
    assert.equal(r.fallbackSyncMs, 60_000);
  });

  test("wsReconnect 子字段不影响 WS enable/disable", () => {
    const r = resolveSyncConfig(baseCfg({
      enableWsClient: false,
      wsReconnect: { initialDelayMs: 500 },
    }));
    assert.equal(r.enableWsClient, false);
    assert.equal(r.wsReconnect.initialDelayMs, 500);
  });
});