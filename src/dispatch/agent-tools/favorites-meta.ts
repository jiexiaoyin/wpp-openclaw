// src/dispatch/agent-tools/favorites-meta.ts - Favor tag (收藏, 4)

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppFavorites } from "../../send/index.js";
import { getDefaultAccountRegistry } from "../../account-state.js";

function getFav() {
  const state = getDefaultAccountRegistry().get("default");
  if (!state) throw new Error("account not found: default");
  return makeWppFavorites({
    baseUrl: state.config.apiBaseUrl,
    tokenKey: state.config.tokenKey,
    authcode: state.authcode,
    accountId: "default",
  });
}

export const FAVORITES_META: ToolMeta = {
  favoritesSync: ["同步收藏内容.", Type.Object({}), () => getFav().sync()],
  favoritesGetInfo: ["获取收藏信息.", Type.Object({ favId: Type.String() }), (favId: string) => getFav().getFavInfo(favId)],
  favoritesGetItem: ["获取收藏原文.", Type.Object({ favId: Type.String() }), (favId: string) => getFav().getFavItem(favId)],
  favoritesDel: ["删除收藏.", Type.Object({ favId: Type.String() }), (favId: string) => getFav().del(favId)],
};
