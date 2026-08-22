import { isBotMentionedByText } from "./parser/mention.js";
import { checkHeartflowGate } from "./heartflow.js";
export function shouldTrigger(msg, cfg, ctx) {
    if (ctx.botWxid && msg.fromWxid === ctx.botWxid) {
        return { triggered: false, via: "blocked" };
    }
    if (msg.peerKind === "group" && cfg.blacklistGroups.includes(msg.chatroomId ?? "")) {
        return { triggered: false, via: "blocked" };
    }
    if (msg.peerKind === "group" && cfg.chatroomDebug) {
        return { triggered: true, via: "at" };
    }
    if (msg.peerKind === "direct") {
        const allow = ctx.allowFrom ?? [];
        if (allow.length === 0 || !allow.includes(msg.fromWxid)) {
            return { triggered: false, via: "blocked" };
        }
        return { triggered: true, via: "at" };
    }
    if (msg.peerKind === "group") {
        const policy = cfg.groupPolicy ?? "open";
        if (policy === "disabled" || policy === "closed") {
            return { triggered: false, via: "blocked" };
        }
        if (policy === "allowlist") {
            const allowGroups = cfg.groupAllowFrom ?? [];
            if (allowGroups.length > 0 && !allowGroups.includes(msg.chatroomId ?? "")) {
                return { triggered: false, via: "blocked" };
            }
        }
    }
    const botMentioned = isBotMentionedByText(msg.content, ctx.botWxid) ||
        (!!ctx.botNickname && msg.content.includes(`@${ctx.botNickname}`));
    if (botMentioned) {
        return { triggered: true, via: "at" };
    }
    if (cfg.msgTypeTrigger.enabled && cfg.msgTypeTrigger.appMsgTypes?.includes(msg.msgType)) {
        if (msg.peerKind === "group" &&
            cfg.msgTypeTrigger.whitelistGroups &&
            cfg.msgTypeTrigger.whitelistGroups.length > 0 &&
            !cfg.msgTypeTrigger.whitelistGroups.includes(msg.chatroomId ?? "")) {
        }
        else {
            return { triggered: true, via: "msgType" };
        }
    }
    if (cfg.quoteBotTrigger.enabled && isQuoteRefToBot(msg.content, ctx.botWxid)) {
        return { triggered: true, via: "quoteBot" };
    }
    if (cfg.keywordTrigger.enabled && cfg.keywordTrigger.keywords.length > 0) {
        if (matchKeyword(msg.content, cfg.keywordTrigger)) {
            return { triggered: true, via: "keyword" };
        }
    }
    if (msg.peerKind === "group" && cfg.heartflow?.enabled) {
        const gate = checkHeartflowGate(msg.chatroomId ?? msg.peerId, msg.content ?? "", cfg.heartflow, Date.now());
        if (gate.allowed) {
            return { triggered: true, via: "heartflow" };
        }
    }
    return { triggered: false, via: null };
}
function isQuoteRefToBot(content, botWxid) {
    if (!botWxid)
        return false;
    const m = content.match(/<refermsg\b[^>]*>[\s\S]*?<(?:fromusr|fromusername)>([\s\S]*?)<\/(?:fromusr|fromusername)>/);
    return !!(m && m[1] && m[1].trim() === botWxid);
}
function matchKeyword(content, kw) {
    const mode = kw.mode ?? "contains";
    for (const k of kw.keywords) {
        if (!k)
            continue;
        if (mode === "exact" && content.trim() === k)
            return true;
        if (mode === "contains" && content.includes(k))
            return true;
        if (mode === "regex") {
            try {
                const re = new RegExp(k);
                if (re.test(content))
                    return true;
            }
            catch {
            }
        }
    }
    return false;
}
export function defaultTriggerConfig() {
    return {
        requireAtMention: false,
        keywordTrigger: { enabled: false, keywords: [], mode: "contains" },
        msgTypeTrigger: { enabled: false, appMsgTypes: [] },
        quoteBotTrigger: { enabled: false },
        blacklistGroups: [],
        chatroomDebug: false,
        groupPolicy: "open",
        groupAllowFrom: [],
        heartflow: { enabled: false },
    };
}
