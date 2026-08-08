// src/send/sayhello.ts - SayHello tag (2 endpoints: 打招呼)

import { postWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppSayHello(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /SayHello/Modelv1 — 模式1: 扫码 */
    modelv1: (scene: string, v1: string) =>
      dispatch("/SayHello/Modelv1", { scene, v1 }),

    /** /SayHello/Modelv2 — 模式3: v3/v4 打招呼 */
    modelv2: (v1: string, v2: string) =>
      dispatch("/SayHello/Modelv2", { v1, v2 }),
  };
}

export type WppSayHelloApi = ReturnType<typeof makeWppSayHello>;
