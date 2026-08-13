import { postWppJson, getWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppSearch(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        ai: (query, opts2) => dispatch("/Search/AI", {
            query,
            model: opts2?.model ?? "deepseek",
            session_id: opts2?.sessionId ?? "",
            turn: opts2?.turn ?? 1,
        }),
        all: (query, cursor = "", limit = 20) => dispatch("/Search/All", { query, cursor, limit }),
        articles: (query, cursor = "", limit = 20) => dispatch("/Search/Articles", { query, cursor, limit }),
        baike: (query, cursor = "", limit = 20) => dispatch("/Search/Baike", { query, cursor, limit }),
        books: (query, cursor = "", limit = 20) => dispatch("/Search/Books", { query, cursor, limit }),
        channels: (query, cursor = "", limit = 20) => dispatch("/Search/Channels", { query, cursor, limit }),
        emoji: (query, cursor = "", limit = 20) => dispatch("/Search/Emoji", { query, cursor, limit }),
        images: (query, cursor = "", limit = 20) => dispatch("/Search/Images", { query, cursor, limit }),
        listen: (query, cursor = "", limit = 20) => dispatch("/Search/Listen", { query, cursor, limit }),
        live: (query, cursor = "", limit = 20) => dispatch("/Search/Live", { query, cursor, limit }),
        miniGames: (query, cursor = "", limit = 20) => dispatch("/Search/MiniGames", { query, cursor, limit }),
        miniPrograms: (query, cursor = "", limit = 20) => dispatch("/Search/MiniPrograms", { query, cursor, limit }),
        moments: (query, cursor = "", limit = 20) => dispatch("/Search/Moments", { query, cursor, limit }),
        news: (query, cursor = "", limit = 20) => dispatch("/Search/News", { query, cursor, limit }),
        officialAccounts: (query, cursor = "", limit = 20) => dispatch("/Search/OfficialAccounts", { query, cursor, limit }),
        stickers: (query, cursor = "", limit = 20) => dispatch("/Search/Stickers", { query, cursor, limit }),
        underlines: (query, cursor = "", limit = 20) => dispatch("/Search/Underlines", { query, cursor, limit }),
        weChatIndex: (query, cursor = "", limit = 20) => dispatch("/Search/WeChatIndex", { query, cursor, limit }),
        capabilities: () => getWppJson(ctx.baseUrl, "/Search/Capabilities", opts),
        services: () => getWppJson(ctx.baseUrl, "/Search/Services", opts),
        gateway: (query) => dispatch("/Search/Gateway", { query }),
        query: (query, category = "", cursor = "") => dispatch("/Search/Query", { query, category, cursor }),
        service: (name, query = "", params = {}) => dispatch(`/Search/Service/${name}`, { query, ...params }),
    };
}
