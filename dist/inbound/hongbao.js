// src/inbound/hongbao.ts - 红包 (red packet) 检测 + 业务逻辑
// 红包消息有特定 msgType (appmsg subtype) 或 content 含特定 marker; 提供 detect + 处理建议 (不自动拆)
import { warn, info, formatErr } from "../core/logger.js";
/**
 * 检测消息是否是红包
 * - msgType 包含 "hongbao" / "redpacket" (vendor-specific)
 * - content 含 "红包" 关键字 (heuristic, 可能误判但够安全)
 * - raw.appmsg.type === 2002 (微信原生 red packet type)
 */
export function isRedPacketMessage(msg) {
    // heuristic 1: content 含 "红包" 关键字
    if (typeof msg.content === "string" && /红包|red.?packet/i.test(msg.content)) {
        return true;
    }
    // heuristic 2: raw.appmsg.type === 2002 (微信 native red packet)
    const appMsg = msg.raw.appMsg;
    if (appMsg && (appMsg.type === 2002 || appMsg.type === "2002")) {
        return true;
    }
    // heuristic 3: raw.type 含 "hongbao" (vendor 私有)
    if (typeof msg.raw.type === "string") {
        const t = msg.raw.type;
        if (/hongbao|redpacket/i.test(t))
            return true;
    }
    // v1.3.72 转账/支付通知 (v1 schema: app.category === "payment_notice", 如 "收到转账10.00元") 也静默 (老板 2026-08-20)
    //   转账与红包同属支付类 app 消息, 推送简化无 transFerId/transactionId, 不触发 AI 回复
    const app = msg.raw.app;
    if (app && typeof app.category === "string") {
        if (/payment_notice|transfer|pay/i.test(app.category))
            return true;
        if (typeof app.description === "string" && /转账|收款|transfer/i.test(app.description))
            return true;
    }
    return false;
}
/**
 * 从 raw payload 提取红包信息 (url + key for OpenHongBao)
 * vendor 推送时, 红包信息可能在 raw.hongbao / raw.appmsg.hongbaoInfo
 */
export function extractRedPacketInfo(msg) {
    const raw = msg.raw;
    // 路径 1: raw.hongbao.url + raw.hongbao.key
    const hb = raw.hongbao;
    if (hb && typeof hb.url === "string" && typeof hb.key === "string") {
        return { url: hb.url, key: hb.key, shouldOpen: false };
    }
    // 路径 2: raw.appMsg.hongbaoInfo
    const appMsg = raw.appMsg;
    if (appMsg) {
        const info = appMsg.hongbaoInfo;
        if (info && typeof info.url === "string" && typeof info.key === "string") {
            return { url: info.url, key: info.key, shouldOpen: false };
        }
    }
    return { shouldOpen: false };
}
/**
 * v1.1.7: 红包消息处理 (handler 调用, 默认仅 log)
 * - 检测到: log + 提取 url/key (供后续业务使用)
 * - 未来可加 shouldOpen 配置 (AI 决策 / 用户配置)
 */
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
//# sourceMappingURL=hongbao.js.map