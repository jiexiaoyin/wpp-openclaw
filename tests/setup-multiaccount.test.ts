// tests/setup-multiaccount.test.ts - v1.3.56 MULTI-ACCOUNT
// 配置引导多账号: registerAccountInOpenclaw / unregisterAccountFromOpenclaw /
//   readAccountFile / updateAccountFile / ensureAgentWorkspace per-account binding /
//   account-context (AsyncLocalStorage 穿透)
//
// 用 WPP_ACCOUNTS_DIR + OPENCLAW_ROOT 隔离 (不碰真实 accounts/ 和 openclaw.json)

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  readAccountFile,
  updateAccountFile,
  registerAccountInOpenclaw,
  unregisterAccountFromOpenclaw,
  ensureAgentWorkspace,
  getAccountsDir,
} from "../src/setup-wizard.js";
import { accountContext, getCurrentAccountId } from "../src/dispatch/account-context.js";

let tmpDir: string;
let accountsDir: string;
let openclawRoot: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "wpp-ma-"));
  accountsDir = join(tmpDir, "accounts");
  openclawRoot = join(tmpDir, "openclaw");
  mkdirSync(accountsDir, { recursive: true });
  mkdirSync(openclawRoot, { recursive: true });
  process.env.WPP_ACCOUNTS_DIR = accountsDir;
  process.env.OPENCLAW_ROOT = openclawRoot;
  // 写一个空 openclaw.json
  writeFileSync(join(openclawRoot, "openclaw.json"), JSON.stringify({ agents: { list: [] }, bindings: [] }, null, 2));
});

after(() => {
  delete process.env.WPP_ACCOUNTS_DIR;
  delete process.env.OPENCLAW_ROOT;
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

function writeAccount(id: string, extra: Record<string, unknown> = {}): void {
  writeFileSync(
    join(accountsDir, `${id}.json`),
    JSON.stringify({
      enabled: true, tokenKeyEnv: `WECHATPRO_${id.toUpperCase()}_TOKEN_KEY`,
      apiBaseUrl: "http://127.0.0.1:8062", wsUrl: "ws://127.0.0.1:8062/ws/sync",
      webhookPort: 4398, webhookPath: `/wechatpadpro/${id}/webhook`,
      allowFrom: [], groupPolicy: "open", groupAllowFrom: [], nickname: id,
      requireAtMention: true, debounceMs: 1500, agent: `wpp-${id}`,
      ...extra,
    }, null, 2) + "\n",
  );
}

// ===== readAccountFile / updateAccountFile =====

test("v1.3.56 readAccountFile — 读现有配置", async () => {
  writeAccount("alice");
  const cfg = await readAccountFile("alice");
  assert.equal(cfg.agent, "wpp-alice");
  assert.equal(cfg.nickname, "alice");
});

test("v1.3.56 readAccountFile — 不存在抛错", async () => {
  await assert.rejects(() => readAccountFile("ghost"), /does not exist/);
});

test("v1.3.56 updateAccountFile — merge 写回保留未改字段", async () => {
  writeAccount("bob");
  const { json } = await updateAccountFile("bob", { webhookPort: 4399, agent: "wpp-bob2" });
  const cfg = JSON.parse(json);
  assert.equal(cfg.webhookPort, 4399);
  assert.equal(cfg.agent, "wpp-bob2");
  assert.equal(cfg.nickname, "bob"); // 未改字段保留
});

// ===== registerAccountInOpenclaw / unregisterAccountFromOpenclaw =====

test("v1.3.56 registerAccountInOpenclaw — 登记 accounts + per-account binding", async () => {
  writeAccount("alice");
  const res = await registerAccountInOpenclaw("alice", "wpp-alice");
  assert.equal(res.registered, true);
  assert.equal(res.bindingAdded, true);

  const cfg = JSON.parse(readFileSync(join(openclawRoot, "openclaw.json"), "utf8"));
  // channels.wechatpadpro.accounts.alice
  const acc = cfg.channels.wechatpadpro.accounts.alice;
  assert.deepEqual(acc, { enabled: true, configFile: "accounts/alice.json" });
  // binding: channel=wechatpadpro, accountId=alice (精确, 非 *)
  const binding = cfg.bindings.find((b) => b.match?.accountId === "alice");
  assert.ok(binding, "应存在 alice 的 binding");
  assert.equal(binding.match.channel, "wechatpadpro", "channel 必须 wechatpadpro (不是 'last')");
  assert.equal(binding.match.accountId, "alice", "accountId 精确匹配");
  assert.equal(binding.agentId, "wpp-alice");
});

test("v1.3.56 registerAccountInOpenclaw — 幂等 (重复 add 不重复登记)", async () => {
  writeAccount("alice");
  await registerAccountInOpenclaw("alice", "wpp-alice");
  const res2 = await registerAccountInOpenclaw("alice", "wpp-alice");
  assert.equal(res2.registered, false);
  assert.equal(res2.bindingAdded, false);
  const cfg = JSON.parse(readFileSync(join(openclawRoot, "openclaw.json"), "utf8"));
  assert.equal(cfg.bindings.filter((b) => b.match?.accountId === "alice").length, 1);
});

test("v1.3.56 unregisterAccountFromOpenclaw — 清理账号 + binding", async () => {
  writeAccount("bob");
  await registerAccountInOpenclaw("bob", "wpp-bob");
  const res = await unregisterAccountFromOpenclaw("bob");
  assert.equal(res.removed, true);
  const cfg = JSON.parse(readFileSync(join(openclawRoot, "openclaw.json"), "utf8"));
  assert.equal(cfg.channels.wechatpadpro.accounts.bob, undefined);
  assert.equal(cfg.bindings.filter((b) => b.match?.accountId === "bob").length, 0);
});

test("v1.3.56 unregisterAccountFromOpenclaw — 不存在账号 no-op", async () => {
  const res = await unregisterAccountFromOpenclaw("ghost");
  assert.equal(res.removed, false);
});

// ===== ensureAgentWorkspace per-account binding =====

test("v1.3.56 ensureAgentWorkspace — accountId 注入精确 binding (channel=wechatpadpro)", async () => {
  const r = await ensureAgentWorkspace({
    agentId: "wpp-carol",
    accountId: "carol",
    openclawRoot,
    patchOpenclawJson: true,
  });
  assert.ok(existsSync(r.workspaceDir), "workspace 应创建");
  const cfg = JSON.parse(readFileSync(join(openclawRoot, "openclaw.json"), "utf8"));
  const binding = cfg.bindings.find((b) => b.match?.accountId === "carol");
  assert.ok(binding, "应存在 carol binding");
  assert.equal(binding.match.channel, "wechatpadpro");
  assert.equal(binding.agentId, "wpp-carol");
});

test("v1.3.56 ensureAgentWorkspace — 无 accountId 时 channel 修好但无具体账号 (旧行为兼容)", async () => {
  const r = await ensureAgentWorkspace({ agentId: "wpp-solo", openclawRoot, patchOpenclawJson: true });
  const cfg = JSON.parse(readFileSync(join(openclawRoot, "openclaw.json"), "utf8"));
  const binding = cfg.bindings.find((b) => b.agentId === "wpp-solo");
  assert.ok(binding, "应存在 solo binding");
  assert.equal(binding.match.channel, "wechatpadpro", "不再用 'last'");
  assert.ok(binding.match.accountId === undefined, "无 accountId 时不绑具体账号");
});

// ===== account-context (ALS 穿透) =====

test("v1.3.56 account-context — run 内 getCurrentAccountId 返回账号", () => {
  assert.equal(getCurrentAccountId(), undefined, "run 外 undefined");
  accountContext.run("account-x", () => {
    assert.equal(getCurrentAccountId(), "account-x");
  });
  assert.equal(getCurrentAccountId(), undefined, "run 外恢复 undefined");
});

test("v1.3.56 account-context — ALS 穿透异步调用链", async () => {
  await accountContext.run("account-y", async () => {
    const inner = async (): Promise<string | undefined> => getCurrentAccountId();
    const deep = await inner();
    assert.equal(deep, "account-y", "异步嵌套仍能拿到账号");
  });
});

test("v1.3.56 account-context — 并发隔离 (不同 run 不串号)", async () => {
  const results: Array<string | undefined> = [];
  await Promise.all([
    accountContext.run("acct-a", async () => {
      await new Promise((r) => setTimeout(r, 5));
      results.push(getCurrentAccountId());
    }),
    accountContext.run("acct-b", async () => {
      await new Promise((r) => setTimeout(r, 1));
      results.push(getCurrentAccountId());
    }),
  ]);
  assert.deepEqual(results.sort(), ["acct-a", "acct-b"], "每个 run 拿到自己的账号, 不串号");
});

// ===== getAccountsDir 尊重 env =====

test("v1.3.56 getAccountsDir — WPP_ACCOUNTS_DIR env 覆盖", () => {
  assert.equal(getAccountsDir(), accountsDir);
});
