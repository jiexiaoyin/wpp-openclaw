import { warn, info, formatErr } from "../core/logger.js";
export function isRedPacketMessage(msg) {
    if (typeof msg.content === "string" && /红包|red.?packet/i.test(msg.content)) {
        return true;
    }
    const appMsg = msg.raw.appMsg;
    if (appMsg && (appMsg.type === 2002 || appMsg.type === "2002")) {
        return true;
    }
    if (typeof msg.raw.type === "string") {
        const t = msg.raw.type;
        if (/hongbao|redpacket/i.test(t))
            return true;
    }
    const app = msg.raw.app;
    if (app && typeof app.category === "string") {
        if (/payment_notice|transfer|pay/i.test(app.category))
            return true;
        if (typeof app.description === "string" && /转账|收款|transfer/i.test(app.description))
            return true;
    }
    return false;
}
export function extractRedPacketInfo(msg) {
    const raw = msg.raw;
    const hb = raw.hongbao;
    if (hb && typeof hb.url === "string" && typeof hb.key === "string") {
        return { url: hb.url, key: hb.key, shouldOpen: false };
    }
    const appMsg = raw.appMsg;
    if (appMsg) {
        const info = appMsg.hongbaoInfo;
        if (info && typeof info.url === "string" && typeof info.key === "string") {
            return { url: info.url, key: info.key, shouldOpen: false };
        }
    }
    return { shouldOpen: false };
}
export function processRedPacket(msg, onExtract) {
    if (!isRedPacketMessage(msg)) {
        return { shouldOpen: false };
    }
    const result = extractRedPacketInfo(msg);
    info(`red packet detected: account=${msg.accountId} peer=${msg.peerId} url=${result.url ? "present" : "missing"}`);
    if (onExtract) {
        try {
            const r = onExtract(result);
            if (r && typeof r.then === "function") {
                r.catch((e) => warn(`redPacket onExtract error: ${formatErr(e)}`));
            }
        }
        catch (e) {
            warn(`redPacket onExtract sync error: ${formatErr(e)}`);
        }
    }
    return result;
}
