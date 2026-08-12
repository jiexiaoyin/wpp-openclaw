// tests/pairing-store.test.ts - v1.2.3 PAIRING 配对码存储 (per-account 隔离)
// 覆盖: per-account 文件隔离 / TTL 过期 / 一次性消耗 / redeem 边界 / extractPairCode 严格前缀

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  generatePairingCode,
  readPairingCode,
  redeemPairingCode,
  extractPairCode,
  normalizePairCode,
  getPairingStorePath,
  PAIRING_CODE_TTL_MS,
} from "../src/pairing-store.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wpp-pair-"));
  process.env.WPP_PAIRING_DIR = dir; // getPairingDir 每次读 env, 可后设
});

after(() => {
  delete process.env.WPP_PAIRING_DIR;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

// ===== per-account 隔离 =====

test("v1.2.3 — per-account 文件隔离 (两账号码独立不串)", async () => {
  const a = await generatePairingCode("acc-a");
  const b = await generatePairingCode("acc-b");

  // 文件路径不同 (文件名带 accountId)
  assert.notEqual(getPairingStorePath("acc-a"), getPairingStorePath("acc-b"));
  assert.ok(getPairingStorePath("acc-a").includes("wechatpadpro-pairing-acc-a.json"));

  // 码不同 (8 位)
  assert.equal(a.code.length, 8);
  assert.notEqual(a.code, b.code);

  // 互不覆盖: readPairingCode("acc-a") 仍是 a 的码
  const ra = await readPairingCode("acc-a");
  const rb = await readPairingCode("acc-b");
  assert.equal(ra!.code, a.code);
  assert.equal(rb!.code, b.code);

  // accountId 绑定
  assert.equal(ra!.accountId, "acc-a");
  assert.equal(rb!.accountId, "acc-b");
});

test("v1.2.3 — 再 generate 覆盖旧码 (同账号)", async () => {
  const first = await generatePairingCode("acc-a");
  const second = await generatePairingCode("acc-a");
  const r = await readPairingCode("acc-a");
  assert.equal(r!.code, second.code);
  assert.notEqual(second.code, first.code);
});

test("v1.2.3 — TTL: 过期码 read/redeem 都返 null/false", async () => {
  await generatePairingCode("acc-a");
  // 把 createdAt 改到 2h 前 → 过期
  const p = getPairingStorePath("acc-a");
  const entry = JSON.parse(await import("node:fs/promises").then((m) => m.readFile(p, "utf8"))) as {
    code: string; accountId: string; createdAt: string;
  };
  const past = new Date(Date.now() - 2 * PAIRING_CODE_TTL_MS).toISOString();
  writeFileSync(p, JSON.stringify({ ...entry, createdAt: past }));

  assert.equal(await readPairingCode("acc-a"), null, "过期 read 应为 null");
  const r = await redeemPairingCode(entry.code, "acc-a");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "expired");
});

// ===== redeem =====

test("v1.2.3 — redeem 成功 + 一次性消耗 (unlink 后二次 redeem false)", async () => {
  const { code } = await generatePairingCode("acc-a");

  const ok = await redeemPairingCode(code, "acc-a");
  assert.equal(ok.ok, true);
  assert.equal(ok.reason, undefined);

  // 一次性: 二次 redeem false (文件已删)
  const again = await redeemPairingCode(code, "acc-a");
  assert.equal(again.ok, false);
  assert.equal(again.reason, "not-found");
});

test("v1.2.3 — redeem 错误码 → invalid", async () => {
  await generatePairingCode("acc-a");
  const r = await redeemPairingCode("XXXXXXXX", "acc-a");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "invalid");
});

test("v1.2.3 — redeem wrong-account 不通用 (码文件绑定 accountId)", async () => {
  // acc-a 生成码, 用 acc-b redeem → not-found (文件不存在)
  const { code } = await generatePairingCode("acc-a");
  const r = await redeemPairingCode(code, "acc-b");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "not-found", "per-account 文件隔离 → 其它账号找不到码");

  // acc-a 自己的码仍有效 (没被 acc-b 消耗)
  const still = await redeemPairingCode(code, "acc-a");
  assert.equal(still.ok, true);
});

// ===== extractPairCode / normalize =====

test("v1.2.3 — extractPairCode 严格 /pair 前缀", () => {
  // 标准 (字母表 A-Z 去 I/O + 2-9 去 0/1, 生成码只含这些)
  assert.equal(extractPairCode("/pair ABCD2345"), "ABCD2345");
  // 小写 → 大写归一
  assert.equal(extractPairCode("/pair abcd2345"), "ABCD2345");
  // 首尾空白
  assert.equal(extractPairCode("  /pair ABCD2345  "), "ABCD2345");
  // 8 位码
  assert.equal(extractPairCode("/pair ABCD2345"), "ABCD2345");

  // 不匹配: 非 /pair
  assert.equal(extractPairCode("hello"), null);
  assert.equal(extractPairCode(""), null);
  assert.equal(extractPairCode(undefined as unknown as string), null);
  // 码太短/太长
  assert.equal(extractPairCode("/pair ABCD"), null);
  assert.equal(extractPairCode("/pair ABCD23456"), null);
  // 尾部垃圾 (多参数)
  assert.equal(extractPairCode("/pair ABCD2345 extra"), null);
  // 前缀不完整
  assert.equal(extractPairCode("/pai ABCD2345"), null);
  // 带 @ 的群消息格式
  assert.equal(extractPairCode("@bot /pair ABCD2345"), null);
  // 非法字符: 0/1 不在字母表 (2-9 区间) → null
  assert.equal(extractPairCode("/pair ABCD2340"), null);
  assert.equal(extractPairCode("/pair ABCD2341"), null);
});

test("v1.2.3 — normalizePairCode trim + 大写", () => {
  assert.equal(normalizePairCode("  ab12cd34  "), "AB12CD34");
  assert.equal(normalizePairCode(""), "");
  assert.equal(normalizePairCode(undefined as unknown as string), "");
});
