// src/inbound/index.ts - 顶层 barrel
// 提供 `import { ... } from "../inbound/index.js"` 给老代码
import { payloadToInboundMessage } from "./parser.js";
import { parseRelayText } from "./relay.js";
import { enrichAndSaveMessage } from "./enrich.js";
import { getDefaultAccountRegistry } from "../account-state.js";
import { logObj as log } from "../core/logger.js";
import { createWppInboundHandler } from "./handler.js";
import { defaultTriggerConfig, shouldTrigger } from "./triggers.js";
import { WppInboundDebouncer } from "./debouncer.js";
import { extractAtUserList, isBotMentionedByText } from "./parser/mention.js";
import { checkGroupPolicy } from "./group-policy.js";
import { checkDmPolicy } from "./dm-policy.js";
import { checkCommandAllowlist } from "./commands.js";
import { parseQuoteXml } from "./parser/quote.js";
import { stripGroupPrefix, describeMsgType } from "./parser/content.js";
import { isValidWxid, isGroupWxid, isValidAtUser } from "./parser/wxid.js";
export { payloadToInboundMessage as parseInbound, createWppInboundHandler, defaultTriggerConfig, shouldTrigger, WppInboundDebouncer, extractAtUserList, isBotMentionedByText, parseQuoteXml, stripGroupPrefix, describeMsgType, isValidWxid, isGroupWxid, isValidAtUser, parseRelayText, enrichAndSaveMessage, };
/**
 * 老 handleWebhookPayload 入口 (compat for src/index.ts)
 * Phase D 升级: parse + persist + DM/group policy 判定, 不实际 dispatcher (Phase F 接入)
 */
export async function handleWebhookPayload(accountId, payload) {
    const msg = payloadToInboundMessage(accountId, payload);
    if (!msg)
        return null;
    const state = getDefaultAccountRegistry().get(accountId);
    // 2026-09-13: enrichAndSaveMessage 不再收 heartflow cfg (其"独立心流 trigger"路径已删, 只落库)
    const result = await enrichAndSaveMessage(msg);
    if (!result.saved) {
        log.warn(`handleWebhookPayload persist failed: ${result.error}`);
    }
    if (!state)
        return msg;
    // v1.1.39 SUNNOY-COMMANDS: 命令白名单检查 (sunnoy/wecom commands.js 范式)
    //   检查顺序: 命令白名单在 group/DM policy 之前
    //   命令且不在白名单 → return null 阻止 dispatch
    //   注: 当前不发 blockMessage (无 sendReply 通道), 仅静默拒绝
    //     未来可接入 sendReply 发友好提示 (v1.1.40+ 待评估)
    const cmdConfig = state.config.commandAllowlist;
    if (cmdConfig) {
        const cmdResult = checkCommandAllowlist(msg.content, cmdConfig);
        if (cmdResult.isCommand && !cmdResult.allowed) {
            log.info(`command blocked: ${cmdResult.name} reason=${cmdResult.reason}`);
            return null;
        }
    }
    // v1.1.39 SUNNOY-DM-POLICY: DM 策略 (sunnoy/wecom dm-policy.js 范式)
    if (msg.peerKind === "direct") {
        const dmResult = checkDmPolicy({
            msg,
            allowFrom: state.config.allowFrom ?? [],
            adminUsers: state.config.adminUsers ?? [],
        });
        if (!dmResult.allowed) {
            log.info(`dm blocked: ${msg.fromWxid} reason=${dmResult.reason}`);
            return null;
        }
    }
    // v1.1.39 SUNNOY-GROUP-POLICY: 群聊策略 (sunnoy/wecom group-policy.js 范式)
    if (msg.peerKind === "group") {
        const grpResult = checkGroupPolicy({
            msg,
            policy: state.config.groupPolicy,
            groupAllowFrom: state.config.groupAllowFrom ?? [],
            requireAtMention: state.config.requireAtMention,
            selfWxid: state.selfWxid,
        });
        if (!grpResult.allowed) {
            log.info(`group blocked: ${msg.chatroomId} reason=${grpResult.reason}`);
            return null;
        }
        // SUNNOY-GROUP-CONTENT 范式: 应用清洗后的 content (给 AI 看)
        if (grpResult.cleanedContent !== undefined) {
            const originalContent = msg.content;
            msg.content = grpResult.cleanedContent;
            log.debug(`group content cleaned: "${originalContent.slice(0, 40)}" → "${msg.content.slice(0, 40)}"`);
        }
    }
    log.info(`inbound: account=${msg.accountId} peer=${msg.peerKind}/${msg.peerId} ` +
        `from=${msg.fromWxid} type=${msg.msgType} text=${msg.content.slice(0, 50)}`);
    return msg;
}
//# sourceMappingURL=index.js.map