// src/inbound/parser.ts - vendor JSON payload → normalized WppInboundMessage
// 范式仿 本项目/src/inbound/parser/payload.ts
// 关键: 大整数预引号化 (vendor 返回 msgId 不丢精度), 触发源暂标记 "direct" (Phase D 升级为 4-way)

import { PeerKind } from "../core/constants.js";
import type { WppInboundMessage, WppWebhookPayload } from "../types.js";

function num(v: unknown, fallback: number): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function str(v: unknown): string {
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
export function payloadToInboundMessage(
  accountId: string,
  payload: WppWebhookPayload,
): WppInboundMessage | null {
  try {
    const obj = payload as Record<string, unknown>;

    // v1.1.15 BUSINESS-CB (2026-08-08 接总立 老板 15:19): vendor 业务回调真实 payload 结构
    //   { Wxid, EventType, Timestamp, Data: { Code, Success, Message, Data: { AddMsgs: [...], ... } } }
    //   消息在 AddMsgs[] 数组里 → 返回第一条 (每条一条 inbound, 多条让上层递归循环)
    //   之前假设顶层/扁平都不对 → parser 丢全部业务回调消息
    if (obj.EventType === "sync_message" && obj.Data) {
      const dataOuter = obj.Data as Record<string, unknown>;
      const dataInner = dataOuter.Data as Record<string, unknown> | undefined;
      const addMsgs = dataInner?.AddMsgs;
      if (Array.isArray(addMsgs) && addMsgs.length > 0) {
        const msg = addMsgs[0] as Record<string, unknown>;
        const out = parseBusinessCallbackMsg(accountId, msg);
        return out;
      }
      return null; // 无 AddMsgs 不认
    }

    // v1.1.15 WEBHOOK-WRAP (vendor /Webhook/Set 推送): 顶层 Wxid + Data 内层消息
    const wrappedData = obj.Data as Record<string, unknown> | undefined;
    const topMsgType = obj.MessageType;
    let src: Record<string, unknown> = obj;
    let msgTypeOverride: unknown;

    if (wrappedData && typeof wrappedData === "object" && !Array.isArray(wrappedData)) {
      const hasMsgField = Object.keys(wrappedData).some((k) =>
        /Content|FromWxid|FromUser|MsgId|MsgType|Text/i.test(k),
      );
      if (hasMsgField) {
        src = wrappedData;
        msgTypeOverride = topMsgType;
      } else {
        return null;
      }
    }

    const fromWxid = str(src.fromUser ?? src.fromWxid ?? src.fromUserName ?? src.FromWxid ?? src.FromUser);
    if (!fromWxid) return null;

    const fromNick = src.fromNick ?? src.fromNickname ?? src.FromNick ?? src.FromNickname;
    const toWxid = src.toWxid ?? src.toUserName ?? src.ToWxid ?? src.ToUserName;
    const chatroomId = src.chatroomId ?? src.roomId ?? src.ChatroomId ?? src.RoomId;
    const chatroomIdStr = chatroomId == null ? undefined : str(chatroomId);

    let msgType = num(src.msgType ?? src.MsgType, 1);
    if (msgTypeOverride !== undefined && msgTypeOverride !== "sync_message") {
      const t = num(msgTypeOverride, msgType);
      if (t !== 1 || msgTypeOverride === "1") msgType = t;
    }
    const content = str(src.content ?? src.text ?? src.msg ?? src.Content ?? src.Text);

    const newMsgId = str(src.newMsgId ?? src.NewMsgId);
    const msgId = str(src.msgId ?? src.MsgId) || newMsgId;

    let ts = num(src.ts ?? src.createTime ?? src.Timestamp ?? src.CreateTime, Date.now() / 1000);
    if (ts > 1e12) ts = Math.floor(ts / 1000);
    ts = Math.floor(ts);

    const peerKind = chatroomIdStr ? PeerKind.GROUP : PeerKind.DIRECT;
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
  } catch {
    return null;
  }
}

/** Backward-compat alias */
export const parseInbound = payloadToInboundMessage;

/**
 * v1.1.15 BUSINESS-CB (2026-08-08): 从 payload 提取所有消息 (处理 AddMsgs[] 多条)
 * 业务回调可能 AddMsgs 含 1..N 条, 普通 webhook 含 1 条
 * 返回空数组 表示跳过 (sync_message 空 / 其他类型)
 */

/**
 * v1.1.17 FULL-FIX (P1, 2026-08-08 老板指令): 解析 vendor v1 真实消息格式
 * 真实 payload (17:20 日志实测, schema=wechatpad.message.v1):
 *   {
 *     content: string,             // 文本原文 / XML
 *     conversation_id: string,     // 会话 id (gh_=公众号, wxid_=好友, xxx@chatroom=群)
 *     created_at: number,          // epoch 秒
 *     direction: "incoming"|"outgoing",
 *     id: "2371605221780442944",   // 大整数 msgId (字符串)
 *     is_group: boolean,
 *     kind: "status"|"text"|"image"|...,
 *     local_id: number,
 *     recipient_id: string,        // 接收者 wxid (self 或群)
 *     sender_id: string,           // 发送者 wxid
 *     status: number,
 *     type: number                 // 1=文本, 51=系统操作, etc.
 *   }
 * 过滤规则 (只保留可交互的入站消息):
 *   - direction !== "incoming" → null (出站消息由 outbound persist 记录, 不触发 AI)
 *   - kind === "status" → null (系统状态消息, 无交互价值)
 *   - sender_id 以 gh_ 开头 → null (公众号/服务号消息, bot 不回复)
 *   - type 51 (系统操作 op) → null (XML op 消息, 非用户内容)
 */
function parseV1Message(
  accountId: string,
  msg: Record<string, unknown>,
): WppInboundMessage | null {
  const str2 = (v: unknown): string | undefined => {
    if (v == null) return undefined;
    return typeof v === "string" ? v : String(v);
  };

  const senderId = str2(msg.sender_id) ?? "";
  const recipientId = str2(msg.recipient_id);
  const direction = str2(msg.direction);
  const kind = str2(msg.kind);
  const msgType = num(msg.type, 1);
  const content = str2(msg.content) ?? "";
  const rawMsgId = str2(msg.id) ?? "";
  const createdAt = num(msg.created_at, Date.now() / 1000);

  // 过滤: 非入站 / 系统状态 / 公众号 / 系统操作
  if (direction && direction !== "incoming") return null;
  if (kind === "status") return null;
  if (!senderId) return null;
  if (senderId.startsWith("gh_")) return null;
  if (msgType === 51) return null;

  const isGroup = msg.is_group === true || senderId.endsWith("@chatroom") || (recipientId ?? "").endsWith("@chatroom");
  const chatroomWxid = senderId.endsWith("@chatroom") ? senderId : (recipientId?.endsWith("@chatroom") ? recipientId : undefined);
  const peerKind = isGroup ? PeerKind.GROUP : PeerKind.DIRECT;
  const peerId = chatroomWxid ?? senderId;
  const ts = Math.floor(createdAt);

  // content 是 XML 时保留原文 (上层 quoteBot / XML 解析处理)
  return {
    accountId,
    msgId: rawMsgId || `${ts}-${Math.random().toString(36).slice(2, 10)}`,
    newMsgId: "",
    fromWxid: senderId,
    fromNickname: undefined,
    chatroomId: chatroomWxid,
    toWxid: recipientId,
    msgType,
    content,
    ts,
    raw: msg as unknown as WppWebhookPayload,
    peerKind,
    peerId,
    trigger: "direct",
  };
}

export function payloadToAllInboundMessages(
  accountId: string,
  payload: WppWebhookPayload,
): WppInboundMessage[] {
  try {
    const obj = payload as Record<string, unknown>;
    // 业务回调: 逐条 parse (支持两种 vendor 格式)
    //   v1 (真实, 2026-08-08 17:20 日志实测): Data.messages[] { sender_id, recipient_id, type, id, created_at, is_group, direction, kind, content }
    //   旧 (v1.1.15 假设): Data.Data.AddMsgs[] { FromUserName, ToUserName, MsgType, MsgId, ... }
    if (obj.EventType === "sync_message" && obj.Data) {
      const dataOuter = obj.Data as Record<string, unknown>;
      const out: WppInboundMessage[] = [];

      // v1 格式: Data.messages[] (wechatpad.message.v1 schema)
      const messages = dataOuter.messages;
      if (Array.isArray(messages)) {
        for (const item of messages) {
          const m = parseV1Message(accountId, item as Record<string, unknown>);
          if (m) out.push(m);
        }
        return out;
      }

      // 旧格式: Data.Data.AddMsgs[]
      const dataInner = dataOuter.Data as Record<string, unknown> | undefined;
      const addMsgs = dataInner?.AddMsgs;
      if (Array.isArray(addMsgs) && addMsgs.length > 0) {
        for (const item of addMsgs) {
          const m = parseBusinessCallbackMsg(accountId, item as Record<string, unknown>);
          if (m) out.push(m);
        }
        return out;
      }
      return [];
    }
    // 其他格式走原 parser (取一条)
    const single = payloadToInboundMessage(accountId, payload);
    return single ? [single] : [];
  } catch {
    return [];
  }
}

/**
 * v1.1.15 BUSINESS-CB (2026-08-08): 解析 vendor business callback 单条消息
 * vendor 字段都是 {string: "..."} 包装 (内部 JSON 序列化) + XML 包裹 Content (MsgType=1 文本是纯文本, 其他是 XML)
 *
 * 字段处理:
 *   - FromUserName: {string: "q139198824"} → 解包为字符串
 *   - ToUserName: {string: "wxid_xxx"} / "@chatroom" → 解包
 *   - Content: {string: "..."} → 解包 (文本/XML 原文)
 *   - MsgType: 数字 (1=文本, 51=操作, 47=emoji, etc.)
 *   - NewMsgId: 大整数 (注意精度)
 *   - 群聊识别: ToUserName 结尾是 "@chatroom" + MsgSource 含 membercount
 */
function parseBusinessCallbackMsg(
  accountId: string,
  msg: Record<string, unknown>,
): WppInboundMessage | null {
  // 解包 vendor {string: "..."} 包装
  const unwrap = (v: unknown): string | undefined => {
    if (v == null) return undefined;
    if (typeof v === "string") return v;
    if (typeof v === "object" && v !== null && "string" in v) {
      return str((v as Record<string, unknown>).string);
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

  if (!fromWxid) return null;

  // 群聊识别: FromUserName 或 ToUserName 结尾是 "@chatroom"
  // (老板 15:20 真实消息: FromUserName=57237508162@chatroom 是群id, ToUserName=q139198824 是老板自己 wxid)
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
