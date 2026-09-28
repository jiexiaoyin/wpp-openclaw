// tests/unit/intent-embed.test.mjs — embedding 快路径中的**纯函数与降级契约**
//
// 只测不触网的部分: 向量数学、命令词判定、模块级缓存。绝不 mock fetch ——
// embedTexts 的网络分支属于集成测试范畴, 这里只锁「什么情况下**根本不发请求**」。
//
// 覆盖重点:
//   - cosineSimilarity: 同向 1 / 正交 0 / 反向 -1 / 零向量 0 (防除零) / 长度不等 0 / 空数组 0
//   - isCommandIntent: 中文命令词命中、闲聊不命中、null|undefined 不炸
//   - embedTexts 的两条短路: 空数组 → [] (先于 apiKey 判定); 缺 apiKey → null (降级而非抛错)
//   - 缓存: 读写、未命中 undefined、clearEmbedCache、超 2000 淘汰最旧
//   - selectTopNByEmbedding 空候选 → [] (同样不触网)
//
// 注意: 缓存是**模块级状态**, 每个用例各自 clearEmbedCache() 收尾, 避免互相污染。

import test from "node:test";
import assert from "node:assert/strict";

import {
  cosineSimilarity,
  isCommandIntent,
  embedTexts,
  cacheEmbedding,
  getCachedEmbedding,
  clearEmbedCache,
  selectTopNByEmbedding,
} from "../../dist/dispatch/intent-embed.js";

/** 浮点比较: 余弦值必须有容差, 不能用 equal */
function near(actual, expected, msg) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${msg} (期望 ${expected}, 实际 ${actual})`,
  );
}

// ── 1. cosineSimilarity (纯函数) ─────────────────────────────────

test("cosineSimilarity: 相同向量 → 1", () => {
  near(cosineSimilarity([1, 2, 3], [1, 2, 3]), 1, "完全同向");
});

test("cosineSimilarity: 同向但不同模长 → 1 (与长度无关)", () => {
  near(cosineSimilarity([1, 2], [2, 4]), 1, "缩放不改变方向");
  near(cosineSimilarity([1, 1, 1], [10, 10, 10]), 1, "缩放不改变方向");
});

test("cosineSimilarity: 正交向量 → 0", () => {
  near(cosineSimilarity([1, 0], [0, 1]), 0, "正交");
  near(cosineSimilarity([1, 0, 0], [0, 0, 5]), 0, "三维正交");
});

test("cosineSimilarity: 反平行 → -1", () => {
  near(cosineSimilarity([1, 0], [-1, 0]), -1, "方向完全相反");
});

test("cosineSimilarity: 零向量 → 0 (防除零, 不得 NaN)", () => {
  near(cosineSimilarity([0, 0], [1, 1]), 0, "左零向量");
  near(cosineSimilarity([1, 1], [0, 0]), 0, "右零向量");
  near(cosineSimilarity([0, 0], [0, 0]), 0, "双零向量");
  assert.ok(
    !Number.isNaN(cosineSimilarity([0, 0], [1, 1])),
    "NaN 会污染下游排序, 必须是 0",
  );
});

test("cosineSimilarity: 长度不等 → 0 (提前返回)", () => {
  near(cosineSimilarity([1, 2], [1]), 0, "长度不等不得按短的对齐算");
  near(cosineSimilarity([1], [1, 2, 3]), 0, "长度不等");
});

test("cosineSimilarity: 空数组 → 0", () => {
  near(cosineSimilarity([], []), 0, "双空");
  near(cosineSimilarity([], [1, 2]), 0, "左空");
  near(cosineSimilarity([1, 2], []), 0, "右空");
});

test("cosineSimilarity: 单元素向量退化为符号一致性", () => {
  near(cosineSimilarity([3], [7]), 1, "同号 → 1");
  near(cosineSimilarity([3], [-7]), -1, "异号 → -1");
});

// ── 2. isCommandIntent ──────────────────────────────────────────

test("isCommandIntent: 中文命令词逐个命中", () => {
  const words = [
    "删", "撤回", "发", "转", "帮", "改", "推送", "群发", "邀请",
    "踢", "移除", "改名", "建", "拉", "分享", "转发", "回复",
  ];
  for (const w of words) {
    assert.equal(isCommandIntent(`帮我${w}一下`), true, `命令词「${w}」应判定为命令意图`);
  }
});

test("isCommandIntent: 真实命令句 → true", () => {
  for (const s of ["把这条消息撤回", "帮我建个群", "推送今天的日报到群里", "转发给他"]) {
    assert.equal(isCommandIntent(s), true, `「${s}」应走 LLM 兜底`);
  }
});

test("isCommandIntent: 普通闲聊 → false", () => {
  for (const s of ["今天天气不错", "哈哈哈", "你说的对", "晚上吃什么"]) {
    assert.equal(isCommandIntent(s), false, `「${s}」不应误触发 LLM`);
  }
});

test("isCommandIntent: null / undefined / 空串 → false (不抛错)", () => {
  assert.equal(isCommandIntent(null), false, "String(text ?? '') 兜底, 不得抛 TypeError");
  assert.equal(isCommandIntent(undefined), false);
  assert.equal(isCommandIntent(""), false);
});

test("[行为记录] isCommandIntent: 正则无字母类词汇, /i 标志对英文无实际作用", () => {
  // 词表全是中文字, 故 "delete"/"DELETE" 一律 false —— 英文命令不在此层拦截 (交给 LLM)
  assert.equal(isCommandIntent("delete this message"), false);
  assert.equal(isCommandIntent("DELETE"), false);
});

test("[行为记录] isCommandIntent: 单字词表过宽, 会造成中文误判 (方向安全)", () => {
  // "拉" 命中「阿拉伯」, "建" 命中「建议」, "发" 命中「发现」
  // 误判的后果是「多走一次 LLM 兜底」而非做出错误动作 → 属于有意的 fail-safe 偏保守
  assert.equal(isCommandIntent("阿拉伯的天气"), true, "「拉」误命中");
  assert.equal(isCommandIntent("我建议明天再说"), true, "「建」误命中");
  assert.equal(isCommandIntent("我发现一个规律"), true, "「发」误命中");
});

// ── 3. embedTexts: 只走短路路径, 不触网 ─────────────────────────

test("embedTexts: 空数组 → [] (且先于 apiKey 判定)", async () => {
  assert.deepEqual(await embedTexts([], { apiKey: "" }), [], "没有输入就没有请求");
  assert.deepEqual(
    await embedTexts([], { apiKey: "sk-fake" }),
    [],
    "即便配了 key, 空输入也不该发起 HTTP",
  );
});

test("embedTexts: apiKey 为空/缺失 → null (降级契约, 不抛错)", async () => {
  assert.equal(
    await embedTexts(["你好"], { apiKey: "" }),
    null,
    "缺 key 必须返回 null 让调用方降级 LLM, 而不是 throw",
  );
  assert.equal(await embedTexts(["你好"], {}), null, "apiKey 缺失同样降级");
  assert.equal(await embedTexts(["你好"], { apiKey: undefined }), null);
});

// ── 4. 缓存 (模块级状态) ────────────────────────────────────────

test("缓存: 写入后可读回, 且是同一个数组引用", () => {
  clearEmbedCache();
  try {
    const vec = [0.1, 0.2, 0.3];
    cacheEmbedding("m1", vec);
    const got = getCachedEmbedding("m1");
    assert.deepEqual(got, [0.1, 0.2, 0.3], "内容应一致");
    assert.equal(got, vec, "应复用同一引用 (不复制, 省内存)");
  } finally {
    clearEmbedCache();
  }
});

test("缓存: 未缓存的 msgId → undefined", () => {
  clearEmbedCache();
  assert.equal(getCachedEmbedding("从未写过"), undefined);
});

test("缓存: clearEmbedCache 清空全部", () => {
  clearEmbedCache();
  cacheEmbedding("a", [1]);
  cacheEmbedding("b", [2]);
  assert.ok(getCachedEmbedding("a") && getCachedEmbedding("b"), "前置: 两条都在");
  clearEmbedCache();
  assert.equal(getCachedEmbedding("a"), undefined);
  assert.equal(getCachedEmbedding("b"), undefined);
});

test("缓存: 同 key 覆盖写, 不新增条目", () => {
  clearEmbedCache();
  try {
    cacheEmbedding("dup", [1]);
    cacheEmbedding("dup", [2]);
    assert.deepEqual(getCachedEmbedding("dup"), [2], "后写覆盖先写");
    assert.equal(getCachedEmbedding("dup").length, 1);
  } finally {
    clearEmbedCache();
  }
});

test("缓存: 容量上限 2000 —— 写 2001 条后最旧一条被淘汰", () => {
  clearEmbedCache();
  try {
    for (let i = 0; i <= 2000; i++) {
      cacheEmbedding(`k${i}`, [i]);
    }
    assert.equal(
      getCachedEmbedding("k0"),
      undefined,
      "第 2001 条写入时应淘汰最旧 (k0) —— 防无界增长的关键行为",
    );
    assert.ok(getCachedEmbedding("k1"), "第二旧的必须还在 (只淘汰一条)");
    assert.ok(getCachedEmbedding("k2000"), "最新写入的必须在");
    assert.deepEqual(getCachedEmbedding("k2000"), [2000], "内容应完好");
  } finally {
    clearEmbedCache();
  }
});

test("缓存: 恰好 2000 条时不淘汰", () => {
  clearEmbedCache();
  try {
    for (let i = 0; i < 2000; i++) {
      cacheEmbedding(`x${i}`, [i]);
    }
    assert.ok(getCachedEmbedding("x0"), "等于上限时不应有任何淘汰 (边界)");
    assert.ok(getCachedEmbedding("x1999"));
  } finally {
    clearEmbedCache();
  }
});

// ── 5. selectTopNByEmbedding: 空候选短路 ────────────────────────

test("selectTopNByEmbedding: 空候选 → [] (不触网)", async () => {
  const r = await selectTopNByEmbedding("触发文本", [], { apiKey: "" });
  assert.deepEqual(r, [], "没有候选就没有活干, 也不该判成降级 null");
});

test("selectTopNByEmbedding: 候选全命中缓存但缺 apiKey → null (触发文本仍需向量)", async () => {
  clearEmbedCache();
  try {
    cacheEmbedding("c1", [1, 0]);
    const r = await selectTopNByEmbedding(
      "触发文本",
      [{ msgId: "c1", text: "候选一", type: "text" }],
      { apiKey: "" },
    );
    assert.equal(
      r,
      null,
      "候选向量有缓存可省, 但触发文本必须现算 —— 缺 key 只能降级",
    );
  } finally {
    clearEmbedCache();
  }
});
