// src/send/qwcontact.ts - QWContact tag (3 endpoints: 企业微信联系人)

import { postWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppQWContact(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /QWContact/QWApplyAddContact */
    qwApplyAddContact: (v1: string, v2: string) =>
      dispatch("/QWContact/QWApplyAddContact", { v1, v2 }),

    /** /QWContact/QWContact/QWAddContact */
    qwAddContact: (v1: string, v2: string) =>
      dispatch("/QWContact/QWContact/QWAddContact", { v1, v2 }),

    /** /QWContact/SearchQWContact */
    searchQWContact: (keyword: string) =>
      dispatch("/QWContact/SearchQWContact", { keyword }),
  };
}

export type WppQWContactApi = ReturnType<typeof makeWppQWContact>;
