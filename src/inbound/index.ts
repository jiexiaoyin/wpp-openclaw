// src/inbound/index.ts - 顶层 barrel
// 提供 `import { ... } from "../inbound/index.js"` 给老代码

import type { WppInboundMessage } from "../types.js";
import { payloadToInboundMessage } from "./parser.js";
import { parseRelayText } from "./relay.js";
import { enrichAndSaveMessage } from "./enrich.js";
import { getDefaultAccountRegistry } from "../account-state.js";
import { logObj as log } from "../core/logger.js";
import { createWppInboundHandler, type WppInboundHandlerOpts } from "./handler.js";
import { defaultTriggerConfig, shouldTrigger } from "./triggers.js";
import { WppInboundDebouncer } from "./debouncer.js";
import { extractAtUserList, isBotMentionedByText } from "./parser/mention.js";
import { parseQuoteXml } from "./parser/quote.js";
import { stripGroupPrefix, describeMsgType } from "./parser/content.js";
import { isValidWxid, isGroupWxid, isValidAtUser } from "./parser/wxid.js";

export {
  payloadToInboundMessage as parseInbound,
  createWppInboundHandler,
  defaultTriggerConfig,
  shouldTrigger,
  WppInboundDebouncer,
  extractAtUserList,
  isBotMentionedByText,
  parseQuoteXml,
  stripGroupPrefix,
  describeMsgType,
  isValidWxid,
  isGroupWxid,
  isValidAtUser,
  parseRelayText,
  enrichAndSaveMessage,
  type WppInboundHandlerOpts,
};

/**
 * 老 handleWebhookPayload 入口 (compat for src/index.ts)
 * Phase D 升级: parse + persist + DM/group policy 判定, 不实际 dispatcher (Phase F 接入)
 */
export async function handleWebhookPayload(
  accountId: string,
  payload: import("../types.js").WppWebhookPayload,
): Promise<WppInboundMessage | null> {
  const msg = payloadToInboundMessage(accountId, payload);
  if (!msg) return null;

  const result = await enrichAndSaveMessage(msg);
  if (!result.saved) {
    log.warn(`handleWebhookPayload persist failed: ${result.error}`);
  }

  const state = getDefaultAccountRegistry().get(accountId);
  if (!state) return msg;

  // DM 白名单
  if (msg.peerKind === "direct") {
    const allow = state.config.allowFrom ?? [];
    if (allow.length > 0 && !allow.includes(msg.fromWxid)) {
      log.info(`dm blocked: ${msg.fromWxid} not in allowFrom`);
      return null;
    }
  }

  // Group 策略 (简单的 disabled/allowlist, 不走 4-way trigger)
  if (msg.peerKind === "group") {
    const policy = state.config.groupPolicy;
    if (policy === "disabled") return null;
    if (policy === "allowlist") {
      const allow = state.config.groupAllowFrom ?? [];
      if (
        allow.length > 0 &&
        msg.chatroomId &&
        !allow.includes(msg.chatroomId)
      ) {
        log.info(`group blocked: ${msg.chatroomId} not in groupAllowFrom`);
        return null;
      }
    }
    // requireAtMention: 群聊默认需要 @ 才触发 — Phase D 加简易 at 校验
    if (state.config.requireAtMention) {
      if (!isBotMentionedByText(msg.content, state.selfWxid)) {
        log.debug(`group at-required skip: ${msg.content.slice(0, 30)}`);
        return null;
      }
    }
  }

  log.info(
    `inbound: account=${msg.accountId} peer=${msg.peerKind}/${msg.peerId} ` +
    `from=${msg.fromWxid} type=${msg.msgType} text=${msg.content.slice(0, 50)}`,
  );
  return msg;
}
