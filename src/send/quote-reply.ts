// src/send/quote-reply.ts - quoteReply 工具实现
// 流程: 查 DB 被引用消息补全 refermsg 字段 → buildQuoteReplyXml 构造 XML → /Msg/ShareLink 发送
// (baseUrl/tokenKey 从 registry 拿, 不能用空 ctx 否则 postWppJson 拼 URL 失败)

/**
 * v1.3.33 GROUP-MENTION-REPLY: 群聊引用回复时给回复文本加 @被回复人昵称前缀 (纯函数, 可测).
 *   参考 gewe 行为 (gewe send/quote.ts: "@${atsNickname} ${replyContent}").
 *   @param toWxid 目标 (群聊以 @chatroom 结尾才加)
 *   @param content AI 回复文本
 *   @param displayName 被回复人昵称 (来自 resolveDisplayName)
 *   @param fromusr 被回复人 wxid (displayName 缺失时兜底用)
 *   @returns 群聊且有昵称 → "@昵称 内容"; 否则原样返回
 */
export function buildGroupMentionPrefix(
  toWxid: string,
  content: string,
  displayName: string | undefined,
  fromusr: string | undefined,
): string {
  if (!toWxid.endsWith("@chatroom")) return content;
  const atName = displayName && displayName !== fromusr ? displayName : (fromusr ?? "");
  if (!atName) return content;
  return `@${atName} ${content}`.trim();
}

import { getMessageByMsgIdOrNewId, saveMessage } from "../db.js";
import { postWppJson } from "../api/client.js";
import { buildQuoteReplyXml } from "./quote-xml.js";
import { resolveQuoteSvrid } from "../inbound/quote-svrid.js";
import { getDefaultAccountRegistry } from "../account-state.js";
import { info, warn, formatErr } from "../core/logger.js";

/**
 * v1.3.16 OUTBOUND-PERSIST: 引用回复成功后入库 (老板拍板 "任意渠道发送都要入库, 以便引用 bot 消息")。
 * sendAiReply 有引用时走 quoteReply (AI 引用回复主路径), 之前未入库 → 引用不到 bot 的回复。
 */
async function persistQuoteReply(
  acct: string,
  toWxid: string,
  content: string,
  resp: { Code: number; Data?: unknown },
): Promise<void> {
  try {
    if (resp.Code !== 0) return; // 发送失败不入库
    const d = (resp.Data ?? {}) as { msgId?: number | string; newMsgId?: number | string };
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
  } catch (e) {
    warn(`[WPP v1.3.16 OUTBOUND-PERSIST] persist quote reply failed (non-fatal): ${formatErr(e)}`);
  }
}

// 引用回复 title 显示昵称 (查 /Friend/GetContractDetail + 30 分钟内存缓存, 避免每次调 vendor)
const nicknameCache = new Map<string, { nick: string; ts: number }>();
const NICKNAME_CACHE_TTL_MS = 30 * 60 * 1000; // 30 分钟

/**
 * 查通讯录好友昵称 (vendor /Friend/GetContractDetail)
 * 失败/超时 → undefined (不阻塞引用回复)
 */
async function resolveDisplayName(
  acct: string,
  wxid: string | undefined,
): Promise<string | undefined> {
  if (!wxid || wxid.endsWith("@chatroom")) return undefined; // 群 ID 无昵称可查
  const cached = nicknameCache.get(wxid);
  if (cached && Date.now() - cached.ts < NICKNAME_CACHE_TTL_MS) return cached.nick;
  try {
    const state = getDefaultAccountRegistry().get(acct);
    const cfg = state?.config;
    const resp = await postWppJson<{ ContactList?: Array<{ NickName?: { string?: string } }> }>(
      cfg?.apiBaseUrl ?? "",
      "/Friend/GetContractDetail",
      { userName: wxid },
      { tokenKey: cfg?.tokenKey ?? "", authcode: cfg?.authcode ?? "", timeoutMs: 5000, maxRetries: 0 },
    );
    const nick = resp.Data?.ContactList?.[0]?.NickName?.string;
    if (nick) {
      nicknameCache.set(wxid, { nick, ts: Date.now() });
      return nick;
    }
  } catch {
    // 昵称查询失败不阻塞引用回复
  }
  return undefined;
}

export interface QuoteReplyParams {
  toWxid: string;
  content: string;
  /** 被引用消息的 msgId (DB 查询用) */
  msgId: string;
  /** 可选: 被引用消息的 newMsgId (fallback) */
  newMsgId?: string;
  accountId?: string;
  /** 被引用消息的发送者 wxid (供 refermsg.fromusr) */
  fromWxid?: string;
  /** 被引用消息的所属会话 wxid (群id 或对方 wxid) */
  chatroomId?: string;
  /** 被引用消息的发送者昵称 */
  fromNickname?: string;
  /** 被引用消息的原始 content (供 refermsg.content) */
  originalContent?: string;
  /** 被引用消息的时间戳 (秒, 供 refermsg.createtime) */
  createtime?: number;
  /** 被引用消息的 msgType (供 refermsg.type) */
  innerType?: number;
}

/**
 * 清洗群消息 content 的发送者 wxid 前缀
 * vendor 群消息 content 形如 "wxid_xxx:\n@bot 你好" (单 wxid + 冒号 + 换行)
 * 或 "senderNick:\n<content>" (昵称 + 冒号 + 换行) — refermsg.content 应只含正文
 */
export function stripGroupContentPrefix(content: string | undefined): string | undefined {
  if (!content) return content;
  // 形如 "wxid_xxx:\n..." 或 "gh_xxx:\n..." 或 "xxx@chatroom:\n..." (首行是 wxid + 冒号)
  const m = content.match(/^[a-zA-Z0-9_@:-]+:\n([\s\S]*)$/);
  if (m && m[1]) return m[1].trim();
  return content;
}

/**
 * 从 vendor 群消息 content 提取真实发送者 wxid (content 前缀 "wxid_xxx:\n")
 * 根因: business callback 的 FromUserName = 群 ID, 发送者 wxid 只在 content 首行前缀
 * 例: "wxid_sender:\n@bot 你好" → "wxid_sender"
 */
export function extractGroupSenderWxid(content: string | undefined): string | undefined {
  if (!content) return undefined;
  // 首行形如 "wxid_xxx:" (wxid 开头) → 提取 wxid
  const m = content.match(/^(wxid_[a-zA-Z0-9_]+|gh_[a-zA-Z0-9_]+|[a-zA-Z0-9_]+@chatroom):\n/);
  if (m && m[1]) return m[1];
  return undefined;
}

/**
 * 引用回复 (文本/图片通用):
 * - 从 DB 查被引用消息, 拿原文 content (图片=图片XML) + fromWxid 等
 * - 构造完整 refermsg → ShareLink 发送
 */
export async function quoteReply(params: QuoteReplyParams): Promise<{ ok: boolean; msg?: string; data?: unknown }> {
  const {
    toWxid, content, msgId, newMsgId, accountId,
    fromWxid, chatroomId, fromNickname, originalContent, createtime, innerType,
  } = params;
  const acct = accountId ?? "default";

  // displayname 兑底变量 (DB peer_name)
  let paramsFromNicknameFallback: string | undefined;

  // 参数 fromWxid 是群 ID (@chatroom 结尾) 时视为无效 → 置 undefined 走 DB 补全 (防 fromusr 永远是群ID)
  const paramFromWxidValid = fromWxid && !fromWxid.endsWith("@chatroom") ? fromWxid : undefined;

  // svrid 直接用 inbound newMsgId (vendor 全局唯一)
  let svrid = newMsgId || msgId || "";
  let dbFromWxid: string | undefined = paramFromWxidValid;
  let dbChatroomId: string | undefined = chatroomId;
  let dbOriginalContent: string | undefined = stripGroupContentPrefix(originalContent);
  let dbCreatetime: number | undefined = createtime;
  let dbInnerType: number | undefined = innerType;
  try {
    // v1.3.18 P1-核心2: 引用查询传 direction: "any" (被引用消息可能是 bot  outbound)
    const rec = await getMessageByMsgIdOrNewId(msgId, newMsgId, acct, { direction: "any" });
    if (rec) {
      const mappedSvrid = await resolveQuoteSvrid(msgId, newMsgId, rec.content ?? undefined, acct);
      if (mappedSvrid && mappedSvrid !== msgId) {
        svrid = mappedSvrid;
      }
      // 发送者 wxid 提取: 参数优先 → raw_payload sender → content 前缀 wxid → (非群) peer_id
      // (business callback FromUserName = 群 ID, 发送者只在 content 前缀)
      const raw = (rec.raw_payload ?? {}) as Record<string, unknown>;
      const rawSenderId =
        (typeof raw.sender_id === "string" ? raw.sender_id : undefined) ??
        (typeof raw.fromUser === "string" ? raw.fromUser : undefined) ??
        (typeof raw.FromWxid === "string" ? raw.FromWxid : undefined) ??
        (typeof raw.fromWxid === "string" ? raw.fromWxid : undefined);
      const isGroupRec = rec.peer_kind === "group";
      // 真实发送者: 参数优先 → raw_payload sender → content 前缀 wxid → (非群) peer_id
      dbFromWxid =
        dbFromWxid ??
        rawSenderId ??
        extractGroupSenderWxid(rec.content ?? undefined) ??
        (isGroupRec ? undefined : (rec.peer_id ?? undefined));
      // 会话 wxid: 群 = chat_id, 私聊 = peer_id (对方 wxid)
      dbChatroomId = dbChatroomId ?? (isGroupRec ? (rec.chat_id ?? undefined) : (rec.peer_id ?? undefined));
      dbOriginalContent = dbOriginalContent ?? stripGroupContentPrefix(rec.content ?? undefined);
      dbCreatetime = dbCreatetime ?? rec.ts;
      dbInnerType = dbInnerType ?? (rec.msg_type ? parseInt(rec.msg_type, 10) : undefined);
      // displayname 兑底: 参数 → peer_name
      if (!fromNickname && rec.peer_name) {
        paramsFromNicknameFallback = rec.peer_name;
      }
    }
  } catch {
    // DB 查询失败不阻塞
  }

  // displayname 优先级: 参数 fromNickname > DB peer_name > 通讯录昵称查询
  const displayName =
    fromNickname ||
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

  // v1.3.33 GROUP-MENTION-REPLY (老板拍板 2026-08-11): 群聊引用回复时加 @被回复人昵称 (gewe 范式)
  const finalContent = buildGroupMentionPrefix(toWxid, content, displayName, quote.fromusr);
  const xml = buildQuoteReplyXml(finalContent, quote);
  const state = getDefaultAccountRegistry().get(acct);
  const cfg = state?.config;
  info(`[WPP v1.2.0 QUOTE-TITLE-FIX] quoteReply ShareLink type=57: to=${toWxid} svrid=${svrid} (title=AI reply + svrid+fromusr refermsg)`);
  info(`[WPP v1.2.0 QUOTE-TITLE-FIX] quoteReply XML (first 800 chars): ${xml.slice(0, 800).replace(/\n/g, "\\n")}`);
  info(`[WPP v1.2.0 QUOTE-TITLE-FIX] quoteReply XML totalLen=${xml.length}`);
  // vendor /Msg/Quote 永久 ret=-2 不可用 → 走 /Msg/ShareLink + Type=5 + 自构造 XML (gewe 范式)
  const resp = await postWppJson(cfg?.apiBaseUrl ?? "", "/Msg/ShareLink", {
    ToWxid: toWxid,
    Type: 5,
    Xml: xml,
  }, {
    tokenKey: cfg?.tokenKey ?? "",
    authcode: cfg?.authcode ?? "",
    timeoutMs: 30000,
  });
  const d = (resp.Data ?? {}) as { BaseResponse?: { ret?: number; errMsg?: unknown }; msgId?: number; newMsgId?: number; type?: number };
  const baseRespRet = d.BaseResponse?.ret;
  info(`[WPP v1.2.0 REVERT] vendor resp: Code=${resp.Code} ret=${baseRespRet} msgId=${d.msgId ?? 0} newMsgId=${d.newMsgId ?? 0} type=${d.type ?? 0}`);
  // 判据陷阱: Code=0 只是 HTTP 200, 真正成功看 Data.BaseResponse.ret === 0 (msgId=0 时 Code=0 不代表成功)
  const ok = resp.Code === 0 && baseRespRet === 0;
  if (ok) await persistQuoteReply(acct, toWxid, content, resp);
  return {
    ok,
    msg: ok ? "引用回复已发送" : `发送失败 Code=${resp.Code} ${resp.CodeValue ?? ""}`,
    data: resp.Data,
  };
}
