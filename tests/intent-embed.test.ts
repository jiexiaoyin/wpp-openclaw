// tests/intent-embed.test.ts - v1.3.2 embedding 快路径 (混用: embedding + LLM 兜底)
// 覆盖: 余弦相似度 / embedding 选 top-N / 命令类检测 / 调用降级

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

import {
  cosineSimilarity,
  isCommandIntent,
  selectTopNByEmbedding,
  clearEmbedCache,
  cacheEmbedding,
  getCachedEmbedding,
} from "../src/dispatch/intent-embed.js";

beforeEach(() => {
  clearEmbedCache();
  delete process.env.BAILIAN_EMBEDDING_API_KEY;
});

after(() => {
  clearEmbedCache();
  delete process.env.BAILIAN_EMBEDDING_API_KEY;
});

// ===== 余弦相似度 =====

test("v1.3.2 — cosineSimilarity 相同向量 = 1", () => {
  assert.equal(cosineSimilarity([1, 2, 3], [1, 2, 3]), 1);
});

test("v1.3.2 — cosineSimilarity 正交 = 0, 反向 = -1", () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
});

test("v1.3.2 — cosineSimilarity 长度不等 = 0", () => {
  assert.equal(cosineSimilarity([1, 2], [1, 2, 3]), 0);
});

// ===== 命令类检测 (embedding 判断不了 → LLM) =====

test("v1.3.2 — isCommandIntent 命令词 → true", () => {
  assert.equal(isCommandIntent("帮我把这个文件删了"), true);
  assert.equal(isCommandIntent("把这个转发给A"), true);
  assert.equal(isCommandIntent("帮我发到群里"), true);
  assert.equal(isCommandIntent("撤回刚才那条"), true);
});

test("v1.3.2 — isCommandIntent 非命令 → false", () => {
  assert.equal(isCommandIntent("看看这个文件"), false);
  assert.equal(isCommandIntent("这个图怎么回事"), false);
  assert.equal(isCommandIntent("上次那个方案呢"), false);
});

// ===== selectTopNByEmbedding (mock embedding) =====

test("v1.3.2 — selectTopNByEmbedding 选相似度高的候选", async () => {
  // 用全局 fetch stub 模拟 embedding 返回 (触发向量 + 候选向量)
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse((init as { body: string }).body);
    const texts = body.input as string[];
    // 模拟向量: 含 "文件" 的文本 → 高相似, 其它低
    return new Response(JSON.stringify({
      data: texts.map((t, i) => ({
        embedding: t.includes("文件") ? [1, 0, 0] : t.includes("触发") ? [1, 0.1, 0] : [0, 1, 0],
        index: i,
      })),
    }), { status: 200 });
  };
  try {
    const relevant = await selectTopNByEmbedding(
      "触发: 看看这个文件",
      [
        { msgId: "f-1", type: "file", text: "报告.pdf 文件", isVoice: false },
        { msgId: "t-1", type: "text", text: "普通闲聊", isVoice: false },
      ],
      { apiKey: "test-key", topN: 2, threshold: 0.3 },
    );
    assert.ok(relevant);
    assert.ok(relevant.includes("f-1"), "文件候选应被选中 (相似度高)");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("v1.3.2 — selectTopNByEmbedding 无 apiKey → null (降级 LLM)", async () => {
  const relevant = await selectTopNByEmbedding(
    "触发",
    [{ msgId: "a", type: "text", text: "x", isVoice: false }],
    { apiKey: "" },
  );
  assert.equal(relevant, null);
});

test("v1.3.2 — selectTopNByEmbedding 相似度全低 → 空数组 (LLM 兜底)", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const texts = JSON.parse((init as { body: string }).body).input as string[];
    // 触发文本 → [1,0]; 无关候选 → [0,1] (低相似)
    return new Response(JSON.stringify({
      data: texts.map((t) => ({
        embedding: t === "触发文本" ? [1, 0] : [0, 1],
        index: 0,
      })),
    }), { status: 200 });
  };
  try {
    const relevant = await selectTopNByEmbedding(
      "触发文本",
      [{ msgId: "a", type: "text", text: "无关内容", isVoice: false }],
      { apiKey: "key", threshold: 0.9 },
    );
    assert.deepEqual(relevant, [], "相似度低于阈值 → 空 (走 LLM)");
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ===== embedding 失败降级 =====

test("v1.3.2 — embedTexts HTTP 失败 → null (降级 LLM)", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("error", { status: 500 });
  try {
    const relevant = await selectTopNByEmbedding(
      "触发",
      [{ msgId: "a", type: "text", text: "x", isVoice: false }],
      { apiKey: "key" },
    );
    assert.equal(relevant, null, "embedding 失败 → null → LLM 兜底");
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ===== v1.3.3 媒体优先 (文件/图不因相似度被挤掉) =====

test("v1.3.3 — 媒体候选优先保留, embedding 只筛文本", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const texts = JSON.parse((init as { body: string }).body).input as string[];
    return new Response(JSON.stringify({
      data: texts.map((t) => ({
        embedding: t.includes("触发") ? [1, 0, 0] : [0, 1, 0], // 文本候选低相似
        index: 0,
      })),
    }), { status: 200 });
  };
  try {
    const relevant = await selectTopNByEmbedding(
      "触发: 看看",
      [
        { msgId: "file-1", type: "file", text: "文档.pdf 文件", isVoice: false },
        { msgId: "img-1", type: "image", text: "[图片]", isVoice: false },
        { msgId: "txt-1", type: "text", text: "无关文本", isVoice: false },
      ],
      { apiKey: "key", topN: 5, threshold: 0.3 },
    );
    assert.ok(relevant, "应返回结果");
    assert.ok(relevant.includes("file-1"), "文件候选应被保留 (媒体优先)");
    assert.ok(relevant.includes("img-1"), "图片候选应被保留 (媒体优先)");
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ===== v1.3.63 P2-4 — embedCache 容量上限 =====

test("v1.3.63 P2-4 — cacheEmbedding 超上限删最旧条目", () => {
  clearEmbedCache();
  // 插入超过上限 (EMBED_CACHE_MAX=2000) 的条目, 最旧应被逐出
  for (let i = 0; i < 2100; i++) {
    cacheEmbedding(`msg-${i}`, [1, 2, 3]);
  }
  // 最新的应在
  assert.ok(getCachedEmbedding("msg-2099"), "最新条目应保留");
  // 最旧的应被逐出 (Map size 被钳制)
  assert.equal(getCachedEmbedding("msg-0"), undefined, "最旧条目应被逐出");
  // 容量应钳制在 ~2000 (允许边界误差)
  const remain = Array.from({ length: 2100 }, (_, i) => getCachedEmbedding(`msg-${i}`)).filter(Boolean).length;
  assert.ok(remain <= 2000, `缓存应钳制 ≤2000, 实际 ${remain}`);
  clearEmbedCache();
});
