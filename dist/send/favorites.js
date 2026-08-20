import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppFavorites(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        del: (favId) => dispatch("/Favor/Del", { favId: Number(favId) }),
        getFavInfo: (favId) => dispatch("/Favor/GetFavInfo", favId === undefined ? {} : { favId: Number(favId) }),
        getFavItem: (favId) => dispatch("/Favor/GetFavItem", { favId: Number(favId) }),
        sync: () => dispatch("/Favor/Sync", {}),
    };
}
