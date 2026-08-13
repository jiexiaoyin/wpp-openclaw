import { isBotMentionedByText, cleanGroupMessage } from "./parser/mention.js";
export function checkGroupPolicy(opts) {
    const { msg, policy, groupAllowFrom, requireAtMention, selfWxid } = opts;
    if (policy === "disabled") {
        return { allowed: false, reason: "groupPolicy=disabled" };
    }
    if (policy === "allowlist") {
        const chatroomId = msg.chatroomId;
        if (groupAllowFrom.length > 0 &&
            chatroomId &&
            !groupAllowFrom.includes(chatroomId)) {
            return { allowed: false, reason: `groupAllowFrom mismatch: ${chatroomId}` };
        }
    }
    if (policy === "closed") {
        return { allowed: false, reason: "groupPolicy=closed (not implemented, fail-closed)" };
    }
    if (requireAtMention) {
        if (!isBotMentionedByText(msg.content, selfWxid)) {
            return { allowed: false, reason: "requireAtMention but bot not @-ed" };
        }
        const cleaned = cleanGroupMessage(msg.content, selfWxid);
        if (cleaned !== msg.content) {
            return { allowed: true, cleanedContent: cleaned };
        }
    }
    return { allowed: true };
}
