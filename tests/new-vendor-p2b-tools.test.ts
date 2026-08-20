// tests/new-vendor-p2b-tools.test.ts - v1.3.67 新 vendor 第二批工具测试
// 验证: Login 6 + Search/AI 2 + 零散 3 (ActiveTasks/Label/SayHello Modelv3)

import { test } from "node:test";
import assert from "node:assert/strict";

import { AGENT_TOOLS_META } from "../src/dispatch/agent-tools/index.js";

test("v1.3.67 P2B — Login 增强工具注册 (6)", () => {
  for (const name of [
    "loginGetStatus", "loginSubmitVerificationCode",
    "loginGetQRPadCloud", "loginGetQRPadPPMT",
    "login62dataQRCodeVerify", "loginCheckCanSetAlias",
  ]) {
    assert.ok(AGENT_TOOLS_META[name], `${name} 应存在`);
    assert.equal(AGENT_TOOLS_META[name].length, 3, `${name} 3 段`);
  }
});

test("v1.3.67 P2B — Search/AI 对话工具注册 (aiConversation/aiFollowUp)", () => {
  for (const name of ["aiConversation", "aiFollowUp"]) {
    assert.ok(AGENT_TOOLS_META[name], `${name} 应存在`);
    assert.equal(typeof AGENT_TOOLS_META[name][2], "function");
  }
});

test("v1.3.67 P2B — 零散工具注册 (activeTasks/getWXFriendListByLabel/sayHelloModelv3)", () => {
  for (const name of ["activeTasks", "getWXFriendListByLabel", "sayHelloModelv3"]) {
    assert.ok(AGENT_TOOLS_META[name], `${name} 应存在`);
    assert.equal(AGENT_TOOLS_META[name].length, 3, `${name} 3 段`);
  }
});

test("v1.3.67 P2B — getWXFriendListByLabel labelId 是 Number", () => {
  const schema = AGENT_TOOLS_META.getWXFriendListByLabel[1];
  const props = schema.properties ?? schema;
  assert.ok(props.labelId, "应有 labelId");
});

test("v1.3.67 P2B — 新工具已进 AGENT_TOOLS 集合", async () => {
  const { AGENT_TOOLS } = await import("../src/dispatch/agent-tools/index.js");
  const names = AGENT_TOOLS.map((t) => t.name);
  for (const name of [
    "loginGetStatus", "loginSubmitVerificationCode", "loginGetQRPadCloud", "loginGetQRPadPPMT",
    "login62dataQRCodeVerify", "loginCheckCanSetAlias",
    "aiConversation", "aiFollowUp", "activeTasks", "getWXFriendListByLabel", "sayHelloModelv3",
  ]) {
    assert.ok(names.includes(name), `${name} 应在 AGENT_TOOLS 里`);
  }
});
