// tests/filehelper-commands.test.ts - v1.3.40 FILEHELPER 命令注册表 (自动兼容)
import { test } from "node:test";
import assert from "node:assert/strict";
import { FILEHELPER_COMMANDS, buildHelpText } from "../src/index.js";

test("命令注册表有 7 个命令", () => {
  assert.equal(FILEHELPER_COMMANDS.length, 7);
  const names = FILEHELPER_COMMANDS.map((c) => c.name);
  assert.ok(names.includes("/genpair"));
  assert.ok(names.includes("/pairs"));
  assert.ok(names.includes("/adduser"));
  assert.ok(names.includes("/deluser"));
  assert.ok(names.includes("/addgroup"));
  assert.ok(names.includes("/delgroup"));
  assert.ok(names.includes("/xiaowei"), "v1.3.71 应有 /xiaowei 开关命令");
});

test("/help 自动遍历注册表 (新增命令无需改 help)", () => {
  const help = buildHelpText();
  // 每个注册命令都出现在 help 里 (自动兼容)
  for (const c of FILEHELPER_COMMANDS) {
    assert.ok(help.includes(c.name), `/help 应含 ${c.name} (自动生成)`);
  }
  // 含示例 (通用占位, 不泄露真实群 ID)
  assert.ok(help.includes("/adduser wxid_abc123"), "help 应含 adduser 示例");
  assert.ok(help.includes("/addgroup xxxxxxxx@chatroom"), "help 应含 addgroup 示例");
});

test("命令名称唯一 (防重复注册)", () => {
  const names = FILEHELPER_COMMANDS.map((c) => c.name.toLowerCase());
  assert.equal(new Set(names).size, names.length, "命令名应唯一");
});
