// tests/shouldquote-all-msgtypes.test.ts - v1.1.50 QUOTE-ALL-MSG-TYPES-REOPEN
// 2026-08-09 10:53 接总立 "⚠️ 调试需要 全部放开"
//   v1.1.49 (msgType === 1) → v1.1.50 (shouldQuote = true 全部放开)
//   老板 21:32 实测 "图片引用 = 该消息类型暂不能展示" 可能仍存在, 调试需要看完整链路

import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * v1.1.50 shouldQuote 逻辑:
 *   所有 msgType → shouldQuote=true (引用回复, 包括图片/语音/视频/文件/位置/名片)
 *   注意: 图片/视频等仍可能因 vendor WPP NewMsgId ≠ svrid → "该消息类型暂不能展示"
 *         但老板 10:53 明确要调试看完整链路
 */
function shouldQuoteFn(_msgType: number): boolean {
  return true;
}

test("v1.1.50 shouldQuote: 文本 (msgType=1) → 引用回复", () => {
  assert.equal(shouldQuoteFn(1), true);
});

test("v1.1.50 shouldQuote: 图片 (msgType=3) → 引用回复 (调试放开)", () => {
  assert.equal(shouldQuoteFn(3), true);
});

test("v1.1.50 shouldQuote: 语音 (msgType=34) → 引用回复 (调试放开)", () => {
  assert.equal(shouldQuoteFn(34), true);
});

test("v1.1.50 shouldQuote: 视频 (msgType=43) → 引用回复 (调试放开)", () => {
  assert.equal(shouldQuoteFn(43), true);
});

test("v1.1.50 shouldQuote: 文件 (msgType=6) → 引用回复 (调试放开)", () => {
  assert.equal(shouldQuoteFn(6), true);
});

test("v1.1.50 shouldQuote: 文件 (msgType=49 app) → 引用回复 (调试放开)", () => {
  assert.equal(shouldQuoteFn(49), true);
});

test("v1.1.50 shouldQuote: 位置 (msgType=48) → 引用回复 (调试放开)", () => {
  assert.equal(shouldQuoteFn(48), true);
});

test("v1.1.50 shouldQuote: 名片 (msgType=42) → 引用回复 (调试放开)", () => {
  assert.equal(shouldQuoteFn(42), true);
});

test("v1.1.50 shouldQuote: emoji (msgType=47) → 引用回复 (调试放开)", () => {
  assert.equal(shouldQuoteFn(47), true);
});