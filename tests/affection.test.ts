// tests/affection.test.ts - v1.3.77 AFFECTION 好感度/社交关系系统
// 覆盖: 关键词分类 / 情绪修正 / 好感度变化 / 情绪门槛 / 上限 / 重分配 / 情绪响应 / system prompt / 端到端

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyInteractionByRules,
  calculateAffectionChange,
  moodModifier,
  planRedistribution,
  applyMoodResponse,
  buildMoodSystemPrompt,
  processAffectionMessage,
  resetAffectionStates,
  getUserAffection,
  getGroupMood,
  defaultAffectionConfig,
  buildClassifyPrompt,
  parseClassifyResponse,
} from "../src/inbound/affection.js";

const cfg = defaultAffectionConfig();
cfg.enabled = true;

// ===== 关键词分类 (对齐原版实际行为, 已用 Python 验证) =====
test("affection: 关键词分类 明确词", () => {
  assert.equal(classifyInteractionByRules("谢谢老板"), "thanks");
  assert.equal(classifyInteractionByRules("在吗"), "care");
  assert.equal(classifyInteractionByRules("你真厉害"), "compliment");
  assert.equal(classifyInteractionByRules("傻逼"), "insult");
  assert.equal(classifyInteractionByRules("弄死你"), "threat");
});
test("affection: 关键词分类 原版宽泛行为 (compliment 先匹配)", () => {
  // 原版: compliment 含 "好"/"不错", 检查顺序在 care 前
  assert.equal(classifyInteractionByRules("今天天气不错"), "compliment");
  assert.equal(classifyInteractionByRules("晚上好"), "compliment");
  assert.equal(classifyInteractionByRules("你好呀"), "compliment");
});
test("affection: 无匹配返回 undefined", () => {
  assert.equal(classifyInteractionByRules("今天群里聊天"), undefined);
});

// ===== 情绪修正 =====
test("affection: moodModifier happy 满强度", () => {
  assert.equal(moodModifier("happy", 1.0), 1.2);
});
test("affection: moodModifier angry 中强度", () => {
  assert.ok(Math.abs(moodModifier("angry", 0.5) - 0.3) < 0.001);
});
test("affection: moodModifier excited", () => {
  assert.ok(Math.abs(moodModifier("excited", 0.8) - 1.3 * 0.9) < 0.001);
});

// ===== 好感度变化 =====
test("affection: praise 在 happy 0.5 → +4 (trunc)", () => {
  const r = calculateAffectionChange({
    interactionType: "praise",
    currentLevel: 10,
    currentMood: { moodType: "happy", intensity: 0.5, description: "" },
    maxUserAffection: 100,
  });
  assert.equal(r.canChange, true);
  assert.equal(r.change, 4); // 5 * (1.2*0.75) = 4.5 → trunc 4
});
test("affection: 情绪门槛 flirt 需 happy/playful/excited", () => {
  const r = calculateAffectionChange({
    interactionType: "flirt",
    currentLevel: 10,
    currentMood: { moodType: "angry", intensity: 0.5, description: "" },
    maxUserAffection: 100,
  });
  assert.equal(r.canChange, false);
});
test("affection: 上限拒绝正向变化", () => {
  const r = calculateAffectionChange({
    interactionType: "chat",
    currentLevel: 100,
    currentMood: null,
    maxUserAffection: 100,
  });
  assert.equal(r.canChange, false);
});
test("affection: 负面变化不受上限限制", () => {
  const r = calculateAffectionChange({
    interactionType: "insult",
    currentLevel: 100,
    currentMood: null,
    maxUserAffection: 100,
  });
  assert.equal(r.canChange, true);
  assert.equal(r.change, -8);
});

// ===== 重分配 =====
test("affection: planRedistribution 按比例扣减", () => {
  const plan = planRedistribution(
    [{ userId: "a", level: 80 }, { userId: "b", level: 40 }, { userId: "c", level: 20 }],
    "a", 50, 0.3,
  );
  assert.ok(plan.size > 0);
  let total = 0;
  for (const amount of plan.values()) total += amount;
  assert.ok(total > 0);
});

// ===== 情绪响应 =====
test("affection: 侮辱 → sad 情绪", () => {
  const m = applyMoodResponse({ moodType: "calm", intensity: 0.5, description: "", expiresAt: 0 }, "insult", 1000);
  assert.equal(m?.moodType, "sad");
});
test("affection: 威胁 → anxious 情绪", () => {
  const m = applyMoodResponse({ moodType: "calm", intensity: 0.5, description: "", expiresAt: 0 }, "threat", 1000);
  assert.equal(m?.moodType, "anxious");
});
test("affection: 夸赞 → happy 情绪", () => {
  const m = applyMoodResponse({ moodType: "calm", intensity: 0.5, description: "", expiresAt: 0 }, "praise", 1000);
  assert.equal(m?.moodType, "happy");
});

// ===== system prompt =====
test("affection: buildMoodSystemPrompt 注入情绪", () => {
  const sp = buildMoodSystemPrompt("你是助手", { moodType: "happy", intensity: 0.8, description: "心情愉快", expiresAt: 0 });
  assert.ok(sp.includes("心情愉快"));
  assert.ok(sp.includes("非常"));
});
test("affection: buildMoodSystemPrompt 已含情绪不重复", () => {
  const base = "你当前情绪状态已存在";
  const sp = buildMoodSystemPrompt(base, { moodType: "happy", intensity: 0.5, description: "心情愉快", expiresAt: 0 });
  assert.equal(sp, base);
});

// ===== LLM 分类 prompt =====
test("affection: buildClassifyPrompt 含类型列表", () => {
  const p = buildClassifyPrompt("你好", "小明");
  assert.ok(p.includes("chat"));
  assert.ok(p.includes("compliment"));
  assert.ok(p.includes("threat"));
});
test("affection: parseClassifyResponse", () => {
  assert.equal(parseClassifyResponse('{"type":"thanks"}'), "thanks");
  assert.equal(parseClassifyResponse('```json\n{"type":"care"}\n```'), "care");
  assert.equal(parseClassifyResponse("invalid"), undefined);
  assert.equal(parseClassifyResponse('{"type":"unknown"}'), undefined);
});

// ===== 端到端 =====
test("affection: 夸赞 → 好感度+", async () => {
  resetAffectionStates();
  const res = await processAffectionMessage("g1", "u1", "你真厉害", "小明", cfg, { apiKey: "" }, Date.now());
  assert.equal(res?.interactionType, "compliment");
  // calm 0.5 → 3 * (1.0*0.75) = 2.25 → trunc 2
  assert.equal(res.change, 2);
  assert.equal(getUserAffection("g1", "u1"), 2);
});
test("affection: 侮辱 → 好感度不为负 (原版 max(0,...))", async () => {
  resetAffectionStates();
  const res = await processAffectionMessage("g1", "u1", "傻逼", "小明", cfg, { apiKey: "" }, Date.now());
  assert.equal(res?.interactionType, "insult");
  assert.ok(res.change < 0, `侮辱应负变化, got ${res.change}`);
  // 好感度下限 0 (原版 max(0, ...))
  assert.equal(getUserAffection("g1", "u1"), 0);
});
test("affection: disabled 时不处理", async () => {
  resetAffectionStates();
  const off = defaultAffectionConfig(); // enabled=false
  const res = await processAffectionMessage("g1", "u1", "你真厉害", "小明", off, { apiKey: "" }, Date.now());
  assert.equal(res, null);
  assert.equal(getUserAffection("g1", "u1"), 0);
});
test("affection: 情绪状态被交互影响", async () => {
  resetAffectionStates();
  await processAffectionMessage("g1", "u1", "傻逼", "小明", cfg, { apiKey: "" }, Date.now());
  const mood = getGroupMood("g1", Date.now());
  assert.equal(mood.moodType, "sad");
});
