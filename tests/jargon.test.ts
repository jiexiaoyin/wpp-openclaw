// tests/jargon.test.ts - v1.3.76 JARGON 群黑话挖掘
// 覆盖: 分词 / 硬编码过滤 / 统计表 / burst / 综合分 / 黑话匹配 / JSON 提取 / prompt 构建

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tokenize,
  updateJargonFromMessage,
  getJargonCandidates,
  getGroupStats,
  shouldFilterCandidate,
  resetJargonStats,
  resetJargonHistory,
  recordJargonMessage,
  getRecentMessages,
  shouldTriggerMine,
  resetJargonMineStates,
  extractStringArray,
  extractJsonObject,
  buildExtractPrompt,
  buildValidatePrompt,
  buildInferWithContextPrompt,
  buildInferContentOnlyPrompt,
  buildComparePrompt,
  defaultJargonConfig,
  containsJargon,
} from "../src/inbound/jargon.js";
import { containsJargon as containsJargonFromTool } from "../src/dispatch/agent-tools/jargon-meta.js";
import { resolveAiConfig } from "../src/config-ai.js";

const cfg = defaultJargonConfig();

// ===== 分词 =====
test("jargon: tokenize 保留缩写过滤停用词", () => {
  resetJargonStats();
  const toks = tokenize("今天群里好多人说 yyds 破防了");
  assert.ok(toks.includes("yyds"), `yyds 应保留, got=${JSON.stringify(toks)}`);
  assert.ok(!toks.some((t) => t === "今天" || t === "说" || t === "了"), "停用词应过滤");
});
test("jargon: tokenize 过滤 @/URL/方括号", () => {
  const toks = tokenize("@接晓银 看这个 https://x.com/a [图片] nbcs");
  assert.ok(toks.includes("nbcs"), "nbcs 应保留");
  assert.ok(!toks.some((t) => t.includes("@") || t.includes("http") || t.includes("[")));
});

// ===== 硬编码过滤 =====
test("jargon: shouldFilterCandidate", () => {
  assert.equal(shouldFilterCandidate("yyds"), false);
  assert.equal(shouldFilterCandidate("哈哈"), true);
  assert.equal(shouldFilterCandidate("a"), true); // 太短
  assert.equal(shouldFilterCandidate("abcdefghijk"), true); // 超长英文
  assert.equal(shouldFilterCandidate("图片"), true);
  assert.equal(shouldFilterCandidate("12345"), true);
  assert.equal(shouldFilterCandidate("abc def"), true); // 含空白
});

// ===== 统计层 =====
test("jargon: updateJargonFromMessage 词频统计", () => {
  resetJargonStats();
  for (let i = 0; i < 10; i++) {
    updateJargonFromMessage("破防了破防了", "g1", "u1");
  }
  const st = getGroupStats("g1");
  assert.ok(st.totalOccurrences >= 10, `occurrences=${st.totalOccurrences}`);
});
test("jargon: getJargonCandidates 高频词上榜", () => {
  resetJargonStats();
  for (let i = 0; i < 10; i++) {
    updateJargonFromMessage("破防了破防了", "g1", "u1");
  }
  const cands = getJargonCandidates("g1", 20);
  const found = cands.find((c) => c.term.includes("破防"));
  assert.ok(found, `破防应成为候选, got=${JSON.stringify(cands.slice(0, 3))}`);
  assert.ok(found.score > 0, "score 应为正");
});
test("jargon: getJargonCandidates 低频词不上榜", () => {
  resetJargonStats();
  updateJargonFromMessage("yyds", "g2", "u1"); // 只出现 1 次 < MIN_FREQUENCY=5
  updateJargonFromMessage("yyds", "g2", "u2");
  updateJargonFromMessage("yyds", "g2", "u3");
  updateJargonFromMessage("yyds", "g2", "u4");
  const cands = getJargonCandidates("g2", 20);
  assert.equal(cands.find((c) => c.term === "yyds"), undefined, "低频词不应上榜");
});
test("jargon: 多用户 vs 单用户集中度", () => {
  resetJargonStats();
  // 单用户高频词 → 高集中度
  for (let i = 0; i < 10; i++) updateJargonFromMessage("nbcs", "g3", "u1");
  // 多用户低频词 → 低集中度
  for (let i = 0; i < 8; i++) updateJargonFromMessage("xswl", "g3", `u${i}`);
  const cands = getJargonCandidates("g3", 20);
  const nbcs = cands.find((c) => c.term === "nbcs");
  const xswl = cands.find((c) => c.term === "xswl");
  assert.ok(nbcs, "nbcs 应上榜");
  assert.ok(xswl, "xswl 应上榜");
});

// ===== 消息历史 =====
test("jargon: recordJargonMessage + getRecentMessages", () => {
  resetJargonHistory();
  recordJargonMessage("g1", "u1", "第一条");
  recordJargonMessage("g1", "u2", "第二条");
  const recent = getRecentMessages("g1", 5);
  assert.equal(recent.length, 2);
  assert.ok(recent[0]?.includes("第一条"));
});

// ===== 挖掘触发 =====
test("jargon: shouldTriggerMine 间隔+消息数", () => {
  resetJargonMineStates();
  const cfg2 = { ...cfg, mineIntervalSec: 60, minMessages: 10 };
  // 初始 0 消息 → 不触发
  assert.equal(shouldTriggerMine("g1", cfg2, 1000, 0), false);
  // 10 条但间隔不够 → 不触发
  assert.equal(shouldTriggerMine("g1", cfg2, 1000, 10), false);
  // 间隔够 + 10 条 → 触发
  assert.equal(shouldTriggerMine("g1", cfg2, 1000 + 61_000, 10), true);
  // 触发后重置 → 再等
  assert.equal(shouldTriggerMine("g1", cfg2, 1000 + 62_000, 10), false);
});

// ===== JSON 提取 =====
test("jargon: extractStringArray", () => {
  assert.deepEqual(extractStringArray('["a","b"]'), ["a", "b"]);
  assert.deepEqual(extractStringArray('```json\n["a"]\n```'), ["a"]);
  assert.deepEqual(extractStringArray("text [\"a\"] tail"), ["a"]);
  assert.deepEqual(extractStringArray("[]"), []);
  assert.deepEqual(extractStringArray("no array"), []);
});
test("jargon: extractJsonObject", () => {
  assert.deepEqual(extractJsonObject('{"meaning":"x"}'), { meaning: "x" });
  assert.deepEqual(extractJsonObject('text {"meaning":"y"} tail'), { meaning: "y" });
  assert.equal(extractJsonObject("no json"), null);
});

// ===== Prompt 构建 =====
test("jargon: buildExtractPrompt 含黑话特征说明", () => {
  const p = buildExtractPrompt("群聊内容");
  assert.ok(p.includes("黑话"));
  assert.ok(p.includes("JSON 数组"));
  assert.ok(p.includes("yyds"));
});
test("jargon: buildValidatePrompt 含候选列表", () => {
  const p = buildValidatePrompt("对话", ["yyds", "哈哈"]);
  assert.ok(p.includes("yyds"));
  assert.ok(p.includes("哈哈"));
});
test("jargon: 三步推断 prompt", () => {
  assert.ok(buildInferWithContextPrompt("yyds", "ctx").includes("yyds"));
  assert.ok(buildInferContentOnlyPrompt("yyds").includes("yyds"));
  assert.ok(buildComparePrompt("yyds", "意思A", "意思B").includes("is_similar"));
});

// ===== 黑话匹配 (tool 用) =====
test("jargon: containsJargon 词边界", () => {
  // ASCII 缩写: 词边界防误命中
  assert.equal(containsJargonFromTool("yyds", "大家 yyds"), true);
  assert.equal(containsJargonFromTool("yyds", "xyydsx"), false);
  // 中文子串
  assert.equal(containsJargonFromTool("破防", "今天破防了"), true);
});

// ===== v1.3.77 AI-UNIFY 统一配置 =====
test("ai-unify: 未配 ai 块 → heartflow 原样", () => {
  const hf = resolveAiConfig({ heartflow: { enabled: true } } as never, "heartflow");
  assert.equal(hf?.enabled, true);
  assert.equal(hf?.model, undefined);
});
test("ai-unify: ai.judgeModel 注入 heartflow", () => {
  const hf = resolveAiConfig({ ai: { judgeModel: "Gemini-2.0-Flash" }, heartflow: { enabled: true } } as never, "heartflow");
  assert.equal(hf?.enabled, true);
  assert.equal(hf?.model, "Gemini-2.0-Flash");
});
test("ai-unify: heartflow 自己配 model 覆盖 ai.judgeModel", () => {
  const hf = resolveAiConfig(
    { ai: { judgeModel: "Gemini-2.0-Flash" }, heartflow: { enabled: true, model: "MiniMax-M2.5" } } as never,
    "heartflow",
  );
  assert.equal(hf?.model, "MiniMax-M2.5");
});
test("ai-unify: ai.timeoutMs 注入 jargon", () => {
  const jg = resolveAiConfig({ ai: { timeoutMs: 8000 }, jargon: { enabled: true } } as never, "jargon");
  assert.equal(jg?.enabled, true);
  assert.equal(jg?.timeoutMs, 8000);
});
test("ai-unify: ai 块未提供值 → jargon 原样", () => {
  const jg = resolveAiConfig({ ai: {}, jargon: { enabled: true, mineIntervalSec: 120 } } as never, "jargon");
  assert.equal(jg?.mineIntervalSec, 120);
});
