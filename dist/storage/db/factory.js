import { info } from "../../core/logger.js";
import { createMysqlAdapter } from "./mysql.js";
let current = null;
let resolvedCfg = null;
export function setBackend(cfg) {
    if (current) {
        if (resolvedCfg &&
            resolvedCfg.mysql.host === cfg.mysql.host &&
            resolvedCfg.mysql.database === cfg.mysql.database) {
            return current;
        }
        throw new Error(`setBackend: DB already initialized, call resetAdapter() first (current=${resolvedCfg?.mysql.host}/${resolvedCfg?.mysql.database})`);
    }
    resolvedCfg = cfg;
    current = createMysqlAdapter(cfg);
    info(`db factory: backend=${cfg.backend} host=${cfg.mysql.host}/${cfg.mysql.database}`);
    return current;
}
export function getAdapter() {
    if (!current) {
        throw new Error("db factory: adapter not initialized — call setBackend() at plugin startup");
    }
    return current;
}
export function currentBackendName() {
    return current?.backendName ?? null;
}
export function currentConfig() {
    return resolvedCfg;
}
export function resetAdapter() {
    if (current) {
        try {
            current.close().catch(() => {
            });
        }
        catch {
        }
    }
    current = null;
    resolvedCfg = null;
}
export function setAdapterForTest(adapter) {
    current = adapter;
}
export function resolveDbConfig(input) {
    return {
        backend: input.backend === "sqlite" ? "sqlite" : "mysql",
        mysql: input.mysql,
    };
}
