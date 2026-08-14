// tests/read-local-media.test.ts - v1.3.63 P2 (2026-08-14 审阅): symlink 逃逸修复
//
// 背景: readLocalMedia 原 path.resolve 是纯词法归一化 (不解析 symlink), readFile 会跟随 symlink.
//   workspace 内有指向 /etc/passwd 的 symlink → 词法校验通过但读到外部文件.
// 修法: realpath 解析真实路径后再做 allowedRoots 包含校验 + workspace 根收窄到 workspace/media.
// 测试: 用可注入 allowedRootsOverride + 临时目录建 symlink 验证逃逸被拒.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readLocalMedia } from "../src/api/resolve-media.js";

let tmpRoot = "";
const allowedRoots = (sub: string) => [path.join(tmpRoot, "media"), path.join(tmpRoot, sub, "media")];

test.before(() => {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), "wpp-media-"));
  // /media/ok.txt — 合法文件
  mkdirSync(path.join(tmpRoot, "media"), { recursive: true });
  writeFileSync(path.join(tmpRoot, "media", "ok.txt"), "hello");
  // /workspace/media/evil-link.txt → 指向 tmpRoot 外部 secret.txt
  mkdirSync(path.join(tmpRoot, "workspace", "media"), { recursive: true });
  writeFileSync(path.join(tmpRoot, "secret.txt"), "SECRET");
  symlinkSync(path.join(tmpRoot, "secret.txt"), path.join(tmpRoot, "workspace", "media", "evil-link.txt"));
  // /workspace/media/inside.txt — workspace/media 内的合法文件
  writeFileSync(path.join(tmpRoot, "workspace", "media", "inside.txt"), "inside");
});

test.after(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

test("v1.3.63 P2 — 合法媒体文件可读", async () => {
  const buf = await readLocalMedia(path.join(tmpRoot, "media", "ok.txt"), allowedRoots("workspace"));
  assert.equal(buf.toString(), "hello");
});

test("v1.3.63 P2 — workspace/media 内文件可读 (收窄后)", async () => {
  const buf = await readLocalMedia(path.join(tmpRoot, "workspace", "media", "inside.txt"), allowedRoots("workspace"));
  assert.equal(buf.toString(), "inside");
});

test("v1.3.63 P2 — symlink 指向外部 → 拒绝 (realpath 逃逸拦截)", async () => {
  await assert.rejects(
    () => readLocalMedia(path.join(tmpRoot, "workspace", "media", "evil-link.txt"), allowedRoots("workspace")),
    /outside allowed media dirs/,
    "symlink 指向 allowedRoots 外 → realpath 校验应拒绝",
  );
});

test("v1.3.63 P2 — .. 逃逸被拒 (normalize 消解后 realpath/包含校验拦截)", async () => {
  await assert.rejects(
    () => readLocalMedia(path.join(tmpRoot, "media", "..", "secret.txt"), allowedRoots("workspace")),
    /\.\. segment|outside allowed media dirs/,
    ".. 逃逸应被拒 (字面 .. 段或消解后 outside allowed 均可)",
  );
});

test("v1.3.63 P2 — allowedRoots 外路径拒绝", async () => {
  await assert.rejects(
    () => readLocalMedia(path.join(tmpRoot, "secret.txt"), allowedRoots("workspace")),
    /outside allowed media dirs/,
  );
});
