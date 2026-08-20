// tests/new-vendor-p2-tools.test.ts - v1.3.67 新 vendor P2 高价值 API 工具测试
// 验证: 视频播放(4) + 群发卡片(1) + 红包(2) + 小程序OAuth(3) 新增工具注册

import { test } from "node:test";
import assert from "node:assert/strict";

import { AGENT_TOOLS_META } from "../src/dispatch/agent-tools/index.js";

test("v1.3.67 P2 — 视频播放控制工具注册 (playVideo/playVideoStop/playVideoStatus/playVideoTasks)", () => {
  for (const name of ["playVideo", "playVideoStop", "playVideoStatus", "playVideoTasks"]) {
    assert.ok(AGENT_TOOLS_META[name], `${name} 应存在`);
    assert.equal(AGENT_TOOLS_META[name].length, 3, `${name} 3 段`);
  }
});

test("v1.3.67 P2 — sendAppMessage 工具注册 (结构化卡片)", () => {
  assert.ok(AGENT_TOOLS_META.sendAppMessage, "sendAppMessage 应存在");
  const [desc, schema, fn] = AGENT_TOOLS_META.sendAppMessage;
  assert.match(desc, /卡片/);
  assert.equal(typeof fn, "function");
  const props = schema.properties ?? schema;
  assert.ok(props.items, "schema 应有 items");
});

test("v1.3.67 P2 — 红包工具注册 (openHongBaoWithParams/receiveWxhbWithoutEncryption)", () => {
  for (const name of ["openHongBaoWithParams", "receiveWxhbWithoutEncryption"]) {
    assert.ok(AGENT_TOOLS_META[name], `${name} 应存在`);
    assert.equal(typeof AGENT_TOOLS_META[name][2], "function");
  }
});

test("v1.3.67 P2 — 小程序 OAuth 工具注册 (deleteOauthApp/getOauthList/jsLoginCustomized)", () => {
  for (const name of ["deleteOauthApp", "getOauthList", "jsLoginCustomized"]) {
    assert.ok(AGENT_TOOLS_META[name], `${name} 应存在`);
    assert.equal(typeof AGENT_TOOLS_META[name][2], "function");
  }
});

test("v1.3.67 P2 — 新工具已进 AGENT_TOOLS 集合", async () => {
  const { AGENT_TOOLS } = await import("../src/dispatch/agent-tools/index.js");
  const names = AGENT_TOOLS.map((t) => t.name);
  for (const name of [
    "playVideo", "playVideoStop", "playVideoStatus", "playVideoTasks",
    "sendAppMessage", "openHongBaoWithParams", "receiveWxhbWithoutEncryption",
    "deleteOauthApp", "getOauthList", "jsLoginCustomized",
  ]) {
    assert.ok(names.includes(name), `${name} 应在 AGENT_TOOLS 里`);
  }
});
