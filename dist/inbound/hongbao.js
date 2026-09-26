// src/inbound/hongbao.ts - 红包 (red packet) 检测 + 业务逻辑
// 红包消息有特定 msgType (appmsg subtype) 或 content 含特定 marker; 提供 detect + 处理建议 (不自动拆)
import { warn, info, formatErr } from "../core/logger.js";
import { isRelayMessage } from "./relay.js";
/**
 * v1.9.2: 是否"卡片类" App 消息 (msgType=49)
 * 红包/转账/接龙/小程序/文件/链接 这些**被包装过**的消息都由 49 承载 (正文里含 XML/摘要),
 * 纯文本 (1) / 图片 (3) / 表情 (47) 等不是卡片。判定放在这里而不是散在各处, 是为了让
 * "哪些启发式只对卡片成立"这件事有单一可读的来源。
 */
function isCardMessage(msg) {
    return msg.msgType === 49;
}
/**
 * 检测消息是否是红包
 * - msgType 包含 "hongbao" / "redpacket" (vendor-specific)
 * - content 含 "红包" 关键字 (heuristic, 可能误判但够安全)
 * - raw.appmsg.type === 2002 (微信原生 red packet type)
 */
export function isRedPacketMessage(msg) {
    // v1.9.1 接龙优先 (2026-09-27 老板报"昨晚接龙没回复"): 群接龙文案**自带"红包"字样**
    //   (如 "提升业绩, 领取红包🧧" / "红包100元"), 而下面的 heuristic 1 是**内容关键词**判定 ⇒ 接龙被误判成红包;
    //   handler 两处红包拦截 (静默入库 / 不触发 AI) 于是把接龙**整条丢掉且无任何报错**。
    //   实测 (只读回放生产账本): 接龙文案加上"红包"二字之后的那批接龙**条条零回复**, 而此前不带"红包"的
    //   接龙条条有回复, 相关性是完美对应的; 且日志只留一行 "red packet detected: … url=missing" ——
    //   看着像"来了个没 url 的红包", 极易误诊成 vendor 侧问题。
    //   结构性识别 (msgType===49 + "#接龙") 比关键词启发式可靠得多, 必须优先。
    if (isRelayMessage(msg))
        return false;
    // heuristic 1: content 含 "红包" 关键字 —— v1.9.2 起**只在卡片类消息上采信** (老板 2026-09-27 拍板)
    //   真红包在本系统里是 App 卡片 (msgType=49), 正文由厂商译成"微信红包"四字; 而**纯文本**里出现
    //   "红包"二字绝大多数是人在聊天 (如"@某某 群收红包"/"抓紧领大红包"), 拿关键词静默它们 = 把群友的话吞了。
    //   实测 (只读回放生产账本): 真红包**全部**是卡片形态 (msgType=49), 纯文本形态**一条没有**
    //   ⇒ 收窄=零漏判, 同时救回一批被误吞的群聊。若将来厂商改用纯文本推红包卡片, 这条注释就是排查入口。
    if (typeof msg.content === "string" && /红包|red.?packet/i.test(msg.content) && isCardMessage(msg)) {
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