// tests/unit/bigint.test.mjs - v1.9.2 P1-fix: stringifyLargeInts 形态依赖缺陷回归
//
// 旧实现用正则 /("[\w$]+"\s*:\s*)(\d{16,})(?=[,\s}\]]|$)/g 改写 JSON 文本, 有三个形态依赖缺陷:
//   (a) 数组/正文位置的大整数不匹配 → 原样透传 → JSON.parse 静默丢精度 (末位漂移, 不报错)
//   (b) 非法 JSON 风险 (见下方 (b) 组: 字符串值位置必须原样透传, 不得被改写)
//   (c) key 名限定 ASCII \w/$ → 含 '-' / '.' / 中文的 key 漏改
// 本文件锁定三种形态 + 边界回归。这些测试是本轮唯一新增的测试。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stringifyLargeInts } from '../../dist/util/bigint.js';

const BIG = '1234567890123456789'; // > Number.MAX_SAFE_INTEGER (9007199254740992)

// ── (a) 对象值位置: 原设计意图 = 引号化为精确字符串, 不得丢精度 ──────────────
test('(a) 对象值位置的大整数 → 引号化为字符串且逐位精确', () => {
  const out = stringifyLargeInts(`{"msg_id":${BIG}}`);
  assert.equal(out, `{"msg_id":"${BIG}"}`);
  const parsed = JSON.parse(out);
  assert.equal(parsed.msg_id, BIG);
  assert.equal(BigInt(parsed.msg_id), 1234567890123456789n, '必须逐位精确');
});

test('(a) key 名含非 \\w 字符 (旧实现漏改) 同样保号', () => {
  for (const key of ['msg-id', 'msg.id', '消息id']) {
    const out = stringifyLargeInts(`{"${key}":${BIG}}`);
    assert.equal(JSON.parse(out)[key], BIG, `key=${key} 必须被保号`);
  }
});

test('(a) pretty JSON (换行 + 缩进) 同样保号且格式不变', () => {
  const out = stringifyLargeInts(`{\n  "msg_id": ${BIG}\n}`);
  assert.equal(out, `{\n  "msg_id": "${BIG}"\n}`);
  assert.equal(JSON.parse(out).msg_id, BIG);
});

// ── (b) 字符串值位置: 不得产出非法 JSON ────────────────────────────────────
test('(b) 字符串值位置的大整数 → 原样透传, 仍是合法 JSON', () => {
  const input = `{"key": "${BIG}"}`;
  assert.equal(stringifyLargeInts(input), input, '字符串 token 必须逐字节不变');
  assert.equal(JSON.parse(stringifyLargeInts(input)).key, BIG);
});

test('(b) 字符串内容含 "k": 1234... (转义引号) → 不被误改写, 仍是合法 JSON', () => {
  const input = `{"t":"x \\"k\\": ${BIG}"}`;
  const out = stringifyLargeInts(input);
  assert.equal(out, input);
  assert.equal(JSON.parse(out).t, `x "k": ${BIG}`);
});

test('(b) 畸形输入 (未闭合字符串) → 原样返回, 不产出比输入更坏的结果', () => {
  const bad = `{"t":"${BIG}`;
  assert.equal(stringifyLargeInts(bad), bad);
});

// ── (c) 数组位置: 不得静默漂移 ────────────────────────────────────────────
test('(c) 数组元素位置的大整数 → 保号 (旧实现末位漂移)', () => {
  const input = `{"arr":[${BIG}]}`;
  const out = stringifyLargeInts(input);
  const parsed = JSON.parse(out);
  assert.equal(parsed.arr[0], BIG, '不得漂移');
  assert.equal(BigInt(parsed.arr[0]), 1234567890123456789n);
  // 旧实现的反例: 静默漂移到 ...800
  assert.notEqual(JSON.parse(input).arr[0], BIG);
});

test('(c) 顶层数组 / 嵌套数组 / 逗号后续元素 均保号', () => {
  assert.equal(JSON.parse(stringifyLargeInts(`[${BIG}]`))[0], BIG);
  assert.equal(JSON.parse(stringifyLargeInts(`{"a":{"b":[[${BIG}]]}}`)).a.b[0][0], BIG);
  assert.equal(JSON.parse(stringifyLargeInts(`[1, ${BIG}]`))[1], BIG);
});

test('(c) 负 16 位整数保号 (旧实现完全不匹配)', () => {
  assert.equal(JSON.parse(stringifyLargeInts(`{"n":-${BIG}}`)).n, `-${BIG}`);
});

// ── 回归护栏: 不该动的绝不动 ─────────────────────────────────────────────
test('回归: 15 位整数 (MAX_SAFE 内) / 小整数 / 浮点 / 字符串内小整数 均不改写', () => {
  assert.equal(stringifyLargeInts('{"n":123456789012345}'), '{"n":123456789012345}');
  assert.equal(stringifyLargeInts('{"n":123}'), '{"n":123}');
  assert.equal(stringifyLargeInts('{"n":1.234567890123456789}'), '{"n":1.234567890123456789}');
  assert.equal(stringifyLargeInts('{"s":"123"}'), '{"s":"123"}');
});

test('回归: 无 16+ 位数字串 → 逐字节不变 (快路径)', () => {
  const s = '{\n  "a": 1,\n  "b": "x"\n}\n';
  assert.equal(stringifyLargeInts(s), s);
});
