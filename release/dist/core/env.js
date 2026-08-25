export const ENV_KEYS = {
    WPP_DB_PASSWORD: "WPP_DB_PASSWORD",
    WPP_DB_HOST: "WPP_DB_HOST",
    WPP_DB_PORT: "WPP_DB_PORT",
    WPP_DB_USER: "WPP_DB_USER",
    WPP_DB_NAME: "WPP_DB_NAME",
    WECHATPRO_DB_PASSWORD: "WECHATPRO_DB_PASSWORD",
    WPP_API_BASE: "WPP_API_BASE",
    WPP_TOKEN_KEY: "WPP_TOKEN_KEY",
    WPP_AUTHCODE: "WPP_AUTHCODE",
    WPP_WEBHOOK_HOST: "WPP_WEBHOOK_HOST",
    WPP_WEBHOOK_PORT: "WPP_WEBHOOK_PORT",
    WPP_WEBHOOK_PATH: "WPP_WEBHOOK_PATH",
    WPP_WEBHOOK_SECRET: "WPP_WEBHOOK_SECRET",
    WPP_DEBUG: "WPP_DEBUG",
};
const TRUTHY_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);
export function getEnv(key, fallback) {
    const v = process.env[key];
    if (v === undefined || v === "")
        return fallback;
    return v;
}
export function getEnvBool(key, fallback = false) {
    const v = process.env[key];
    if (v === undefined || v === "")
        return fallback;
    return TRUTHY_VALUES.has(v.toLowerCase());
}
export function getEnvNumber(key, fallback) {
    const v = process.env[key];
    if (v === undefined || v === "")
        return fallback;
    const n = Number(v);
    if (!Number.isFinite(n))
        return fallback;
    return n;
}
export function requireEnv(key) {
    const v = process.env[key];
    if (v === undefined || v === "") {
        throw new Error(`required env var missing: ${key}`);
    }
    return v;
}
