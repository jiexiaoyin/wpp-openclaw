// src/api/resolve-media.ts - 媒体路径/URL/base64 → base64 统一解析
//
// 把本地路径 / URL / data URL 转成 base64 (/Msg/UploadImg 需要)
//  - HTTP 下载加 30s 超时 + 15MB size cap (防 vendor 不可达挂起 / 大文件 OOM)
//  - 错误消息脱敏 (URL 含签名 CDN query, 不能带完整 URL 上抛)
//  - 本地路径限制到 workspace/media (防 AI 诱导读任意文件外带)
// v1.3.18 P1-安全1: readLocalMedia 三重防御 (path.resolve + `..` 拒绝 + 精确包含校验)

import { readFile } from "node:fs/promises";
import path from "node:path";
import { safeFetchWithCap } from "../util/safe-fetch.js";

export async function resolveImageToBase64(input: string): Promise<string> {
  if (!input) throw new Error("resolveImageToBase64: empty input");
  const m = DATA_URI_RE.exec(input);
  if (m && m[1]) return m[1].trim();
  if (/^https?:\/\//i.test(input)) {
    // v1.3.57 P0-SSRF (2026-08-13 交付审阅): 裸 fetch → safeFetchWithCap
    //   (host 白名单 + 15MB cap + 流式), 防 AI 诱导抓内网/云元数据外带
    const MAX_BYTES = 15 * 1024 * 1024; // 15MB cap (与旧值一致)
    try {
      const buf = await safeFetchWithCap(input, { signal: AbortSignal.timeout(30_000) }, MAX_BYTES);
      return buf.toString("base64");
    } catch (e) {
      throw new Error(`resolveImageToBase64: download failed (${sanitizeHost(input)}): ${(e as Error).message}`);
    }
  }
  if (input.startsWith("file://")) {
    const p = input.slice("file://".length);
    return (await readLocalMedia(p)).toString("base64");
  }
  //    base64 特征: 长度 ≥16 且只含 A-Za-z0-9+/=
  const isPureBase64 = input.length >= 16 && /^[A-Za-z0-9+/=]+$/.test(input) && input.length % 4 === 0;
  if (isPureBase64) return input.trim();
  if (input.startsWith("/") || input.startsWith("./") || input.startsWith("../")) {
    return (await readLocalMedia(input)).toString("base64");
  }
  return input.trim();
}

/**
 * v1.3.18 P1-安全1 fix (2026-08-10): path.resolve 归一化 + 拒绝 .. + 精确包含校验
 *
 * 原版仅做前缀匹配 `abs.startsWith(root)`, 攻击者构造 `/root/.openclaw/media/../../etc/passwd`
 * 时前缀命中但真实路径是 `/etc/passwd` → 任意文件读取. v1.3.18 三重防御:
 *   1. 拒绝任何包含 `..` 段的路径 (防御性)
 *   2. path.resolve 归一化 (消解 `..`, 解析符号链接)
 *   3. 精确校验 (归一化后必须真实在 allowedRoots 目录树下)
 */
export async function readLocalMedia(p: string, allowedRootsOverride?: string[]): Promise<Buffer> {
  const allowedRoots = allowedRootsOverride ?? [
    "/root/.openclaw/media",
    "/root/.openclaw/workspace/media",
    "/root/.openclaw/shared-media",
  ];
  const normalized = path.normalize(p);
  if (normalized.split(/[\\/]/).includes("..")) {
    throw new Error("resolveImageToBase64: path contains .. segment");
  }
  const abs = path.resolve(p);
  if (!allowedRoots.some((root) => {
    const rootWithSep = root.endsWith("/") ? root : root + "/";
    return abs === root || abs.startsWith(rootWithSep);
  })) {
    throw new Error("resolveImageToBase64: local path outside allowed media dirs");
  }
  // v1.3.63 P2 (2026-08-14 审阅): symlink 逃逸修复.
  //   原注释称"解析符号链接"但 path.resolve 是纯词法归一化 — readFile 会跟随 symlink,
  //   若 workspace 内有指向 /etc/passwd 的 symlink → 校验通过但读到外部文件.
  //   修法: realpath 解析真实路径后再做一次 allowedRoots 包含校验 (symlink 指向外部则拒绝).
  //   同时收窄 allowedRoots: workspace 根 → workspace/media 子目录 (原含 agent 转录/.env).
  let real: string;
  try {
    real = await import("node:fs/promises").then((fsp) => fsp.realpath(abs));
  } catch {
    throw new Error("resolveImageToBase64: cannot resolve local path");
  }
  const insideAllowed = allowedRoots.some((root) => {
    const rootWithSep = root.endsWith("/") ? root : root + "/";
    return real === root || real.startsWith(rootWithSep);
  });
  if (!insideAllowed) {
    throw new Error("resolveImageToBase64: local path resolves outside allowed media dirs");
  }
  return readFile(real);
}

/** 错误消息脱敏: 只保留 host, 去掉 URL query (可能含签名 CDN 参数) */
function sanitizeHost(url: string): string {
  try {
    return new URL(url).host || "url";
  } catch {
    return "url";
  }
}

const DATA_URI_RE = /^data:[^;]+;base64,(.+)$/i;
