import { logObj as log, formatErr } from "../core/logger.js";
import { saveMessage } from "../db.js";
export async function enrichAndSaveMessage(msg) {
    try {
        await saveMessage({
            account_id: msg.accountId,
            msg_id: msg.msgId,
            new_msg_id: msg.newMsgId,
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
export async function enrichBatch(batch) {
    const results = await Promise.all(batch.map((msg) => enrichAndSaveMessage(msg)));
    let saved = 0;
    let failed = 0;
    for (const r of results) {
        if (r.saved)
            saved++;
        else
            failed++;
    }
    log.info(`enrichBatch: ${saved} saved, ${failed} failed (size=${batch.length})`);
    return { saved, failed };
}
