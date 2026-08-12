// tests/group-intent.test.ts - v1.3.0 群聊触发消息意图判断
// 老板拍板: 智能判断意图, 按类型选择性注入 (不无条件喂全部上下文)

import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyGroupIntent } from "../src/dispatch/dispatcher.js";

// ===== no-op: 纯 @ / 极短 → 不注入 =====

test("v1.3.0 — 纯 @ (无内容) → no-op", () => {
  assert.equal(classifyGroupIntent("@接晓银"), "no-op");
  assert.equal(classifyGroupIntent("@bot"), "no-op");
  assert.equal(classifyGroupIntent("@wxid_abc"), "no-op");
});

test("v1.3.31 — 极短问候 (≤4字, 有文字) → topic (老板拍板: @一律回复)", () => {
  assert.equal(classifyGroupIntent("@接晓银 你好"), "topic");
  assert.equal(classifyGroupIntent("@接晓银 在吗"), "topic");
  assert.equal(classifyGroupIntent("@接晓银 早上好"), "topic");
  assert.equal(classifyGroupIntent("@接晓银 hi"), "topic");
});

test("v1.3.0 — 空/undefined → no-op", () => {
  assert.equal(classifyGroupIntent(""), "no-op");
  assert.equal(classifyGroupIntent(undefined as unknown as string), "no-op");
});

// ===== media: 提到文件/图/语音 → 只注入媒体 =====

test("v1.3.0 — 提到文件 → media", () => {
  assert.equal(classifyGroupIntent("@接晓银 看看这个文件"), "media");
  assert.equal(classifyGroupIntent("@接晓银 这个文档你看下"), "media");
  assert.equal(classifyGroupIntent("@接晓银 表发我看看"), "media");
  assert.equal(classifyGroupIntent("@接晓银 附件能打开吗"), "media");
});

test("v1.3.0 — 提到图片 → media", () => {
  assert.equal(classifyGroupIntent("@接晓银 你能看到图片吗"), "media");
  assert.equal(classifyGroupIntent("@接晓银 这个图怎么回事"), "media");
  assert.equal(classifyGroupIntent("@接晓银 照片看一下"), "media");
});

test("v1.3.0 — 提到语音/视频 → media", () => {
  assert.equal(classifyGroupIntent("@接晓银 语音听一下"), "media");
  assert.equal(classifyGroupIntent("@接晓银 视频看看"), "media");
});

// ===== topic: 实质文本 → 注入文本 + 媒体 =====

test("v1.3.0 — 实质话题 → topic", () => {
  assert.equal(classifyGroupIntent("@接晓银 上次那个方案呢"), "topic");
  assert.equal(classifyGroupIntent("@接晓银 明天几点开会"), "topic");
  assert.equal(classifyGroupIntent("@接晓银 帮我查下订单"), "topic");
});

test("v1.3.0 — 含媒体词「你看」→ media (即使偏话题, 规则可接受)", () => {
  // "你看这个方案怎么样" 含 "你看" → media (后续可调词表精化)
  assert.equal(classifyGroupIntent("@接晓银 你看这个方案怎么样"), "media");
});
