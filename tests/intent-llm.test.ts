// tests/intent-llm.test.ts - v1.3.1 LLM 智能意图判断
// 群聊@触发时用 LLM 判断注入哪些上下文候选 (老板拍板)
// 覆盖: 归一化(语音当文本)/候选压缩/LLM调用/解析/预筛

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeTriggerText,
  extractSttText,
  summarizeContent,
  parseIntentResponse,
  decideIntentWithLlm,
  needsLlm,
} from "../src/dispatch/intent-llm.js";
import { classifyGroupIntent } from "../src/dispatch/dispatcher.js";

beforeEach(() => {
  delete process.env.MINIMAX_API_KEY;
});

after(() => {
  delete process.env.MINIMAX_API_KEY;
});

// ===== 归一化 (语音当文本核心) =====

test("v1.3.1 — normalizeTriggerText 去@ + 去媒体标记", () => {
  assert.equal(normalizeTriggerText("@接晓银 看看这个文件"), "看看这个文件");
  assert.equal(
    normalizeTriggerText("@接晓银 这个图 [图片] https://oss/x.jpg"),
    "这个图",
  );
});

test("v1.3.1 — normalizeTriggerText 语音转写当文本", () => {
  assert.equal(
    normalizeTriggerText("收到一条语音\n[转写] 把订单发我"),
    "把订单发我",
  );
});

test("v1.3.1 — extractSttText", () => {
  assert.equal(extractSttText("收到一条语音\n[转写] 你好啊"), "你好啊");
  assert.equal(extractSttText("没有转写"), null);
});

// ===== 候选压缩 =====

test("v1.3.1 — summarizeContent 语音带转写 → 文本 (老板观点)", () => {
  const r = summarizeContent("收到一条语音\n[转写] 把订单发我");
  assert.equal(r.type, "text");
  assert.equal(r.text, "把订单发我");
  assert.equal(r.isVoice, true);
});

test("v1.3.1 — summarizeContent 图片/文件/纯文本", () => {
  assert.equal(summarizeContent("[图片] https://oss/x.jpg").type, "image");
  const f = summarizeContent("[文件] 报告.pdf (100 bytes) https://oss/x.pdf");
  assert.equal(f.type, "file");
  assert.equal(f.title, "报告.pdf");
  assert.equal(summarizeContent("普通文本内容").type, "text");
});

// ===== LLM 响应解析 =====

test("v1.3.1 — parseIntentResponse no-op / inject / 围栏 / 坏JSON", () => {
  assert.deepEqual(parseIntentResponse('{"action":"no-op"}'), { action: "no-op" });
  assert.deepEqual(parseIntentResponse('{"action":"inject","relevant_ids":["a-1","b-2"]}'), {
    action: "inject",
    relevantIds: ["a-1", "b-2"],
  });
  assert.deepEqual(parseIntentResponse('```json\n{"action":"no-op"}\n```'), { action: "no-op" });
  assert.equal(parseIntentResponse("not json"), null);
  assert.equal(parseIntentResponse('{"action":"bad"}'), null);
});

// ===== LLM 调用 (mock fetch) =====

test("v1.3.1 — decideIntentWithLlm 调 MiniMax + 解析结果", async () => {
  // stub 全局 fetch
  const origFetch = globalThis.fetch;
  const calls: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
  globalThis.fetch = async (url, init) => {
    const parsed = init as { headers: Record<string, string>; body: string };
    calls.push({ url: String(url), headers: parsed.headers, body: JSON.parse(parsed.body) });
    return new Response(JSON.stringify({
      content: [{ type: "text", text: '{"action":"inject","relevant_ids":["a-1"]}' }],
    }), { status: 200 });
  };
  try {
    const res = await decideIntentWithLlm(
      { triggerText: "看看这个文件", candidates: [{ msgId: "a-1", type: "file", text: "[文件] 报告.pdf", isVoice: false }] },
      { apiKey: "test-key" },
    );
    assert.deepEqual(res, { action: "inject", relevantIds: ["a-1"] });
    assert.equal(calls.length, 1);
    assert.ok(calls[0]!.url.endsWith("/v1/messages"), "应调 MiniMax anthropic endpoint");
    assert.equal(calls[0]!.headers["x-api-key"], "test-key");
    assert.equal(calls[0]!.headers["anthropic-version"], "2023-06-01");
    const body = calls[0]!.body as { model: string };
    assert.equal(body.model, "MiniMax-M2.5");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("v1.3.1 — decideIntentWithLlm 无 apiKey → null (不调 fetch)", async () => {
  const res = await decideIntentWithLlm(
    { triggerText: "hi", candidates: [] },
    { apiKey: "" } as never,
  );
  assert.equal(res, null);
});

// ===== needsLlm 预筛 =====

test("v1.3.31 — needsLlm: 纯@→false, 有文字(含问候)→true (老板拍板@一律回复)", () => {
  assert.equal(needsLlm("@接晓银"), false);          // 纯@ 无内容, 不调
  assert.equal(needsLlm("@接晓银 你好"), true);       // 有文字 → 调 LLM 回复
  assert.equal(needsLlm("@接晓银 在吗"), true);
});

test("v1.3.1 — needsLlm: 有实质意图 → true", () => {
  assert.equal(needsLlm("@接晓银 看看这个文件"), true);
  assert.equal(needsLlm("@接晓银 上次那个方案呢"), true);
});

// ===== classifyGroupIntent 仍可用 (预筛) =====

test("v1.3.1 — classifyGroupIntent 语音当文本 (不判 media)", () => {
  // "收到语音" 归一化后是文本, 不因 "语音" 词判 media
  assert.equal(classifyGroupIntent(normalizeTriggerText("收到语音\n[转写] 把订单发我")), "topic");
});
