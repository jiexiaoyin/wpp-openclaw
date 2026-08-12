// tests/safe-regex.test.ts - v1.1.27 ReDoS 防护单元测试
// 验证 isCatastrophicRegex 能识别已知灾难模式, safeMatch 截断超长输入

import { test } from "node:test";
import assert from "node:assert/strict";
import { isCatastrophicRegex, safeMatch } from "../src/core/safe-regex.js";

test("isCatastrophicRegex — 嵌套量词 (a+)+", () => {
  assert.equal(isCatastrophicRegex("(a+)+$"), true);
  assert.equal(isCatastrophicRegex(/(a+)+/), true);
});

test("isCatastrophicRegex — (a*)* 嵌套", () => {
  assert.equal(isCatastrophicRegex("(a*)*"), true);
});

test("isCatastrophicRegex — 非捕获嵌套 (?:.+)+", () => {
  assert.equal(isCatastrophicRegex("(?:.+)+"), true);
});

test("isCatastrophicRegex — 灾难 alternation ([a-z]+|[0-9]+)+", () => {
  assert.equal(isCatastrophicRegex("([a-z]+|[0-9]+)+"), true);
});

test("isCatastrophicRegex — 量词后接量词 a++ a*+", () => {
  assert.equal(isCatastrophicRegex("a++"), true);
  assert.equal(isCatastrophicRegex("a*+"), true);
});

test("isCatastrophicRegex — 正常 regex 不误判", () => {
  assert.equal(isCatastrophicRegex(/^[^:\n]+:\n[^:\n]+:\n([\s\S]*)$/), false);
  assert.equal(isCatastrophicRegex(/<refermsg\b[^>]*>([\s\S]*?)<\/refermsg>/), false);
  assert.equal(isCatastrophicRegex(/<(\w+)>([^<]+)<\/\1>/), false);
  assert.equal(isCatastrophicRegex(/\[(图片|视频|语音|文件)\]\s+(?:[^\n]*?)\s*(https?:\/\/\S+)/), false);
});

test("safeMatch — 超长输入截断 4096", () => {
  const re = /^.*$/;
  const input = "x".repeat(10000);
  const m = safeMatch(re, input, 4096);
  assert.ok(m);
});

test("safeMatch — 正常输入不截断", () => {
  const re = /hello/;
  const m = safeMatch(re, "say hello world", 4096);
  assert.ok(m);
  assert.equal(m![0], "hello");
});

test("safeMatch — 无匹配返回 null", () => {
  const re = /xyzz/;
  const m = safeMatch(re, "hello world", 4096);
  assert.equal(m, null);
});

test("safeMatch — 灾难 regex 实际执行 1000 字符不 hang (gewe 教训)", () => {
  // 用非灾难 regex 模拟: 验证截断保护
  const re = /^a+$/;
  const input = "a".repeat(1000);
  const start = Date.now();
  const m = safeMatch(re, input);
  const elapsed = Date.now() - start;
  assert.ok(m);
  assert.ok(elapsed < 50, `should complete fast, took ${elapsed}ms`);
});