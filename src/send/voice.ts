// src/send/voice.ts - Voice tag (3 endpoints: 语音转写)

import { postWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppVoice(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /Voice/MessageTranscribe — 接收的语音消息转文字 */
    messageTranscribe: (msgId: string) =>
      dispatch("/Voice/MessageTranscribe", { msgId }),

    /** /Voice/Result — 查询异步转写结果 */
    result: (taskId: string) => dispatch("/Voice/Result", { taskId }),

    /** /Voice/Transcribe — 上传语音并转文字 */
    transcribe: (voiceBase64: string, durationMs?: number) =>
      dispatch("/Voice/Transcribe", { voiceBase64, durationMs: durationMs ?? 0 }),
  };
}

export type WppVoiceApi = ReturnType<typeof makeWppVoice>;
