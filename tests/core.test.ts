// tests/core.test.ts - Phase A 单元测试
// 覆盖: core/logger (formatErr + 函数式 + 对象式) + core/env (getEnv/getEnvBool/requireEnv) + core/paths (findPluginRoot) + util/id + util/exec + constants

import { test } from "node:test";
import assert from "node:assert/strict";

import { formatErr, info, warn, error, debug, logObj } from "../src/core/logger.js";
import { getEnv, getEnvBool, requireEnv, ENV_KEYS } from "../src/core/env.js";
import { findPluginRoot, resolveFromPlugin } from "../src/core/paths.js";
import { uniqueId, longUniqueId } from "../src/util/id.js";
import { execAsync } from "../src/util/exec.js";
import {
  CHANNEL_ID,
  PLUGIN_NAME,
  MsgType,
  PeerKind,
  DEFAULT_DEBOUNCE_MS,
  WEBHOOK_BODY_LIMIT_BYTES,
  DEDUPE_TTL_MS,
} from "../src/core/constants.js";

// ===== logger.ts =====

test("formatErr — Error 实例保留 stack", () => {
  const e = new Error("boom");
  const out = formatErr(e);
  assert.ok(out.includes("boom"));
  assert.ok(out.includes("Error: "));
  assert.ok(out.includes("at "), "expected stack trace");
});

test("formatErr — 非 Error 实例走 String()", () => {
  assert.equal(formatErr("plain string"), "plain string");
  assert.equal(formatErr(42), "42");
  assert.equal(formatErr(null), "null");
  assert.equal(formatErr(undefined), "undefined");
});

test("logger 函数式 — 不抛", () => {
  info("test info");
  info("test info with fields", { a: 1, b: "two" });
  info("test info with err", new Error("e-info"));
  warn("test warn");
  warn("test warn fields", { code: 500 });
  warn("test warn err", new Error("e-warn"));
  error("test error", new Error("real"));
  debug("test debug");
});

test("logger 对象式 — logObj 兼容老调用", () => {
  logObj.info("compat info");
  logObj.warn("compat warn");
  logObj.error("compat error", new Error("e-compat"));
  logObj.debug("compat debug"); // WPP_DEBUG!=1 → 静默
});

// ===== env.ts =====

test("ENV_KEYS — 关键键存在", () => {
  assert.equal(ENV_KEYS.WPP_DB_PASSWORD, "WPP_DB_PASSWORD");
  assert.equal(ENV_KEYS.WECHATPRO_DB_PASSWORD, "WECHATPRO_DB_PASSWORD");
  assert.equal(ENV_KEYS.WPP_TOKEN_KEY, "WPP_TOKEN_KEY");
  assert.equal(ENV_KEYS.WPP_API_BASE, "WPP_API_BASE");
});

test("getEnv — 返回 process.env 或 fallback", () => {
  process.env.WPP_TEST_VAR = "hello";
  assert.equal(getEnv("WPP_TEST_VAR"), "hello");
  assert.equal(getEnv("WPP_TEST_VAR", "fb"), "hello");
  delete process.env.WPP_TEST_VAR;
  assert.equal(getEnv("WPP_TEST_VAR"), undefined);
  assert.equal(getEnv("WPP_TEST_VAR", "fb"), "fb");
});

test("getEnvBool — truthy 解析", () => {
  process.env.WPP_BOOL_TEST = "1";
  assert.equal(getEnvBool("WPP_BOOL_TEST"), true);
  process.env.WPP_BOOL_TEST = "true";
  assert.equal(getEnvBool("WPP_BOOL_TEST"), true);
  process.env.WPP_BOOL_TEST = "yes";
  assert.equal(getEnvBool("WPP_BOOL_TEST"), true);
  process.env.WPP_BOOL_TEST = "no";
  assert.equal(getEnvBool("WPP_BOOL_TEST"), false);
  process.env.WPP_BOOL_TEST = "";
  assert.equal(getEnvBool("WPP_BOOL_TEST", true), true); // empty → fallback
  delete process.env.WPP_BOOL_TEST;
  assert.equal(getEnvBool("WPP_BOOL_TEST", false), false);
});

test("requireEnv — 缺失抛错", () => {
  delete process.env.WPP_MUST_EXIST;
  assert.throws(() => requireEnv("WPP_MUST_EXIST"), /required env var missing/);
  process.env.WPP_MUST_EXIST = "ok";
  assert.equal(requireEnv("WPP_MUST_EXIST"), "ok");
  delete process.env.WPP_MUST_EXIST;
});

// ===== paths.ts =====

test("findPluginRoot — 找到当前 plugin root", async () => {
  const root = await findPluginRoot();
  assert.ok(root.length > 0);
  assert.ok(root.endsWith("/wechatpadpro-openclaw"), `got ${root}`);
});

test("resolveFromPlugin — 解析 plugin root 相对路径", async () => {
  const cfgPath = await resolveFromPlugin("config.json");
  assert.ok(cfgPath.endsWith("/wechatpadpro-openclaw/config.json"));
});

// ===== util/id.ts =====

test("uniqueId — 16 hex chars, 不重复 (1000 跑无碰撞)", () => {
  const ids = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    ids.add(uniqueId());
  }
  assert.equal(ids.size, 1000, "expected 1000 unique 16-hex ids");
  assert.ok(/^[0-9a-f]{16}$/.test(uniqueId()));
});

test("longUniqueId — 24 hex chars", () => {
  assert.ok(/^[0-9a-f]{24}$/.test(longUniqueId()));
});

// ===== util/exec.ts =====

test("execAsync — echo 命令返回 stdout", async () => {
  const r = await execAsync("echo", ["hello world"]);
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), "hello world");
  assert.equal(r.stderr, "");
  assert.ok(r.latencyMs >= 0);
});

test("execAsync — 失败 exit code 1 不抛", async () => {
  const r = await execAsync("false");
  assert.equal(r.code, 1);
  assert.ok(r.latencyMs >= 0);
});

test("execAsync — timeout SIGKILL 兜底", async () => {
  const r = await execAsync("sleep", ["10"], { timeoutMs: 200 });
  assert.equal(r.code, null);
  assert.equal(r.signal, "SIGKILL");
});

// ===== constants.ts =====

test("constants — channel + msgType sanity", () => {
  assert.equal(CHANNEL_ID, "wechatpadpro");
  assert.equal(PLUGIN_NAME, "wechatpadpro");
  assert.equal(MsgType.TEXT, 1);
  assert.equal(MsgType.VOICE, 34);
  assert.equal(PeerKind.DIRECT, "direct");
  assert.equal(PeerKind.GROUP, "group");
  assert.equal(DEFAULT_DEBOUNCE_MS, 1500);
  assert.equal(WEBHOOK_BODY_LIMIT_BYTES, 10 * 1024 * 1024);
  assert.equal(DEDUPE_TTL_MS, 30 * 60 * 1000);
});
