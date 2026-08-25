// src/send/webhook.ts - Webhook tag (6 endpoints: business+standard)

import { postWppJson, getWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx, type Resp } from "./factory.js";

export function makeWppWebhook(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);

  return {
    /** /Webhook/Business/Get — GET 业务回调 URL (按授权码) */
    businessGet: (): Resp => getWppJson(ctx.baseUrl, "/Webhook/Business/Get", opts),

    /** /Webhook/Business/Set — POST 设置业务回调 URL */
    businessSet: (url: string): Resp => {
      const body: Record<string, unknown> = { url, authcode: ctx.authcode ?? "" };
      return postWppJson(ctx.baseUrl, "/Webhook/Business/Set", body, opts);
    },

    /** /Webhook/Get — GET Webhook 配置 (按授权码) */
    get: (): Resp => getWppJson(ctx.baseUrl, "/Webhook/Get", opts),

    /** /Webhook/Remove — POST 删除 Webhook 配置 */
    remove: (): Resp => postWppJson(ctx.baseUrl, "/Webhook/Remove", {}, opts),

    /** /Webhook/Set — POST 设置 Webhook 配置 */
    // v1.1.17 FULL-FIX (P0-E): 补 enabled:true (之前漏传 → Go bool 零值 false → webhook 设了等于没设)
    set: (url: string): Resp => {
      const body: Record<string, unknown> = { url, authcode: ctx.authcode ?? "", enabled: true, retryCount: 3, timeout: 10, messageTypes: ["all"] };
      return postWppJson(ctx.baseUrl, "/Webhook/Set", body, opts);
    },

    /** /Webhook/Test — POST 测试发送 Webhook 消息 */
    test: (msg?: Record<string, unknown>): Resp => {
      const body: Record<string, unknown> = { msg: msg ?? { hello: "world" }, authcode: ctx.authcode ?? "" };
      return postWppJson(ctx.baseUrl, "/Webhook/Test", body, opts);
    },
  };
}

export type WppWebhookApi = ReturnType<typeof makeWppWebhook>;
