// src/send/factory.ts - 通用 vendor 凭证 + endpoint ctx
// 每个 makeXxxTag 函数接收 ctx, 返回对象 (含各 vendor endpoint 的 dispatch method)

import type { WppApiResponse, WppCallOptions } from "../api/client.js";

export interface WppAccountCtx {
  baseUrl: string;
  tokenKey: string;
  authcode?: string;
  accountId: string;
}

/** Convert ctx to WppCallOptions (reused by all postWppJson calls) */
export function ctxToCallOpts(ctx: WppAccountCtx): WppCallOptions {
  return {
    tokenKey: ctx.tokenKey,
    authcode: ctx.authcode,
    accountId: ctx.accountId,
  };
}

/** Standard response type */
export type Resp<T = unknown> = Promise<WppApiResponse<T>>;
