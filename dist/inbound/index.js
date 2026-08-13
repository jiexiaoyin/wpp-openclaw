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
export async function handleWebhookPayload(accountId, payload) {
    const msg = payloadToInboundMessage(accountId, payload);
    if (!msg)
        return null;
    const result = await enrichAndSaveMessage(msg);
    if (!result.saved) {
        log.warn(`handleWebhookPayload persist failed: ${result.error}`);
    }
    const state = getDefaultAccountRegistry().get(accountId);
    if (!state)
        return msg;
    const cmdConfig = state.config.commandAllowlist;
    if (cmdConfig) {
        const cmdResult = checkCommandAllowlist(msg.content, cmdConfig);
        if (cmdResult.isCommand && !cmdResult.allowed) {
            log.info(`command blocked: ${cmdResult.name} reason=${cmdResult.reason}`);
            return null;
        }
    }
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
