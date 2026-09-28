// tests/unit/db-row-mappers.test.mjs — DB row → 领域对象 反序列化
//
// v1.9.2 从 mysql.ts 抽出 row-mappers.ts 时建立的测试。
// 抽出的动机之一就是「这 4 个函数是纯函数, 本可在无 MySQL 环境下单测」——
// 抽出后立刻补上, 否则等于只搬了位置没兑现价值。
//
// 覆盖重点 (都是 NULL 处理与类型转换的真实边界):
//   - NULL 列 → null / 既定默认 (而非 undefined / NaN / "null")
//   - raw_payload 非合法 JSON → 原样保留字符串 (上游可能存非 JSON 文本)
//   - ts 为 Date → Unix 秒; 为数字 → 直取
//   - enabled 的 0/1 → false/true
//   - sample_msgs / version 的 falsy 兜底

import test from "node:test";
import assert from "node:assert/strict";

import {
  rowToAccount,
  rowToHfGroupProfile,
  rowToHfGroupState,
  rowToMessage,
} from "../../dist/storage/db/row-mappers.js";

// ── 1. rowToMessage: NULL + JSON 解析 + ts 转换 ────────────────────

test("rowToMessage: 常规行完整映射", () => {
  const m = rowToMessage({
    account_id: "default",
    msg_id: "123",
    new_msg_id: "456",
    direction: "inbound",
    peer_kind: "group",
    peer_id: "g1@chatroom",
    peer_name: "测试群",
    chat_id: "g1@chatroom",
    msg_type: "text",
    content: "hello",
    raw_payload: '{"a":1}',
    from_wxid: "wxid_x",
    ts: 1700000000,
  });
  assert.equal(m.account_id, "default");
  assert.equal(m.msg_id, "123");
  assert.equal(m.direction, "inbound");
  assert.deepEqual(m.raw_payload, { a: 1 }, "合法 JSON 应被解析成对象");
  assert.equal(m.ts, 1700000000);
});

test("rowToMessage: NULL 列 → null (不得变成 'null' 字符串或 undefined)", () => {
  const m = rowToMessage({
    account_id: "default",
    peer_id: "p1",
    direction: "inbound",
    peer_kind: "friend",
    ts: 1,
  });
  assert.equal(m.msg_id, null);
  assert.equal(m.new_msg_id, null);
  assert.equal(m.peer_name, null);
  assert.equal(m.chat_id, null);
  assert.equal(m.msg_type, null);
  assert.equal(m.content, null);
  assert.equal(m.from_wxid, null);
});

test("rowToMessage: raw_payload 非合法 JSON → 原样保留字符串", () => {
  const raw = "not a json at all";
  const m = rowToMessage({ account_id: "a", peer_id: "p", direction: "inbound", peer_kind: "friend", ts: 1, raw_payload: raw });
  assert.equal(m.raw_payload, raw, "解析失败必须保留原文, 不能丢数据");
});

test("rowToMessage: raw_payload 已是对象时原样透传", () => {
  const obj = { k: "v" };
  const m = rowToMessage({ account_id: "a", peer_id: "p", direction: "inbound", peer_kind: "friend", ts: 1, raw_payload: obj });
  assert.deepEqual(m.raw_payload, obj);
});

test("rowToMessage: ts 为 Date → Unix 秒 (向下取整)", () => {
  const d = new Date(1700000000123); // 带毫秒
  const m = rowToMessage({ account_id: "a", peer_id: "p", direction: "inbound", peer_kind: "friend", ts: d });
  assert.equal(m.ts, 1700000000, "毫秒必须截掉");
});

test("rowToMessage: ts 缺失 → 0 (而非 NaN)", () => {
  const m = rowToMessage({ account_id: "a", peer_id: "p", direction: "inbound", peer_kind: "friend" });
  assert.equal(m.ts, 0);
  assert.ok(!Number.isNaN(m.ts));
});

// ── 2. rowToAccount ───────────────────────────────────────────────

test("rowToAccount: enabled 0/1 → false/true; 缺失 → false", () => {
  assert.equal(rowToAccount({ account_id: "a", enabled: 1 }).enabled, true);
  assert.equal(rowToAccount({ account_id: "a", enabled: 0 }).enabled, false);
  assert.equal(rowToAccount({ account_id: "a" }).enabled, false, "缺失按 false (fail-safe)");
});

test("rowToAccount: NULL 可选字段 → null", () => {
  const a = rowToAccount({ account_id: "a", enabled: 1 });
  assert.equal(a.display_name, null);
  assert.equal(a.self_wxid, null);
  assert.equal(a.nickname, null);
  assert.equal(a.config_json, null);
});

// ── 3. rowToHfGroupState ─────────────────────────────────────────

test("rowToHfGroupState: 学到的阈值与变更记录映射", () => {
  const s = rowToHfGroupState({
    account_id: "a",
    group_id: "g",
    learned_threshold: "0.65",
    last_change_at: 1700000000,
    last_change_old: "0.6",
    last_change_new: "0.65",
    last_change_reason: "收敛",
  });
  assert.equal(s.learned_threshold, 0.65, "字符串数字应转 Number");
  assert.equal(s.last_change_old, 0.6);
  assert.equal(s.last_change_reason, "收敛");
});

test("rowToHfGroupState: 未学习过 (NULL) → null, 不得变 0", () => {
  const s = rowToHfGroupState({ account_id: "a", group_id: "g" });
  assert.equal(s.learned_threshold, null, "null 与 0 语义不同 —— 0 会被当成有效阈值");
  assert.equal(s.last_change_at, null);
  assert.equal(s.last_change_reason, null);
});

// ── 4. rowToHfGroupProfile ───────────────────────────────────────

test("rowToHfGroupProfile: profile_json 为 NULL → 空串 (上层按'无画像'处理)", () => {
  const p = rowToHfGroupProfile({ account_id: "a", group_id: "g" });
  assert.equal(p.profile_json, "", "契约: NULL → 空串, 不是 null");
});

test("rowToHfGroupProfile: sample_msgs/version 的 falsy 兜底", () => {
  const p = rowToHfGroupProfile({ account_id: "a", group_id: "g", sample_msgs: 0, version: 0 });
  assert.equal(p.sample_msgs, 0);
  assert.equal(p.version, 1, "version 0 为 falsy → 兜底 1");

  const p2 = rowToHfGroupProfile({ account_id: "a", group_id: "g", sample_msgs: 7, version: 3 });
  assert.equal(p2.sample_msgs, 7);
  assert.equal(p2.version, 3);
});
