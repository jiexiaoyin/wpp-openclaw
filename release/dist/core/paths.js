import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
export async function findPluginRoot() {
    if (_cachedPluginRoot)
        return _cachedPluginRoot;
    let dir;
    if (typeof __dirname === "string") {
        dir = __dirname;
    }
    else {
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
        if (parent === dir)
            break;
        dir = parent;
    }
    throw new Error(`findPluginRoot: openclaw.plugin.json + package.json not found within 8 levels from ${dir}`);
}
export async function getPluginRoot() {
    return findPluginRoot();
}
export async function resolveFromPlugin(...parts) {
    return resolve(await findPluginRoot(), ...parts);
}
export function _resetPluginRootCache() {
    _cachedPluginRoot = null;
}
