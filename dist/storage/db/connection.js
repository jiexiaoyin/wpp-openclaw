import { error, info, warn } from "../../core/logger.js";
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
    const MAX_DB_INIT_RETRIES = 3;
    let lastErr;
    for (let attempt = 1; attempt <= MAX_DB_INIT_RETRIES; attempt++) {
        try {
            await adapter.init();
            await adapter.ping();
            info(`db ready: ${m.host}:${m.port}/${m.database} (user=${m.user}, limit=${m.connectionLimit ?? 5})`);
            void API_TIMEOUT_MS;
            return;
        }
        catch (e) {
            lastErr = e;
            if (attempt < MAX_DB_INIT_RETRIES) {
                const backoffMs = 1000 * 2 ** (attempt - 1);
                warn(`db init attempt ${attempt}/${MAX_DB_INIT_RETRIES} failed, retry in ${backoffMs}ms: ${e instanceof Error ? e.message : String(e)}`);
                await new Promise((r) => setTimeout(r, backoffMs));
            }
        }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
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
