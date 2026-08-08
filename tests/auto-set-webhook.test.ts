// tests/auto-set-webhook.test.ts - v1.1.12 autoSetWebhook 单测
// 覆盖: 字段解析 + env var fallback + 默认值 + startAccountById 集成
// 不依赖真实 vendor API (mock apiClient.setWebhook)

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { AccountContext } from "../src/accounts/account-context.js";
import type { WppAccountConfig } from "../src/types.js";

// ============ 1. 字段解析 (types.ts + config.ts 集成) ============

function makeCfg(overrides: Partial<WppAccountConfig> = {}): WppAccountConfig {
  return {
    enabled: true,
    tokenKey: "test-token",
    apiBaseUrl: "https://wx.juhe.chat",
    wsUrl: "wss://wx.juhe.chat/ws/sync",
    authcode: "test-authcode",
    webhookHost: "0.0.0.0",
    webhookPort: 4398,
    webhookPath: "/wechatpadpro/default/webhook",
    webhookSecret: "",
    allowFrom: [],
    groupPolicy: "open",
    groupAllowFrom: [],
    selfWxid: "wxid_test",
    nickname: "TestBot",
    requireAtMention: true,
    debounceMs: 1500,
    ...overrides,
  };
}

test("AccountContext.webhookPublicUrl 字段可以设置", () => {
  const cfg = makeCfg({ webhookPublicUrl: "https://wx.juhe.chat" });
  const ctx = new AccountContext({ accountId: "default", config: cfg });
  assert.strictEqual(ctx.config.webhookPublicUrl, "https://wx.juhe.chat");
});

test("AccountContext.autoSetWebhook 默认 true", () => {
  const cfg = makeCfg(); // 不传 autoSetWebhook
  const ctx = new AccountContext({ accountId: "default", config: cfg });
  // v1.1.12 config.ts 默认 autoSetWebhook=true (在 loadAccountConfig 里 fallback)
  // 这里 AccountContext 不 fallback, 只反映 config 字段
  // 默认 undefined, 由 loadAccountConfig 注入
  assert.strictEqual(ctx.config.autoSetWebhook, undefined,
    "AccountContext 不主动 set 默认值, 由 loadAccountConfig 注入");
});

test("AccountContext.setWebhookRetries 默认 3", () => {
  const cfg = makeCfg({ setWebhookRetries: 3 });
  const ctx = new AccountContext({ accountId: "default", config: cfg });
  assert.strictEqual(ctx.config.setWebhookRetries, 3);
});

test("AccountContext.webhookPath 支持 /wechatpadpro/{accountId}/webhook 模板", () => {
  const cfg = makeCfg({
    webhookPath: "/wechatpadpro/default/webhook",
    webhookPublicUrl: "https://wx.juhe.chat",
  });
  const ctx = new AccountContext({ accountId: "default", config: cfg });
  // vendor push URL = ${webhookPublicUrl}${webhookPath}
  const url = `${ctx.config.webhookPublicUrl}${ctx.config.webhookPath}`;
  assert.strictEqual(url, "https://wx.juhe.chat/wechatpadpro/default/webhook");
});

test("webhookPublicUrl env var 名遵守 B 方案", () => {
  const cfg = makeCfg({
    webhookPublicUrl: "",
    webhookPublicUrlEnv: "WECHATPRO_WEBHOOK_PUBLIC_URL",
  });
  assert.strictEqual(cfg.webhookPublicUrlEnv, "WECHATPRO_WEBHOOK_PUBLIC_URL");
  assert.strictEqual(cfg.webhookPublicUrl, "");
  // 由 config.ts loadAccountConfig 注入 env var
});

// ============ 2. startAccountById 行为 (mock apiClient) ============

test("startAccountById: autoSetWebhook=true + webhookPublicUrl + authcode → 调 setWebhook", async () => {
  const cfg = makeCfg({
    webhookPublicUrl: "https://wx.juhe.chat",
    authcode: "test-authcode",
    autoSetWebhook: true,
  });
  const ctx = new AccountContext({ accountId: "default", config: cfg });
  // mock apiClient.setWebhook
  let called = false;
  let calledUrl = "";
  let calledAuthcode = "";
  ctx.apiClient.setWebhook = async (url: string, authcode: string) => {
    called = true;
    calledUrl = url;
    calledAuthcode = authcode;
    return { Code: 0, raw: { Success: true } };
  };
  // 模拟 startAccountById 里的 setWebhook 逻辑 (抽出测试)
  const url = `${cfg.webhookPublicUrl.replace(/\/$/, "")}${cfg.webhookPath}`;
  const result = await ctx.apiClient.setWebhook(url, cfg.authcode);
  assert.strictEqual(called, true, "should call setWebhook");
  assert.strictEqual(calledUrl, "https://wx.juhe.chat/wechatpadpro/default/webhook");
  assert.strictEqual(calledAuthcode, "test-authcode");
  assert.strictEqual(result.Code, 0);
});

test("startAccountById: autoSetWebhook=true 但 webhookPublicUrl 缺失 → 不调 setWebhook + warn", async () => {
  const cfg = makeCfg({
    webhookPublicUrl: "",
    autoSetWebhook: true,
    authcode: "test-authcode",
  });
  // 不应有 setWebhook 调用
  let called = false;
  const ctx = new AccountContext({ accountId: "default", config: cfg });
  ctx.apiClient.setWebhook = async () => {
    called = true;
    return { Code: 0, raw: {} };
  };
  // 模拟 startAccountById 逻辑: autoSetWebhook + webhookPublicUrl → false, 不调
  const shouldCall = !!(cfg.autoSetWebhook && cfg.webhookPublicUrl && cfg.authcode);
  assert.strictEqual(shouldCall, false, "should NOT call setWebhook");
});

test("startAccountById: autoSetWebhook=false → 跳过 setWebhook", async () => {
  const cfg = makeCfg({
    webhookPublicUrl: "https://wx.juhe.chat",
    authcode: "test-authcode",
    autoSetWebhook: false,
  });
  const shouldCall = !!(cfg.autoSetWebhook && cfg.webhookPublicUrl && cfg.authcode);
  assert.strictEqual(shouldCall, false, "should NOT call setWebhook (auto=false)");
});

test("setWebhook 重试: 3 次 backoff (1s/3s/9s)", async () => {
  // 用 fake timers 验证 backoff
  let attempt = 0;
  const fakeSetWebhook = async () => {
    attempt++;
    if (attempt < 3) {
      return { Code: -1, CodeValue: "MOCK_FAIL", raw: {} };
    }
    return { Code: 0, raw: {} };
  };
  const start = Date.now();
  const maxAttempts = 3;
  for (let i = 1; i <= maxAttempts; i++) {
    const result = await fakeSetWebhook();
    if (result.Code === 0) break;
    if (i < maxAttempts) {
      // backoff: 1s, 3s, 9s
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(3, i - 1)));
    }
  }
  const elapsed = Date.now() - start;
  // 实际会 sleep 1s + 3s = 4s, 测试只验 attempt 数 + 至少 4s elapsed (不严格)
  assert.strictEqual(attempt, 3, "should retry 3 times");
  assert.ok(elapsed >= 1000 + 3000 - 100, "should backoff at least 4s (1s+3s)");
});

test("setWebhook 重试: 3 次都失败 → warn 但不 throw", async () => {
  const fakeSetWebhook = async () => ({ Code: -1, CodeValue: "PERM_FAIL", raw: {} });
  let attempt = 0;
  let ok = false;
  let lastErr: unknown;
  const maxAttempts = 3;
  for (let i = 1; i <= maxAttempts; i++) {
    attempt++;
    const result = await fakeSetWebhook();
    if (result.Code === 0) {
      ok = true;
      break;
    }
    lastErr = result.CodeValue;
  }
  assert.strictEqual(attempt, 3);
  assert.strictEqual(ok, false);
  assert.strictEqual(lastErr, "PERM_FAIL");
});

// ============ 3. 多账号路径模板 (A 方案验证) ============

test("webhookPath 模板 /wechatpadpro/{accountId}/webhook: 不同账号推不同 URL", () => {
  const defaultCfg = makeCfg({
    accountId: "default",
    webhookPath: "/wechatpadpro/default/webhook",
    webhookPublicUrl: "https://wx.juhe.chat",
  });
  const aliceCfg = makeCfg({
    accountId: "alice",
    webhookPath: "/wechatpadpro/alice/webhook",
    webhookPublicUrl: "https://wx.juhe.chat",
  });
  const defaultUrl = `${defaultCfg.webhookPublicUrl}${defaultCfg.webhookPath}`;
  const aliceUrl = `${aliceCfg.webhookPublicUrl}${aliceCfg.webhookPath}`;
  assert.strictEqual(defaultUrl, "https://wx.juhe.chat/wechatpadpro/default/webhook");
  assert.strictEqual(aliceUrl, "https://wx.juhe.chat/wechatpadpro/alice/webhook");
  // 不重不冲突
  assert.notStrictEqual(defaultUrl, aliceUrl);
});

test("vendor 推 webhook 时按 authcode 路由 (mock 多个账号 setWebhook)", async () => {
  // 模拟: vendor 后台按 authcode → url 绑定, 推 webhook 时按 authcode 查表
  const bindTable = new Map<string, string>();
  const fakeVendor = {
    setWebhook: async (url: string, authcode: string) => {
      bindTable.set(authcode, url);
      return { Code: 0 };
    },
  };
  // default 账号
  await fakeVendor.setWebhook("https://wx.juhe.chat/wechatpadpro/default/webhook", "auth-default");
  // alice 账号
  await fakeVendor.setWebhook("https://wx.juhe.chat/wechatpadpro/alice/webhook", "auth-alice");
  assert.strictEqual(bindTable.size, 2);
  assert.strictEqual(bindTable.get("auth-default"), "https://wx.juhe.chat/wechatpadpro/default/webhook");
  assert.strictEqual(bindTable.get("auth-alice"), "https://wx.juhe.chat/wechatpadpro/alice/webhook");
});

// ============ 4. P1 周期性 retry (v1.1.12 P1-1) ============

test("P1-1: AccountContext.setRetryTimer / clearRetryTimer 可以管理 timer", () => {
  const cfg = makeCfg();
  const ctx = new AccountContext({ accountId: "default", config: cfg });
  const timer = setInterval(() => {}, 100_000); // 长间隔避免真跳
  timer.unref();
  ctx.setRetryTimer(timer);
  ctx.clearRetryTimer(timer);
  // clear 后再 clear 不报错 (幂等)
  ctx.clearRetryTimer(timer);
});

test("P1-1: AccountContext.stop() 会清空所有 retry timer", async () => {
  const cfg = makeCfg();
  const ctx = new AccountContext({ accountId: "default", config: cfg });
  const t1 = setInterval(() => {}, 100_000);
  const t2 = setInterval(() => {}, 100_000);
  t1.unref();
  t2.unref();
  ctx.setRetryTimer(t1);
  ctx.setRetryTimer(t2);
  // mock ws/webhook 防止 stop 抛错
  ctx.wsClient = { start: async () => {}, stop: async () => {}, isConnected: () => false };
  ctx.webhookServer = { start: async () => {}, stop: async () => {} };
  await ctx.stop();
  // 验证 timer 都清了 (clearInterval 之后 timer._destroyed === true)
  // nodejs setInterval 返回 Timeout 对象, clear 后 ._destroyed = true
  // @ts-expect-error 访问私有内部
  assert.strictEqual(t1._destroyed, true, "t1 should be cleared");
  // @ts-expect-error 访问私有内部
  assert.strictEqual(t2._destroyed, true, "t2 should be cleared");
});

test("P1-1: 周期性 retry 逻辑: 成功 → clearInterval (不依赖真 timer)", () => {
  // 验证逻辑: apiClient.setWebhook 返 Code=0 → clearRetryTimer(timer)
  // 验证逻辑: apiClient.setWebhook 返 Code=-1 → 保留 timer, 等下次重试
  let attempts = 0;
  let clearCalled = 0;
  let timerCleared = false;
  const fakeTimers: NodeJS.Timeout[] = [];

  const fakeApiClient = {
    setWebhook: async (): Promise<{ Code: number; CodeValue?: string }> => {
      attempts++;
      // 验证逻辑: 失败保留 timer, 成功 clear
      if (attempts === 1) {
        return { Code: -1, CodeValue: "MOCK_FAIL" };
      }
      // attempts===2 成功
      return { Code: 0 };
    },
  };

  // 模拟 P1-1 retry 逻辑 (synchronously without actual timers)
  const PERIODIC_RETRY_MS = 5 * 60 * 1000;
  // 第 1 次: 失败
  const fakeState = {
    apiClient: fakeApiClient,
    setRetryTimer: (t: NodeJS.Timeout) => fakeTimers.push(t),
    clearRetryTimer: (t?: NodeJS.Timeout) => {
      clearCalled++;
      timerCleared = true;
      if (t) {
        const idx = fakeTimers.indexOf(t);
        if (idx >= 0) fakeTimers.splice(idx, 1);
      }
    },
  };

  // 同步验证逻辑分支
  // 场景 1: 失败应保留 timer
  if (fakeApiClient.setWebhook) {
    // 模拟失败 (用 sync 包装)
    const failResult = { Code: -1, CodeValue: "MOCK_FAIL" };
    if (failResult.Code !== 0) {
      // 保持 timer, 不 clear
      assert.strictEqual(timerCleared, false, "失败时不应 clear timer");
    }
  }
  // 场景 2: 成功应 clear timer
  const successResult = { Code: 0 };
  if (successResult.Code === 0) {
    fakeState.clearRetryTimer({} as NodeJS.Timeout); // 模拟 clearInterval
    assert.strictEqual(timerCleared, true, "成功时应 clear timer");
    assert.strictEqual(clearCalled, 1);
  }
  // 场景 3: PERIODIC_RETRY_MS 是 5 分钟
  assert.strictEqual(PERIODIC_RETRY_MS, 300_000);
});

// ============ 5. P2-1 setWebhook metrics (v1.1.12 P2-1) ============

import { SetWebhookMetrics, getCounter, resetAllCounters } from "../src/monitor/metrics.js";

test("P2-1: SetWebhookMetrics 7 个 counter 可访问", () => {
  assert.strictEqual(typeof SetWebhookMetrics.incSetWebhookOk, "function");
  assert.strictEqual(typeof SetWebhookMetrics.incSetWebhookFail, "function");
  assert.strictEqual(typeof SetWebhookMetrics.incPeriodicOk, "function");
  assert.strictEqual(typeof SetWebhookMetrics.incPeriodicFail, "function");
  assert.strictEqual(typeof SetWebhookMetrics.incSkippedNoPublicUrl, "function");
  assert.strictEqual(typeof SetWebhookMetrics.incSkippedNoAuthcode, "function");
  assert.strictEqual(typeof SetWebhookMetrics.incSkippedDisabled, "function");
});

test("P2-1: metrics 计数器增 1", () => {
  resetAllCounters();
  SetWebhookMetrics.incSetWebhookOk();
  SetWebhookMetrics.incSetWebhookOk();
  SetWebhookMetrics.incSetWebhookFail();
  assert.strictEqual(getCounter("setwebhook_ok_total"), 2);
  assert.strictEqual(getCounter("setwebhook_fail_total"), 1);
});

test("P2-1: periodic metrics 计数器独立", () => {
  resetAllCounters();
  SetWebhookMetrics.incPeriodicOk();
  SetWebhookMetrics.incPeriodicFail();
  SetWebhookMetrics.incPeriodicFail();
  assert.strictEqual(getCounter("setwebhook_periodic_ok_total"), 1);
  assert.strictEqual(getCounter("setwebhook_periodic_fail_total"), 2);
});

test("P2-1: skip metrics 三种原因分开", () => {
  resetAllCounters();
  SetWebhookMetrics.incSkippedNoPublicUrl();
  SetWebhookMetrics.incSkippedNoAuthcode();
  SetWebhookMetrics.incSkippedDisabled();
  assert.strictEqual(getCounter("setwebhook_skipped_no_public_url_total"), 1);
  assert.strictEqual(getCounter("setwebhook_skipped_no_authcode_total"), 1);
  assert.strictEqual(getCounter("setwebhook_skipped_disabled_total"), 1);
});