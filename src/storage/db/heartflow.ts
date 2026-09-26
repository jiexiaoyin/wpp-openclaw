// src/storage/db/heartflow.ts - wpp_hf_* CRUD 便捷封装 (v1.6.x 心流反馈闭环)
// 全部通过 getAdapter() 拿 adapter, 不直接 import mysql2 (解耦 backend)
// 范式照 jargon.ts; adapter 不 catch, 错误由业务上层 catch 吞 (不阻断 dispatch)

import { getAdapter } from "./factory.js";
import type {
  HfClosedSample,
  HfGroupHourBucket,
  HfGroupMsgStats,
  HfGroupProfileRecord,
  HfGroupStateRecord,
  HfLedgerRecord,
  HfLedgerTrace,
  HfSentCountRow,
  HfThresholdAuditRecord,
} from "./types.js";

/** judge 通过落行 (INSERT IGNORE, dup 保留首次决策) */
export async function recordHfJudged(record: HfLedgerRecord): Promise<void> {
  return getAdapter().recordHfJudged(record);
}

/** v1.6.1 可观测 (只读): 近 sinceSec 秒台账按 status/reason 计数 */
export async function countHfLedgerByStatus(
  accountId: string,
  sinceSec: number,
): Promise<{ total: number; byStatus: Record<string, number>; bySuppressedReason: Record<string, number> }> {
  return getAdapter().countHfLedgerByStatus(accountId, sinceSec);
}

/** v1.6.8 可观测 (只读): 近 sinceSec 秒已收敛样本按命中信号计数 */
export async function countHfEngageSignals(
  accountId: string,
  sinceSec: number,
): Promise<Record<string, number>> {
  return getAdapter().countHfEngageSignals(accountId, sinceSec);
}

/** judged → sent (guard: 仅 judged). v1.6.8: 一并记 bot 自己那条的 msgId (判"有人引用了我") */
export async function setHfLedgerSent(
  accountId: string,
  inboundMsgId: string,
  sentAtSec: number,
  windowExpiresAtSec: number,
  botMsgId?: string | null,
): Promise<void> {
  return getAdapter().setHfLedgerSent(accountId, inboundMsgId, sentAtSec, windowExpiresAtSec, botMsgId);
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

/** 按信号收敛开窗行 (close=false 只落弱信号并保持开窗, 见 types.ts markHfEngaged 注释) */
export async function markHfEngaged(
  accountId: string,
  groupId: string,
  atSec: number,
  engaged: 0 | 1,
  signal: string,
  close: boolean,
): Promise<void> {
  return getAdapter().markHfEngaged(accountId, groupId, atSec, engaged, signal, close);
}

/** v1.6.8 反事实基线素材: 每群 × 每小时段的入站人类消息数 (hour 为本地小时) */
export async function listHfGroupMsgHourBuckets(
  accountId: string,
  sinceSec: number,
  localOffsetSec: number,
): Promise<HfGroupHourBucket[]> {
  return getAdapter().listHfGroupMsgHourBuckets(accountId, sinceSec, localOffsetSec);
}

/** v1.6.9 发言预算回填: 每群近 1 小时 / 近 24 小时已发出条数 + 最近发出时刻 */
export async function listHfSentCountsRecent(
  accountId: string,
  hourSinceSec: number,
  daySinceSec: number,
): Promise<HfSentCountRow[]> {
  return getAdapter().listHfSentCountsRecent(accountId, hourSinceSec, daySinceSec);
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

/** v1.7.0 /heartflow why: 该群最近一条台账行 (只读追溯) */
export async function getHfLedgerLast(
  accountId: string,
  groupId: string,
): Promise<HfLedgerTrace | null> {
  return getAdapter().getHfLedgerLast(accountId, groupId);
}

// ===== v1.7.0 群画像 (wpp_hf_group_profile) =====

/** 覆盖写单群画像 (调用方只在解析成功时调 ⇒ 不会写空画像) */
export async function upsertHfGroupProfile(record: HfGroupProfileRecord): Promise<void> {
  return getAdapter().upsertHfGroupProfile(record);
}

/** 读单群画像 (无则 null) */
export async function getHfGroupProfile(
  accountId: string,
  groupId: string,
): Promise<HfGroupProfileRecord | null> {
  return getAdapter().getHfGroupProfile(accountId, groupId);
}

/** 列账号全部画像 (sweep 预热内存缓存用; judge 路径不查它) */
export async function listHfGroupProfiles(accountId: string): Promise<HfGroupProfileRecord[]> {
  return getAdapter().listHfGroupProfiles(accountId);
}

/** 画像素材统计 (单表只读聚合; 只在生成画像时调, 每群每天一次) */
export async function getHfGroupMessageStats(
  accountId: string,
  groupId: string,
  sinceSec: number,
): Promise<HfGroupMsgStats> {
  return getAdapter().getHfGroupMessageStats(accountId, groupId, sinceSec);
}
