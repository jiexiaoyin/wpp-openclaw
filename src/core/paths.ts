// core/paths.ts - Plugin 根目录探测
// 仿 本项目/src/core/paths.ts 范式
// 关键: 不用 import.meta.dirname (打包后会失效), 走 6 levels up 验 openclaw.plugin.json + package.json

import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let _cachedPluginRoot: string | null = null;

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Walk up from this file's directory looking for BOTH `openclaw.plugin.json` AND `package.json`.
 * Returns the directory containing both, or throws if not found within 6 levels.
 *
 * 关键: 不依赖 import.meta.dirname (dist/ 与 src/ 路径不同, deploy.sh cp -r 会乱)
 * 而是基于 fileURLToPath + 6 层 walk, 兼容 dist/test/cli 各种调用入口
 *
 * async (P1-3 fix): 用 fs/promises.access 替代 existsSync, 启动期探测 plugin root 不阻塞 event loop
 * 仍保留 cache (启动期只探测一次, 后续 sync fast path)
 */
export async function findPluginRoot(): Promise<string> {
  if (_cachedPluginRoot) return _cachedPluginRoot;
  // 基于本文件位置 (dist 或 src) 反推 plugin root
  let dir: string;
  if (typeof __dirname === "string") {
    dir = __dirname;
  } else {
    // ESM module — use import.meta.url (works in both src and dist)
    dir = dirname(fileURLToPath(import.meta.url));
  }

  for (let i = 0; i < 8; i++) {
    const hasPlugin = await pathExists(resolve(dir, "openclaw.plugin.json"));
    const hasPkg = await pathExists(resolve(dir, "package.json"));
    if (hasPlugin && hasPkg) {
      _cachedPluginRoot = dir;
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break; // reached fs root
    dir = parent;
  }
  throw new Error(
    `findPluginRoot: openclaw.plugin.json + package.json not found within 8 levels from ${dir}`,
  );
}

/** 兼容 import.meta.dirname (Node 20.11+) */
export async function getPluginRoot(): Promise<string> {
  return findPluginRoot();
}

/** 把相对 plugin 路径解析为绝对路径 (避免 import.meta.dirname 硬编码) */
export async function resolveFromPlugin(...parts: string[]): Promise<string> {
  return resolve(await findPluginRoot(), ...parts);
}

/** 单元测试用 — 清 cache 让 findPluginRoot 重新探测 */
export function _resetPluginRootCache(): void {
  _cachedPluginRoot = null;
}
