// tests/setup-wizard-7-fields.test.ts - v1.1.44 SETUP-COMPLETE
// 验证 7 字段补全后的 AddAccountInput + writeAccountFile 行为

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAccountFile } from "../src/setup-wizard.js";

describe("v1.1.44 SETUP-COMPLETE 7 字段补全", () => {
  function baseInput(extra: Partial<Parameters<typeof writeAccountFile>[0]> = {}) {
    return {
      id: "test-7f",
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

  function readWritten(id: string): Record<string, unknown> {
    const fp = join(process.cwd(), "accounts", `${id}.json`);
    const data = readFileSync(fp, "utf8");
    rmSync(fp, { force: true });
    return JSON.parse(data) as Record<string, unknown>;
  }

  test("groupAllowFrom 数组写入", async () => {
    await writeAccountFile({
      ...baseInput({ id: "test-7f-1", groupAllowFrom: ["123@chatroom", "456@chatroom"] }),
    });
    const w = readWritten("test-7f-1");
    assert.deepEqual(w.groupAllowFrom, ["123@chatroom", "456@chatroom"]);
  });

  test("selfWxid 字符串写入", async () => {
    await writeAccountFile({
      ...baseInput({ id: "test-7f-2", selfWxid: "q139198824" }),
    });
    const w = readWritten("test-7f-2");
    assert.equal(w.selfWxid, "q139198824");
  });

  test("keywordTrigger 嵌套对象 (mode=regex)", async () => {
    await writeAccountFile({
      ...baseInput({
        id: "test-7f-3",
        keywordTrigger: { enabled: true, keywords: ["help", "reset"], mode: "regex" },
      }),
    });
    const w = readWritten("test-7f-3");
    assert.deepEqual(w.keywordTrigger, {
      enabled: true,
      keywords: ["help", "reset"],
      mode: "regex",
    });
  });

  test("msgTypeTrigger 嵌套对象 (appMsgTypes + whitelistGroups)", async () => {
    await writeAccountFile({
      ...baseInput({
        id: "test-7f-4",
        msgTypeTrigger: { enabled: true, appMsgTypes: [3, 43], whitelistGroups: ["123@chatroom"] },
      }),
    });
    const w = readWritten("test-7f-4");
    assert.deepEqual(w.msgTypeTrigger, {
      enabled: true,
      appMsgTypes: [3, 43],
      whitelistGroups: ["123@chatroom"],
    });
  });

  test("quoteBotTrigger 嵌套对象", async () => {
    await writeAccountFile({
      ...baseInput({ id: "test-7f-5", quoteBotTrigger: { enabled: true } }),
    });
    const w = readWritten("test-7f-5");
    assert.deepEqual(w.quoteBotTrigger, { enabled: true });
  });

  test("blacklistGroups 数组写入", async () => {
    await writeAccountFile({
      ...baseInput({ id: "test-7f-6", blacklistGroups: ["junk@chatroom"] }),
    });
    const w = readWritten("test-7f-6");
    assert.deepEqual(w.blacklistGroups, ["junk@chatroom"]);
  });

  test("chatroomDebug boolean 写入 (true/false 都写)", async () => {
    await writeAccountFile({
      ...baseInput({ id: "test-7f-7", chatroomDebug: true }),
    });
    const w = readWritten("test-7f-7");
    assert.equal(w.chatroomDebug, true);
  });

  test("未设 7 字段时 JSON 干净", async () => {
    await writeAccountFile({ ...baseInput({ id: "test-7f-8" }) });
    const fp = join(process.cwd(), "accounts", "test-7f-8.json");
    const written = readFileSync(fp, "utf8");
    rmSync(fp, { force: true });
    for (const f of ["groupAllowFrom", "selfWxid", "keywordTrigger", "msgTypeTrigger", "quoteBotTrigger", "blacklistGroups", "chatroomDebug"]) {
      assert.ok(!written.includes(`"${f}"`), `未设 ${f} 不应出现在 JSON 中`);
    }
  });

  test("完整 7 字段组合一次写入", async () => {
    await writeAccountFile({
      ...baseInput({
        id: "test-7f-9",
        groupAllowFrom: ["g1@chatroom"],
        selfWxid: "q139198824",
        keywordTrigger: { enabled: true, keywords: ["help"] },
        msgTypeTrigger: { enabled: true },
        quoteBotTrigger: { enabled: true },
        blacklistGroups: ["junk@chatroom"],
        chatroomDebug: true,
      }),
    });
    const w = readWritten("test-7f-9");
    assert.deepEqual(w.groupAllowFrom, ["g1@chatroom"]);
    assert.equal(w.selfWxid, "q139198824");
    assert.deepEqual(w.keywordTrigger, { enabled: true, keywords: ["help"] });
    assert.deepEqual(w.msgTypeTrigger, { enabled: true });
    assert.deepEqual(w.quoteBotTrigger, { enabled: true });
    assert.deepEqual(w.blacklistGroups, ["junk@chatroom"]);
    assert.equal(w.chatroomDebug, true);
  });
});