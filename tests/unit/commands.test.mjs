// tests/unit/commands.test.mjs — 命令白名单三态判定 (checkCommandAllowlist)
//
// 范式: 消息 → { isCommand:false } | { isCommand:true, allowed:true, name, args }
//                       | { isCommand:true, allowed:false, name, reason, blockMessage }
// 三态缺一不可: 少判 "非命令" 会把普通聊天吞掉; 少判 "allowed:false" 会放行越权命令。
//
// 覆盖重点:
//   - 三态形状逐字段锁死 (deepEqual 锁形状, 防有人偷偷加/删字段)
//   - 空 allowlist = 禁用命令机制 → fail-closed (任何 /xxx 都拒绝), 不是 fail-open
//   - 命令名精确匹配 (大小写敏感), "/RESET" 不命中 ["reset"]
//   - name/args 切分: 多空格、前导空格、空命令名 "/" 的边界
//   - 自定义 prefix 后, 默认 "/" 前缀不再被识别
//   - blockMessage 自定义透传 / 默认中文兜底

import test from "node:test";
import assert from "node:assert/strict";

import { checkCommandAllowlist } from "../../dist/inbound/commands.js";

const DEFAULT_BLOCK = "当前账号未授权此命令，请联系管理员。";

// ── 1. 三态之一: 非命令 ──────────────────────────────────────────

test("非命令: 不以 / 开头 → { isCommand: false } (形状锁死)", () => {
  assert.deepEqual(
    checkCommandAllowlist("hello bot", { allowlist: ["reset"] }),
    { isCommand: false },
    "普通聊天必须整体交回上游, 不得带 name/args 等多余字段",
  );
});

test("非命令: 空串与纯空白 → { isCommand: false }", () => {
  assert.deepEqual(checkCommandAllowlist("", { allowlist: ["reset"] }), { isCommand: false });
  assert.deepEqual(checkCommandAllowlist("   ", { allowlist: ["reset"] }), { isCommand: false });
});

test("非命令: 斜杠出现在句中 (非开头) → 不识别", () => {
  assert.deepEqual(
    checkCommandAllowlist("路径是 a/b", { allowlist: ["reset"] }),
    { isCommand: false },
    "只有 trimStart 后**首字符**是 prefix 才算命令",
  );
});

// ── 2. 三态之二: 命令 + 白名单命中 ───────────────────────────────

test("命中: /reset → name=reset, args 为空串", () => {
  assert.deepEqual(
    checkCommandAllowlist("/reset", { allowlist: ["reset", "status"] }),
    { isCommand: true, allowed: true, name: "reset", args: "" },
    "无参数时 args 必须是空串 (不是 undefined)",
  );
});

test("命中: /reset --all → name=reset, args=--all", () => {
  assert.deepEqual(
    checkCommandAllowlist("/reset --all", { allowlist: ["reset"] }),
    { isCommand: true, allowed: true, name: "reset", args: "--all" },
  );
});

test("命中: 多个参数整体归入 args (不被二次切分)", () => {
  const r = checkCommandAllowlist("/heartflow group add g1@chatroom", { allowlist: ["heartflow"] });
  assert.equal(r.allowed, true);
  assert.equal(r.name, "heartflow");
  assert.equal(r.args, "group add g1@chatroom", "args 是剩余原文, 由调用方自行切词");
});

test("命中: 前导空白不影响识别 (trimStart)", () => {
  assert.deepEqual(
    checkCommandAllowlist("   /reset", { allowlist: ["reset"] }),
    { isCommand: true, allowed: true, name: "reset", args: "" },
    "前导空格是人手输入常态, 必须仍识别为命令",
  );
});

test("命中: 命令名与参数间多个空格 → args 被 trim 干净", () => {
  const r = checkCommandAllowlist("/reset   --all", { allowlist: ["reset"] });
  assert.equal(r.allowed, true);
  assert.equal(r.name, "reset");
  assert.equal(r.args, "--all", "多余空格不得渗进 args");
});

// ── 3. 三态之三: 命令 + 白名单未命中 ─────────────────────────────

test("未命中: 拒绝且 reason 含命令名, blockMessage 为默认中文文案", () => {
  const r = checkCommandAllowlist("/foo", { allowlist: ["reset"] });
  assert.equal(r.isCommand, true);
  assert.equal(r.allowed, false);
  assert.equal(r.name, "foo");
  assert.ok(r.reason.includes("foo"), `reason 应含命令名便于排查, 实际: ${r.reason}`);
  assert.equal(r.reason, 'command "foo" not in allowlist');
  assert.equal(r.blockMessage, DEFAULT_BLOCK, "默认文案须为中文兜底提示");
});

test("未命中: 空 allowlist = 禁用命令机制 → fail-closed", () => {
  const cases = ["/reset", "/status", "/help", "/anything"];
  for (const text of cases) {
    const r = checkCommandAllowlist(text, { allowlist: [] });
    assert.equal(r.isCommand, true, `${text} 仍应被识别为命令`);
    assert.equal(
      r.allowed,
      false,
      `${text}: 空白名单必须是「全部拒绝」, 绝不能因为没配就放行`,
    );
    assert.equal(r.blockMessage, DEFAULT_BLOCK);
  }
});

test("未命中: 大小写精确匹配 —— /RESET 不命中 [\"reset\"]", () => {
  const r = checkCommandAllowlist("/RESET", { allowlist: ["reset"] });
  assert.equal(r.allowed, false, "includes 是精确匹配, 不做大小写归一");
  assert.equal(r.name, "RESET", "name 保留用户原始大小写 (供日志)");
  assert.ok(r.reason.includes("RESET"));
});

test("未命中: 白名单里写大写也只在用户输入同为大写时命中", () => {
  assert.equal(checkCommandAllowlist("/RESET", { allowlist: ["RESET"] }).allowed, true);
  assert.equal(checkCommandAllowlist("/reset", { allowlist: ["RESET"] }).allowed, false);
});

test("未命中: 前缀片段不算命中 (/res 不命中 reset)", () => {
  assert.equal(checkCommandAllowlist("/res", { allowlist: ["reset"] }).allowed, false);
});

// ── 4. 空命令名 ─────────────────────────────────────────────────

test("空命令名: \"/\" → 拒绝, reason=empty command name", () => {
  const r = checkCommandAllowlist("/", { allowlist: ["reset"] });
  assert.equal(r.isCommand, true, "裸前缀仍是命令, 不能当普通消息放给 AI");
  assert.equal(r.allowed, false);
  assert.equal(r.name, "");
  assert.equal(r.reason, "empty command name");
  assert.equal(r.blockMessage, DEFAULT_BLOCK);
});

test("空命令名: \"/   \" (前缀+空格) → 同样拒绝", () => {
  const r = checkCommandAllowlist("/   ", { allowlist: ["reset"] });
  assert.equal(r.allowed, false);
  assert.equal(r.name, "");
  assert.equal(r.reason, "empty command name");
});

// ── 5. 自定义 prefix ────────────────────────────────────────────

test("自定义 prefix \"!\": 只有 ! 开头才识别, /reset 不再是命令", () => {
  assert.deepEqual(
    checkCommandAllowlist("/reset", { allowlist: ["reset"], prefix: "!" }),
    { isCommand: false },
    "换了 prefix 后, 旧前缀应彻底失效 (避免双前缀歧义)",
  );
  assert.deepEqual(
    checkCommandAllowlist("!reset", { allowlist: ["reset"], prefix: "!" }),
    { isCommand: true, allowed: true, name: "reset", args: "" },
  );
});

test("自定义 prefix 多字符: \"@@reset\" + prefix \"@@\"", () => {
  const r = checkCommandAllowlist("@@reset now", { allowlist: ["reset"], prefix: "@@" });
  assert.equal(r.allowed, true);
  assert.equal(r.name, "reset");
  assert.equal(r.args, "now");
});

// ── 6. 自定义 blockMessage 透传 ──────────────────────────────────

test("自定义 blockMessage: 未命中路径原样透传", () => {
  const r = checkCommandAllowlist("/foo", { allowlist: ["reset"], blockMessage: "别乱按。" });
  assert.equal(r.allowed, false);
  assert.equal(r.blockMessage, "别乱按。");
});

test("自定义 blockMessage: 空命令名路径也原样透传", () => {
  const r = checkCommandAllowlist("/", { allowlist: ["reset"], blockMessage: "参数缺失。" });
  assert.equal(r.reason, "empty command name");
  assert.equal(r.blockMessage, "参数缺失。", "两条拒绝路径都必须用同一份自定义文案");
});

// ── 7. 行为记录 (非断言理想行为, 仅锁住现状) ────────────────────

test("[行为记录] 只有 ASCII 空格被当作 name/args 分隔符 (Tab 不分隔)", () => {
  // 代码用 indexOf(" ") 定位分隔, 制表符会整段并进 name → 必然不命中白名单 (fail-closed, 安全方向)
  const r = checkCommandAllowlist("/reset\t--all", { allowlist: ["reset"] });
  assert.equal(r.allowed, false, "Tab 不分隔 → 命令名含 Tab → 不命中");
  assert.equal(r.name, "reset\t--all");
});
