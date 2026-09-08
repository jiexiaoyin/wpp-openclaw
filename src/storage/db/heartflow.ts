// src/storage/db/heartflow.ts - wpp_hf_* CRUD 便捷封装 (v1.6.x 心流反馈闭环)
// 全部通过 getAdapter() 拿 adapter, 不直接 import mysql2 (解耦 backend)
// 范式照 jargon.ts; adapter 不 catch, 错误由业务上层 catch 吞 (不阻断 dispatch)

import { getAdapter } from "./factory.js";
import type {
  HfClosedSample,
  HfGroupStateRecord,
  HfLedgerRecord,
  HfThresholdAuditRecord,
} from "./types.js";

/** judge 通过落行 (INSERT IGNORE, dup 保留首次决策) */
export async function recordHfJudged(record: HfLedgerRecord): Promise<void> {
  return getAdapter().recordHfJudged(record);
}

/** judged → sent (guard: 仅 judged) */
export async function setHfLedgerSent(
  accountId: string,
  inboundMsgId: string,
  sentAtSec: number,
  windowExpiresAtSec: number,
): Promise<void> {
  return getAdapter().setHfLedgerSent(accountId, inboundMsgId, sentAtSec, windowExpiresAtSec);
}

/** judged → suppressed (guard: 仅 judged) */
export async function setHfLedgerSuppressed(
  accountId: string,
  inboundMsgId: string,
  reason: string,
  atSec: number,
): Promise<void> {
  return getAdapter().setHfLedgerSuppressed(accountId, inboundMsgId, reason, atSec);
}

/** 人类接话: sent 开窗且未定 → engaged=1 + closed */
export async function markHfEngaged(
  accountId: string,
  groupId: string,
  atSec: number,
): Promise<void> {
  return getAdapter().markHfEngaged(accountId, groupId, atSec);
}

/** sweep: sent 到期无人接话 → ignored + closed */
export async function closeHfExpiredWindows(accountId: string, atSec: number): Promise<void> {
  return getAdapter().closeHfExpiredWindows(accountId, atSec);
}

/** sweep: judged 无发送结果超上限 → suppressed (呆账收敛) */
export async function expireHfStaleJudged(
  accountId: string,
  atSec: number,
  judgedBeforeSec: number,
): Promise<void> {
  return getAdapter().expireHfStaleJudged(accountId, atSec, judgedBeforeSec);
}

/** 滚窗样本: 最近 limit 条已收敛 closed 的 engaged 值 */
export async function getHfClosedRecent(
  accountId: string,
  groupId: string,
  limit: number,
): Promise<HfClosedSample[]> {
  return getAdapter().getHfClosedRecent(accountId, groupId, limit);
}

/** upsert 每群 learned 阈值状态 */
export async function upsertHfGroupState(record: HfGroupStateRecord): Promise<void> {
  return getAdapter().upsertHfGroupState(record);
}

/** 读单群状态 (无则 null) */
export async function getHfGroupState(
  accountId: string,
  groupId: string,
): Promise<HfGroupStateRecord | null> {
  return getAdapter().getHfGroupState(accountId, groupId);
}

/** 列账号所有群状态 (供 /heartflow status 只读摘要) */
export async function listHfGroupStates(accountId: string): Promise<HfGroupStateRecord[]> {
  return getAdapter().listHfGroupStates(accountId);
}

/** 阈值变更审计落行 */
export async function logHfThresholdChange(record: HfThresholdAuditRecord): Promise<void> {
  return getAdapter().logHfThresholdChange(record);
}

/** sweep: 有已收敛样本的群清单 (since 之后) */
export async function getHfLedgerDistinctClosedGroups(
  accountId: string,
  sinceSec: number,
): Promise<string[]> {
  return getAdapter().getHfLedgerDistinctClosedGroups(accountId, sinceSec);
}
