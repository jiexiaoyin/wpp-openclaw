// src/send/customized.ts - Customized tag (1 endpoint)

import { postWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppCustomized(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /Customized/WXCTDUniftyAuthBatch — 批量开小程序 (v1.2.1 swagger-alignment: WXCTDUniftyAuthParmDoc {Username}) */
    wxctdUniftyAuthBatch: (username: string) =>
      dispatch("/Customized/WXCTDUniftyAuthBatch", { Username: username }),
  };
}

export type WppCustomizedApi = ReturnType<typeof makeWppCustomized>;
