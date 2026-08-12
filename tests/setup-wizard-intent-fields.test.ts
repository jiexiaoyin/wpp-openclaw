// tests/setup-wizard-intent-fields.test.ts - v1.3.30 SETUP-INTENT
// 验证意图判断 + 群上下文细节字段补全后的写入行为
//   llmIntentEnabled/llmIntentTimeoutMs/llmIntentModel
//   embedIntentEnabled/embedIntentTopN/embedIntentThreshold
//   groupContextMaxImages / groupContextWindow

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAccountFile, validateAddInput } from "../src/setup-wizard.js";

describe("v1.3.30 SETUP-INTENT 字段补全", () => {
  let tmpDir: string;
  function setup(): void {
    tmpDir = mkdtempSync(join(tmpdir(), "wpp-intent-"));
    process.env.WPP_ACCOUNTS_DIR = tmpDir; // 指向临时目录, 不污染真实 accounts/
  }
  function cleanup(): void {
    delete process.env.WPP_ACCOUNTS_DIR;
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  }

  function baseInput(extra: Partial<Parameters<typeof writeAccountFile>[0]> = {}) {
    return {
      id: "test-intent",
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

  test("llmIntent/embedIntent/groupContext 字段全部写入 JSON", async () => {
    setup();
    try {
      const input = baseInput({
        id: "test-intent-1",
        llmIntentEnabled: false,
        llmIntentTimeoutMs: 8000,
        llmIntentModel: "MiniMax-M2.7",
        embedIntentEnabled: false,
        embedIntentTopN: 3,
        embedIntentThreshold: 0.5,
        groupContextWindow: 30,
        groupContextMaxImages: 2,
      });
      const { filePath, json } = await writeAccountFile(input);
      const cfg = JSON.parse(readFileSync(filePath, "utf8"));
      assert.equal(cfg.llmIntentEnabled, false);
      assert.equal(cfg.llmIntentTimeoutMs, 8000);
      assert.equal(cfg.llmIntentModel, "MiniMax-M2.7");
      assert.equal(cfg.embedIntentEnabled, false);
      assert.equal(cfg.embedIntentTopN, 3);
      assert.equal(cfg.embedIntentThreshold, 0.5);
      assert.equal(cfg.groupContextWindow, 30);
      assert.equal(cfg.groupContextMaxImages, 2);
      assert.ok(json.includes("llmIntentEnabled"), "JSON 应含 llmIntentEnabled");
    } finally {
      cleanup();
    }
  });

  test("未设的意图字段不写入 (保持 JSON 干净)", async () => {
    setup();
    try {
      const { filePath } = await writeAccountFile(baseInput({ id: "test-intent-2" }));
      const cfg = JSON.parse(readFileSync(filePath, "utf8"));
      assert.equal("llmIntentEnabled" in cfg, false, "未设不应写");
      assert.equal("embedIntentEnabled" in cfg, false);
      assert.equal("groupContextMaxImages" in cfg, false);
    } finally {
      cleanup();
    }
  });

  test("validateAddInput 不因意图字段报错 (可选字段兼容)", () => {
    const errors = validateAddInput(baseInput());
    assert.equal(errors.length, 0, `应 0 错, 实际: ${errors.join("; ")}`);
  });
});
