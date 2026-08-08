// tests/setup-wizard.test.ts - v1.1.0 setup wizard 单元测试
// 注意: src/setup-wizard.ts 用 findPluginRoot() 走 plugin 真路径, 不走 cwd
//       所以测试必须在 真 accounts/ 目录操作 + beforeEach/afterEach 清理
//       不能用 mkdtemp + chdir 隔离 (findPluginRoot 不跟 cwd)

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { findPluginRoot } from "../src/core/paths.js";
import {
  listAccountsDetailed,
  validateAccount,
  writeAccountFile,
  removeAccountFile,
  validateAddInput,
  ACCOUNTS_DIR,
} from "../src/setup-wizard.js";

const ACCOUNTS_REAL_DIR = join(await findPluginRoot(), "accounts");
const INVALID_INPUT = { id: "../etc", enabled: true, tokenKeyEnv: "X", authcodeEnv: "X", apiBaseUrl: "x", wsUrl: "x", webhookHost: "x", webhookPort: 443, webhookPath: "/x", allowFrom: [], groupPolicy: "open" as const, nickname: "x", requireAtMention: true, debounceMs: 1000 };
const DUP_INPUT = { id: "dup-test", enabled: true, tokenKeyEnv: "X", authcodeEnv: "X", apiBaseUrl: "x", wsUrl: "x", webhookHost: "x", webhookPort: 443, webhookPath: "/x", allowFrom: [], groupPolicy: "open" as const, nickname: "x", requireAtMention: true, debounceMs: 1000 };

// ===== 测试 setup: 备份 + 还原 accounts/ 真实目录 =====

let backup: Map<string, string> = new Map();

function backupAccounts() {
  backup.clear();
  if (!existsSync(ACCOUNTS_REAL_DIR)) {
    mkdirSync(ACCOUNTS_REAL_DIR, { recursive: true });
    return;
  }
  for (const f of readdirSync(ACCOUNTS_REAL_DIR)) {
    if (f.endsWith(".json")) {
      const p = join(ACCOUNTS_REAL_DIR, f);
      backup.set(f, readFileSync(p, "utf8"));
    }
  }
}

function restoreAccounts() {
  if (existsSync(ACCOUNTS_REAL_DIR)) {
    for (const f of readdirSync(ACCOUNTS_REAL_DIR)) {
      if (f.endsWith(".json") && !backup.has(f)) {
        try { rmSync(join(ACCOUNTS_REAL_DIR, f)); } catch {}
      }
    }
  }
  for (const [f, content] of backup) {
    writeFileSync(join(ACCOUNTS_REAL_DIR, f), content, "utf8");
  }
}

function clearAccounts() {
  if (!existsSync(ACCOUNTS_REAL_DIR)) return;
  for (const f of readdirSync(ACCOUNTS_REAL_DIR)) {
    if (f.endsWith(".json")) {
      try { rmSync(join(ACCOUNTS_REAL_DIR, f)); } catch {}
    }
  }
}

let backedUp = false;

function ensureBackup() {
  if (!backedUp) {
    backupAccounts();
    backedUp = true;
  }
}

beforeEach(() => {
  ensureBackup();
});

after(() => {
  // 强制恢复一次 (无论 test pass/fail)
  restoreAccounts();
  backedUp = false;
});

function writeTestAccount(id: string, cfg: Record<string, unknown>): void {
  writeFileSync(join(ACCOUNTS_REAL_DIR, `${id}.json`), JSON.stringify(cfg, null, 2), "utf8");
}

// 辅助: 删 test 写入的文件 (不删 default.json)
function cleanupTestAccounts(...ids: string[]) {
  for (const id of ids) {
    try { rmSync(join(ACCOUNTS_REAL_DIR, `${id}.json`)); } catch {}
  }
}

// ===== listAccountsDetailed =====

// 注: listAccountIds() (在 config.ts) 走 findPluginRoot 读真 accounts/, 不受 WPP_ACCOUNTS_DIR 影响
//       所以 "空目录" 这个边界 case 测不到 (真 accounts/ 至少有 default.json)
//       测 "1 账号 + env 缺失" 已经覆盖了核心行为

test("listAccountsDetailed — 1 账号 + env 缺失标 configured=false", async () => {
  writeTestAccount("test-acc-1", {
    enabled: true, tokenKeyEnv: "TEST_TOKEN_1", apiBaseUrl: "http://x",
    authcodeEnv: "TEST_AUTH_1", nickname: "T1", groupPolicy: "open",
    webhookHost: "0.0.0.0", webhookPort: 5000, webhookPath: "/wpp",
  });
  delete process.env.TEST_TOKEN_1;
  delete process.env.TEST_AUTH_1;

  const entries = await listAccountsDetailed();
  const ours = entries.find((e) => e.id === "test-acc-1");
  assert.ok(ours, "应找到 test-acc-1");
  assert.equal(ours!.configured, false);
  assert.deepEqual(ours!.envHints.sort(), ["TEST_AUTH_1", "TEST_TOKEN_1"].sort());
});


test("listAccountsDetailed — env 都配 → configured=true", async () => {
  writeTestAccount("test-acc-2", {
    enabled: true, tokenKeyEnv: "TEST_TOKEN_2", apiBaseUrl: "http://x",
    authcodeEnv: "TEST_AUTH_2", nickname: "T2", groupPolicy: "open",
    webhookHost: "0.0.0.0", webhookPort: 5001, webhookPath: "/wpp",
  });
  process.env.TEST_TOKEN_2 = "tk";
  process.env.TEST_AUTH_2 = "au";

  const entries = await listAccountsDetailed();
  const ours = entries.find((e) => e.id === "test-acc-2");
  assert.ok(ours);
  assert.equal(ours!.configured, true);
  assert.deepEqual(ours!.envHints, []);
});

// ===== validateAccount =====

test("validateAccount — 无效 accountId (path traversal) 返 fail", async () => {
  const r = await validateAccount("../etc/passwd");
  assert.equal(r[0]!.label, "accountId 合法");
  assert.equal(r[0]!.level, "fail");
});

test("validateAccount — 不存在的 file 返 fail", async () => {
  const r = await validateAccount("nonexistent-test-zzz");
  const fileCheck = r.find((c) => c.label === "accounts file 存在");
  assert.equal(fileCheck?.level, "fail");
});

test("validateAccount — JSON 损坏返 fail", async () => {
  writeFileSync(join(ACCOUNTS_REAL_DIR, "broken-test.json"), "{not valid json", "utf8");
  const r = await validateAccount("broken-test");
  const jsonCheck = r.find((c) => c.label === "JSON 解析");
  assert.equal(jsonCheck?.level, "fail");
});

test("validateAccount — 完整账号, env 都配 → 0 fail", async () => {
  writeTestAccount("happy-test", {
    enabled: true, tokenKeyEnv: "HAPPY_TOKEN", apiBaseUrl: "http://x",
    authcodeEnv: "HAPPY_AUTH", nickname: "H", groupPolicy: "open",
    webhookHost: "0.0.0.0", webhookPort: 5002, webhookPath: "/wpp",
  });
  process.env.HAPPY_TOKEN = "tk-1234";
  process.env.HAPPY_AUTH = "au-1234";

  const r = await validateAccount("happy-test");
  const fails = r.filter((c) => c.level === "fail");
  assert.equal(fails.length, 0, `应 0 fail, 实际 ${fails.length}: ${JSON.stringify(fails)}`);
});

test("validateAccount — webhookPort 1023 返 fail", async () => {
  writeTestAccount("lowport-test", {
    enabled: true, tokenKeyEnv: "LP_TOKEN", apiBaseUrl: "http://x",
    authcodeEnv: "LP_AUTH", nickname: "L", groupPolicy: "open",
    webhookHost: "0.0.0.0", webhookPort: 1023, webhookPath: "/wpp",
  });
  process.env.LP_TOKEN = "x";
  process.env.LP_AUTH = "x";
  const r = await validateAccount("lowport-test");
  const portCheck = r.find((c) => c.label.includes("webhook port"));
  assert.equal(portCheck?.level, "fail");
});

// ===== writeAccountFile =====

test("writeAccountFile — 合法输入写盘, 内容 JSON 正确", async () => {
  const input = {
    id: "newacc-test",
    enabled: true,
    apiBaseUrl: "https://test.com",
    wsUrl: "wss://test.com/ws",
    tokenKeyEnv: "NEWACC_TOKEN",
    authcodeEnv: "NEWACC_AUTH",
    webhookHost: "127.0.0.1",
    webhookPort: 5003,
    webhookPath: "/webhook",
    allowFrom: ["alice"],
    groupPolicy: "open" as const,
    nickname: "New",
    requireAtMention: true,
    debounceMs: 1000,
  };
  const { filePath, json } = await writeAccountFile(input);
  assert.ok(existsSync(filePath));
  const content = JSON.parse(json);
  assert.equal(content.tokenKey, "", "tokenKey 必空 (走 env)");
  assert.equal(content.tokenKeyEnv, "NEWACC_TOKEN");
  assert.equal(content.allowFrom[0], "alice");
  const onDisk = JSON.parse(readFileSync(filePath, "utf8"));
  assert.equal(onDisk.apiBaseUrl, "https://test.com");
});

test("writeAccountFile — 无效 id 抛错 (path traversal 拒绝)", async () => {
  const input = {
    id: "../etc",
    enabled: true,
    apiBaseUrl: "x", wsUrl: "x",
    tokenKeyEnv: "x", authcodeEnv: "x",
    webhookHost: "x", webhookPort: 5000,
    webhookPath: "/x",
    allowFrom: [], groupPolicy: "open" as const,
    nickname: "x", requireAtMention: true, debounceMs: 1000,
  };
  await assert.rejects(() => writeAccountFile(input), /invalid accountId/);
});

test("writeAccountFile — 重复 id 抛错", async () => {
  await writeAccountFile(DUP_INPUT);
  await assert.rejects(
    () => writeAccountFile(DUP_INPUT),
    /already exists/,
  );
});

// ===== removeAccountFile =====

test("removeAccountFile — 存在 → 删", async () => {
  const filePath = join(ACCOUNTS_REAL_DIR, "torm-test.json");
  writeFileSync(filePath, "{}", "utf8");
  assert.ok(existsSync(filePath));
  const result = await removeAccountFile("torm-test");
  assert.equal(result.filePath, filePath);
  assert.equal(existsSync(filePath), false);
});

test("removeAccountFile — 不存在抛错", async () => {
  await assert.rejects(() => removeAccountFile("ghost-test-zzz"), /does not exist/);
});

test("removeAccountFile — path traversal 拒绝", async () => {
  await assert.rejects(() => removeAccountFile("../etc"), /invalid accountId/);
});

// ===== validateAddInput =====

test("validateAddInput — 缺 id 返错", () => {
  const errors = validateAddInput({
    apiBaseUrl: "x", wsUrl: "x", tokenKeyEnv: "x", authcodeEnv: "x",
    webhookHost: "x", webhookPort: 5000, webhookPath: "/x",
    groupPolicy: "open", debounceMs: 1000,
  });
  assert.ok(errors.length > 0);
  assert.ok(errors[0]!.includes("id"));
});

test("validateAddInput — 完整输入返 []", () => {
  const errors = validateAddInput({
    id: "valid_id", apiBaseUrl: "x", wsUrl: "x",
    tokenKeyEnv: "x", authcodeEnv: "x",
    webhookHost: "x", webhookPort: 5000, webhookPath: "/x",
    groupPolicy: "open", debounceMs: 1000,
  });
  assert.deepEqual(errors, []);
});

test("validateAddInput — webhookPort 80 返错 (非特权端口拒绝)", () => {
  const errors = validateAddInput({
    id: "ok", apiBaseUrl: "x", wsUrl: "x",
    tokenKeyEnv: "x", authcodeEnv: "x",
    webhookHost: "x", webhookPort: 80, webhookPath: "/x",
    groupPolicy: "open", debounceMs: 1000,
  });
  assert.ok(errors.some((e) => e.includes("webhookPort")));
});
