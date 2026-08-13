// tests/agent-tools-mcp.test.ts - v1.3.58 MCP-READONLY
// vendor MCP 只读工具整合给 AI: 工具注册 + 失败降级 (不依赖真 MCP, 用 mock)
// 注意: 真 MCP 调通在手动验证 (vendor 本地), 单测只测工具形状 + 失败路径

import { test } from "node:test";
import assert from "node:assert/strict";

import { AGENT_TOOLS_META } from "../src/dispatch/agent-tools/index.js";
import { callMcpTool } from "../src/vendor-mcp-client.js";

test("v1.3.58 MCP-READONLY — 7 个 mcp 只读工具已注册", () => {
  const mcpTools = Object.keys(AGENT_TOOLS_META).filter((k) => k.startsWith("mcp"));
  assert.deepEqual(
    mcpTools.sort(),
    [
      "mcpAccountStatus",
      "mcpGetContact",
      "mcpGetGroup",
      "mcpListContacts",
      "mcpListGroups",
      "mcpRecentMessages",
      "mcpSearch",
    ].sort(),
    "应注册 7 个 MCP 只读工具",
  );
});

test("v1.3.58 MCP-READONLY — 工具 execute 失败降级 (MCP 不可用返回提示, 不抛)", async () => {
  // 不 mock, 直接调 execute — 无 WECHATPRO_AUTHCODE env 时 callMcpTool 返回 null → 降级提示
  const meta = AGENT_TOOLS_META.mcpAccountStatus as [
    string,
    unknown,
    (...args: unknown[]) => Promise<unknown>,
  ];
  const fn = meta[2];
  const r = await fn();
  // 无凭证时返回降级提示 (MCP 不可用), 不抛错
  assert.equal(typeof r, "string");
});

test("v1.3.58 MCP-READONLY — callMcpTool 无 env 返回 null (安全降级)", async () => {
  // 确保 WECHATPRO_AUTHCODE 未设时返回 null 不抛
  const saved = process.env.WECHATPRO_AUTHCODE;
  delete process.env.WECHATPRO_AUTHCODE;
  try {
    const r = await callMcpTool("wechat_account_status", {});
    assert.equal(r, null, "无凭证应返回 null 而非抛错");
  } finally {
    if (saved) process.env.WECHATPRO_AUTHCODE = saved;
  }
});
