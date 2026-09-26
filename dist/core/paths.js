// core/paths.ts - Plugin 根目录探测 (单一真源)
// 仿 本项目/src/core/paths.ts 范式
// 关键: 不用 import.meta.dirname (打包后会失效), 走 8 levels up 验 openclaw.plugin.json + package.json
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { access } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { logObj as log } from "./logger.js";
let _cachedPluginRoot = null;
async function pathExists(p) {
    try {
        await access(p);
        return true;
    }
    catch {
        return false;
    }
}
// ---------------------------------------------------------------------------
// v1.6.7 (2026-09-26) OpenClaw 2026.9.6+ plugin source capture 适配
//
// 背景: OpenClaw 2026.9.6 起, 本地插件在**每次 CLI 调用/gateway 加载**时会被「源捕获」
//   (plugin source capture) 复制构建到:
//     <stateDir>/tmp/plugin-captures/<instance-uuid>/captures/openclaw-plugin-build-XXXX/
//       package-0/node_modules/<pluginName>/
//   这是一个**临时的实体副本** (实测与安装目录 inode/权限/mtime 全不同), 每次调用新建,
//   进程退出后由 sweepPluginSourceCaptureDirectories() 清掉 (实测 uuid 根已轮换多个,
//   旧的整个消失)。捕获上下文是 openclaw 内部 AsyncLocalStorage, **不对插件 SDK 暴露**,
//   插件无法从 SDK 侧拿到"真实源目录"。
//
// 旧行为 (bug): 8 层 walk 会停在副本根 —— 副本里同样有 openclaw.plugin.json + package.json,
//   于是 join(await findPluginRoot(), "accounts" | "config.json" | "db/schema.sql") 全部落到副本:
//     1) 运行时写账号配置写进临时目录 → 进程退出即丢 (真实故障: `openclaw status --all` 期间
//        WARN config hot-reload failed: default: account config not found:
//        …/tmp/plugin-captures/3a591cca-…/…/node_modules/wechatpadpro/accounts/default.json);
//     2) 副本被 sweep 后下一次调用重新拷贝, 并发进程互相看不见对方写的账号配置。
//
// 修复: 解析到副本路径时映射回**稳定安装根** <stateDir>/extensions/<name>
//   stateDir  = 副本路径里 `/tmp/plugin-captures/` 之前的片段 (再退化到 OPENCLAW_STATE_DIR / ~/.openclaw)
//   name      = 副本 package.json 的 name (再退化到副本目录名)
//   同名/同 id 校验: 扫 <stateDir>/extensions/* 比对 package.json name 或 openclaw.plugin.json id
// 找不到稳定根时**保留副本路径并只 warn 一次**(降级, 绝不因探测失败让插件起不来)。
// ---------------------------------------------------------------------------
/** 副本路径特征段 (统一用 / 比较, 兼容 Windows 反斜杠) */
const CAPTURE_SEGMENT = "/tmp/plugin-captures/";
/** 同类临时构建目录名 (plugin-build / model-catalog) */
const CAPTURE_BUILD_DIR_RE = /^openclaw-(?:plugin-build|model-catalog)-/;
let _warnedCaptureFallback = false;
function toPosix(p) {
    return p.split("\\").join("/");
}
/**
 * 该目录是否位于 openclaw 的临时插件源捕获区。
 * 注意必须看**整条路径**: 8 层 walk 停下的通常不是 build 目录本身, 而是它下面的插件根
 * (…/openclaw-plugin-build-XXXX/package-0/node_modules/wechatpadpro) —— build 标记在祖先里。
 */
export function isPluginCapturePath(dir) {
    const norm = toPosix(dir);
    if (norm.includes(CAPTURE_SEGMENT))
        return true;
    return norm.split("/").some((seg) => CAPTURE_BUILD_DIR_RE.test(seg));
}
/** 从副本路径反推 stateDir (副本路径里 /tmp/plugin-captures/ 之前的片段) */
function captureStateDir(dir) {
    const norm = toPosix(dir);
    const idx = norm.indexOf(CAPTURE_SEGMENT);
    if (idx <= 0)
        return null;
    return norm.slice(0, idx);
}
function readJsonSync(p) {
    try {
        return JSON.parse(readFileSync(p, "utf8"));
    }
    catch {
        return null;
    }
}
function isPluginRootDir(dir) {
    return existsSync(join(dir, "openclaw.plugin.json")) && existsSync(join(dir, "package.json"));
}
function str(v) {
    return typeof v === "string" && v.length > 0 ? v : null;
}
/**
 * 把 capture 副本根映射回稳定安装根。
 * 返回 null = 未能定位 (调用方降级保留副本路径)。
 */
function mapCaptureToStableRoot(captureRoot) {
    const pkg = readJsonSync(join(captureRoot, "package.json"));
    const manifest = readJsonSync(join(captureRoot, "openclaw.plugin.json"));
    const pkgName = str(pkg?.name);
    const manifestId = str(manifest?.id) ?? str(manifest?.name);
    const dirName = basename(captureRoot);
    const wanted = [...new Set([pkgName ? basename(pkgName) : null, dirName].filter((x) => x !== null))];
    // stateDir 候选: 路径反推 → 环境变量 → ~/.openclaw
    const stateDirs = [];
    const fromPath = captureStateDir(captureRoot);
    if (fromPath)
        stateDirs.push(fromPath);
    const fromEnv = str(process.env.OPENCLAW_STATE_DIR);
    if (fromEnv && !stateDirs.includes(fromEnv))
        stateDirs.push(fromEnv);
    const home = str(process.env.HOME);
    if (home) {
        const fromHome = join(home, ".openclaw");
        if (!stateDirs.includes(fromHome))
            stateDirs.push(fromHome);
    }
    for (const stateDir of stateDirs) {
        const extDir = join(stateDir, "extensions");
        // 1) 直连候选: <stateDir>/extensions/<name>
        for (const name of wanted) {
            const direct = join(extDir, name);
            if (isPluginRootDir(direct))
                return direct;
        }
        // 2) 扫描: package.json name 匹配 → manifest id 匹配 → 目录名匹配
        if (!existsSync(extDir))
            continue;
        let byId = null;
        let byDirName = null;
        let entries;
        try {
            entries = readdirSync(extDir);
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            if (entry.startsWith("."))
                continue;
            const candidate = join(extDir, entry);
            try {
                if (!statSync(candidate).isDirectory())
                    continue;
            }
            catch {
                continue;
            }
            if (!isPluginRootDir(candidate))
                continue;
            const candPkg = readJsonSync(join(candidate, "package.json"));
            if (pkgName && str(candPkg?.name) === pkgName)
                return candidate;
            if (!byId && manifestId) {
                const candManifest = readJsonSync(join(candidate, "openclaw.plugin.json"));
                if (str(candManifest?.id) === manifestId || str(candManifest?.name) === manifestId)
                    byId = candidate;
            }
            if (!byDirName && wanted.includes(entry))
                byDirName = candidate;
        }
        if (byId)
            return byId;
        if (byDirName)
            return byDirName;
    }
    return null;
}
/**
 * 命中后的收口: capture 路径 → 稳定根; 缓存稳定结果。
 * 未找到稳定根时**不缓存**(副本本身是临时的, 缓存死路径更糟), 只 warn 一次。
 */
function settleRoot(dir) {
    if (!isPluginCapturePath(dir)) {
        _cachedPluginRoot = dir;
        return dir;
    }
    const stable = mapCaptureToStableRoot(dir);
    if (stable) {
        log.info(`[paths] plugin source capture 适配: ${dir} → 稳定根 ${stable}`);
        _cachedPluginRoot = stable;
        return stable;
    }
    if (!_warnedCaptureFallback) {
        _warnedCaptureFallback = true;
        log.warn(`[paths] 检测到 openclaw plugin source capture 副本但未能定位稳定安装根, 暂用副本路径 (accounts/config 写入可能丢失): ${dir}`);
    }
    return dir;
}
/** 本文件所在目录 (src/ 或 dist/ 均可用; 打包后 __dirname 可能不存在) */
function currentFileDir() {
    if (typeof __dirname === "string")
        return __dirname;
    try {
        return dirname(fileURLToPath(import.meta.url));
    }
    catch {
        return null;
    }
}
/**
 * Walk up from this file's directory looking for BOTH `openclaw.plugin.json` AND `package.json`.
 * Returns the directory containing both, or throws if not found within 8 levels.
 *
 * 关键: 不依赖 import.meta.dirname (dist/ 与 src/ 路径不同, deploy.sh cp -r 会乱)
 * 而是基于 fileURLToPath + 8 层 walk, 兼容 dist/test/cli 各种调用入口
 *
 * async (P1-3 fix): 用 fs/promises.access 替代 existsSync, 启动期探测 plugin root 不阻塞 event loop
 * 仍保留 cache (启动期只探测一次, 后续 sync fast path)
 */
export async function findPluginRoot() {
    if (_cachedPluginRoot)
        return _cachedPluginRoot;
    // 基于本文件位置 (dist 或 src) 反推 plugin root
    const start = currentFileDir();
    if (!start) {
        throw new Error("findPluginRoot: cannot determine module directory (no __dirname / import.meta.url)");
    }
    let dir = start;
    for (let i = 0; i < 8; i++) {
        const hasPlugin = await pathExists(resolve(dir, "openclaw.plugin.json"));
        const hasPkg = await pathExists(resolve(dir, "package.json"));
        if (hasPlugin && hasPkg) {
            return settleRoot(dir);
        }
        const parent = dirname(dir);
        if (parent === dir)
            break; // reached fs root
        dir = parent;
    }
    throw new Error(`findPluginRoot: openclaw.plugin.json + package.json not found within 8 levels from ${start}`);
}
/**
 * v1.6.7: findPluginRoot 的 SYNC 版 (OpenClaw 有些调用点不 await, 见 config-helpers.ts 的 P0 记录)。
 * 与 async 版共用同一 cache 与同一 capture 回映射, 保证两条路径结果一致 (不再各自 inline walk)。
 */
export function findPluginRootSync() {
    if (_cachedPluginRoot)
        return _cachedPluginRoot;
    const start = currentFileDir();
    if (!start)
        return null;
    let dir = start;
    for (let i = 0; i < 8; i++) {
        if (isPluginRootDir(dir))
            return settleRoot(dir);
        const parent = dirname(dir);
        if (parent === dir)
            return null;
        dir = parent;
    }
    return null;
}
/** 兼容 import.meta.dirname (Node 20.11+) */
export async function getPluginRoot() {
    return findPluginRoot();
}
/** 把相对 plugin 路径解析为绝对路径 (避免 import.meta.dirname 硬编码) */
export async function resolveFromPlugin(...parts) {
    return resolve(await findPluginRoot(), ...parts);
}
/** 单元测试用 — 清 cache 让 findPluginRoot 重新探测 */
export function _resetPluginRootCache() {
    _cachedPluginRoot = null;
}
//# sourceMappingURL=paths.js.map