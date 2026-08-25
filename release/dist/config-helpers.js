import { isConfigured as _isConfigured, isValidAccountId, } from "./config.js";
import { DEFAULT_ACCOUNT_ID } from "./core/constants.js";
import { _resetPluginRootCache, findPluginRoot } from "./core/paths.js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
function findPluginRootSync() {
    let dir;
    if (typeof __dirname === "string") {
        dir = __dirname;
    }
    else {
        try {
            dir = dirname(fileURLToPath(import.meta.url));
        }
        catch {
            return null;
        }
    }
    for (let i = 0; i < 8; i++) {
        const pluginFile = resolve(dir, "openclaw.plugin.json");
        const pkgFile = resolve(dir, "package.json");
        if (existsSync(pluginFile) && existsSync(pkgFile)) {
            return dir;
        }
        const parent = dirname(dir);
        if (parent === dir)
            return null;
        dir = parent;
    }
    return null;
}
export function listAccountIds(_cfg) {
    const pluginRoot = findPluginRootSync();
    if (!pluginRoot)
        return [];
    try {
        const entries = readdirSync(join(pluginRoot, "accounts"));
        return entries
            .filter((f) => f.endsWith(".json"))
            .filter((f) => !f.startsWith("."))
            .map((f) => f.replace(/\.json$/, ""));
    }
    catch (e) {
        const err = e;
        if (err.code === "ENOENT")
            return [];
        throw e;
    }
}
export function resolveAccount(_cfg, accountId) {
    const id = accountId ?? DEFAULT_ACCOUNT_ID;
    if (!isValidAccountId(id))
        return null;
    const pluginRoot = findPluginRootSync();
    if (!pluginRoot)
        return null;
    _resetPluginRootCache();
    void findPluginRoot().catch(() => { });
    const filePath = join(pluginRoot, "accounts", `${id}.json`);
    if (!existsSync(filePath))
        return null;
    let raw;
    try {
        raw = JSON.parse(readFileSync(filePath, "utf8"));
    }
    catch {
        return null;
    }
    if (raw.tokenKeyEnv) {
        const envToken = process.env[raw.tokenKeyEnv];
        if (envToken)
            raw.tokenKey = envToken;
    }
    if (raw.authcodeEnv) {
        const envAuth = process.env[raw.authcodeEnv];
        if (envAuth)
            raw.authcode = envAuth;
    }
    if (typeof raw.webhookSecretEnv === "string" && raw.webhookSecretEnv && !raw.webhookSecret) {
        const envSecret = process.env[raw.webhookSecretEnv];
        if (envSecret)
            raw.webhookSecret = envSecret;
    }
    return raw;
}
export function defaultAccountId() {
    return DEFAULT_ACCOUNT_ID;
}
export function isConfigured(account) {
    if (!account)
        return false;
    return _isConfigured(account);
}
export function unconfiguredReason(account) {
    if (!account)
        return "account not found";
    if (!account.enabled)
        return "account disabled (set enabled=true)";
    if (!account.tokenKey) {
        return `tokenKey missing (set ${account.tokenKeyEnv ?? "env var"} + set in accounts/${account.nickname ?? "default"}.json)`;
    }
    if (!account.apiBaseUrl)
        return "apiBaseUrl missing";
    return null;
}
export function describeAccount(account) {
    if (!account)
        return "(no account)";
    const nick = account.nickname || "(unnamed)";
    const self = account.selfWxid || "(unset)";
    const cfg = _isConfigured(account) ? "configured" : "unconfigured";
    return `${nick} (selfWxid=${self}, ${cfg})`;
}
