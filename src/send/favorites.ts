// src/send/favorites.ts - Favor tag (4 endpoints: 收藏)

import { postWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppFavorites(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /Favor/Del — favId 必须 number (新旧 swagger 均 integer; 传 string 新 vendor 报 json unmarshal 错误) */
    del: (favId: number | string) => dispatch("/Favor/Del", { favId: Number(favId) }),

    /** /Favor/GetFavInfo — 新 vendor 无 body (忽略 favId), 保留兼容 */
    getFavInfo: (favId?: number | string) => dispatch("/Favor/GetFavInfo", favId === undefined ? {} : { favId: Number(favId) }),

    /** /Favor/GetFavItem — favId 必须 number */
    getFavItem: (favId: number | string) => dispatch("/Favor/GetFavItem", { favId: Number(favId) }),

    /** /Favor/Sync */
    sync: () => dispatch("/Favor/Sync", {}),
  };
}

export type WppFavoritesApi = ReturnType<typeof makeWppFavorites>;
