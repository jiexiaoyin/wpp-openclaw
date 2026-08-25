// src/storage/db/jargon.ts - wpp_jargon_terms CRUD 便捷封装 (v1.3.76 黑话)
// 全部通过 getAdapter() 拿 adapter, 不直接 import mysql2 (解耦 backend)

import { getAdapter } from "./factory.js";
import type { JargonTermRecord } from "./types.js";

/** 保存/更新黑话词条 (UPSERT, idempotent) */
export async function saveJargonTerm(record: JargonTermRecord): Promise<void> {
  return getAdapter().saveJargonTerm(record);
}

/** 查群内黑话 (按 frequency 降序) */
export async function getJargonTerms(
  accountId: string,
  groupId: string,
  limit?: number,
): Promise<JargonTermRecord[]> {
  return getAdapter().getJargonTerms(accountId, groupId, limit);
}

/** 查某词条是否已存在 */
export async function hasJargonTerm(
  accountId: string,
  groupId: string,
  term: string,
): Promise<boolean> {
  return getAdapter().hasJargonTerm(accountId, groupId, term);
}
