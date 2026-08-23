// tests/filehelper-commands.test.ts - v1.3.40 FILEHELPER 命令注册表 (自动兼容)
import { test } from "node:test";
import assert from "node:assert/strict";
import { FILEHELPER_COMMANDS, buildHelpText } from "../src/index.js";

test("命令注册表有 9 个命令", () => {
  assert.equal(FILEHELPER_COMMANDS.length, 9);
  const names = FILEHELPER_COMMANDS.map((c) => c.name);
  assert.ok(names.includes("/genpair"));
  assert.ok(names.includes("/pairs"));
  assert.ok(names.includes("/user"), "v1.3.80 应有 /user 私聊白名单");
  assert.ok(names.includes("/group"), "v1.3.80 应有 /group 群白名单");
  assert.ok(names.includes("/blacklist"), "v1.3.80 应有 /blacklist 黑名单");
  assert.ok(names.includes("/xiaowei"), "v1.3.71 应有 /xiaowei 开关命令");
  assert.ok(names.includes("/heartflow"), "v1.3.79 应有 /heartflow 心流开关");
  assert.ok(names.includes("/affection"), "v1.3.79 应有 /affection 好感度开关");
  assert.ok(names.includes("/jargon"), "v1.3.79 应有 /jargon 黑话开关");
  assert.ok(!names.includes("/adduser"), "旧命令 /adduser 已移除");
  assert.ok(!names.includes("/delgroup"), "旧命令 /delgroup 已移除");
});

test("/help 自动遍历注册表 (新增命令无需改 help)", () => {
  const help = buildHelpText();
  // 每个注册命令都出现在 help 里 (自动兼容)
  for (const c of FILEHELPER_COMMANDS) {
    assert.ok(help.includes(c.name), `/help 应含 ${c.name} (自动生成)`);
  }
  // 含示例 (通用占位, 不泄露真实群 ID)
  assert.ok(help.includes("/user add wxid_abc123 wxid_xyz"), "help 应含 user 示例");
  assert.ok(help.includes("/group add xxxxxxxx@chatroom"), "help 应含 group 示例");
});

test("命令名称唯一 (防重复注册)", () => {
  const names = FILEHELPER_COMMANDS.map((c) => c.name.toLowerCase());
  assert.equal(new Set(names).size, names.length, "命令名应唯一");
});
