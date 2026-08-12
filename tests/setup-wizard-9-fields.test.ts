// tests/setup-wizard-9-fields.test.ts - v1.1.43 SETUP-FULL
// 验证 9 字段补全后的 AddAccountInput + writeAccountFile 行为

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { writeAccountFile } from "../src/setup-wizard.js";

describe("v1.1.43 SETUP-FULL 9 字段补全", () => {
  let tmpDir: string;
  function setup(): void {
    tmpDir = mkdtempSync(join(tmpdir(), "wpp-9f-"));
  }
  function cleanup(): void {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  }

  function baseInput(extra: Partial<Parameters<typeof writeAccountFile>[0]> = {}) {
    return {
      id: "test-9f",
      enabled: true,
      apiBaseUrl: "https://test.api",
      wsUrl: "wss://test/ws",
      tokenKeyEnv: "WPP_TEST_TOKEN",
      authcodeEnv: "WPP_TEST_AUTH",
      webhookHost: "0.0.0.0",
      webhookPort: 4398,
      webhookPath: "/test/webhook",
      allowFrom: [],
      groupPolicy: "open" as const,
      nickname: "testbot",
      requireAtMention: true,
      debounceMs: 1500,
      agent: "wpp-wechat",
      ...extra,
    };
  }

  test("v1.1.12 P0 字段: webhookBusinessPath 未设不写", async () => {
    setup();
    try {
      const fp = join(tmpDir, "test-9f-1.json");
      await writeAccountFile({ ...baseInput({ id: "test-9f-1" }) });
      // 实际写到了 process.cwd()/accounts 目录, 验证那里
      const written = readFileSync(join(process.cwd(), "accounts", "test-9f-1.json"), "utf8");
      assert.ok(!written.includes("webhookBusinessPath"), "未设 webhookBusinessPath 不应写");
    } finally {
      cleanup();
      rmSync(join(process.cwd(), "accounts", "test-9f-1.json"), { force: true });
    }
  });

  test("v1.1.12 P0 字段: webhookBusinessPath=set 时写入", async () => {
    setup();
    try {
      await writeAccountFile({
        ...baseInput({ id: "test-9f-2", webhookBusinessPath: "/wechatpadpro/test/webhook/business" }),
      });
      const written = JSON.parse(readFileSync(join(process.cwd(), "accounts", "test-9f-2.json"), "utf8"));
      assert.equal(written.webhookBusinessPath, "/wechatpadpro/test/webhook/business");
    } finally {
      cleanup();
      rmSync(join(process.cwd(), "accounts", "test-9f-2.json"), { force: true });
    }
  });

  test("v1.1.12 P0 字段: webhookPublicUrl + autoSetWebhook 写入", async () => {
    setup();
    try {
      await writeAccountFile({
        ...baseInput({
          id: "test-9f-3",
          webhookPublicUrl: "https://wx.juhe.chat",
          autoSetWebhook: false,
          setWebhookRetries: 5,
        }),
      });
      const w = JSON.parse(readFileSync(join(process.cwd(), "accounts", "test-9f-3.json"), "utf8"));
      assert.equal(w.webhookPublicUrl, "https://wx.juhe.chat");
      assert.equal(w.autoSetWebhook, false);
      assert.equal(w.setWebhookRetries, 5);
    } finally {
      cleanup();
      rmSync(join(process.cwd(), "accounts", "test-9f-3.json"), { force: true });
    }
  });

  test("v1.1.39 SUNNOY: adminUsers 数组写入", async () => {
    setup();
    try {
      await writeAccountFile({
        ...baseInput({ id: "test-9f-4", adminUsers: ["q139198824", "zhujun"] }),
      });
      const w = JSON.parse(readFileSync(join(process.cwd(), "accounts", "test-9f-4.json"), "utf8"));
      assert.deepEqual(w.adminUsers, ["q139198824", "zhujun"]);
    } finally {
      cleanup();
      rmSync(join(process.cwd(), "accounts", "test-9f-4.json"), { force: true });
    }
  });

  test("v1.1.39 SUNNOY: commandAllowlist 嵌套对象写入", async () => {
    setup();
    try {
      await writeAccountFile({
        ...baseInput({
          id: "test-9f-5",
          commandAllowlist: { allowlist: ["reset", "status"], prefix: "/", blockMessage: "禁止" },
        }),
      });
      const w = JSON.parse(readFileSync(join(process.cwd(), "accounts", "test-9f-5.json"), "utf8"));
      assert.deepEqual(w.commandAllowlist, {
        allowlist: ["reset", "status"],
        prefix: "/",
        blockMessage: "禁止",
      });
    } finally {
      cleanup();
      rmSync(join(process.cwd(), "accounts", "test-9f-5.json"), { force: true });
    }
  });

  test("v1.1.40 GLOBAL-CONFIG: sync 嵌套 4 字段写入", async () => {
    setup();
    try {
      await writeAccountFile({
        ...baseInput({
          id: "test-9f-6",
          sync: {
            enableWsClient: false,
            enableHttpFallback: true,
            fallbackSyncMs: 30000,
            wsReconnect: { initialDelayMs: 500, maxDelayMs: 60000, multiplier: 3 },
          },
        }),
      });
      const w = JSON.parse(readFileSync(join(process.cwd(), "accounts", "test-9f-6.json"), "utf8"));
      assert.equal(w.sync.enableWsClient, false);
      assert.equal(w.sync.enableHttpFallback, true);
      assert.equal(w.sync.fallbackSyncMs, 30000);
      assert.equal(w.sync.wsReconnect.initialDelayMs, 500);
      assert.equal(w.sync.wsReconnect.maxDelayMs, 60000);
      assert.equal(w.sync.wsReconnect.multiplier, 3);
    } finally {
      cleanup();
      rmSync(join(process.cwd(), "accounts", "test-9f-6.json"), { force: true });
    }
  });

  test("完整 9 字段组合一次写入", async () => {
    setup();
    try {
      await writeAccountFile({
        ...baseInput({
          id: "test-9f-7",
          webhookBusinessPath: "/wechatpadpro/test/webhook/business",
          webhookPublicUrl: "https://wx.juhe.chat",
          autoSetWebhook: true,
          setWebhookRetries: 3,
          adminUsers: ["q139198824"],
          commandAllowlist: { allowlist: ["reset"] },
          sync: { enableWsClient: true, fallbackSyncMs: 60000 },
        }),
      });
      const w = JSON.parse(readFileSync(join(process.cwd(), "accounts", "test-9f-7.json"), "utf8"));
      // 9 字段全部存在
      assert.equal(w.webhookBusinessPath, "/wechatpadpro/test/webhook/business");
      assert.equal(w.webhookPublicUrl, "https://wx.juhe.chat");
      assert.equal(w.autoSetWebhook, true);
      assert.equal(w.setWebhookRetries, 3);
      assert.deepEqual(w.adminUsers, ["q139198824"]);
      assert.deepEqual(w.commandAllowlist, { allowlist: ["reset"] });
      assert.equal(w.sync.enableWsClient, true);
      assert.equal(w.sync.fallbackSyncMs, 60000);
    } finally {
      cleanup();
      rmSync(join(process.cwd(), "accounts", "test-9f-7.json"), { force: true });
    }
  });

  test("未设 sync/adminUsers/commandAllowlist 时 JSON 干净", async () => {
    setup();
    try {
      await writeAccountFile({ ...baseInput({ id: "test-9f-8" }) });
      const written = readFileSync(join(process.cwd(), "accounts", "test-9f-8.json"), "utf8");
      assert.ok(!written.includes("adminUsers"), "未设 adminUsers 不应写");
      assert.ok(!written.includes("commandAllowlist"), "未设 commandAllowlist 不应写");
      assert.ok(!written.includes('"sync"'), "未设 sync 不应写");
      assert.ok(!written.includes("webhookBusinessPath"), "未设 webhookBusinessPath 不应写");
    } finally {
      cleanup();
      rmSync(join(process.cwd(), "accounts", "test-9f-8.json"), { force: true });
    }
  });
});