// src/send/qwcontact.ts - QWContact tag (3 endpoints: 企业微信联系人)

import { postWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppQWContact(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /QWContact/QWApplyAddContact — 企业联系人添加 (v1.3.67 对齐新 swagger: context/username/v1) */
    qwApplyAddContact: (username: string, v1: string, context = "") =>
      dispatch("/QWContact/QWApplyAddContact", context ? { context, username, v1 } : { username, v1 }),

    /** /QWContact/QWAddContact — 搜索结果添加 (v1.3.67 路径去重 + 对齐 username/v1; 旧 /QWContact/QWContact/QWAddContact 已废弃) */
    qwAddContact: (username: string, v1: string) =>
      dispatch("/QWContact/QWAddContact", { username, v1 }),

    /** /QWContact/SearchQWContact — 企业联系人搜索 (v1.3.67 对齐 username; 旧 keyword 已废弃) */
    searchQWContact: (username: string) =>
      dispatch("/QWContact/SearchQWContact", { username }),
  };
}

export type WppQWContactApi = ReturnType<typeof makeWppQWContact>;
