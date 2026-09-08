// src/inbound/parser.ts - vendor JSON payload → normalized WppInboundMessage
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
/**
 * Convert vendor payload (a flat JSON object with various field aliases) to
 * a normalized WppInboundMessage.
 *
 * Vendor field conventions (sampled from swagger.json 2026-08-04):
 *   - fromUser / fromWxid / fromUserName : sender wxid
 *   - fromNick / fromNickname : sender nick
 *   - toWxid / toUserName : receiver (self) wxid
 *   - msgType : numeric (1=text, 3=image, 34=voice, 43=video, 47=emoji)
 *   - content / text / msg : payload body
 *   - msgId : varchar (often 16+ digit integer as string already)
 *   - newMsgId : secondary id
 *   - ts / createTime : epoch seconds (sometimes ms; detect via magnitude)
 *   - chatroomId / roomId : group id (presence implies group message)
 */
export function payloadToInboundMessage(accountId, payload) {
    try {
        const obj = payload;
        // vendor 业务回调: { Wxid, EventType, Timestamp, Data: { ..., Data: { AddMsgs: [...] } } }
        // 消息在 AddMsgs[] → 取第一条
        if (obj.EventType === "sync_message" && obj.Data) {
            const dataOuter = obj.Data;
            const dataInner = dataOuter.Data;
            const addMsgs = dataInner?.AddMsgs;
            if (Array.isArray(addMsgs) && addMsgs.length > 0) {
                const msg = addMsgs[0];
                const out = parseBusinessCallbackMsg(accountId, msg);
                return out;
            }
            return null; // 无 AddMsgs 不认
        }
        // vendor webhook 推送: 顶层 Wxid + Data 内层消息
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
        // 群聊 peerId = chatroomId; 私聊先 fallback fromWxid (peerId 方向修正见 handler.ts selfWxid 判断)
        const peerId = chatroomIdStr ?? fromWxid;
        return {
            accountId,
            msgId: msgId || `${ts}-${Math.random().toString(36).slice(2, 10)}`, // 防空 msgId 炸 DB
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
            trigger: "direct", // 后续 inbound/handler.ts 触发器模块覆盖
        };
    }
    catch {
        return null;
    }
}
/** Backward-compat alias */
export const parseInbound = payloadToInboundMessage;
/**
 * 解析 vendor v1 消息格式 (schema=wechatpad.message.v1):
 *   { content, conversation_id, created_at, direction, id, is_group, kind,
 *     local_id, recipient_id, sender_id, status, type }
 * 过滤规则 (只保留可交互入站): 非 incoming / kind=status / sender_id 以 gh_ 开头 / type=51 → null
 */
function parseV1Message(accountId, msg) {
    const str2 = (v) => {
        if (v == null)
            return undefined;
        return typeof v === "string" ? v : String(v);
    };
    const senderId = str2(msg.sender_id) ?? "";
    const recipientId = str2(msg.recipient_id);
    const direction = str2(msg.direction);
    /** filehelper 会话识别 (conversation_id 或 recipient_id = filehelper) */
    const conversationIdOrFileHelper = (m) => str2(m.conversation_id) ?? recipientId;
    const kind = str2(msg.kind);
    const msgType = num(msg.type, 1);
    const content = str2(msg.content) ?? "";
    const rawMsgId = str2(msg.id) ?? "";
    const v1NewMsgId = str2(msg.new_msg_id) ?? str2(msg.svr_id) ?? "";
    const createdAt = num(msg.created_at, Date.now() / 1000);
    // 过滤: 非入站 / 系统状态 / 公众号 / 系统操作
    // v1.3.21 REVOKE-FIX (2026-08-10): 放行 outgoing 图片 (kind=image / msgType=3) —
    //   插件自己发的图片, vendor 会推送回 WPP (business callback), 过滤掉就拿不到真实 server ID,
    //   图片撤回需要它 (UploadImg 返回的 Newmsgid 是上传凭证, 非 server 消息 ID)。
    //   其它 outgoing (文本/语音/视频) 仍过滤 (AI 回复进上下文会混乱)。
    const isOutgoingImage = direction && direction !== "incoming" && (kind === "image" || msgType === 3);
    // v1.3.39 FILEHELPER (老板 2026-08-11): filehelper 只放行**命令** (非命令仍过滤)
    //   老板在机器人手机的文件传输助手里发命令 (/genpair 等) → 放行; 普通消息不放行 (不进 AI)
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
    // 群聊必须按 groupId 建 session (否则按人拆, 群上下文串台): 优先级 conversation_id > recipient_id > sender_id
    const conversationId = str2(msg.conversation_id);
    const groupCandidates = [conversationId, recipientId, senderId].filter((v) => typeof v === "string" && v.endsWith("@chatroom"));
    const chatroomWxid = groupCandidates[0];
    const isGroup = msg.is_group === true || chatroomWxid !== undefined;
    const peerKind = isGroup ? PeerKind.GROUP : PeerKind.DIRECT;
    // v1.3.39 FILEHELPER: filehelper 特殊会话 peerId=filehelper (命令处理识别用)
    //   (senderId 是机器人自己, 若用 senderId 作 peerId 会无法识别 filehelper 会话)
    const isFileHelperPeer = conversationId === "filehelper" || recipientId === "filehelper";
    // 群聊 peerId=groupId; 私聊先 fallback senderId (方向修正见 handler.ts selfWxid 判断)
    const peerId = chatroomWxid ?? (isFileHelperPeer ? "filehelper" : senderId);
    const ts = Math.floor(createdAt);
    // content 是 XML 时保留原文 (上层 quoteBot / XML 解析处理)
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
        // v1.3.21 REVOKE-FIX: 透传 direction (outgoing 图片需标 outbound, enrich 入库方向才正确)
        direction: direction === "incoming" ? "inbound" : "outbound",
        trigger: "direct",
    };
}
export function payloadToAllInboundMessages(accountId, payload) {
    try {
        const obj = payload;
        // 业务回调逐条 parse, 支持两种 vendor 格式: v1 Data.messages[] / 旧 Data.Data.AddMsgs[]
        if (obj.EventType === "sync_message" && obj.Data) {
            const dataOuter = obj.Data;
            const out = [];
            // v1 格式: Data.messages[] (wechatpad.message.v1 schema)
            const messages = dataOuter.messages;
            if (Array.isArray(messages)) {
                for (const item of messages) {
                    const m = parseV1Message(accountId, item);
                    if (m)
                        out.push(m);
                }
                return out;
            }
            // 旧格式: Data.Data.AddMsgs[]
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
        // 其他格式走原 parser (取一条)
        const single = payloadToInboundMessage(accountId, payload);
        return single ? [single] : [];
    }
    catch {
        return [];
    }
}
/**
 * 解析 vendor business callback 单条消息
 * vendor 字段都是 {string: "..."} 包装 (内部 JSON 序列化); MsgType=1 纯文本, 其他是 XML
 *   - FromUserName/ToUserName/Content → 解包 {string: ...} 为字符串
 *   - NewMsgId 大整数 (注意精度)
 *   - 群聊识别: FromUserName/ToUserName 结尾 "@chatroom"
 */
function parseBusinessCallbackMsg(accountId, msg) {
    // 解包 vendor {string: "..."} 包装
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
    // 群聊识别: FromUserName 或 ToUserName 结尾是 "@chatroom"
    const isGroup = (fromWxid?.endsWith("@chatroom") ?? false) || (toWxid?.endsWith("@chatroom") ?? false);
    const chatroomWxid = fromWxid?.endsWith("@chatroom") ? fromWxid : (toWxid?.endsWith("@chatroom") ? toWxid : undefined);
    const peerKind = isGroup ? PeerKind.GROUP : PeerKind.DIRECT;
    const peerId = isGroup ? (chatroomWxid ?? fromWxid) : fromWxid;
    // Content 处理: MsgType=1 纯文本, MsgType=51/47/etc 是 XML
    // 业务回调直接保留原文 (后续 dispatcher 根据 msgType 处理 XML / 提取文本)
    const content = rawContent;
    return {
        accountId,
        msgId: msgId || newMsgId || `${createTime}-${Math.random().toString(36).slice(2, 10)}`,
        newMsgId,
        fromWxid,
        fromNickname: undefined, // business callback 未提供 nickname
        chatroomId: isGroup ? chatroomWxid : undefined,
        toWxid: toWxid,
        msgType,
        content,
        ts: Math.floor(createTime),
        raw: msg,
        peerKind,
        peerId,
        trigger: "direct", // 后续 handler 触发器模块覆盖
    };
}
//# sourceMappingURL=parser.js.map