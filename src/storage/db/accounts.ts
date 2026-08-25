// src/storage/db/accounts.ts - wpp_accounts CRUD 便捷封装
// 范式仿 src/storage/db/messages.ts (本项目 模式)
// G2-3: 账号状态持久化 (vendor 鉴权 + 元数据), 启动恢复 / 监控 / 健康检查

import { getAdapter } from "./factory.js";
import type { AccountRecord } from "./types.js";

/**
 * UPSERT 账号状态 (idempotent, ON DUPLICATE KEY UPDATE)
 * 调用方负责:
 *   - 不传 tokenKey / authcode / webhookSecret (敏感字段, 走 accounts/<id>.json + env)
 *   - enabled 字段必须反映当前 config.enabled (供监控 / 健康检查)
 */
export async function upsertAccount(record: AccountRecord): Promise<void> {
  return getAdapter().upsertAccount(record);
}

/**
 * 列出所有已知账号 (按 account_id 排序)
 * 供 plugin 重启时遍历 / 健康检查 / 监控
 */
export async function getAccounts(): Promise<AccountRecord[]> {
  return getAdapter().getAccounts();
}

/**
 * 单个账号状态 (null 表示从未注册过)
 */
export async function getAccount(accountId: string): Promise<AccountRecord | null> {
  return getAdapter().getAccount(accountId);
}
