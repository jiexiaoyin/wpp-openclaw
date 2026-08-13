import { Type } from "typebox";
import { makeWppFavorites } from "../../send/index.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";
function getFav() {
    const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
    if (!state)
        throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
    return makeWppFavorites({
        baseUrl: state.config.apiBaseUrl,
        tokenKey: state.config.tokenKey,
        authcode: state.authcode,
        accountId: getCurrentAccountId() ?? "default",
    });
}
export const FAVORITES_META = {
    favoritesSync: ["同步收藏内容.", Type.Object({}), () => getFav().sync()],
    favoritesGetInfo: ["获取收藏信息.", Type.Object({ favId: Type.String() }), (favId) => getFav().getFavInfo(favId)],
    favoritesGetItem: ["获取收藏原文.", Type.Object({ favId: Type.String() }), (favId) => getFav().getFavItem(favId)],
    favoritesDel: ["删除收藏.", Type.Object({ favId: Type.String() }), (favId) => getFav().del(favId)],
};
