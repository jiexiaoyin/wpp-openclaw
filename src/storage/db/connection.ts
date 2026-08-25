// src/storage/db/connection.ts - v0.1.0 兼容 shims
// 老代码 (src/db.ts) 调用的 initDbPool/pingDb/initSchema/closeDb 名字保留
// 新代码用 getAdapter() 走 interface

import { error, info, warn } from "../../core/logger.js";
import { setBackend, getAdapter } from "./factory.js";
import { resolveDbConfig } from "./factory.js";
import { API_TIMEOUT_MS } from "../../core/constants.js";
import type { WppGlobalConfig } from "../../types.js";

/**
 * 兼容老 initDbPool(cfg: WppGlobalConfig):
 * - 从 cfg.storage.db.mariadb 抽
 * - env 替换 password (老板 2026-08-01 铁律: 凭证单一来源)
 * - setBackend() 走 adapter
 * - 立即 init (建表 + 迁移)
 *
 * Returns nothing: 老签名返回 Pool 现在不该被依赖, 用 getAdapter()
 */
export async function initDbPool(cfg: WppGlobalConfig): Promise<void> {
  const m = cfg.storage.db.mariadb;
  if (!m) throw new Error("mariadb config missing in config.json storage.db");

  let password = m.password;
  if (!password) {
    if (m.passwordEnv) {
      password = process.env[m.passwordEnv] ?? "";
    }
    if (!password) {
      throw new Error(
        `mariadb password empty: set env ${m.passwordEnv ?? "WECHATPRO_DB_PASSWORD"}`,
      );
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
  // P1 (2026-08-23): DB 启动连接加退避重试 (3 次, 1s/2s/4s) —
  //   之前 init/ping 失败立即抛 → 插件永久起不来 (systemd 重启前不可用)。同机 DB 短暂不可用可自愈。
  const MAX_DB_INIT_RETRIES = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_DB_INIT_RETRIES; attempt++) {
    try {
      await adapter.init();
      await adapter.ping();
      info(
        `db ready: ${m.host}:${m.port}/${m.database} (user=${m.user}, limit=${m.connectionLimit ?? 5})`,
      );
      // suppress unused-API_TIMEOUT_MS warning - reserved for future queryWithTimeout call
      void API_TIMEOUT_MS;
      return;
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_DB_INIT_RETRIES) {
        const backoffMs = 1000 * 2 ** (attempt - 1); // 1s, 2s
        warn(`db init attempt ${attempt}/${MAX_DB_INIT_RETRIES} failed, retry in ${backoffMs}ms: ${e instanceof Error ? e.message : String(e)}`);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function pingDb(): Promise<void> {
  await getAdapter().ping();
}

export async function initSchema(): Promise<void> {
  await getAdapter().init();
}

export async function closeDb(): Promise<void> {
  try {
    await getAdapter().close();
  } catch (e) {
    error("closeDb failed", e);
  }
  info("db closed");
}
