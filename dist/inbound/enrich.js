// src/inbound/enrich.ts - DB 单一入口 (仿 本项目/src/inbound/enrich.ts)
// 关键: webhook / handler 都通过本文件写 DB, 避免 webhook 自己 INSERT + handler 再 UPDATE 的重复修复模式
//
// ⚠️ 2026-09-13 变更: 本文件**不再触发心流**。原 v1.5.0 B-fix 的「独立 trigger」
//   (tryHeartflowAfterEnrich → tryIndependentTrigger) 已整条删除, 原因 (均为实测事实):
//     1. 它只 log 决策, **从不发送、从不落台账** ⇒ 对心流行为零影响;
//     2. 判定用**账号级**阈值 (不走 resolveThresholdOverride) ⇒ 与真实决策用的 per-群 learned
//        阈值不一致 (华为群 learned=0.30 vs 账号级 0.6), 就算接上发送也是错的;
//     3. 它先调 markHeartflowJudged() 消耗 judge 冷却, 而真实路径共用该冷却 ⇒ minJudgeIntervalSec>0
//        时会把真路径整个闸死 (静默失效地雷);
//     4. ⚠️⚠️ **同一个群消息被 judge 两次**: enrichBatch 先 map(enrichAndSaveMessage) (内部已 fire
//        一次), 末尾又一个 for 循环再 fire 一次 ⇒ 每条群消息白烧 2 次 LLM 调用 (实测: 一条 via=msgType
//        的消息在**同一次** handler 调用里产生 2 条 judge failed);
//     5. 设计前提「非@群消息到不了 handler 的心流分支」经查**不成立** —— requireAtMention 从未在
//        shouldTrigger 内实现, 非@消息本来就会走到 triggers.ts 的心流分支; ledger 31 行全部由
//        handler.ts 写出即证。
//   真·心流回复只走 handler.ts (`t.via === "heartflow"` → judgeHeartflow → persistHfJudged → dispatch)。
import { logObj as log, formatErr } from "../core/logger.js";
import { saveMessage } from "../db.js";
/**
 * Persist inbound message to wpp_messages. Idempotent — same msgId can call twice safely.
 * 关键: 不抛, 吞错返 saved:false (silent killer 永久救回靠 caller log)
 *
 * 2026-09-13: 只做落库。v1.5.2 曾在此 fire-and-forget 触发心流独立 judge, 已整条删除
 *   (同一消息会被本函数 + enrichBatch 末尾循环各触发一次 = 双烧 LLM; 且结果被丢弃) — 见文件头注释。
 */
export async function enrichAndSaveMessage(msg) {
    try {
        await saveMessage({
            account_id: msg.accountId,
            msg_id: msg.msgId,
            new_msg_id: msg.newMsgId,
            // v1.3.21 REVOKE-FIX: 用 msg.direction (outgoing 图片 = outbound), 默认 inbound
            direction: msg.direction ?? "inbound",
            peer_kind: msg.peerKind,
            peer_id: msg.peerId,
            peer_name: msg.fromNickname,
            chat_id: msg.chatroomId,
            msg_type: String(msg.msgType),
            content: msg.content,
            raw_payload: msg.raw,
            from_wxid: msg.fromWxid,
            ts: msg.ts,
        });
        return { saved: true };
    }
    catch (e) {
        log.warn(`enrichAndSaveMessage failed: ${formatErr(e)}`, {
            msgId: msg.msgId,
        });
        return { saved: false, error: e.message };
    }
}
/**
 * 多个消息批量保存
 *
 * 2026-09-13: 只做落库 (原 v1.5.0/v1.5.2 的「写库后 fire-and-forget 心流独立 trigger」已删除)。
 *   注意历史坑: 那两个版本里 enrichBatch 自己又 fire 了一次, 而 map(enrichAndSaveMessage) 内部
 *   也 fire 一次 ⇒ 每条群消息被 judge 两次。删除该循环即同时修掉这个双烧。
 */
export async function enrichBatch(batch) {
    // P3-2 (2026-08-13 外部审计): 历史跟踪入库 — 每条消息独立落库 (不同 msg_id, INSERT...ON DUPLICATE 幂等),
    //   相互独立无数据依赖 → 顺序 await 改 Promise.all 并发 (enrichAndSaveMessage 内部吞错永不 reject,
    //   一条失败不阻塞其余 + 计数语义与原串行一致)
    const results = await Promise.all(batch.map((msg) => enrichAndSaveMessage(msg)));
    let saved = 0;
    let failed = 0;
    for (const r of results) {
        if (r.saved)
            saved++;
        else
            failed++;
    }
    // 每条入站消息都会落库 → 全部成功只 debug; 有失败才 warn 提级 (需排查)
    if (failed > 0)
        log.warn(`enrichBatch: ${saved} saved, ${failed} failed (size=${batch.length})`);
    else
        log.debug(`enrichBatch: ${saved} saved, ${failed} failed (size=${batch.length})`);
    return { saved, failed };
}
//# sourceMappingURL=enrich.js.map