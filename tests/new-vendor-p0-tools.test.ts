// tests/new-vendor-p0-tools.test.ts - v1.3.67 新 vendor P0 API 工具测试
// 验证: 群发文本/发文件/收藏朋友圈/通讯录/好友权限 新增工具注册 + schema

import { test } from "node:test";
import assert from "node:assert/strict";

import { AGENT_TOOLS_META } from "../src/dispatch/agent-tools/index.js";

test("v1.3.67 P0 — sendGroupMassMsgText 工具注册", () => {
  assert.ok(AGENT_TOOLS_META.sendGroupMassMsgText, "sendGroupMassMsgText 应存在");
  const [desc, schema, fn] = AGENT_TOOLS_META.sendGroupMassMsgText;
  assert.match(desc, /群发/);
  assert.equal(typeof fn, "function");
  // schema 有 toIds/content (typebox 字段在 properties)
  const props = schema.properties ?? schema;
  assert.ok(props.toIds, "schema 应有 toIds");
  assert.ok(props.content, "schema 应有 content");
});

test("v1.3.67 P0 — sendFileV2 工具注册", () => {
  assert.ok(AGENT_TOOLS_META.sendFileV2, "sendFileV2 应存在");
  const [, schema, fn] = AGENT_TOOLS_META.sendFileV2;
  assert.equal(typeof fn, "function");
  const props = schema.properties ?? schema;
  assert.ok(props.toWxid && props.fileName && props.base64, "schema 应含 toWxid/fileName/base64");
});

test("v1.3.67 P0 — friendcircle 新工具注册 (getCollectCircle/sendFavItemCircle/sendOneIdCircle/setFriendCircleDays)", () => {
  for (const name of ["getCollectCircle", "sendFavItemCircle", "sendOneIdCircle", "setFriendCircleDays"]) {
    assert.ok(AGENT_TOOLS_META[name], `${name} 应存在`);
    assert.equal(AGENT_TOOLS_META[name].length, 3, `${name} 3 段`);
  }
  // setFriendCircleDays range 枚举
  const rangeSchema = (AGENT_TOOLS_META.setFriendCircleDays[1].properties ?? AGENT_TOOLS_META.setFriendCircleDays[1]).range;
  assert.ok(rangeSchema, "setFriendCircleDays 应有 range");
});

test("v1.3.67 P0 — getGHList 工具注册 (通讯录完整拉取)", () => {
  assert.ok(AGENT_TOOLS_META.getGHList, "getGHList 应存在");
  assert.equal(typeof AGENT_TOOLS_META.getGHList[2], "function", "getGHList fn 是函数");
});

test("v1.3.67 P0 — user 好友权限工具注册 (friendVerification/addMeMethods)", () => {
  for (const name of ["friendVerification", "addMeMethods"]) {
    assert.ok(AGENT_TOOLS_META[name], `${name} 应存在`);
    assert.equal(typeof AGENT_TOOLS_META[name][2], "function");
  }
});

test("v1.3.67 P0 — 新工具已进 AGENT_TOOLS 集合", async () => {
  const { AGENT_TOOLS } = await import("../src/dispatch/agent-tools/index.js");
  const names = AGENT_TOOLS.map((t) => t.name);
  for (const name of [
    "sendGroupMassMsgText", "sendFileV2",
    "getCollectCircle", "sendFavItemCircle", "sendOneIdCircle", "setFriendCircleDays",
    "getGHList", "friendVerification", "addMeMethods",
  ]) {
    assert.ok(names.includes(name), `${name} 应在 AGENT_TOOLS 里`);
  }
});
