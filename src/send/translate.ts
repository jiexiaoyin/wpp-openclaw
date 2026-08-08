// src/send/translate.ts - Translate tag (2 endpoints: 翻译)

import { postWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppTranslate(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /Translate/Send — 翻译并发送 */
    send: (toWxid: string, content: string, targetLang: string) =>
      dispatch("/Translate/Send", { toWxid, content, targetLang }),

    /** /Translate/Text — 翻译文字 */
    text: (content: string, targetLang: string) =>
      dispatch("/Translate/Text", { content, targetLang }),
  };
}

export type WppTranslateApi = ReturnType<typeof makeWppTranslate>;
