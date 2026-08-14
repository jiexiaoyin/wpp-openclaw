/**
 * dispatcher-outbound-dedupe.test.ts
 *
 * v2026-08-14 14:50 P0-fix (老板 query 14:46):
 *   同 inbound 被 framework 双派发 (main + wpp-wechat) → 2 条 outbound,
 *   AI 自创 ack 模板 "[Previous reply already sent...]" 刷屏
 *
 * v1.3.63 审阅修复 (2026-08-14):
 *   * P2-6: 原测试手抄 ACK 正则副本 (还抄成 `Reply\.\*` 字面点星, 与生产 `Reply.*` 通配分叉)
 *     + fakeSendAiReply 重写生产 dedup 逻辑 → 生产正则/逻辑从未被测. 改 import 生产真值.
 *   * P1-3: 生产 dedup key 从 content[:30] → 完整内容 sha1 (防误吞合法回复). 直接测 dedupKeyFor.
 *   * P1-1: 生产 ACK_TEMPLATE_RE 曾含字面 0x08 退格字节 (正则恒 false) — 现已修, 回归测试钉住.
 */
import test from "node:test";
import assert from "node:assert/strict";

// 从生产源码 import 真值 (禁止手抄副本 — 手抄会与生产分叉掩盖 bug)
import { ACK_TEMPLATE_RE, dedupKeyFor, OUTBOUND_DEDUP_WINDOW_MS } from "../src/dispatch/dispatcher.js";

// === ACK 拦截单测 (生产正则真值) ===

test("1. ACK: '[Previous reply already sent...]' → DROP", () => {
  assert.equal(ACK_TEMPLATE_RE.test("[Previous reply already sent - 高献梅 joined the 8月 GT7 接龙, reply delivered successfully]"), true);
});

test("2. ACK: '[No further action needed...]' → DROP", () => {
  assert.equal(ACK_TEMPLATE_RE.test("[No further action needed - reply already sent]"), true);
});

test("3. ACK: '[Reply already delivered]' → DROP (Reply.*delivered 通配分支)", () => {
  assert.equal(ACK_TEMPLATE_RE.test("[Reply already delivered]"), true);
});

test("4. ACK: '[reply delivered successfully]' → DROP", () => {
  assert.equal(ACK_TEMPLATE_RE.test("[reply delivered successfully]"), true);
});

test("5. PASS: 正常接龙鼓励 '高献梅来啦' → 不拦截", () => {
  assert.equal(ACK_TEMPLATE_RE.test("高献梅来啦，接龙越来越热闹👏"), false);
});

test("6. PASS: '倪彩霞 gt7 蓝×3，猛👍' → 不拦截", () => {
  assert.equal(ACK_TEMPLATE_RE.test("倪彩霞 gt7 蓝×3，猛👍"), false);
});

test("7. PASS: 英文普通文本 'Done!' → 不拦截", () => {
  assert.equal(ACK_TEMPLATE_RE.test("Done!"), false);
});

test("P1-1 回归: 生产 ACK_TEMPLATE_RE 不得含字面 0x08 退格字节", () => {
  // 曾: `)\b` 被转义成字面 0x08 → 4 个模板全不匹配 → 拦截半边生产失效
  assert.equal(ACK_TEMPLATE_RE.test("[Previous reply already sent]"), true, "regex 必须真正匹配");
  assert.equal(ACK_TEMPLATE_RE.source.includes(""), false, "source 不得含退格字节");
  // v1.3.63 P3: 收窄为完整 `[...]` 块匹配 (不再依赖 \b)
  assert.equal(ACK_TEMPLATE_RE.test("Done!"), false);
  // 收窄: 正文散落 delivered (非方括号块) 不误伤
  assert.equal(ACK_TEMPLATE_RE.test("好的，这条已 delivered 处理完成"), false, "正文散落 delivered 不应误伤");
});

// === P1-3: dedup key 行为 (生产纯函数真值) ===

test("P1-3: 不同内容前 30 字符相同 → key 不同 (不再误吞)", () => {
  const a = dedupKeyFor("default", "g@chatroom", "收到，我帮你查一下销售数据");
  const b = dedupKeyFor("default", "g@chatroom", "收到，我帮你查一下库存数据");
  assert.notEqual(a, b, "前 30 字符相同但内容不同 → 不得共用 key");
});

test("P1-3: 同内容同 peer 同账号 → key 相同 (dedup 命中)", () => {
  const k1 = dedupKeyFor("default", "g@chatroom", "高献梅来啦，接龙越来越热闹👏");
  const k2 = dedupKeyFor("default", "g@chatroom", "高献梅来啦，接龙越来越热闹👏");
  assert.equal(k1, k2);
});

test("P1-3: 不同账号 → key 不同", () => {
  const k1 = dedupKeyFor("default", "g@chatroom", "高献梅来啦");
  const k2 = dedupKeyFor("alice", "g@chatroom", "高献梅来啦");
  assert.notEqual(k1, k2);
});

test("P1-3: 不同 peer → key 不同", () => {
  const k1 = dedupKeyFor("default", "groupA@chatroom", "高献梅来啦");
  const k2 = dedupKeyFor("default", "groupB@chatroom", "高献梅来啦");
  assert.notEqual(k1, k2);
});

// === 常量 sanity ===

test("OUTBOUND_DEDUP_WINDOW_MS = 5 分钟", () => {
  assert.equal(OUTBOUND_DEDUP_WINDOW_MS, 5 * 60 * 1000);
});
