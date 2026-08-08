// tests/agent-tools.test.ts - Phase F AGENT_TOOLS 测试

import { test } from "node:test";
import assert from "node:assert/strict";

import { AGENT_TOOLS, AGENT_TOOLS_META } from "../src/dispatch/agent-tools/index.js";
import { buildAgentTools } from "../src/dispatch/agent-tools/factory.js";
import type { ToolEntry, ToolMeta } from "../src/dispatch/agent-tools/_shared.js";

test("AGENT_TOOLS_META — 总数 ≥ 80 工具 (高价值子集)", () => {
  const total = Object.keys(AGENT_TOOLS_META).length;
  assert.ok(total >= 80, `expected ≥80 tools, got ${total}`);
  console.log(`AGENT_TOOLS_META tools: ${total}`);
});

test("AGENT_TOOLS — buildAgentTools 转换数量 = meta 数量", () => {
  assert.equal(AGENT_TOOLS.length, Object.keys(AGENT_TOOLS_META).length);
});

test("每个 ToolEntry 三段 [description, schema, fn] 都有", () => {
  for (const [name, entry] of Object.entries(AGENT_TOOLS_META)) {
    assert.ok(Array.isArray(entry), `${name} entry 不是 array`);
    assert.equal(entry.length, 3, `${name} 应该 3 段`);
    const [desc, schema, fn] = entry;
    assert.equal(typeof desc, "string");
    assert.ok(typeof schema === "object" && schema !== null);
    assert.equal(typeof fn, "function");
  }
});

test("ChannelAgentTool — 必有 name/description/label/parameters/execute", () => {
  for (const tool of AGENT_TOOLS) {
    assert.equal(typeof tool.name, "string");
    assert.equal(typeof tool.description, "string");
    assert.equal(typeof tool.label, "string");
    assert.equal(typeof tool.parameters, "object");
    assert.equal(typeof tool.execute, "function");
  }
});

test("domain 命名空间 — 至少 14 个 tag (sendText, scanGetQR, sendFriendRequest 等)", () => {
  const names = Object.keys(AGENT_TOOLS_META);
  const expected = [
    "sendText",
    "scanGetQR",
    "sendFriendRequest",
    "publishFriendCircle",
    "setChatRoomAnnouncement",
    "revokeMsg",
    "getMyProfile",
  ];
  for (const e of expected) {
    assert.ok(names.includes(e), `missing expected tool: ${e}`);
  }
});

test("buildAgentTools 自定义小 meta — 独立工作", () => {
  const tinyMeta: ToolMeta = {
    add: [
      "a + b",
      {
        type: "object",
        properties: { a: { type: "number" }, b: { type: "number" } },
        required: ["a", "b"],
      } as ToolEntry[1],
      async (a: number, b: number) => a + b,
    ],
  };
  const tools = buildAgentTools(tinyMeta);
  assert.equal(tools.length, 1);
  assert.equal(tools[0]?.name, "add");
});

test("AGENT_TOOLS.execute — 错误捕获后返 Error: text", async () => {
  const tinyMeta: ToolMeta = {
    fail: [
      "will throw",
      { type: "object", properties: {} } as ToolEntry[1],
      () => {
        throw new Error("boom");
      },
    ],
  };
  const tools = buildAgentTools(tinyMeta);
  const r = await tools[0]!.execute("call-1", {});
  assert.ok(r.content[0]?.text?.includes("Error"));
  assert.ok(r.content[0]?.text?.includes("boom"));
});

test("AGENT_TOOLS.execute — 成功返 JSON 结果", async () => {
  const tinyMeta: ToolMeta = {
    greet: [
      "greet",
      {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      } as ToolEntry[1],
      async (name: string) => ({ greeting: `hi ${name}` }),
    ],
  };
  const tools = buildAgentTools(tinyMeta);
  const r = await tools[0]!.execute("call-2", { name: "world" });
  assert.equal(r.content[0]?.type, "text");
  assert.ok(r.content[0]?.text?.includes("hi world"));
});

test("AGENT_TOOLS.execute — ordered args 顺序按 schema.properties", async () => {
  // a,b,c 顺序 schema, fn(a,b,c), 调时给 b,a,c → 测试 fn 收到 b,a,c 位置还是 schema order
  const tinyMeta: ToolMeta = {
    orderTest: [
      "ordered args test",
      {
        type: "object",
        properties: { a: { type: "string" }, b: { type: "string" }, c: { type: "string" } },
        required: ["a", "b", "c"],
      } as ToolEntry[1],
      async (a: string, b: string, c: string) => `got:${a}/${b}/${c}`,
    ],
  };
  const tools = buildAgentTools(tinyMeta);
  // params 故意用不 sorted 顺序
  const r = await tools[0]!.execute("call-3", { c: "third", a: "first", b: "second" });
  assert.equal(r.content[0]?.text, "got:first/second/third");
});
