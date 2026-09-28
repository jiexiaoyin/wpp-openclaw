// tests/unit/heartflow-runtime.test.mjs — 心流运行时配置表 (全局唯一实例不变量)
//
// 背景 (src/inbound/heartflow-runtime.ts 文件头原文):
//   「2026-09-27 从 index.ts L107 提取。动机: 拆分 handleFeatureCommand 时, 该 Map 被 index.ts
//     与新模块共用; 若各自复制一份, 状态不同步 (startAccountById 写 A、命令处理器读 B) ——
//     实测导致 7 个测试失败。」
//   提取本身是修 bug, 但提取后**没有任何测试锁住这个不变量** —— 只要有人再写一次
//   `new Map()` 复制品, 同样的 7 个失败会原样复发。本文件就是那把锁。
//
// 覆盖重点:
//   - 多次调用 getHeartflowRuntime() 返回**引用相等**的同一个 Map (不是内容相等)
//   - 经不同 import 路径 (静态 / 动态 / file:// URL) 拿到的是同一个实例
//   - 写入后经另一条路径能读到 (读写共享同一份状态, 即事故里的 "不同步" 反面)
//   - 它是 Map; 模块加载时为空 (sizeAtImport 在任何测试写入前采样)
//   - 源码级护栏: index.js 与 filehelper-features.js 都必须经 getter 取实例, 不得各自 new

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { getHeartflowRuntime } from "../../dist/inbound/heartflow-runtime.js";

// 在任何测试写入之前采样初始容量 —— 若本文件再次 import 时被污染, 这条会立刻报警
const sizeAtImport = getHeartflowRuntime().size;

/** 造一个最小可用的 HeartflowConfig 替身 (运行时无类型校验, 只需标记可辨认) */
function fakeHfConfig(tag) {
  return { enabled: true, tag };
}

// ── 1. 类型与初始状态 ─────────────────────────────────────────────

test("getHeartflowRuntime: 返回 Map 类型", () => {
  assert.ok(getHeartflowRuntime() instanceof Map, "必须是 Map 实例");
});

test("getHeartflowRuntime: 模块加载时为空表", () => {
  assert.equal(sizeAtImport, 0, "本模块被 import 时不应自带任何条目");
});

// ── 2. 单例不变量 (核心) ─────────────────────────────────────────

test("getHeartflowRuntime: 连续两次调用返回同一个 Map 实例", () => {
  assert.equal(
    getHeartflowRuntime(),
    getHeartflowRuntime(),
    "必须是同一个引用 —— 若返回新 Map, 就是本次事故的复现",
  );
});

test("getHeartflowRuntime: 三次调用仍是同一实例 (幂等)", () => {
  const a = getHeartflowRuntime();
  const b = getHeartflowRuntime();
  const c = getHeartflowRuntime();
  assert.ok(a === b && b === c, "多次获取不得产生新实例");
});

test("getHeartflowRuntime: 写入后从另一引用能读到 (状态共享, 非快照拷贝)", () => {
  const m = getHeartflowRuntime();
  try {
    m.set("acc-share", fakeHfConfig("first"));
    // 模拟 "startAccountById 写 A、命令处理器读 B" 的读侧
    const readSide = getHeartflowRuntime();
    const got = readSide.get("acc-share");
    assert.ok(got, "写侧写入后读侧必须看得到");
    assert.equal(got.tag, "first", "读到的应是写侧写入的那份配置");
    assert.equal(readSide.size, 1, "写侧与读侧共享同一份存储");
  } finally {
    m.delete("acc-share");
  }
});

test("getHeartflowRuntime: 覆盖写同一 key 后读侧看到新值 (不同步的反面)", () => {
  const writeSide = getHeartflowRuntime();
  try {
    writeSide.set("acc-overwrite", fakeHfConfig("v1"));
    getHeartflowRuntime().set("acc-overwrite", fakeHfConfig("v2"));
    const got = getHeartflowRuntime().get("acc-overwrite");
    assert.equal(got.tag, "v2", "后写应覆盖先写, 不应各存一份");
  } finally {
    writeSide.delete("acc-overwrite");
  }
});

// ── 3. 跨 import 路径同一性 ──────────────────────────────────────

test("getHeartflowRuntime: 动态 import 与静态 import 拿到同一实例", async () => {
  const mod = await import("../../dist/inbound/heartflow-runtime.js");
  assert.equal(
    mod.getHeartflowRuntime(),
    getHeartflowRuntime(),
    "同一模块的静态/动态导入必须是同一实例 (ESM 模块缓存)",
  );
});

test("getHeartflowRuntime: file:// URL 形式导入也拿到同一实例", async () => {
  const url = new URL("../../dist/inbound/heartflow-runtime.js", import.meta.url).href;
  const mod = await import(url);
  assert.equal(
    mod.getHeartflowRuntime(),
    getHeartflowRuntime(),
    "换写法解析同一文件, 仍须是同一实例",
  );
});

test("getHeartflowRuntime: 不同路径的实例间写入可见", async () => {
  const mod = await import("../../dist/inbound/heartflow-runtime.js");
  const other = mod.getHeartflowRuntime();
  try {
    getHeartflowRuntime().set("acc-cross", fakeHfConfig("cross"));
    assert.equal(other.get("acc-cross")?.tag, "cross", "换 import 路径读到的应是同一份数据");
  } finally {
    getHeartflowRuntime().delete("acc-cross");
  }
});

// ── 4. 源码级护栏: 共用方必须走 getter, 不得各自 new ─────────────

test("源码护栏: index.ts 与 filehelper-features.ts 都经 getHeartflowRuntime() 取实例", () => {
  const root = new URL("../../", import.meta.url);
  const idx = fs.readFileSync(new URL("dist/index.js", root), "utf-8");
  const cmd = fs.readFileSync(new URL("dist/inbound/filehelper-features.js", root), "utf-8");

  const line = "const runtimeHeartflow = getHeartflowRuntime();";
  assert.ok(idx.includes(line), "index.js 必须经 getter 取全局实例");
  assert.ok(cmd.includes(line), "filehelper-features.js 必须经 getter 取全局实例");
});

test("源码护栏: 该 Map 只在 heartflow-runtime.ts 里被构造 (唯一产地)", () => {
  const root = new URL("../../", import.meta.url);
  const rt = fs.readFileSync(new URL("dist/inbound/heartflow-runtime.js", root), "utf-8");
  assert.ok(
    /new Map\(\)/.test(rt),
    "heartflow-runtime.js 应持有那份被共享的 Map 本体",
  );

  // 共用方只允许「声明一次 runtimeHeartflow, 且来自 getter」—— 存在第二次声明即说明被复制
  for (const rel of ["dist/index.js", "dist/inbound/filehelper-features.js"]) {
    const code = fs.readFileSync(new URL(rel, root), "utf-8");
    const decls = code.match(/const runtimeHeartflow\b/g) ?? [];
    assert.equal(decls.length, 1, `${rel}: runtimeHeartflow 只应声明一次`);
    assert.match(
      code,
      /const runtimeHeartflow = getHeartflowRuntime\(\);/,
      `${rel}: 唯一那份必须来自 getHeartflowRuntime(), 不得 new Map()`,
    );
  }
});
