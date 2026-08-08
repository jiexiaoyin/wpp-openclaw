// src/dispatch/handler-action.ts - actions.send handler (legacy OpenClaw path)
// 仿 本项目/src/dispatch/handler-action.ts

import { sendText, sendImage, sendVoice, sendVideo, revokeMsg } from "./outbound.js";
import { logObj as log } from "../core/logger.js";

export interface HandleActionOpts {
  action: string;
  params: Record<string, unknown>;
  accountId?: string;
  sessionKey?: string;
}

export async function handleAction(opts: HandleActionOpts): Promise<unknown> {
  const accountId = opts.accountId ?? "default";
  switch (opts.action) {
    case "send": {
      const { toWxid, content } = opts.params as { toWxid: string; content: string };
      if (!toWxid || !content) throw new Error("action.send requires toWxid, content");
      log.info(`handleAction: send to=${toWxid}`);
      return sendText(accountId, toWxid, content);
    }
    case "sendImage": {
      const { toWxid, imageUrl } = opts.params as { toWxid: string; imageUrl: string };
      if (!toWxid || !imageUrl) throw new Error("sendImage requires toWxid, imageUrl");
      return sendImage(accountId, toWxid, imageUrl);
    }
    case "sendVoice": {
      const { toWxid, voiceUrl, durationMs } = opts.params as {
        toWxid: string;
        voiceUrl: string;
        durationMs?: number;
      };
      return sendVoice(accountId, toWxid, voiceUrl, durationMs);
    }
    case "sendVideo": {
      const { toWxid, videoUrl, thumbUrl } = opts.params as {
        toWxid: string;
        videoUrl: string;
        thumbUrl?: string;
      };
      return sendVideo(accountId, toWxid, videoUrl, thumbUrl);
    }
    // v1.1.17 FULL-FIX (P0-B): sendApp case 已移除 — /Msg/SendApp 是群发端点, 防误触广播
    case "revoke": {
      const { toWxid, msgId, newMsgId } = opts.params as {
        toWxid: string;
        msgId: string;
        newMsgId: string;
      };
      return revokeMsg(accountId, toWxid, msgId, newMsgId);
    }
    default:
      throw new Error(`unsupported action: ${opts.action}`);
  }
}
