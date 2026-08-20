// tests/xiaowei-predevel.test.ts - v1.3.69/71 小微预开发 (默认关闭, 命令开关)
// 验证: ① send 层工厂方法齐全 ② 工具在 AGENT_TOOLS 但默认 xiaoweiEnabled=false 抛错 ③ 端点已注册

import { test } from "node:test";
import assert from "node:assert/strict";

import { makeWppXiaoWei } from "../src/send/xiaowei.js";
import { AGENT_TOOLS_META } from "../src/dispatch/agent-tools/index.js";
import { WPP_VENDOR_ENDPOINTS } from "../src/send/index.js";
import { FILEHELPER_COMMANDS, buildHelpText } from "../src/index.js";

test("v1.3.69 小微预开发 — makeWppXiaoWei 工厂方法齐全 (20)", () => {
  const api = makeWppXiaoWei({
    baseUrl: "http://127.0.0.1:18062",
    tokenKey: "test-token",
    authcode: "test-authcode",
    accountId: "default",
  });
  const methods = [
    "createSession", "getSession", "sendMessage", "cancel", "regenerate", "switchRoom", "events",
    "historyList", "historyFill", "historyDelete",
    "invite", "inviteCandidates", "inviteInfo",
    "redDotsQuery", "redDotsRead",
    "cardUsers", "cardScreenshotCheck",
    "permission", "a2aList", "suggestions",
  ];
  for (const m of methods) {
    assert.equal(typeof api[m], "function", `makeWppXiaoWei.${m} 应是函数`);
  }
});

test("v1.3.71 小微开关 — 工具在 AGENT_TOOLS_META (20 个)", () => {
  const xw = Object.keys(AGENT_TOOLS_META).filter((k) => k.toLowerCase().startsWith("xiaowei"));
  assert.equal(xw.length, 20, `应有 20 个 xiaoWei 工具 (实际 ${xw.length})`);
  // 每个工具 schema 存在 + fn 是函数
  for (const k of xw) {
    assert.equal(AGENT_TOOLS_META[k].length, 3, `${k} 3 段`);
    assert.equal(typeof AGENT_TOOLS_META[k][2], "function", `${k} fn`);
  }
});

test("v1.3.69 小微预开发 — WPP_VENDOR_ENDPOINTS 已注册 20 个 XiaoWei 端点", () => {
  const xw = WPP_VENDOR_ENDPOINTS.xiaoWei;
  assert.ok(xw && xw.length === 20, `xiaoWei 端点应 20 个 (实际 ${xw?.length})`);
  // 抽查核心端点
  assert.ok(xw.includes("/XiaoWei/Chat/Sessions"), "应有 Chat/Sessions");
  assert.ok(xw.includes("/XiaoWei/Chat/Sessions/{session_id}/Messages"), "应有 Messages");
  assert.ok(xw.includes("/XiaoWei/Chat/Sessions/{session_id}/Events"), "应有 Events (SSE)");
  assert.ok(xw.includes("/XiaoWei/Permission"), "应有 Permission");
});

test("v1.3.71 小微开关 — /xiaowei 命令在 FILEHELPER_COMMANDS + /help 列出", () => {
  // 命令注册
  const cmd = FILEHELPER_COMMANDS.find((c) => c.name === "/xiaowei");
  assert.ok(cmd, "/xiaowei 命令应存在");
  assert.match(cmd.desc, /小微/);
  assert.match(cmd.example, /\/xiaowei on/);
  // /help 自动列出
  const help = buildHelpText();
  assert.match(help, /\/xiaowei/, "/help 应列出 /xiaowei");
  // 不应有 /friendcircle (朋友圈用白名单机制, 老板拍板不加开关)
  const fc = FILEHELPER_COMMANDS.find((c) => c.name === "/friendcircle");
  assert.ok(!fc, "不应有 /friendcircle 命令 (朋友圈用白名单)");
});
