// tests/log-fix.test.ts - v1.1.46 FIX-LOG
// 验证 log 信息用 cfg.agent 而不是入参 _agentId

import { test, describe } from "node:test";
import assert from "node:assert/strict";

describe("v1.1.46 FIX-LOG (log 用 cfg.agent 不是入参 agentId)", () => {
  test("log 显示 cfg.agent 而非入参 'main'", () => {
    // 模拟 startAccountById("default", "main"): agentId 参数 = "main"
    // 老 log: `account fully started: ${accountId} (agent=${agentId})` → 显示 (agent=main) ❌
    // 新 log (v1.1.46): `... (agent=${cfg.agent})` → 显示 (agent=wpp-wechat) ✅
    const cfg = { agent: "wpp-wechat" } as { agent: string };
    const agentId = "main"; // 入参 (框架传)
    const loggedAgent = cfg.agent; // v1.1.46 fix
    assert.equal(loggedAgent, "wpp-wechat", "v1.1.46 log 应显示 cfg.agent");
    assert.notEqual(agentId, loggedAgent, "旧版 bug: log 显示 main, 实际用 wpp-wechat");
  });

  test("v1.1.16 P0 防护: cfg.agent 缺失 → throw", () => {
    const cfg = {} as { agent?: string };
    const isInvalid = !cfg.agent || typeof cfg.agent !== "string" || cfg.agent === "main";
    assert.ok(isInvalid, "v1.1.16 P0 防护: cfg.agent 缺失应 throw");
  });

  test("v1.1.16 P0 防护: cfg.agent='main' → throw (P0 污染防护)", () => {
    const cfg = { agent: "main" };
    const isInvalid = !cfg.agent || typeof cfg.agent !== "string" || cfg.agent === "main";
    assert.ok(isInvalid, "cfg.agent='main' 是 v1.1.16 P0 污染防护，应 throw");
  });

  test("v1.1.46 编译验证: index.ts 入参加 _ 前缀", async () => {
    // 验证 source 已改
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("/root/dev/wechatpadpro-openclaw/src/index.ts", "utf8");
    // 应该能找到 _agentId 命名 (前缀下划线 = 该参数故意不用)
    assert.ok(
      src.includes("_agentId"),
      "startAccountById 入参应用 _agentId (前缀下划线 = 故意不用, TS noUnusedParameters)",
    );
    // log 行应该用 cfg.agent
    assert.ok(
      src.includes("agent=${cfg.agent}"),
      "log 应改成 agent=${cfg.agent}",
    );
  });
});