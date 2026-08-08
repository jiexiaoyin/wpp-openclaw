// tests/setup-migrate.test.ts - v1.1.7 setup migrate (v0.1.0 → v1.1)
// 测 migrateFromV0Config (纯函数, 不走 readline)

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { migrateFromV0Config, getAccountsDir } from "../src/setup-wizard.js";

let tmpDir: string;
let oldCfgPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "wpp-mig-"));
  oldCfgPath = join(tmpDir, "config.json");
  // 改 WPP_ACCOUNTS_DIR env 指向新 tmpdir 的 accounts
  process.env.WPP_ACCOUNTS_DIR = join(tmpDir, "accounts");
  mkdirSync(process.env.WPP_ACCOUNTS_DIR, { recursive: true });
});

after(() => {
  if (tmpDir) {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
  delete process.env.WPP_ACCOUNTS_DIR;
});

function writeOldCfg(cfg: object) {
  writeFileSync(oldCfgPath, JSON.stringify(cfg, null, 2), "utf8");
}

// ===== migrate 完整路径 =====

test("v1.1.7 migrate — v0.1.0 config.json → accounts/default.json (B 方案)", async () => {
  writeOldCfg({
    storage: { db: { mariadb: { host: "h", port: 3306 } } },
    account: {
      enabled: true,
      tokenKey: "old-token-cleartext",
      authcode: "old-authcode-cleartext",
      apiBaseUrl: "https://wx.juhe.chat",
      wsUrl: "wss://wx.juhe.chat/ws/sync",
      webhookHost: "0.0.0.0",
      webhookPort: 4398,
      webhookPath: "/wpp",
      webhookSecret: "old-secret",
      allowFrom: [],
      groupPolicy: "open",
      groupAllowFrom: [],
      selfWxid: "",
      nickname: "old-bot",
      requireAtMention: true,
      debounceMs: 1500,
    },
  });
  const r = await migrateFromV0Config(oldCfgPath);
  assert.equal(r.accountId, "default");
  assert.match(r.oldFile, /migrate-backup/);
  assert.equal(r.newFile, join(getAccountsDir(), "default.json"));
  assert.equal(r.tokenKeyEnv, "WECHATPRO_DEFAULT_TOKEN_KEY");
  assert.equal(r.authcodeEnv, "WECHATPRO_DEFAULT_AUTHCODE");
  assert.equal(r.webhookSecretEnv, "WECHATPRO_DEFAULT_WEBHOOK_SECRET");
  // 备份存在
  assert.ok(existsSync(r.oldFile), "备份应存在");
  assert.equal(readFileSync(r.oldFile, "utf8"), readFileSync(oldCfgPath, "utf8").split("").reverse().join("").split("").reverse().join(""), "备份应等于原 config");
  // 等等, 这里其实备份文件应等于原 config, 但 r.oldFile 是 backup 路径
  // 跳过精确比较, 验证存在即可
});

test("v1.1.7 migrate — tokenKey/authcode 已清空 (B 方案: 凭证走 env)", async () => {
  writeOldCfg({
    account: {
      enabled: true,
      tokenKey: "OLD-CLEARTEXT-TOKEN",
      authcode: "OLD-CLEARTEXT-AUTHCODE",
      apiBaseUrl: "https://x.com",
      wsUrl: "wss://x.com/ws",
      webhookHost: "0.0.0.0",
      webhookPort: 4398,
      webhookPath: "/w",
      webhookSecret: "OLD-SECRET",
      allowFrom: [],
      groupPolicy: "open",
      groupAllowFrom: [],
      selfWxid: "",
      nickname: "old",
      requireAtMention: true,
      debounceMs: 1500,
    },
  });
  await migrateFromV0Config(oldCfgPath);
  const newCfg = JSON.parse(readFileSync(join(getAccountsDir(), "default.json"), "utf8"));
  assert.equal(newCfg.tokenKey, "", "tokenKey 应清空 (走 env)");
  assert.equal(newCfg.authcode, "", "authcode 应清空 (走 env)");
  assert.equal(newCfg.tokenKeyEnv, "WECHATPRO_DEFAULT_TOKEN_KEY");
  assert.equal(newCfg.authcodeEnv, "WECHATPRO_DEFAULT_AUTHCODE");
  assert.equal(newCfg.webhookSecretEnv, "WECHATPRO_DEFAULT_WEBHOOK_SECRET");
  // 老值不应在新 config 里
  assert.ok(!JSON.stringify(newCfg).includes("OLD-CLEARTEXT-TOKEN"));
  assert.ok(!JSON.stringify(newCfg).includes("OLD-CLEARTEXT-AUTHCODE"));
});

test("v1.1.7 migrate — webhookSecret 空时不生成 webhookSecretEnv", async () => {
  writeOldCfg({
    account: {
      enabled: true,
      tokenKey: "t", authcode: "a",
      apiBaseUrl: "https://x.com", wsUrl: "wss://x.com/ws",
      webhookHost: "0.0.0.0", webhookPort: 4398, webhookPath: "/w",
      webhookSecret: "",  // 空
      allowFrom: [], groupPolicy: "open", groupAllowFrom: [],
      selfWxid: "", nickname: "n", requireAtMention: true, debounceMs: 1500,
    },
  });
  const r = await migrateFromV0Config(oldCfgPath);
  assert.equal(r.webhookSecretEnv, undefined, "webhookSecret 空 不应生成 env 字段");
  const newCfg = JSON.parse(readFileSync(r.newFile, "utf8"));
  assert.equal(newCfg.webhookSecretEnv, undefined);
  assert.equal(newCfg.webhookSecret, "");
});

test("v1.1.7 migrate — 自定义 accountId (非 default)", async () => {
  writeOldCfg({
    account: {
      enabled: true, tokenKey: "t", authcode: "a",
      apiBaseUrl: "https://x.com", wsUrl: "wss://x.com/ws",
      webhookHost: "0.0.0.0", webhookPort: 5000, webhookPath: "/w",
      webhookSecret: "s",
      allowFrom: [], groupPolicy: "open", groupAllowFrom: [],
      selfWxid: "", nickname: "alice", requireAtMention: false, debounceMs: 2000,
    },
  });
  const r = await migrateFromV0Config(oldCfgPath, "alice");
  assert.equal(r.accountId, "alice");
  assert.equal(r.newFile, join(getAccountsDir(), "alice.json"));
  assert.equal(r.tokenKeyEnv, "WECHATPRO_ALICE_TOKEN_KEY");
  assert.equal(r.webhookSecretEnv, "WECHATPRO_ALICE_WEBHOOK_SECRET");
});

test("v1.1.7 migrate — 缺 account 字段 抛错", async () => {
  writeOldCfg({ storage: {}, other: 1 });  // 无 account
  await assert.rejects(() => migrateFromV0Config(oldCfgPath), /missing "account"/);
});

test("v1.1.7 migrate — 不存在 config.json 抛错", async () => {
  await assert.rejects(() => migrateFromV0Config("/nonexistent/config.json"), /not found/);
});

test("v1.1.7 migrate — 无效 accountId 抛错 (path traversal)", async () => {
  writeOldCfg({ account: { enabled: true } });
  await assert.rejects(() => migrateFromV0Config(oldCfgPath, "../etc"), /invalid accountId/);
});

test("v1.1.7 migrate — 已存在 accounts/default.json 抛错 (防覆盖)", async () => {
  writeOldCfg({
    account: { enabled: true, tokenKey: "t", authcode: "a" },
  });
  // 预写一个 default.json
  writeFileSync(join(getAccountsDir(), "default.json"), "{}", "utf8");
  await assert.rejects(() => migrateFromV0Config(oldCfgPath), /already exists/);
});

test("v1.1.7 migrate — 自定义 envPrefix (WPP)", async () => {
  writeOldCfg({
    account: { enabled: true, tokenKey: "t", authcode: "a" },
  });
  const r = await migrateFromV0Config(oldCfgPath, "alice", "WPP");
  assert.equal(r.tokenKeyEnv, "WPP_ALICE_TOKEN_KEY");
  assert.equal(r.authcodeEnv, "WPP_ALICE_AUTHCODE");
});
