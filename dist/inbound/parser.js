import { PeerKind } from "../core/constants.js";
function num(v, fallback) {
    if (typeof v === "number")
        return v;
    if (typeof v === "string") {
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
    }
    return fallback;
}
function str(v) {
    return v == null ? "" : String(v);
}
export function payloadToInboundMessage(accountId, payload) {
    try {
        const obj = payload;
        if (obj.EventType === "sync_message" && obj.Data) {
            const dataOuter = obj.Data;
            const dataInner = dataOuter.Data;
            const addMsgs = dataInner?.AddMsgs;
            if (Array.isArray(addMsgs) && addMsgs.length > 0) {
                const msg = addMsgs[0];
                const out = parseBusinessCallbackMsg(accountId, msg);
                return out;
            }
            return null;
        }
        const wrappedData = obj.Data;
        const topMsgType = obj.MessageType;
        let src = obj;
        let msgTypeOverride;
        if (wrappedData && typeof wrappedData === "object" && !Array.isArray(wrappedData)) {
            const hasMsgField = Object.keys(wrappedData).some((k) => /Content|FromWxid|FromUser|MsgId|MsgType|Text/i.test(k));
            if (hasMsgField) {
                src = wrappedData;
                msgTypeOverride = topMsgType;
            }
            else {
                return null;
            }
        }
        const fromWxid = str(src.fromUser ?? src.fromWxid ?? src.fromUserName ?? src.FromWxid ?? src.FromUser);
        if (!fromWxid)
            return null;
        const fromNick = src.fromNick ?? src.fromNickname ?? src.FromNick ?? src.FromNickname;
        const toWxid = src.toWxid ?? src.toUserName ?? src.ToWxid ?? src.ToUserName;
        const chatroomId = src.chatroomId ?? src.roomId ?? src.ChatroomId ?? src.RoomId;
        const chatroomIdStr = chatroomId == null ? undefined : str(chatroomId);
        let msgType = num(src.msgType ?? src.MsgType, 1);
        if (msgTypeOverride !== undefined && msgTypeOverride !== "sync_message") {
            const t = num(msgTypeOverride, msgType);
            if (t !== 1 || msgTypeOverride === "1")
                msgType = t;
        }
        const content = str(src.content ?? src.text ?? src.msg ?? src.Content ?? src.Text);
        const newMsgId = str(src.newMsgId ?? src.NewMsgId);
        const msgId = str(src.msgId ?? src.MsgId) || newMsgId;
        let ts = num(src.ts ?? src.createTime ?? src.Timestamp ?? src.CreateTime, Date.now() / 1000);
        if (ts > 1e12)
            ts = Math.floor(ts / 1000);
        ts = Math.floor(ts);
        const peerKind = chatroomIdStr ? PeerKind.GROUP : PeerKind.DIRECT;
        const peerId = chatroomIdStr ?? fromWxid;
        return {
            accountId,
            msgId: msgId || `${ts}-${Math.random().toString(36).slice(2, 10)}`,
            newMsgId,
            fromWxid,
            fromNickname: fromNick == null ? undefined : str(fromNick),
            chatroomId: chatroomIdStr,
            toWxid: toWxid == null ? undefined : str(toWxid),
            msgType,
            content,
            ts,
            raw: payload,
            peerKind,
            peerId,
            trigger: "direct",
        };
    }
    catch {
        return null;
    }
}
export const parseInbound = payloadToInboundMessage;
function parseV1Message(accountId, msg) {
    const str2 = (v) => {
        if (v == null)
            return undefined;
        return typeof v === "string" ? v : String(v);
    };
    const senderId = str2(msg.sender_id) ?? "";
    const recipientId = str2(msg.recipient_id);
    const direction = str2(msg.direction);
    const conversationIdOrFileHelper = (m) => str2(m.conversation_id) ?? recipientId;
    const kind = str2(msg.kind);
    const msgType = num(msg.type, 1);
    const content = str2(msg.content) ?? "";
    const rawMsgId = str2(msg.id) ?? "";
    const v1NewMsgId = str2(msg.new_msg_id) ?? str2(msg.svr_id) ?? "";
    const createdAt = num(msg.created_at, Date.now() / 1000);
    const isOutgoingImage = direction && direction !== "incoming" && (kind === "image" || msgType === 3);
    const isFileHelper = recipientId === "filehelper" || conversationIdOrFileHelper(msg) === "filehelper";
    const isFileHelperCommand = isFileHelper && /^\s*\//.test(content);
    if (direction && direction !== "incoming" && !isOutgoingImage && !isFileHelperCommand)
        return null;
    if (kind === "status")
        return null;
    if (!senderId)
        return null;
    if (senderId.startsWith("gh_"))
        return null;
    if (msgType === 51)
        return null;
    const conversationId = str2(msg.conversation_id);
    const groupCandidates = [conversationId, recipientId, senderId].filter((v) => typeof v === "string" && v.endsWith("@chatroom"));
    const chatroomWxid = groupCandidates[0];
    const isGroup = msg.is_group === true || chatroomWxid !== undefined;
    const peerKind = isGroup ? PeerKind.GROUP : PeerKind.DIRECT;
    const isFileHelperPeer = conversationId === "filehelper" || recipientId === "filehelper";
    const peerId = chatroomWxid ?? (isFileHelperPeer ? "filehelper" : senderId);
    const ts = Math.floor(createdAt);
    return {
        accountId,
        msgId: rawMsgId || `${ts}-${Math.random().toString(36).slice(2, 10)}`,
        newMsgId: v1NewMsgId,
        fromWxid: senderId,
        fromNickname: undefined,
        chatroomId: chatroomWxid,
        toWxid: recipientId,
        msgType,
        content,
        ts,
        raw: msg,
        peerKind,
        peerId,
        direction: direction === "incoming" ? "inbound" : "outbound",
        trigger: "direct",
    };
}
export function payloadToAllInboundMessages(accountId, payload) {
    try {
        const obj = payload;
        if (obj.EventType === "sync_message" && obj.Data) {
            const dataOuter = obj.Data;
            const out = [];
            const messages = dataOuter.messages;
            if (Array.isArray(messages)) {
                for (const item of messages) {
                    const m = parseV1Message(accountId, item);
                    if (m)
                        out.push(m);
                }
                return out;
            }
            const dataInner = dataOuter.Data;
            const addMsgs = dataInner?.AddMsgs;
            if (Array.isArray(addMsgs) && addMsgs.length > 0) {
                for (const item of addMsgs) {
                    const m = parseBusinessCallbackMsg(accountId, item);
                    if (m)
                        out.push(m);
                }
                return out;
            }
            return [];
        }
        const single = payloadToInboundMessage(accountId, payload);
        return single ? [single] : [];
    }
    catch {
        return [];
    }
}
function parseBusinessCallbackMsg(accountId, msg) {
    const unwrap = (v) => {
        if (v == null)
            return undefined;
        if (typeof v === "string")
            return v;
        if (typeof v === "object" && v !== null && "string" in v) {
            return str(v.string);
        }
        return str(v);
    };
    const fromWxid = unwrap(msg.FromUserName) ?? "";
    const toWxid = unwrap(msg.ToUserName);
    const rawContent = unwrap(msg.Content) ?? "";
    const msgType = num(msg.MsgType, 1);
    const createTime = num(msg.CreateTime, Date.now() / 1000);
    const msgId = str(msg.MsgId);
    const newMsgId = str(msg.NewMsgId);
    if (!fromWxid)
        return null;
    const isGroup = (fromWxid?.endsWith("@chatroom") ?? false) || (toWxid?.endsWith("@chatroom") ?? false);
    const chatroomWxid = fromWxid?.endsWith("@chatroom") ? fromWxid : (toWxid?.endsWith("@chatroom") ? toWxid : undefined);
    const peerKind = isGroup ? PeerKind.GROUP : PeerKind.DIRECT;
    const peerId = isGroup ? (chatroomWxid ?? fromWxid) : fromWxid;
    const content = rawContent;
    return {
        accountId,
        msgId: msgId || newMsgId || `${createTime}-${Math.random().toString(36).slice(2, 10)}`,
        newMsgId,
        fromWxid,
        fromNickname: undefined,
        chatroomId: isGroup ? chatroomWxid : undefined,
        toWxid: toWxid,
        msgType,
        content,
        ts: Math.floor(createTime),
        raw: msg,
        peerKind,
        peerId,
        trigger: "direct",
    };
}
