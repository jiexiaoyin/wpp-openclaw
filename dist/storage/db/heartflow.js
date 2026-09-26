// src/storage/db/heartflow.ts - wpp_hf_* CRUD 便捷封装 (v1.6.x 心流反馈闭环)
// 全部通过 getAdapter() 拿 adapter, 不直接 import mysql2 (解耦 backend)
// 范式照 jargon.ts; adapter 不 catch, 错误由业务上层 catch 吞 (不阻断 dispatch)
import { getAdapter } from "./factory.js";
/** judge 通过落行 (INSERT IGNORE, dup 保留首次决策) */
export async function recordHfJudged(record) {
    return getAdapter().recordHfJudged(record);
}
/** v1.6.1 可观测 (只读): 近 sinceSec 秒台账按 status/reason 计数 */
export async function countHfLedgerByStatus(accountId, sinceSec) {
    return getAdapter().countHfLedgerByStatus(accountId, sinceSec);
}
/** v1.6.8 可观测 (只读): 近 sinceSec 秒已收敛样本按命中信号计数 */
export async function countHfEngageSignals(accountId, sinceSec) {
    return getAdapter().countHfEngageSignals(accountId, sinceSec);
}
/** judged → sent (guard: 仅 judged). v1.6.8: 一并记 bot 自己那条的 msgId (判"有人引用了我") */
export async function setHfLedgerSent(accountId, inboundMsgId, sentAtSec, windowExpiresAtSec, botMsgId) {
    return getAdapter().setHfLedgerSent(accountId, inboundMsgId, sentAtSec, windowExpiresAtSec, botMsgId);
}
/** judged → suppressed (guard: 仅 judged) */
export async function setHfLedgerSuppressed(accountId, inboundMsgId, reason, atSec) {
    return getAdapter().setHfLedgerSuppressed(accountId, inboundMsgId, reason, atSec);
}
/** 按信号收敛开窗行 (close=false 只落弱信号并保持开窗, 见 types.ts markHfEngaged 注释) */
export async function markHfEngaged(accountId, groupId, atSec, engaged, signal, close) {
    return getAdapter().markHfEngaged(accountId, groupId, atSec, engaged, signal, close);
}
/** v1.6.8 反事实基线素材: 每群 × 每小时段的入站人类消息数 (hour 为本地小时) */
export async function listHfGroupMsgHourBuckets(accountId, sinceSec, localOffsetSec) {
    return getAdapter().listHfGroupMsgHourBuckets(accountId, sinceSec, localOffsetSec);
}
/** v1.6.9 发言预算回填: 每群近 1 小时 / 近 24 小时已发出条数 + 最近发出时刻 */
export async function listHfSentCountsRecent(accountId, hourSinceSec, daySinceSec) {
    return getAdapter().listHfSentCountsRecent(accountId, hourSinceSec, daySinceSec);
}
/** sweep: sent 到期无人接话 → ignored + closed */
export async function closeHfExpiredWindows(accountId, atSec) {
    return getAdapter().closeHfExpiredWindows(accountId, atSec);
}
/** sweep: judged 无发送结果超上限 → suppressed (呆账收敛) */
export async function expireHfStaleJudged(accountId, atSec, judgedBeforeSec) {
    return getAdapter().expireHfStaleJudged(accountId, atSec, judgedBeforeSec);
}
/** 滚窗样本: 最近 limit 条已收敛 closed 的 engaged 值 */
export async function getHfClosedRecent(accountId, groupId, limit) {
    return getAdapter().getHfClosedRecent(accountId, groupId, limit);
}
/** upsert 每群 learned 阈值状态 */
export async function upsertHfGroupState(record) {
    return getAdapter().upsertHfGroupState(record);
}
/** 读单群状态 (无则 null) */
export async function getHfGroupState(accountId, groupId) {
    return getAdapter().getHfGroupState(accountId, groupId);
}
/** 列账号所有群状态 (供 /heartflow status 只读摘要) */
export async function listHfGroupStates(accountId) {
    return getAdapter().listHfGroupStates(accountId);
}
/** 阈值变更审计落行 */
export async function logHfThresholdChange(record) {
    return getAdapter().logHfThresholdChange(record);
}
/** sweep: 有已收敛样本的群清单 (since 之后) */
export async function getHfLedgerDistinctClosedGroups(accountId, sinceSec) {
    return getAdapter().getHfLedgerDistinctClosedGroups(accountId, sinceSec);
}
/** v1.7.0 /heartflow why: 该群最近一条台账行 (只读追溯) */
export async function getHfLedgerLast(accountId, groupId) {
    return getAdapter().getHfLedgerLast(accountId, groupId);
}
// ===== v1.7.0 群画像 (wpp_hf_group_profile) =====
/** 覆盖写单群画像 (调用方只在解析成功时调 ⇒ 不会写空画像) */
export async function upsertHfGroupProfile(record) {
    return getAdapter().upsertHfGroupProfile(record);
}
/** 读单群画像 (无则 null) */
export async function getHfGroupProfile(accountId, groupId) {
    return getAdapter().getHfGroupProfile(accountId, groupId);
}
/** 列账号全部画像 (sweep 预热内存缓存用; judge 路径不查它) */
export async function listHfGroupProfiles(accountId) {
    return getAdapter().listHfGroupProfiles(accountId);
}
/** 画像素材统计 (单表只读聚合; 只在生成画像时调, 每群每天一次) */
export async function getHfGroupMessageStats(accountId, groupId, sinceSec) {
    return getAdapter().getHfGroupMessageStats(accountId, groupId, sinceSec);
}
// ===== v1.8.0 分层统计 (wpp_hf_layer_stat) =====
/** 分层输入: 窗口内全部群已收敛行 (一次批量取, 避免逐群 N+1) */
export async function listHfClosedSince(accountId, sinceSec, limit) {
    return getAdapter().listHfClosedSince(accountId, sinceSec, limit);
}
/** upsert 一行段统计 (调用方只在内容变化时调) */
export async function upsertHfLayerStat(record) {
    return getAdapter().upsertHfLayerStat(record);
}
/** 读账号全部段统计 (启动预热内存缓存用) */
export async function listHfLayerStats(accountId) {
    return getAdapter().listHfLayerStats(accountId);
}
/** 一键否决: 把该群最近一条已发出标记为 veto (无行可标 ⇒ null) */
export async function markHfLedgerVeto(accountId, groupId, atSec) {
    return getAdapter().markHfLedgerVeto(accountId, groupId, atSec);
}
/**
 * v1.9.0 观测: 每群发言占比素材 (按群 × 方向计数)。
 * ⚠️ 出站行 chat_id 为 NULL, adapter 侧已 `COALESCE(NULLIF(chat_id,''), peer_id)` 归群。
 */
export async function listHfBotMsgShare(accountId, sinceSec) {
    return getAdapter().listHfBotMsgShare(accountId, sinceSec);
}
/** v1.9.0 观测: 重复率素材 (群聊出站文本, 时间升序) */
export async function listHfOutboundTexts(accountId, sinceSec, limit) {
    return getAdapter().listHfOutboundTexts(accountId, sinceSec, limit);
}
//# sourceMappingURL=heartflow.js.map