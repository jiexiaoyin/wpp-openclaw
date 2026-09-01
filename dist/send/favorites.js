// src/send/favorites.ts - Favor tag (4 endpoints: 收藏)
import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppFavorites(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        /** /Favor/Del — favId 必须 number (新旧 swagger 均 integer; 传 string 新 vendor 报 json unmarshal 错误) */
        del: (favId) => dispatch("/Favor/Del", { favId: Number(favId) }),
        /** /Favor/GetFavInfo — 新 vendor 无 body (忽略 favId), 保留兼容 */
        getFavInfo: (favId) => dispatch("/Favor/GetFavInfo", favId === undefined ? {} : { favId: Number(favId) }),
        /** /Favor/GetFavItem — favId 必须 number */
        getFavItem: (favId) => dispatch("/Favor/GetFavItem", { favId: Number(favId) }),
        /** /Favor/Sync */
        sync: () => dispatch("/Favor/Sync", {}),
    };
}
//# sourceMappingURL=favorites.js.map