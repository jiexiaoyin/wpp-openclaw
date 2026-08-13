// tests/pairing-allow-from.test.ts - v1.2.3 PAIRING appendAllowFrom (写 accounts/<id>.json)
// 覆盖: round-trip 不丢字段 / 合并新 wxid / 已存在 no-op / 不存在的账号 ok:false
// ⚠️ appendAllowFrom 走 findPluginRoot()/accounts (真目录), 必须备份/还原 (同 setup-wizard.test.ts)

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { findPluginRoot } from "../src/core/paths.js";
import { appendAllowFrom, loadAccountConfig } from "../src/config.js";

const ACCOUNTS_REAL_DIR = join(await findPluginRoot(), "accounts");
const TEST_ACCOUNT = "pairing-test-acc";
const TEST_FILE = join(ACCOUNTS_REAL_DIR, `${TEST_ACCOUNT}.json`);

const backup = new Map<string, string>();

function backupAccounts() {
  backup.clear();
  if (!existsSync(ACCOUNTS_REAL_DIR)) {
    mkdirSync(ACCOUNTS_REAL_DIR, { recursive: true });
    return;
  }
  for (const f of readdirSync(ACCOUNTS_REAL_DIR)) {
    if (f.endsWith(".json")) {
      backup.set(f, readFileSync(join(ACCOUNTS_REAL_DIR, f), "utf8"));
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

beforeEach(() => {
  backupAccounts();
  // v1.3.57 P2-7 (2026-08-13 交付审阅): 清掉非备份的残留测试账号文件, 防并行竞态
  if (existsSync(ACCOUNTS_REAL_DIR)) {
    for (const f of readdirSync(ACCOUNTS_REAL_DIR)) {
      if (f.endsWith(".json") && !backup.has(f)) {
        try { rmSync(join(ACCOUNTS_REAL_DIR, f)); } catch {}
      }
    }
  }
});

after(() => {
  restoreAccounts();
});

test("v1.2.3 — appendAllowFrom 合并新 wxid + round-trip 不丢其它字段", async () => {
  // 构造一个带其它字段的账号配置 (模拟真实 accounts/<id>.json)
  const base = {
    enabled: true,
    tokenKeyEnv: "WECHATPRO_TOKEN_KEY",
    authcodeEnv: "WECHATPRO_AUTHCODE",
    apiBaseUrl: "https://wx.juhe.chat",
    wsUrl: "wss://wx.juhe.chat/ws/sync",
    webhookHost: "127.0.0.1",
    webhookPort: 4398,
    webhookPath: "/wechatpadpro/test/webhook",
    allowFrom: ["wxid_existing"],
    groupPolicy: "allowlist",
    groupAllowFrom: ["57737516566@chatroom"],
    selfWxid: "q139198824",
    agent: "wpp-wechat",
    mcpEnabled: false,
    nickname: "TestBot",
    requireAtMention: true,
    debounceMs: 1500,
  };
  writeFileSync(TEST_FILE, JSON.stringify(base, null, 2) + "\n", "utf8");

  const r = await appendAllowFrom(TEST_ACCOUNT, "wxid_newcomer");
  assert.equal(r.ok, true);
  assert.deepEqual(r.allowFrom, ["wxid_existing", "wxid_newcomer"]);

  // round-trip: 磁盘文件其它字段不丢
  const onDisk = JSON.parse(readFileSync(TEST_FILE, "utf8")) as Record<string, unknown>;
  assert.deepEqual(onDisk.allowFrom, ["wxid_existing", "wxid_newcomer"]);
  assert.equal(onDisk.groupPolicy, "allowlist");
  assert.equal(onDisk.groupAllowFrom?.length, 1);
  assert.equal(onDisk.selfWxid, "q139198824");
  assert.equal(onDisk.agent, "wpp-wechat");
  assert.equal(onDisk.mcpEnabled, false);
  assert.equal(onDisk.nickname, "TestBot");
});

test("v1.2.3 — appendAllowFrom 已存在 wxid → no-op (allowFrom 不变)", async () => {
  writeFileSync(TEST_FILE, JSON.stringify({
    enabled: true,
    tokenKeyEnv: "X", authcodeEnv: "X",
    apiBaseUrl: "x", wsUrl: "x",
    webhookHost: "x", webhookPort: 443, webhookPath: "/x",
    allowFrom: ["wxid_existing"],
    groupPolicy: "open",
    agent: "wpp-wechat",
    nickname: "x", requireAtMention: true, debounceMs: 1000,
  }, null, 2) + "\n", "utf8");

  const r = await appendAllowFrom(TEST_ACCOUNT, "wxid_existing");
  assert.equal(r.ok, true);
  assert.deepEqual(r.allowFrom, ["wxid_existing"], "已存在 → 不重复添加");
});

test("v1.2.3 — appendAllowFrom 不存在的账号 → ok:false", async () => {
  if (existsSync(TEST_FILE)) rmSync(TEST_FILE);
  const r = await appendAllowFrom(TEST_ACCOUNT, "wxid_x");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "account-not-found");
});

test("v1.2.3 — appendAllowFrom 写后 loadAccountConfig 读到新 allowFrom (cache 失效)", async () => {
  writeFileSync(TEST_FILE, JSON.stringify({
    enabled: true,
    tokenKeyEnv: "X", authcodeEnv: "X",
    apiBaseUrl: "x", wsUrl: "x",
    webhookHost: "x", webhookPort: 443, webhookPath: "/x",
    allowFrom: [],
    groupPolicy: "open",
    agent: "wpp-wechat",
    nickname: "x", requireAtMention: true, debounceMs: 1000,
  }, null, 2) + "\n", "utf8");

  const r = await appendAllowFrom(TEST_ACCOUNT, "wxid_new");
  assert.equal(r.ok, true);
  // invalidateConfigCache 生效: loadAccountConfig 读到新 allowFrom
  const cfg = await loadAccountConfig(TEST_ACCOUNT);
  assert.ok(cfg.allowFrom.includes("wxid_new"), "写后 loadAccountConfig 应读到新 allowFrom");
});
