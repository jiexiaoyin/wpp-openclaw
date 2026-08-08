// src/send/favorites.ts - Favor tag (4 endpoints: 收藏)

import { postWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppFavorites(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /Favor/Del */
    del: (favId: string) => dispatch("/Favor/Del", { favId }),

    /** /Favor/GetFavInfo */
    getFavInfo: (favId: string) => dispatch("/Favor/GetFavInfo", { favId }),

    /** /Favor/GetFavItem */
    getFavItem: (favId: string) => dispatch("/Favor/GetFavItem", { favId }),

    /** /Favor/Sync */
    sync: () => dispatch("/Favor/Sync", {}),
  };
}

export type WppFavoritesApi = ReturnType<typeof makeWppFavorites>;
