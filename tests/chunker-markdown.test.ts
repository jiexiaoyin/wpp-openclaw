// tests/chunker-markdown.test.ts - v1.3.63 P2-CHUNKER-MARKDOWN (2026-08-13 老板反馈)
//
// 背景: 老板实测 WPP 渠道长消息被截断, 调查发现 chunker 注释/代码不一致 + 无 markdown 保护
// 修复: outbound.ts chunkMarkdown 真正按 \n\n 切 + 保护代码块/表格/列表 + 单行硬切
//
// v1.3.63 审阅修复 (2026-08-14): 假绿测试改真测 —
//   * P2-5: 原代码块/表格"跨 chunk 保护"测试输入 <6000 → chunker 直接返回 [text], 保护逻辑零覆盖.
//     改为加长到 >limit 再断言真正切分后保护.
//   * P2-6/P2-7: 原 import { chunkMarkdown } 引用未导出符号 (esbuild 树摇静默吞, 从未调用).
//     现在 chunkMarkdown 已 export, 直接测真函数 + 自定义 limit 精确隔离边界.
//   * 新增 P1-2 巨型代码块硬 cap / P2-1 代码块内空行 / P2-2 emoji 代理对 回归测试.

import { test } from "node:test";
import assert from "node:assert/strict";

// chunker 是 internal, 不导出. 通过 wppChannelPlugin.outbound.chunker 间接测
import { chunker, chunkMarkdown } from "../src/dispatch/outbound.js";


test("v1.3.63 P2-CHUNKER-MARKDOWN — chunker 入口存在", () => {
  assert.equal(typeof chunker, "function", "chunker 必须是 function");
});

test("v1.3.63 P2-CHUNKER-MARKDOWN — 文本 < 6000, 不切", () => {
  const text = "a".repeat(5000);
  const chunks = chunker(text);
  assert.equal(chunks.length, 1, "5000 字符不应切");
  assert.equal(chunks[0], text);
});

test("v1.3.63 P2-CHUNKER-MARKDOWN — 文本 = 6000, 不切", () => {
  const text = "a".repeat(6000);
  const chunks = chunker(text);
  assert.equal(chunks.length, 1, "6000 字符 (恰好等于 limit) 不应切");
});

test("v1.3.63 P2-CHUNKER-MARKDOWN — 文本 > 6000, 切成多片, 每片 ≤ 6000", () => {
  const text = "a".repeat(12000);
  const chunks = chunker(text);
  assert.ok(chunks.length >= 2, "12000 字符应切 >= 2 片");
  for (const c of chunks) {
    assert.ok(c.length <= 6000, `每片必须 ≤ 6000, 实际 ${c.length}`);
  }
  // 合并后内容应跟原文一致 (不丢字符)
  assert.equal(chunks.join(""), text);
});

test("v1.3.63 P2-CHUNKER-MARKDOWN — 真正按段落 (\\n\\n) 切", () => {
  // 段落 1 (50 字符) + 空行 + 段落 2 (50 字符) + 空行 + 段落 3 (50 字符)
  const para1 = "a".repeat(50);
  const para2 = "b".repeat(50);
  const para3 = "c".repeat(50);
  const text = `${para1}\n\n${para2}\n\n${para3}`;
  const chunks = chunker(text);
  // 当前 limit=6000, 总长 154 字符, 直接 1 片
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0], text);
});

test("v1.3.63 P2-CHUNKER-MARKDOWN — 多段落超过 limit, 仍按段落切", () => {
  const para1 = "a".repeat(2000);
  const para2 = "b".repeat(2000);
  const para3 = "c".repeat(2000);
  const para4 = "d".repeat(2000);
  // 总: 8000 + 3*2 = 8006, 切成 2 片
  const text = `${para1}\n\n${para2}\n\n${para3}\n\n${para4}`;
  const chunks = chunker(text);
  assert.ok(chunks.length >= 2, `8000+ 字符应切 >= 2 片, 实际 ${chunks.length}`);
  for (const c of chunks) {
    assert.ok(c.length <= 6000, `每片必须 ≤ 6000, 实际 ${c.length}`);
  }
  // 段落分隔 \\n\\n 应保留
  const rejoin = chunks.join("\n\n");
  assert.ok(rejoin.includes(para1));
  assert.ok(rejoin.includes(para4));
});

test("v1.3.63 P2-CHUNKER-MARKDOWN — 单行超 limit, 硬切字符", () => {
  // 一行 8000 字符 (no \\n), 超过 limit 6000
  const text = "x".repeat(8000);
  const chunks = chunker(text);
  assert.ok(chunks.length >= 2, `8000 字符单行应切 >= 2 片, 实际 ${chunks.length}`);
  for (const c of chunks) {
    assert.ok(c.length <= 6000, `每片必须 ≤ 6000, 实际 ${c.length}`);
  }
  assert.equal(chunks.join(""), text);
});

test("v1.3.63 P2-CHUNKER — P2-5 真测: 巨型代码块跨 chunk 保护 (<limit 不触发, 需 >6000)", () => {
  // 关键: 代码块内容 >6000 才真正触发 chunkLongParagraph 的代码块保护分支 (原测试 <6000 是平凡真)
  // 代码块 40KB (< 12000 硬 cap): 会切成多片, 但围栏标记不拆断 — 开围栏 chunk 以 ```js 开头,
  // 闭合围栏在最后一个代码 chunk 内完整保留
  const codeLines = Array.from({ length: 400 }, (_, i) => `  const v${i} = ${i};`).join("\n");
  assert.ok(codeLines.length > 6000, `测试前置: 代码块内容须 >6000, 实际 ${codeLines.length}`);
  const codeBlock = `\`\`\`js\n${codeLines}\n\`\`\``;
  assert.ok(codeBlock.length < 6000 * 2, `前置: 代码块须 < 硬 cap 才测'不拆断', 实际 ${codeBlock.length}`);
  const text = `前面的话\n\n${codeBlock}\n\n后面的话`;

  const chunks = chunkMarkdown(text, 6000);
  const FENCE = "```";
  // 开头围栏 ```js 必须完整 (不被从中间拆)
  const opening = chunks.find(c => c.includes(FENCE + "js"));
  assert.ok(opening, "开围栏 ```js 应存在");
  assert.ok(opening.includes(FENCE + "js"), "开围栏标记完整");
  // 闭合围栏 ``` 必须完整在某 chunk 结尾
  const closing = chunks.find(c => c.trimEnd().endsWith(FENCE) || c.includes(FENCE + "\n"));
  assert.ok(closing, "闭合围栏应存在且完整");
});

test("v1.3.63 P2-CHUNKER — P1-2 硬 cap: 巨型代码块超 cap 强制切, 单 chunk ≤ limit*2", () => {
  // 2000 行闭合代码块 (~60KB), 必须强制切分, 不产出 ~60KB 单 chunk
  const codeLines = Array.from({ length: 2000 }, (_, i) => `line ${i} ${"x".repeat(10)}`).join("\n");
  const codeBlock = `\`\`\`js\n${codeLines}\n\`\`\``;
  assert.ok(codeBlock.length > 6000 * 2, `前置: 须超硬 cap, 实际 ${codeBlock.length}`);
  const chunks = chunkMarkdown(codeBlock, 6000);
  assert.ok(chunks.length >= 2, "超硬 cap 必须切分 >= 2 片");
  for (const c of chunks) {
    assert.ok(c.length <= 6000 * 2, `单 chunk 不得超硬 cap (12000), 实际 ${c.length}`);
  }
  // 内容不丢 (去围栏后 rejoin 应含所有行)
  const rejoin = chunks.join("");
  assert.ok(rejoin.includes("line 0"));
  assert.ok(rejoin.includes("line 1999"));
});

test("v1.3.63 P2-CHUNKER — P1-2 硬 cap: 不闭合围栏 (奇数 ```) 也封顶", () => {
  const unclosed = "```\n" + Array.from({ length: 2000 }, (_, i) => `x${i}`).join("\n");
  const chunks = chunkMarkdown(unclosed, 6000);
  for (const c of chunks) {
    assert.ok(c.length <= 6000 * 2, `不闭合围栏也必须封顶, 实际 ${c.length}`);
  }
});

test("v1.3.63 P2-CHUNKER — P2-1 代码块内含空行, 围栏不被拆断", () => {
  // 关键: 空行在代码块内, 段级切分 (split \n\n) 必须跳过, 否则围栏被拆到不同 chunk
  const text = "开头\n\n```js\ncode1\ncode2\n\ncode3\n```\n结尾";
  const chunks = chunkMarkdown(text, 6000);
  // 围栏必须完整 (```js 与 ``` 在同一 chunk)
  const full = chunks.filter(c => c.includes("```js") && c.includes("```\n"));
  assert.ok(full.length >= 1, `代码块应整体在一 chunk, 实际 chunks=${chunks.length}`);
});

test("v1.3.63 P2-CHUNKER — P2-2 硬切不切断 emoji 代理对", () => {
  // 单行超 limit 硬切时, emoji (UTF-16 代理对) 不得被切断成孤立项
  const emojiLine = "😀".repeat(6001);
  const chunks = chunkMarkdown(emojiLine, 6000);
  assert.ok(chunks.length >= 2, "6001 emoji 应切分");
  for (const c of chunks) {
    assert.equal(c.replace(/😀/g, ""), "", `不得出现孤立的代理对碎片: "${c.slice(0, 10)}"`);
    assert.ok(c.length <= 6000, `每片 ≤ 6000, 实际 ${c.length}`);
  }
  // 内容完整合并回原文
  assert.equal(chunks.join(""), emojiLine);
});

test("v1.3.63 P2-CHUNKER-MARKDOWN — 表格行不切断", () => {
  // 关键: 表格超 6000 才触发切分 + 行完整性保护 (原测试 <6000 是平凡真)
  const header = "| 列1 | 列2 | 列3 |";
  const sep = "|--- |--- |--- |";
  const rows = Array.from({ length: 300 }, (_, i) => `| 行${i}A | 行${i}B | 行${i}C | ${"p".repeat(20)} |`).join("\n");
  const table = `${header}\n${sep}\n${rows}`;
  assert.ok(table.length > 6000, `前置: 表格须 >6000, 实际 ${table.length}`);
  const text = `前面\n\n${table}\n\n后面`;

  const chunks = chunkMarkdown(text, 6000);
  const rejoin = chunks.join("");
  // 每行完整保留 (以 | 开头 | 结尾)
  for (const row of rows.split("\n").filter(r => r.includes("行300"))) {
    assert.ok(rejoin.includes(row), "表格行应完整保留");
  }
});

test("v1.3.63 P2-CHUNKER-MARKDOWN — 列表项保持完整", () => {
  const items = Array.from({ length: 20 }, (_, i) => `- 项目 ${i}: 一些描述文字`).join("\n");
  const text = `标题\n\n${items}\n\n结尾`;

  const chunks = chunker(text);
  const rejoined = chunks.join("\n\n");
  // 至少前 5 个列表项应存在
  for (let i = 0; i < 5; i++) {
    assert.ok(rejoined.includes(`- 项目 ${i}:`), `- 项目 ${i}: 应在结果中`);
  }
});

test("v1.3.63 P2-CHUNKER-MARKDOWN — 实际场景: cron 推送的长消息", () => {
  // 模拟 AI 回复 8000 字符, 包含表格 + 列表 + 代码块
  const codeBlock = `\`\`\`ts\nconst x = 1;\n\`\`\``;
  const table = `| 门店 | 销售额 | 毛利 |\n|--- |--- |--- |\n| 1号店 | 10000 | 1500 |\n| 2号店 | 8000 | 1200 |`;
  const list = Array.from({ length: 30 }, (_, i) => `- 建议 ${i}`).join("\n");
  const filler = "感谢您的关注。".repeat(1000); // ~8000 字符
  const text = `${filler}\n\n${table}\n\n${codeBlock}\n\n${list}`;

  const chunks = chunker(text);
  for (const c of chunks) {
    assert.ok(c.length <= 6000, `每片必须 ≤ 6000, 实际 ${c.length}`);
  }
  // 合并后内容应包含所有元素
  const rejoin = chunks.join("\n\n");
  assert.ok(rejoin.includes("| 门店 |"), "表格应保留");
  assert.ok(rejoin.includes("```ts"), "代码块应保留");
  assert.ok(rejoin.includes("- 建议 0"), "列表项应保留");
  assert.ok(rejoin.includes("感谢您的关注"), "正文应保留");
});
