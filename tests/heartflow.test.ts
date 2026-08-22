// tests/heartflow.test.ts - v1.3.75 HEARTFLOW 心流主动回复
// 覆盖: JSON 稳健解析 / clamp / 5维打分解析 / 精力状态机 / 原始消息缓冲 / 触发门禁 / triggers 集成

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractHeartflowJson,
  clampScore,
  parseHeartflowResponse,
  getChatState,
  recordActiveReply,
  recordPassiveMessage,
  secondsSinceLastReply,
  recordRawMessage,
  getRawBuffer,
  formatRawMessages,
  lastBotReply,
  buildChatContextSummary,
  buildHeartflowPrompt,
  checkHeartflowGate,
  resetHeartflowStates,
  resetHeartflowBuffers,
  defaultHeartflowConfig,
} from "../src/inbound/heartflow.js";
import { shouldTrigger, defaultTriggerConfig } from "../src/inbound/triggers.js";
import type { WppInboundMessage } from "../src/types.js";

const cfg = defaultHeartflowConfig();

function makeGroupMsg(content: string): WppInboundMessage {
  return {
    accountId: "default",
    msgId: "m1",
    newMsgId: "n1",
    fromWxid: "wxid_user1",
    msgType: 1,
    content,
    ts: Math.floor(Date.now() / 1000),
    peerKind: "group",
    peerId: "g1@chatroom",
    chatroomId: "g1@chatroom",
    fromNickname: "小明",
    toWxid: "bot_wxid",
    trigger: "at",
  } as WppInboundMessage;
}

// ===== JSON 稳健解析 =====
test("heartflow: extractHeartflowJson 直接解析", () => {
  assert.deepEqual(extractHeartflowJson('{"a":1}'), { a: 1 });
});
test("heartflow: extractHeartflowJson 剥 markdown 围栏", () => {
  assert.deepEqual(extractHeartflowJson('```json\n{"a":2}\n```'), { a: 2 });
});
test("heartflow: extractHeartflowJson 正则取外层", () => {
  assert.deepEqual(extractHeartflowJson('text {"a":3} tail'), { a: 3 });
});
test("heartflow: extractHeartflowJson 无效返回 null", () => {
  assert.equal(extractHeartflowJson("no json"), null);
  assert.equal(extractHeartflowJson(""), null);
});

// ===== clamp =====
test("heartflow: clampScore 钉位 [0,10]", () => {
  assert.equal(clampScore(15), 10);
  assert.equal(clampScore(-2), 0);
  assert.equal(clampScore("7.5"), 7.5);
  assert.equal(clampScore("abc"), 0);
  assert.equal(clampScore(null), 0);
});

// ===== 5 维打分解析 =====
test("heartflow: parseHeartflowResponse 高分应回复", () => {
  const r = parseHeartflowResponse(
    '{"relevance":8,"willingness":7,"social":6,"timing":5,"continuity":5}',
    cfg,
  );
  assert.ok(r);
  assert.equal(r.shouldReply, true);
  // (8*.25 + 7*.2 + 6*.2 + 5*.15 + 5*.2) / 10 = 6.35/10 = 0.635
  assert.equal(r.overallScore.toFixed(3), "0.635");
});
test("heartflow: parseHeartflowResponse 低分不回复", () => {
  const r = parseHeartflowResponse(
    '{"relevance":1,"willingness":1,"social":2,"timing":1,"continuity":2}',
    cfg,
  );
  assert.ok(r);
  assert.equal(r.shouldReply, false);
});
test("heartflow: parseHeartflowResponse 坏 JSON 返回 null", () => {
  assert.equal(parseHeartflowResponse("not json", cfg), null);
});
test("heartflow: parseHeartflowResponse 带 reasoning", () => {
  const r = parseHeartflowResponse(
    '{"relevance":5,"willingness":5,"social":5,"timing":5,"continuity":5,"reasoning":"适合参与"}',
    cfg,
  );
  assert.ok(r);
  assert.equal(r.reasoning, "适合参与");
});

// ===== 精力状态机 =====
test("heartflow: 状态机初始 1.0", () => {
  resetHeartflowStates();
  const st = getChatState("g1", cfg, 1_000_000);
  assert.equal(st.energy, 1.0);
});
test("heartflow: 回复后精力衰减", () => {
  resetHeartflowStates();
  getChatState("g1", cfg, 1_000_000);
  recordActiveReply("g1", cfg, 2_000_000);
  assert.equal(getChatState("g1", cfg, 2_000_000).energy.toFixed(2), "0.90"); // 1.0 - 0.1
});
test("heartflow: 不回复时精力恢复", () => {
  resetHeartflowStates();
  getChatState("g1", cfg, 1_000_000);
  recordPassiveMessage("g1", cfg, 1_000_000);
  // 已满 1.0 → 恢复封顶仍 1.0
  assert.equal(getChatState("g1", cfg, 1_000_000).energy.toFixed(2), "1.00");
});
test("heartflow: secondsSinceLastReply", () => {
  resetHeartflowStates();
  recordActiveReply("g1", cfg, 2_000_000);
  assert.equal(secondsSinceLastReply("g1", 2_000_000 + 10_000), 10);
  assert.equal(secondsSinceLastReply("g1", 1_000_000), 0); // 无记录
});

// ===== 原始消息缓冲 =====
test("heartflow: recordRawMessage + getRawBuffer 环形", () => {
  resetHeartflowBuffers();
  for (let i = 0; i < 10; i++) {
    recordRawMessage("g1", { senderName: "u", senderId: "u", content: `msg${i}`, timestamp: i, isBot: false });
  }
  const buf = getRawBuffer("g1", 5);
  assert.equal(buf.length, 5);
  assert.equal(buf[0]?.content, "msg5");
  assert.equal(buf[4]?.content, "msg9");
});
test("heartflow: formatRawMessages 带前缀", () => {
  resetHeartflowBuffers();
  recordRawMessage("g1", { senderName: "小明", senderId: "u", content: "你好", timestamp: 1, isBot: false });
  recordRawMessage("g1", { senderName: "bot", senderId: "bot", content: "在的", timestamp: 2, isBot: true });
  const s = formatRawMessages(getRawBuffer("g1", 5));
  assert.ok(s.includes("[小明]: 你好"));
  assert.ok(s.includes("[机器人]: 在的"));
});
test("heartflow: lastBotReply 取最近 bot 回复", () => {
  resetHeartflowBuffers();
  recordRawMessage("g1", { senderName: "u", senderId: "u", content: "hi", timestamp: 1, isBot: false });
  recordRawMessage("g1", { senderName: "bot", senderId: "bot", content: "回复1", timestamp: 2, isBot: true });
  recordRawMessage("g1", { senderName: "u", senderId: "u", content: "再问", timestamp: 3, isBot: false });
  recordRawMessage("g1", { senderName: "bot", senderId: "bot", content: "回复2", timestamp: 4, isBot: true });
  assert.equal(lastBotReply("g1"), "回复2");
});

// ===== 上下文摘要 =====
test("heartflow: buildChatContextSummary 包含活跃度", () => {
  resetHeartflowStates();
  resetHeartflowBuffers();
  getChatState("g1", cfg, 1_000_000);
  const s = buildChatContextSummary("g1", cfg, 1_000_000);
  assert.ok(s.includes("最近活跃度"));
  assert.ok(s.includes("历史回复率"));
});

// ===== 触发门禁 =====
test("heartflow: checkHeartflowGate 门禁", () => {
  assert.equal(checkHeartflowGate("g", "hi", { ...cfg, enabled: false }, 0).allowed, false);
  assert.equal(checkHeartflowGate("g", "hi", { ...cfg, enabled: true }, 0).allowed, true);
  assert.equal(checkHeartflowGate("g", "  ", { ...cfg, enabled: true }, 0).allowed, false);
  assert.equal(
    checkHeartflowGate("g", "hi", { ...cfg, enabled: true, whitelistGroups: ["g2"] }, 0).allowed,
    false,
  );
  assert.equal(
    checkHeartflowGate("g2", "hi", { ...cfg, enabled: true, whitelistGroups: ["g2"] }, 0).allowed,
    true,
  );
});
test("heartflow: checkHeartflowGate 冷却期", () => {
  resetHeartflowStates();
  const cfg2 = { ...cfg, enabled: true, minReplyIntervalSec: 60 };
  // 从未回复 → 允许
  assert.equal(checkHeartflowGate("g1", "hi", cfg2, 1_000_000).allowed, true);
  recordActiveReply("g1", cfg2, 1_000_000);
  // 10 秒后 → 冷却中拒绝
  assert.equal(checkHeartflowGate("g1", "hi", cfg2, 1_000_000 + 10_000).allowed, false);
  // 70 秒后 → 允许
  assert.equal(checkHeartflowGate("g1", "hi", cfg2, 1_000_000 + 70_000).allowed, true);
});

// ===== prompt 构建 =====
test("heartflow: buildHeartflowPrompt 含 5 维 + 阈值", () => {
  const p = buildHeartflowPrompt(
    {
      chatId: "g1@chatroom",
      botNickname: "接晓银",
      content: "今晚吃什么",
      senderName: "小明",
      chatContext: "最近活跃度: 中",
      recentMessages: "[小明]: 今晚吃什么",
      lastBotReply: "",
      secondsSinceLastReply: 0,
      energy: 1.0,
    },
    cfg,
  );
  assert.ok(p.includes("内容相关度"));
  assert.ok(p.includes("回复意愿"));
  assert.ok(p.includes("社交适宜性"));
  assert.ok(p.includes("时机恰当性"));
  assert.ok(p.includes("对话连贯性"));
  assert.ok(p.includes("0.6")); // 默认阈值
  assert.ok(p.includes("接晓银"));
});

// ===== triggers 集成 =====
test("heartflow: shouldTrigger 未@群消息命中 heartflow", () => {
  const tcfg = {
    ...defaultTriggerConfig(),
    heartflow: { enabled: true },
  };
  const msg = makeGroupMsg("今晚聊什么");
  const r = shouldTrigger(msg, tcfg, { botWxid: "bot_wxid", botNickname: "接晓银" });
  assert.equal(r.triggered, true);
  assert.equal(r.via, "heartflow");
});
test("heartflow: shouldTrigger heartflow 关闭不触发", () => {
  const tcfg = defaultTriggerConfig(); // heartflow.enabled=false
  const msg = makeGroupMsg("今晚聊什么");
  const r = shouldTrigger(msg, tcfg, { botWxid: "bot_wxid", botNickname: "接晓银" });
  assert.equal(r.triggered, false);
});
test("heartflow: shouldTrigger 群白名单过滤", () => {
  const tcfg = {
    ...defaultTriggerConfig(),
    heartflow: { enabled: true, whitelistGroups: ["g2@chatroom"] },
  };
  const msg = makeGroupMsg("今晚聊什么"); // g1@chatroom
  const r = shouldTrigger(msg, tcfg, { botWxid: "bot_wxid", botNickname: "接晓银" });
  assert.equal(r.triggered, false);
});
test("heartflow: shouldTrigger @消息优先 (不触发 heartflow)", () => {
  const tcfg = {
    ...defaultTriggerConfig(),
    heartflow: { enabled: true },
  };
  const msg = makeGroupMsg("@接晓银 你好");
  const r = shouldTrigger(msg, tcfg, { botWxid: "bot_wxid", botNickname: "接晓银" });
  assert.equal(r.triggered, true);
  assert.equal(r.via, "at"); // 被@ → 走 at 触发
});
test("heartflow: shouldTrigger 私聊不触发 heartflow", () => {
  const tcfg = {
    ...defaultTriggerConfig(),
    heartflow: { enabled: true },
  };
  const msg = makeGroupMsg("私聊内容");
  (msg as { peerKind: string }).peerKind = "direct";
  (msg as { peerId: string }).peerId = "wxid_user1";
  const r = shouldTrigger(msg, tcfg, { botWxid: "bot_wxid", botNickname: "接晓银", allowFrom: ["wxid_user1"] });
  // 私聊 → via "at" (白名单内)
  assert.equal(r.via, "at");
});
