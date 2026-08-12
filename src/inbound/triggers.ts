// src/inbound/triggers.ts - 4-way OR 触发器判定
// 范式: `@mention` | `keyword` | `msgType` | `quoteBot` 任一命中即触发; 带 DM/群白名单门禁

import type { WppInboundMessage } from "../types.js";
import { isBotMentionedByText } from "./parser/mention.js";

export type GroupPolicyValue = "open" | "disabled" | "allowlist" | "closed";

export interface WppTriggerConfig {
  /** 群聊 requireAtMention — 注意: 当前未在 shouldTrigger 内实现 (见下方说明) */
  requireAtMention: boolean;
  keywordTrigger: {
    enabled: boolean;
    keywords: string[];
    mode?: "exact" | "contains" | "regex";
  };
  msgTypeTrigger: {
    enabled: boolean;
    appMsgTypes?: number[]; // vendor app msg 类型白名单 (e.g. 接龙 53)
    /** 群消息触发白名单 — 缺省全群触发; 配后只触发列出的群 */
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
   * 群聊策略 (live 路径强制执行)
   * - "open"      全放行 (走 4-way trigger)
   * - "disabled"  全部拒绝
   * - "allowlist" 仅 groupAllowFrom 内群可触发
   * - "closed"    全部拒绝
   */
  groupPolicy?: GroupPolicyValue;
  /** groupPolicy=allowlist 时的群白名单 */
  groupAllowFrom?: string[];
}

export interface WppAccountTriggerCtx {
  /** 当前账号 self wxid (用于 @mention 检测 + 自回环过滤) */
  botWxid: string | null;
  /** 当前账号昵称 (用于 @昵称 中文匹配 — vendor 群 @ 用中文昵称) */
  botNickname: string | null;
  /** 历史群 @ 缓存 (key=chatroomId) — 留接口先不实装 */
  lastGroupMentionByChatroom?: Map<string, number>;
  /**
   * DM allowFrom 白名单 (从 accounts/<id>.json 读)
   * 长度 = 0: 拒绝所有 DM (fail-closed, 防 P0 联系人 fan-out 重演)
   * 长度 > 0: strict 白名单, 不在列表内一律 blocked
   */
  allowFrom?: string[];
  /** v1.2.3 PAIRING: 运行时可热切 (配对/热重载即时开关) — handler 读 triggerCtx 而非创建时快照 */
  dmPairingEnabled?: boolean;
  /** v1.2.4 GROUP-CONTEXT: 运行时可热切 (默认 false, 显式 true 才缓冲非触发群消息) */
  groupContextEnabled?: boolean;
  /** v1.2.4 GROUP-CONTEXT: 上下文条数 (默认 20) */
  groupContextWindow?: number;
}

/** 决定 message 是否触发 OpenClaw AI 回复 */
export function shouldTrigger(
  msg: WppInboundMessage,
  cfg: WppTriggerConfig,
  ctx: WppAccountTriggerCtx,
): { triggered: boolean; via: "at" | "keyword" | "msgType" | "quoteBot" | "group-open" | "blocked" | null } {
  // 自回环过滤: bot 自己发的消息不回 (防 vendor 回推 self → 自问自答)
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

  // DM 白名单: allowFrom 必须显式包含 sender 才放行; 空列表 = 拒绝所有 (fail-closed 防 fan-out)
  if (msg.peerKind === "direct") {
    const allow = ctx.allowFrom ?? [];
    if (allow.length === 0 || !allow.includes(msg.fromWxid)) {
      return { triggered: false, via: "blocked" }; // fail-closed: 空白名单 = 拒绝
    }
    return { triggered: true, via: "at" }; // 视同被 @ (私聊 always, 白名单内)
  }

  // groupPolicy 检查 (live 路径强制执行)
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
    // 群消息 @ 中文昵称 也触发
    (!!ctx.botNickname && msg.content.includes(`@${ctx.botNickname}`));

  if (botMentioned) {
    return { triggered: true, via: "at" };
  }

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

  if (cfg.quoteBotTrigger.enabled && isQuoteRefToBot(msg.content, ctx.botWxid)) {
    return { triggered: true, via: "quoteBot" };
  }

  if (cfg.keywordTrigger.enabled && cfg.keywordTrigger.keywords.length > 0) {
    if (matchKeyword(msg.content, cfg.keywordTrigger)) {
      return { triggered: true, via: "keyword" };
    }
  }

  return { triggered: false, via: null };
}

function isQuoteRefToBot(content: string, botWxid: string | null): boolean {
  if (!botWxid) return false;
  // 真实引用结构是 <fromusr> (不是 <fromusername>); 老板引用 bot 消息时匹配
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
