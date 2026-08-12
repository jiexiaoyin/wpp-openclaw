// tests/commands.test.ts - v1.1.39 SUNNOY-COMMANDS
// 借鉴 sunnoy/wecom commands.js checkCommandAllowlist 范式

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { checkCommandAllowlist } from "../src/inbound/commands.js";

describe("checkCommandAllowlist (v1.1.39 SUNNOY-COMMANDS)", () => {
  test("非命令 (不以 / 开头) → isCommand=false", () => {
    const r = checkCommandAllowlist("hello bot", { allowlist: ["reset"] });
    assert.equal(r.isCommand, false);
  });

  test("/reset 在白名单 → allowed", () => {
    const r = checkCommandAllowlist("/reset", { allowlist: ["reset"] });
    assert.equal(r.isCommand, true);
    if (r.isCommand && r.allowed) {
      assert.equal(r.name, "reset");
      assert.equal(r.args, "");
    } else {
      assert.fail("should be allowed");
    }
  });

  test("/reset --all 解析 args", () => {
    const r = checkCommandAllowlist("/reset --all", { allowlist: ["reset"] });
    if (r.isCommand && r.allowed) {
      assert.equal(r.name, "reset");
      assert.equal(r.args, "--all");
    } else {
      assert.fail("should be allowed");
    }
  });

  test("/foo 不在白名单 → 不允许 + blockMessage", () => {
    const r = checkCommandAllowlist("/foo", {
      allowlist: ["reset"],
      blockMessage: "测试 block message",
    });
    assert.equal(r.isCommand, true);
    if (r.isCommand && !r.allowed) {
      assert.equal(r.name, "foo");
      assert.match(r.reason, /not in allowlist/);
      assert.equal(r.blockMessage, "测试 block message");
    } else {
      assert.fail("should be blocked");
    }
  });

  test("allowlist 空数组 = 禁用命令机制 (所有命令都不允许)", () => {
    const r = checkCommandAllowlist("/reset", { allowlist: [] });
    assert.equal(r.isCommand, true);
    if (r.isCommand) {
      assert.equal(r.allowed, false);
    }
  });

  test("默认 blockMessage", () => {
    const r = checkCommandAllowlist("/foo", { allowlist: ["reset"] });
    if (r.isCommand && !r.allowed) {
      assert.match(r.blockMessage, /未授权/);
    } else {
      assert.fail("should be blocked");
    }
  });

  test("自定义 prefix (e.g. !)", () => {
    const r = checkCommandAllowlist("!reset", {
      allowlist: ["reset"],
      prefix: "!",
    });
    assert.equal(r.isCommand, true);
    if (r.isCommand && r.allowed) {
      assert.equal(r.name, "reset");
    }
  });

  test("空命令名 (/ 单独) → 不允许 + 友好提示", () => {
    const r = checkCommandAllowlist("/", { allowlist: ["reset"] });
    assert.equal(r.isCommand, true);
    if (r.isCommand && !r.allowed) {
      assert.match(r.reason, /empty/);
    }
  });

  test("前后空格不敏感 (trimStart)", () => {
    const r = checkCommandAllowlist("   /reset", { allowlist: ["reset"] });
    assert.equal(r.isCommand, true);
    if (r.isCommand && r.allowed) {
      assert.equal(r.name, "reset");
    }
  });

  test("/status /help 等多个命令都通过", () => {
    for (const cmd of ["status", "help", "ping", "reset"]) {
      const r = checkCommandAllowlist(`/${cmd}`, {
        allowlist: ["status", "help", "ping", "reset"],
      });
      assert.equal(r.isCommand, true);
      if (r.isCommand) assert.equal(r.allowed, true, `/${cmd} should be allowed`);
    }
  });

  test("多空格分隔 args", () => {
    const r = checkCommandAllowlist("/search  hello world  ", {
      allowlist: ["search"],
    });
    if (r.isCommand && r.allowed) {
      assert.equal(r.name, "search");
      assert.equal(r.args, "hello world");
    } else {
      assert.fail("should be allowed");
    }
  });
});
