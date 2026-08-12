// tests/runtime-config.test.ts - v1.1.40 GLOBAL-CONFIG
// 测试 resolveGlobalConfig / resolveSyncConfig 兜底默认值 + override

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveGlobalConfig,
  resolveSyncConfig,
  RUNTIME_DEFAULTS,
} from "../src/core/runtime-config.js";
import type { WppGlobalConfig, WppAccountConfig } from "../src/types.js";

describe("resolveGlobalConfig (v1.1.40 GLOBAL-CONFIG)", () => {
  test("无 config 时全字段使用默认值", () => {
    const r = resolveGlobalConfig(undefined);
    assert.equal(r.defaults.vendorApiBase, "http://127.0.0.1:8062");
    assert.equal(r.defaults.vendorBasePath, "/api");
    assert.equal(r.defaults.vendorWsPath, "/ws/sync");
    assert.equal(r.defaults.botNickname, "YourBot");
    assert.equal(r.defaults.webhookHost, "127.0.0.1");
    assert.equal(r.defaults.webhookPort, 4398);
    assert.equal(r.defaults.webhookPath, "/wechatpadpro/webhook");
    assert.equal(r.defaults.debounceMs, 1500);
  });

  test("runtime 默认值正确", () => {
    const r = resolveGlobalConfig(undefined);
    assert.equal(r.runtime.apiTimeoutMs, 30_000);
    assert.equal(r.runtime.requestTimeoutMs, 30_000);
    assert.equal(r.runtime.webhookBodyLimitBytes, 10 * 1024 * 1024);
    assert.equal(r.runtime.apiMaxRetries, 3);
    assert.equal(r.runtime.apiRetryBaseMs, 500);
    assert.equal(r.runtime.dedupeTtlMs, 30 * 60 * 1000);
    assert.equal(r.runtime.sttTimeoutMs, 60_000);
    assert.equal(r.runtime.mediaTimeoutMs, 60_000);
    assert.equal(r.runtime.execTimeoutMs, 30_000);
    assert.equal(r.runtime.configCacheTtlMs, 60_000);
  });

  test("vendor 默认值正确", () => {
    const r = resolveGlobalConfig(undefined);
    assert.equal(r.vendor.name, "wechatpadpro");
    assert.equal(r.vendor.authHeader, "X-TokenKey");
  });

  test("config 提供时 override defaults", () => {
    const cfg: WppGlobalConfig = {
      storage: { saveHistory: true, db: { backend: "mysql", mariadb: {} as any } },
      defaults: {
        vendorApiBase: "https://custom.api.com",
        webhookPort: 8888,
        botNickname: "Custom Bot",
      },
    };
    const r = resolveGlobalConfig(cfg);
    assert.equal(r.defaults.vendorApiBase, "https://custom.api.com");
    assert.equal(r.defaults.webhookPort, 8888);
    assert.equal(r.defaults.botNickname, "Custom Bot");
    // 未 override 的字段仍用默认值
    assert.equal(r.defaults.vendorBasePath, "/api");
    assert.equal(r.defaults.webhookHost, "127.0.0.1");
  });

  test("config 提供时 override runtime", () => {
    const cfg: WppGlobalConfig = {
      storage: { saveHistory: true, db: { backend: "mysql", mariadb: {} as any } },
      runtime: {
        apiTimeoutMs: 60_000,
        webhookBodyLimitBytes: 20 * 1024 * 1024,
        dedupeTtlMs: 10 * 60 * 1000,
      },
    };
    const r = resolveGlobalConfig(cfg);
    assert.equal(r.runtime.apiTimeoutMs, 60_000);
    assert.equal(r.runtime.webhookBodyLimitBytes, 20 * 1024 * 1024);
    assert.equal(r.runtime.dedupeTtlMs, 10 * 60 * 1000);
    assert.equal(r.runtime.requestTimeoutMs, 30_000);
  });

  test("部分 config 字段 (storage 也缺失) 不报错", () => {
    const cfg = {} as WppGlobalConfig;
    const r = resolveGlobalConfig(cfg);
    assert.equal(r.defaults.vendorApiBase, "http://127.0.0.1:8062");
  });

  test("空 defaults 分组不影响 runtime", () => {
    const cfg: WppGlobalConfig = {
      storage: { saveHistory: true, db: { backend: "mysql", mariadb: {} as any } },
      defaults: {}, // 空对象
      runtime: { apiTimeoutMs: 99_000 },
    };
    const r = resolveGlobalConfig(cfg);
    assert.equal(r.runtime.apiTimeoutMs, 99_000);
    assert.equal(r.defaults.vendorApiBase, "http://127.0.0.1:8062");
  });
});

describe("resolveSyncConfig (v1.1.40 GLOBAL-CONFIG 单账号独有)", () => {
  test("无 config 时使用默认 sync 策略", () => {
    const r = resolveSyncConfig(undefined);
    assert.equal(r.fallbackSyncMs, 60_000);
    assert.equal(r.wsReconnect.initialDelayMs, 1_000);
    assert.equal(r.wsReconnect.maxDelayMs, 30_000);
    assert.equal(r.wsReconnect.multiplier, 2);
  });

  test("单账号 config 覆盖 sync 字段", () => {
    const cfg: WppAccountConfig = {
      enabled: true,
      tokenKey: "test",
      apiBaseUrl: "http://test",
      wsUrl: "ws://test",
      authcode: "test",
      webhookHost: "127.0.0.1",
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
      sync: {
        fallbackSyncMs: 30_000,
        wsReconnect: {
          initialDelayMs: 500,
          maxDelayMs: 60_000,
          multiplier: 3,
        },
      },
    };
    const r = resolveSyncConfig(cfg);
    assert.equal(r.fallbackSyncMs, 30_000);
    assert.equal(r.wsReconnect.initialDelayMs, 500);
    assert.equal(r.wsReconnect.maxDelayMs, 60_000);
    assert.equal(r.wsReconnect.multiplier, 3);
  });

  test("sync 字段部分缺失时混合 default + override", () => {
    const cfg: WppAccountConfig = {
      enabled: true,
      tokenKey: "test",
      apiBaseUrl: "http://test",
      wsUrl: "ws://test",
      authcode: "test",
      webhookHost: "127.0.0.1",
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
      sync: { fallbackSyncMs: 30_000 }, // 只设一个
    };
    const r = resolveSyncConfig(cfg);
    assert.equal(r.fallbackSyncMs, 30_000); // override
    assert.equal(r.wsReconnect.initialDelayMs, 1_000); // default
    assert.equal(r.wsReconnect.maxDelayMs, 30_000); // default
  });
});

describe("RUNTIME_DEFAULTS SSOT (v1.1.40)", () => {
  test("默认值常量导出正确", () => {
    assert.equal(RUNTIME_DEFAULTS.defaults.vendorApiBase, "http://127.0.0.1:8062");
    assert.equal(RUNTIME_DEFAULTS.runtime.apiMaxRetries, 3);
    assert.equal(RUNTIME_DEFAULTS.sync.fallbackSyncMs, 60_000);
    assert.equal(RUNTIME_DEFAULTS.vendor.name, "wechatpadpro");
  });
});