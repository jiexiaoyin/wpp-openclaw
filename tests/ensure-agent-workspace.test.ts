// tests/ensure-agent-workspace.test.ts - v1.1.42 SETUP-MERGE
// 验证 ensureAgentWorkspace pure function 行为

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureAgentWorkspace } from "../src/setup-wizard.js";

describe("ensureAgentWorkspace (v1.1.42 SETUP-MERGE)", () => {
  let tmpRoot: string;
  let backupDir: string;

  function setupTmp(): void {
    tmpRoot = mkdtempSync(join(tmpdir(), "wpp-agent-test-"));
    backupDir = join(tmpRoot, "backup");
    // 写 minimal openclaw.json
    const cfg = {
      agents: { list: [{ id: "main", workspace: "/tmp/x", agentDir: "/tmp/x/a" }] },
      bindings: [],
    };
    writeFileSync(join(tmpRoot, "openclaw.json"), JSON.stringify(cfg));
  }

  function cleanupTmp(): void {
    if (tmpRoot && existsSync(tmpRoot)) {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  }

  test("minimal 模板: 7 核心文件 + agent/sqlite + openclaw.json 注入", async () => {
    setupTmp();
    try {
      const r = await ensureAgentWorkspace({
        agentId: "test-new",
        cloneFrom: undefined,
        patchOpenclawJson: true,
        openclawRoot: tmpRoot,
        backupDir,
      });
      // workspace 7 文件
      for (const f of ["AGENTS.md", "SOUL.md", "USER.md", "IDENTITY.md", "TOOLS.md", "HEARTBEAT.md", "BOOTSTRAP.md"]) {
        assert.ok(existsSync(join(r.workspaceDir, f)), `${f} 缺失`);
      }
      // agent/sqlite
      assert.ok(existsSync(r.modelsJsonPath), "models.json 缺失");
      assert.ok(existsSync(r.sqlitePath), "sqlite 缺失");
      assert.ok(existsSync(join(r.agentDir, "plugins")), "plugins/ 缺失");
      // sessions
      assert.ok(existsSync(r.sessionsDir), "sessions/ 缺失");
      // openclaw.json 注入
      const cfg = JSON.parse(readFileSync(join(tmpRoot, "openclaw.json"), "utf8"));
      const ids = cfg.agents.list.map((a: { id: string }) => a.id);
      assert.ok(ids.includes("test-new"), "agents.list 未注入");
      assert.ok(cfg.bindings.some((b: { agentId: string }) => b.agentId === "test-new"), "bindings 未注入");
      // 备份
      assert.ok(r.openclawJsonBackedUp, "未生成备份");
      assert.ok(existsSync(r.openclawJsonBackedUp!), "备份文件不存在");
    } finally {
      cleanupTmp();
    }
  });

  test("AGENTS.md 模板含 agentId", async () => {
    setupTmp();
    try {
      const r = await ensureAgentWorkspace({
        agentId: "alice-wpp",
        openclawRoot: tmpRoot,
        backupDir,
      });
      const agents = readFileSync(join(r.workspaceDir, "AGENTS.md"), "utf8");
      assert.ok(agents.includes("alice-wpp"), "AGENTS.md 模板应含 agentId");
      assert.ok(agents.includes("agent:alice-wpp"), "AGENTS.md 模板应含路由标识");
    } finally {
      cleanupTmp();
    }
  });

  test("agentId 格式校验 [a-z0-9-]+", async () => {
    await assert.rejects(
      () => ensureAgentWorkspace({ agentId: "BadID", openclawRoot: "/tmp" }),
      /agentId 不合法/,
    );
    await assert.rejects(
      () => ensureAgentWorkspace({ agentId: "has_underscore", openclawRoot: "/tmp" }),
      /agentId 不合法/,
    );
  });

  test("workspace 冲突报错", async () => {
    setupTmp();
    try {
      // 预创建
      const { mkdirSync } = await import("node:fs");
      mkdirSync(join(tmpRoot, "workspace", "dupe"), { recursive: true });
      await assert.rejects(
        () => ensureAgentWorkspace({ agentId: "dupe", openclawRoot: tmpRoot, backupDir }),
        /workspace 已存在/,
      );
    } finally {
      cleanupTmp();
    }
  });

  test("patchOpenclawJson=false 不动 openclaw.json", async () => {
    setupTmp();
    try {
      const before = readFileSync(join(tmpRoot, "openclaw.json"), "utf8");
      await ensureAgentWorkspace({
        agentId: "no-patch",
        patchOpenclawJson: false,
        openclawRoot: tmpRoot,
        backupDir,
      });
      const after = readFileSync(join(tmpRoot, "openclaw.json"), "utf8");
      assert.equal(before, after, "openclaw.json 不应被修改");
    } finally {
      cleanupTmp();
    }
  });

  test("cloneFrom gewe-wechat: workspace 模板从源拷贝 + models.json 复用", async () => {
    setupTmp();
    try {
      // 模拟源 agent
      const { mkdirSync, writeFileSync: wfs } = await import("node:fs");
      mkdirSync(join(tmpRoot, "workspace", "gewe-wechat"), { recursive: true });
      wfs(
        join(tmpRoot, "workspace", "gewe-wechat", "AGENTS.md"),
        "# AGENTS.md - gewe-wechat CLOEND\n",
      );
      mkdirSync(join(tmpRoot, "agents", "gewe-wechat", "agent"), { recursive: true });
      wfs(join(tmpRoot, "agents", "gewe-wechat", "agent", "models.json"), '{"providers":{"openai":{}}}');

      const r = await ensureAgentWorkspace({
        agentId: "cloned",
        cloneFrom: "gewe-wechat",
        openclawRoot: tmpRoot,
        backupDir,
      });
      const agents = readFileSync(join(r.workspaceDir, "AGENTS.md"), "utf8");
      assert.ok(agents.includes("gewe-wechat CLOEND"), "AGENTS.md 未从源拷贝");
      const models = readFileSync(r.modelsJsonPath, "utf8");
      assert.ok(models.includes("openai"), "models.json 应该是源拷贝");
    } finally {
      cleanupTmp();
    }
  });
});
