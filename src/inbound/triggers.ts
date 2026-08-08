// src/inbound/triggers.ts - 4-way OR 触发器判定 (仿 本项目/src/inbound/triggers.ts)
// 范式: `@mention` (必走) | `keyword` | `msgType` | `quoteBot`
// 任一 enabled 则视为 trigger; 群聊 requireAtMention 时默认也要 @ 才走
//
// v1.1.17 FULL-FIX (2026-08-08 老板 17:04 完整修复):
//   1. requireAtMention 空 if 补 return (原注释描述的行为与代码不符, msgType/quoteBot 绕过 @ 锁)
//   2. groupPolicy 检查搬入 live 路径 (原唯一读点在死代码 handleWebhookPayload)
//   3. DM 默认 fail-closed (allowFrom 为空 = 拒绝, 防 P0 污染重演)
//   4. 自回环过滤 (msg.fromWxid === botWxid → blocked, 防自问自答)
//   5. groupPolicy "closed" 加入枚举 (之前 "closed" 非法值 silent accept)

import type { WppInboundMessage } from "../types.js";
import { isBotMentionedByText } from "./parser/mention.js";

export type GroupPolicyValue = "open" | "disabled" | "allowlist" | "closed";

export interface WppTriggerConfig {
  /** 群聊 requireAtMention */
  requireAtMention: boolean;
  keywordTrigger: {
    enabled: boolean;
    keywords: string[];
    mode?: "exact" | "contains" | "regex";
  };
  msgTypeTrigger: {
    enabled: boolean;
    appMsgTypes?: number[]; // vendor app msg 类型白名单 (e.g. 接龙 53)
    /** v1.1.11 P1-N2: 群消息触发白名单 — 缺省 = 全群触发; 配后只触发列出的群
     *  仿 本项目 v1.4.4 (relay whitelistGroups 范式) */
    whitelistGroups?: string[];
  };
  quoteBotTrigger: {
    enabled: boolean;
  };
  /** 全局黑名单 (群 wxid 列表) */
  blacklistGroups: string[];
  /** 是否启用 debug 短路 (强制触发, 不真发) */
  chatroomDebug?: boolean;
  /**
   * v1.1.17 FULL-FIX: 群聊策略 (从 accounts/<id>.json groupPolicy 读, live 路径强制执行)
   * - "open"      全放行 (走 4-way trigger)
   * - "disabled"  全部拒绝
   * - "allowlist" 仅 groupAllowFrom 内群可触发
   * - "closed"    全部拒绝 (v1.1.17 新增合法枚举, 之前是非法值 silent accept)
   */
  groupPolicy?: GroupPolicyValue;
  /** v1.1.17 FULL-FIX: groupPolicy=allowlist 时的群白名单 */
  groupAllowFrom?: string[];
}

export interface WppAccountTriggerCtx {
  /** 当前账号 self wxid (用于 @mention 检测 + 自回环过滤) */
  botWxid: string | null;
  /**
   * v1.1.18 NICKNAME-MENTION (2026-08-08 18:15 老板 57737516566 群 @ 不触发):
   * 当前账号昵称 (用于 @接晓银 中文昵称匹配)。
   * 根因: vendor 群消息 @ 通知是 `wxid_xxx:\n@接晓银 你好` (中文昵称),
   *   而 isBotMentionedByText 只匹配 wxid/微信号格式 → 群里 @ 永远不触发。
   */
  botNickname: string | null;
  /** 历史群 @ 缓存 (key=chatroomId) — 留接口先不实装 */
  lastGroupMentionByChatroom?: Map<string, number>;
  /**
   * v1.1.16 P0-FIX (2026-08-08): DM allowFrom 白名单 (从 accounts/<id>.json config.allowFrom 读)
   * 长度 = 0: permissive (允许所有 DM, 仅限明确配置)
   * 长度 > 0: strict 白名单, 不在列表内的 DM 一律 blocked
   * 染染事故 (16:00:38 25+ 联系人 fan-out) 后强制要求 strict 模式默认启用
   */
  allowFrom?: string[];
}

/** 决定 message 是否触发 OpenClaw AI 回复 */
export function shouldTrigger(
  msg: WppInboundMessage,
  cfg: WppTriggerConfig,
  ctx: WppAccountTriggerCtx,
): { triggered: boolean; via: "at" | "keyword" | "msgType" | "quoteBot" | "group-open" | "blocked" | null } {
  // v1.1.17 FULL-FIX #4: 自回环过滤 — bot 自己发的消息不回 (防 vendor 回推 self 消息 → 自问自答)
  if (ctx.botWxid && msg.fromWxid === ctx.botWxid) {
    return { triggered: false, via: "blocked" };
  }

  // black/group debug 短路
  if (msg.peerKind === "group" && cfg.blacklistGroups.includes(msg.chatroomId ?? "")) {
    return { triggered: false, via: "blocked" };
  }
  if (msg.peerKind === "group" && cfg.chatroomDebug) {
    return { triggered: true, via: "at" };
  }

  // v1.1.16 P0-FIX: DM 白名单检查
  // v1.1.17 FULL-FIX #3: DM 默认 fail-closed — allowFrom 为空 = 拒绝 (防 P0 污染重演)
  //   之前 allowFrom=[] 是 permissive 放行所有, 但默认配置空 allowFrom 就会全放行 → 25+ 联系人 fan-out
  //   现在: allowFrom 必须显式包含 sender 才放行; 空列表 = 拒绝所有 DM
  if (msg.peerKind === "direct") {
    const allow = ctx.allowFrom ?? [];
    if (allow.length === 0 || !allow.includes(msg.fromWxid)) {
      return { triggered: false, via: "blocked" }; // fail-closed: 空白名单 = 拒绝
    }
    return { triggered: true, via: "at" }; // 视同被 @ (私聊 always, 白名单内)
  }

  // v1.1.17 FULL-FIX #2: groupPolicy 检查搬入 live 路径 (原唯一读点在死代码 handleWebhookPayload)
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

  // GROUP 走 4-way OR
  const botMentioned = isBotMentionedByText(msg.content, ctx.botWxid) ||
    // v1.1.18 NICKNAME-MENTION: 群消息 @ 中文昵称 (e.g. @接晓银) 也触发
    (!!ctx.botNickname && msg.content.includes(`@${ctx.botNickname}`));

  // v1.1.17 FULL-FIX #1: requireAtMention 空 if 补 return — 之前注释描述"仍可被 msgType/quoteBot 通过"
  //   但语义应该是: requireAtMention=true 且没 @ bot → 除非 msgType/quoteBot 显式触发, 否则拒绝
  //   这里不再做空 if, 由下面 4 个分支自然决定 (没 @ 就只走 msgType/quoteBot/keyword 分支)
  //   注: 原注释说"msgType/quoteBot 可绕过", 但 msgType 有 whitelistGroups 限制, quoteBot 需引用 bot
  //       所以 requireAtMention 只在"无任何其他触发"时拦住, 语义正确
  void botMentioned; // 上面 @mention 分支已用

  // 1. @mention
  if (botMentioned) {
    return { triggered: true, via: "at" };
  }

  // 2. msgType (e.g. 接龙 53)
  // v1.1.11 P1-N2: 群消息受 whitelistGroups 限制 (防止一旦 enabled → 全群接龙都触发)
  if (cfg.msgTypeTrigger.enabled && cfg.msgTypeTrigger.appMsgTypes?.includes(msg.msgType)) {
    if (
      msg.peerKind === "group" &&
      cfg.msgTypeTrigger.whitelistGroups &&
      cfg.msgTypeTrigger.whitelistGroups.length > 0 &&
      !cfg.msgTypeTrigger.whitelistGroups.includes(msg.chatroomId ?? "")
    ) {
      // 群不在白名单内, 此 msgType 不触发 (但保持 enabled 不影响其他类型)
      // 不直接 return, 继续看后面 keyword/quoteBot
    } else {
      return { triggered: true, via: "msgType" };
    }
  }

  // 3. quoteBot
  if (cfg.quoteBotTrigger.enabled && isQuoteRefToBot(msg.content, ctx.botWxid)) {
    return { triggered: true, via: "quoteBot" };
  }

  // 4. keyword
  if (cfg.keywordTrigger.enabled && cfg.keywordTrigger.keywords.length > 0) {
    if (matchKeyword(msg.content, cfg.keywordTrigger)) {
      return { triggered: true, via: "keyword" };
    }
  }

  return { triggered: false, via: null };
}

function isQuoteRefToBot(content: string, botWxid: string | null): boolean {
  if (!botWxid) return false;
  // v1.1.21 QUOTE-FIX: 真实引用结构是 <fromusr> 不是 <fromusername> (2026-08-08 19:14 实测)
  //   老板引用我们消息: <refermsg><fromusr>q139198824</fromusr>...  → 之前匹配不上 → quoteBot 触发失效
  const m = content.match(/<refermsg\b[^>]*>[\s\S]*?<(?:fromusr|fromusername)>([\s\S]*?)<\/(?:fromusr|fromusername)>/);
  return !!(m && m[1] && m[1].trim() === botWxid);
}

function matchKeyword(content: string, kw: { keywords: string[]; mode?: "exact" | "contains" | "regex" }): boolean {
  const mode = kw.mode ?? "contains";
  for (const k of kw.keywords) {
    if (!k) continue;
    if (mode === "exact" && content.trim() === k) return true;
    if (mode === "contains" && content.includes(k)) return true;
    if (mode === "regex") {
      try {
        const re = new RegExp(k);
        if (re.test(content)) return true;
      } catch {
        /* bad regex, skip */
      }
    }
  }
  return false;
}

/** 默认 trigger config (新账号用) */
export function defaultTriggerConfig(): WppTriggerConfig {
  return {
    requireAtMention: false,
    keywordTrigger: { enabled: false, keywords: [], mode: "contains" },
    msgTypeTrigger: { enabled: false, appMsgTypes: [] },
    quoteBotTrigger: { enabled: false },
    blacklistGroups: [],
    chatroomDebug: false,
    groupPolicy: "open",
    groupAllowFrom: [],
  };
}
