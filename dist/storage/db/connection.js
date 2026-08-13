import { error, info } from "../../core/logger.js";
import { setBackend, getAdapter } from "./factory.js";
import { resolveDbConfig } from "./factory.js";
import { API_TIMEOUT_MS } from "../../core/constants.js";
export async function initDbPool(cfg) {
    const m = cfg.storage.db.mariadb;
    if (!m)
        throw new Error("mariadb config missing in config.json storage.db");
    let password = m.password;
    if (!password) {
        if (m.passwordEnv) {
            password = process.env[m.passwordEnv] ?? "";
        }
        if (!password) {
            throw new Error(`mariadb password empty: set env ${m.passwordEnv ?? "WECHATPRO_DB_PASSWORD"}`);
        }
    }
    const resolved = resolveDbConfig({
        backend: "mariadb",
        mysql: {
            host: m.host,
            port: m.port,
            user: m.user,
            password,
            database: m.database,
            connectionLimit: m.connectionLimit ?? 5,
        },
    });
    const adapter = setBackend(resolved);
    await adapter.init();
    await adapter.ping();
    info(`db ready: ${m.host}:${m.port}/${m.database} (user=${m.user}, limit=${m.connectionLimit ?? 5})`);
    void API_TIMEOUT_MS;
}
export async function pingDb() {
    await getAdapter().ping();
}
export async function initSchema() {
    await getAdapter().init();
}
export async function closeDb() {
    try {
        await getAdapter().close();
    }
    catch (e) {
        error("closeDb failed", e);
    }
    info("db closed");
}
