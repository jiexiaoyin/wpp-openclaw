// src/storage/db/heartflow.ts - wpp_hf_* CRUD 便捷封装 (v1.6.x 心流反馈闭环)
// 全部通过 getAdapter() 拿 adapter, 不直接 import mysql2 (解耦 backend)
// 范式照 jargon.ts; adapter 不 catch, 错误由业务上层 catch 吞 (不阻断 dispatch)
import { getAdapter } from "./factory.js";
/** judge 通过落行 (INSERT IGNORE, dup 保留首次决策) */
export async function recordHfJudged(record) {
    return getAdapter().recordHfJudged(record);
}
/** judged → sent (guard: 仅 judged) */
export async function setHfLedgerSent(accountId, inboundMsgId, sentAtSec, windowExpiresAtSec) {
    return getAdapter().setHfLedgerSent(accountId, inboundMsgId, sentAtSec, windowExpiresAtSec);
}
/** judged → suppressed (guard: 仅 judged) */
export async function setHfLedgerSuppressed(accountId, inboundMsgId, reason, atSec) {
    return getAdapter().setHfLedgerSuppressed(accountId, inboundMsgId, reason, atSec);
}
/** 人类接话: sent 开窗且未定 → engaged=1 + closed */
export async function markHfEngaged(accountId, groupId, atSec) {
    return getAdapter().markHfEngaged(accountId, groupId, atSec);
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
//# sourceMappingURL=heartflow.js.map