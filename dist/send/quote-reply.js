export function buildGroupMentionPrefix(toWxid, content, displayName, fromusr) {
    if (!toWxid.endsWith("@chatroom"))
        return content;
    const atName = displayName && displayName !== fromusr ? displayName : (fromusr ?? "");
    if (!atName)
        return content;
    return `@${atName} ${content}`.trim();
}
import { getMessageByMsgIdOrNewId, saveMessage } from "../db.js";
import { postWppJson } from "../api/client.js";
import { buildQuoteReplyXml } from "./quote-xml.js";
import { resolveQuoteSvrid } from "../inbound/quote-svrid.js";
import { getDefaultAccountRegistry } from "../account-state.js";
import { info, warn, formatErr } from "../core/logger.js";
async function persistQuoteReply(acct, toWxid, content, resp) {
    try {
        if (resp.Code !== 0)
            return;
        const d = (resp.Data ?? {});
        await saveMessage({
            account_id: acct,
            msg_id: d.msgId != null ? String(d.msgId) : null,
            new_msg_id: d.newMsgId != null ? String(d.newMsgId) : null,
            direction: "outbound",
            peer_kind: toWxid.endsWith("@chatroom") ? "group" : "direct",
            peer_id: toWxid,
            msg_type: "quote",
            content,
        });
        info(`[WPP v1.3.16 OUTBOUND-PERSIST] saved quote reply → ${toWxid} msgId=${String(d.msgId ?? "")}`);
    }
    catch (e) {
        warn(`[WPP v1.3.16 OUTBOUND-PERSIST] persist quote reply failed (non-fatal): ${formatErr(e)}`);
    }
}
const nicknameCache = new Map();
const NICKNAME_CACHE_TTL_MS = 30 * 60 * 1000;
async function resolveDisplayName(acct, wxid) {
    if (!wxid || wxid.endsWith("@chatroom"))
        return undefined;
    const cacheKey = `${acct}:${wxid}`;
    const cached = nicknameCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < NICKNAME_CACHE_TTL_MS)
        return cached.nick;
    try {
        const state = getDefaultAccountRegistry().get(acct);
        const cfg = state?.config;
        const resp = await postWppJson(cfg?.apiBaseUrl ?? "", "/Friend/GetContractDetail", { userName: wxid }, { tokenKey: cfg?.tokenKey ?? "", authcode: cfg?.authcode ?? "", timeoutMs: 5000, maxRetries: 0 });
        const nick = resp.Data?.ContactList?.[0]?.NickName?.string;
        if (nick) {
            nicknameCache.set(cacheKey, { nick, ts: Date.now() });
            return nick;
        }
    }
    catch {
    }
    return undefined;
}
export function stripGroupContentPrefix(content) {
    if (!content)
        return content;
    const m = content.match(/^[a-zA-Z0-9_@:-]+:\n([\s\S]*)$/);
    if (m && m[1])
        return m[1].trim();
    return content;
}
export function extractGroupSenderWxid(content) {
    if (!content)
        return undefined;
    const m = content.match(/^(wxid_[a-zA-Z0-9_]+|gh_[a-zA-Z0-9_]+|[a-zA-Z0-9_]+@chatroom):\n/);
    if (m && m[1])
        return m[1];
    return undefined;
}
export async function quoteReply(params) {
    const { toWxid, content, msgId, newMsgId, accountId, fromWxid, chatroomId, fromNickname, originalContent, createtime, innerType, } = params;
    const acct = accountId ?? "default";
    let paramsFromNicknameFallback;
    const paramFromWxidValid = fromWxid && !fromWxid.endsWith("@chatroom") ? fromWxid : undefined;
    let svrid = newMsgId || msgId || "";
    let dbFromWxid = paramFromWxidValid;
    let dbChatroomId = chatroomId;
    let dbOriginalContent = stripGroupContentPrefix(originalContent);
    let dbCreatetime = createtime;
    let dbInnerType = innerType;
    try {
        const rec = await getMessageByMsgIdOrNewId(msgId, newMsgId, acct, { direction: "any" });
        if (rec) {
            const mappedSvrid = await resolveQuoteSvrid(msgId, newMsgId, rec.content ?? undefined, acct);
            if (mappedSvrid && mappedSvrid !== msgId) {
                svrid = mappedSvrid;
            }
            const raw = (rec.raw_payload ?? {});
            const rawSenderId = (typeof raw.sender_id === "string" ? raw.sender_id : undefined) ??
                (typeof raw.fromUser === "string" ? raw.fromUser : undefined) ??
                (typeof raw.FromWxid === "string" ? raw.FromWxid : undefined) ??
                (typeof raw.fromWxid === "string" ? raw.fromWxid : undefined);
            const isGroupRec = rec.peer_kind === "group";
            dbFromWxid =
                dbFromWxid ??
                    rawSenderId ??
                    extractGroupSenderWxid(rec.content ?? undefined) ??
                    (isGroupRec ? undefined : (rec.peer_id ?? undefined));
            dbChatroomId = dbChatroomId ?? (isGroupRec ? (rec.chat_id ?? undefined) : (rec.peer_id ?? undefined));
            dbOriginalContent = dbOriginalContent ?? stripGroupContentPrefix(rec.content ?? undefined);
            dbCreatetime = dbCreatetime ?? rec.ts;
            dbInnerType = dbInnerType ?? (rec.msg_type ? parseInt(rec.msg_type, 10) : undefined);
            if (!fromNickname && rec.peer_name) {
                paramsFromNicknameFallback = rec.peer_name;
            }
        }
    }
    catch {
    }
    const displayName = fromNickname ||
        paramsFromNicknameFallback ||
        (await resolveDisplayName(acct, dbFromWxid));
    const quote = {
        svrid,
        fromusr: dbFromWxid,
        chatusr: dbChatroomId ?? toWxid,
        displayname: displayName,
        content: dbOriginalContent,
        createtime: dbCreatetime,
        innerType: dbInnerType,
    };
    const finalContent = buildGroupMentionPrefix(toWxid, content, displayName, quote.fromusr);
    const xml = buildQuoteReplyXml(finalContent, quote);
    const state = getDefaultAccountRegistry().get(acct);
    const cfg = state?.config;
    info(`[WPP v1.2.0 QUOTE-TITLE-FIX] quoteReply ShareLink type=57: to=${toWxid} svrid=${svrid} (title=AI reply + svrid+fromusr refermsg)`);
    info(`[WPP v1.2.0 QUOTE-TITLE-FIX] quoteReply XML (first 800 chars): ${xml.slice(0, 800).replace(/\n/g, "\\n")}`);
    info(`[WPP v1.2.0 QUOTE-TITLE-FIX] quoteReply XML totalLen=${xml.length}`);
    const resp = await postWppJson(cfg?.apiBaseUrl ?? "", "/Msg/ShareLink", {
        ToWxid: toWxid,
        Type: 5,
        Xml: xml,
    }, {
        tokenKey: cfg?.tokenKey ?? "",
        authcode: cfg?.authcode ?? "",
        timeoutMs: 30000,
    });
    const d = (resp.Data ?? {});
    const baseRespRet = d.BaseResponse?.ret;
    info(`[WPP v1.2.0 REVERT] vendor resp: Code=${resp.Code} ret=${baseRespRet} msgId=${d.msgId ?? 0} newMsgId=${d.newMsgId ?? 0} type=${d.type ?? 0}`);
    const ok = (resp.Code === 0 || resp.Code === 200) && (baseRespRet === 0 || baseRespRet === undefined);
    if (ok)
        await persistQuoteReply(acct, toWxid, content, resp);
    return {
        ok,
        msg: ok ? "引用回复已发送" : `发送失败 Code=${resp.Code} ${resp.CodeValue ?? ""}`,
        data: resp.Data,
    };
}
