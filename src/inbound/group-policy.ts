// src/inbound/group-policy.ts - 群聊策略检查 (v1.1.39 SUNNOY-GROUP-POLICY)
//
// 设计来源: sunnoy/wecom v3.4.0 wecom/group-policy.js:61 checkGroupPolicy
//   单一职责: 检查一条群消息是否允许进入 dispatch 链路
//   范式: 返 { allowed: boolean; reason?: string } 而不是直接 boolean
//
// 与 sunnoy 的差异:
//   sunnoy 检查: groupId + senderId (双维度, sender 白名单也在这里)
//   WPP 检查: groupId (groupPolicy + groupAllowFrom) + at 检测
//     WPP sender 白名单是独立的 triggerConfig.allowFrom (在 triggers.ts:shouldTrigger 里)
//     所以这里只做 group 级策略
//
// 调用点: inbound/index.ts handleWebhookPayload (Phase D 兼容路径)
// 未来: 接入 handler.ts 主路径 (P2.5)

import type { WppInboundMessage } from "../types.js";
import { isBotMentionedByText, cleanGroupMessage } from "./parser/mention.js";

export type GroupPolicyResult =
  | { allowed: true; /** 清洗后的 content (供 AI 看), 没变化时 = undefined */ cleanedContent?: string }
  | { allowed: false; reason: string };

export interface CheckGroupPolicyOpts {
  msg: WppInboundMessage;
  /** 来自 accounts config: "open" | "disabled" | "allowlist" | "closed" */
  policy: "open" | "disabled" | "allowlist" | "closed";
  /** 来自 accounts config: 允许的群 chatroomId 白名单 */
  groupAllowFrom: string[];
  /** 来自 accounts config: 是否要求 @ 才触发 (默认 true) */
  requireAtMention: boolean;
  /** 机器人 selfWxid (用于 @ 检测 + cleanGroupMessage) */
  selfWxid: string | null;
}

/**
 * v1.1.39 SUNNOY-GROUP-POLICY: 借鉴 sunnoy checkGroupPolicy 范式
 *   单一职责检查群消息是否允许进入 dispatch
 *   返 { allowed, reason? } 让 caller 决定是否继续
 *
 * @param opts - msg + policy + allowFrom + requireAtMention + selfWxid
 * @returns GroupPolicyResult - allowed=true 时可选带 cleanedContent (SUNNOY-GROUP-CONTENT 范式)
 */
export function checkGroupPolicy(opts: CheckGroupPolicyOpts): GroupPolicyResult {
  const { msg, policy, groupAllowFrom, requireAtMention, selfWxid } = opts;

  if (policy === "disabled") {
    return { allowed: false, reason: "groupPolicy=disabled" };
  }

  if (policy === "allowlist") {
    const chatroomId = msg.chatroomId;
    // P0-2 (2026-08-23): allowlist 空列表 = 拒绝所有群 (fail-closed, 与 triggers.ts 对齐)
    if (
      groupAllowFrom.length === 0 ||
      (chatroomId && !groupAllowFrom.includes(chatroomId))
    ) {
      return { allowed: false, reason: `groupAllowFrom mismatch: ${chatroomId ?? "(空)"}` };
    }
  }

  if (policy === "closed") {
    return { allowed: false, reason: "groupPolicy=closed (not implemented, fail-closed)" };
  }

  if (requireAtMention) {
    if (!isBotMentionedByText(msg.content, selfWxid)) {
      return { allowed: false, reason: "requireAtMention but bot not @-ed" };
    }
    // v1.1.39 SUNNOY-GROUP-CONTENT: 借鉴 sunnoy extractGroupMessageContent
    //   at 通过后, 清洗 content (去 wxid_xxx:\n sender 前缀 + 去 @bot 提及)
    const cleaned = cleanGroupMessage(msg.content, selfWxid);
    if (cleaned !== msg.content) {
      return { allowed: true, cleanedContent: cleaned };
    }
  }

  return { allowed: true };
}
