// src/dispatch/agent-tools/voice-meta.ts - Voice tag (语音, 3)

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppVoice } from "../../send/index.js";
import { getDefaultAccountRegistry } from "../../account-state.js";

function getVoi() {
  const state = getDefaultAccountRegistry().get("default");
  if (!state) throw new Error("account not found: default");
  return makeWppVoice({
    baseUrl: state.config.apiBaseUrl,
    tokenKey: state.config.tokenKey,
    authcode: state.authcode,
    accountId: "default",
  });
}

export const VOICE_META: ToolMeta = {
  voiceTranscribe: [
    "上传语音 base64 并转文字.",
    Type.Object({
      voiceBase64: Type.String(),
      durationMs: Type.Optional(Type.Number()),
    }),
    // 原版 api.transcribe(voiceBase64) — 但 api 签名是 (audioBase64, fromUserName, toUserName, ...)
    // 历史不一致, 不优化
    (voiceBase64: string, _durationMs?: number) => getVoi().transcribe(voiceBase64, "", ""),
  ],
  voiceMessageTranscribe: [
    "把已收到语音消息转写 (异步).",
    Type.Object({ msgId: Type.String() }),
    // 原版 api.messageTranscribe(msgId) — 但 api 签名是 (msgId, newMsgId, fromUserName, ...)
    // 历史不一致, 不优化
    (msgId: string) => getVoi().messageTranscribe(msgId, "", ""),
  ],
  voiceResult: [
    "查询异步语音转写结果.",
    Type.Object({ taskId: Type.String() }),
    (taskId: string) => getVoi().result(taskId),
  ],
};
