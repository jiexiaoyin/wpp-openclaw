// src/storage/db/factory.ts - DB backend singleton 管理
// 范式仿 本项目/src/storage/db/factory.ts
// 关键: lazy init, backend 切换抛错 (防 multi-process 状态漂移), 暴露 resetAdapter 给 tests
import { info } from "../../core/logger.js";
import { createMysqlAdapter } from "./mysql.js";
let current = null;
let resolvedCfg = null;
/**
 * Set backend impl (called from gateway startup)
 * Throws if already initialized with different backend
 */
export function setBackend(cfg) {
    if (current) {
        if (resolvedCfg &&
            resolvedCfg.mysql.host === cfg.mysql.host &&
            resolvedCfg.mysql.database === cfg.mysql.database) {
            // 同一 backend 重设, 返回现有 adapter
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
/** 测试用 — 清掉当前 adapter, 允许重新 setBackend */
export function resetAdapter() {
    if (current) {
        try {
            current.close().catch(() => {
                /* ignore */
            });
        }
        catch {
            /* ignore */
        }
    }
    current = null;
    resolvedCfg = null;
}
/**
 * 测试用 — 直接注入 adapter (跳过 createMysqlAdapter + 真实 DB 连接)
 * 命名 _forTest 显式标"测试 only", 生产代码不应调
 */
export function setAdapterForTest(adapter) {
    current = adapter;
    // resolvedCfg 留 null — setBackend 不再可用 (会撞 isResolved 校验)
}
/**
 * 从 plugin config.json storage block 反推 ResolvedDbConfig
 * (单账号 demo 用不到, 但为多账号 / 不同 schema 留入口)
 */
export function resolveDbConfig(input) {
    return {
        backend: input.backend === "sqlite" ? "sqlite" : "mysql",
        mysql: input.mysql,
    };
}
//# sourceMappingURL=factory.js.map