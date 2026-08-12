// src/send/search.ts - Search tag (18 endpoints)
// v1.1.27 SEARCH-FIELD-FIX (2026-08-08 P1-1): 批量改字段名对齐 swagger
//   之前: 全部用 keyword → 静默失效 (vendor 是 query)
//   fix: Search.VerticalRequest = {query, cursor, limit, offset, ...}
//        Search.AIRequest = {model, query, session_id, turn, ...}

import { postWppJson, getWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppSearch(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /Search/AI — AI 搜索 (Search.AIRequest: model/query/session_id/turn) */
    ai: (query: string, opts2?: { model?: string; sessionId?: string; turn?: number }) =>
      dispatch("/Search/AI", {
        query,
        model: opts2?.model ?? "deepseek",
        session_id: opts2?.sessionId ?? "",
        turn: opts2?.turn ?? 1,
      }),

    /** /Search/All — 综合 */
    all: (query: string, cursor = "", limit = 20) =>
      dispatch("/Search/All", { query, cursor, limit }),

    /** /Search/Articles — 公众号文章 */
    articles: (query: string, cursor = "", limit = 20) =>
      dispatch("/Search/Articles", { query, cursor, limit }),

    /** /Search/Baike — 百科 */
    baike: (query: string, cursor = "", limit = 20) =>
      dispatch("/Search/Baike", { query, cursor, limit }),

    /** /Search/Books — 读书 */
    books: (query: string, cursor = "", limit = 20) =>
      dispatch("/Search/Books", { query, cursor, limit }),

    /** /Search/Channels — 视频号内容 */
    channels: (query: string, cursor = "", limit = 20) =>
      dispatch("/Search/Channels", { query, cursor, limit }),

    /** /Search/Emoji — 表情 */
    emoji: (query: string, cursor = "", limit = 20) =>
      dispatch("/Search/Emoji", { query, cursor, limit }),

    /** /Search/Images — 图片 */
    images: (query: string, cursor = "", limit = 20) =>
      dispatch("/Search/Images", { query, cursor, limit }),

    /** /Search/Listen — 听一听 */
    listen: (query: string, cursor = "", limit = 20) =>
      dispatch("/Search/Listen", { query, cursor, limit }),

    /** /Search/Live — 直播 */
    live: (query: string, cursor = "", limit = 20) =>
      dispatch("/Search/Live", { query, cursor, limit }),

    /** /Search/MiniGames — 小游戏 */
    miniGames: (query: string, cursor = "", limit = 20) =>
      dispatch("/Search/MiniGames", { query, cursor, limit }),

    /** /Search/MiniPrograms — 小程序 */
    miniPrograms: (query: string, cursor = "", limit = 20) =>
      dispatch("/Search/MiniPrograms", { query, cursor, limit }),

    /** /Search/Moments — 朋友圈 */
    moments: (query: string, cursor = "", limit = 20) =>
      dispatch("/Search/Moments", { query, cursor, limit }),

    /** /Search/News — 新闻 */
    news: (query: string, cursor = "", limit = 20) =>
      dispatch("/Search/News", { query, cursor, limit }),

    /** /Search/OfficialAccounts — 公众号与账号 */
    officialAccounts: (query: string, cursor = "", limit = 20) =>
      dispatch("/Search/OfficialAccounts", { query, cursor, limit }),

    /** /Search/Stickers — 贴图 */
    stickers: (query: string, cursor = "", limit = 20) =>
      dispatch("/Search/Stickers", { query, cursor, limit }),

    /** /Search/Underlines — 划线 */
    underlines: (query: string, cursor = "", limit = 20) =>
      dispatch("/Search/Underlines", { query, cursor, limit }),

    /** /Search/WeChatIndex — 微信指数 */
    weChatIndex: (query: string, cursor = "", limit = 20) =>
      dispatch("/Search/WeChatIndex", { query, cursor, limit }),

    // ===== v1.3.25 SWAGGER-254: 新增 5 个通用搜索 =====

    /** /Search/Capabilities — GET 查看通用搜索支持的分类 */
    capabilities: () => getWppJson(ctx.baseUrl, "/Search/Capabilities", opts),

    /** /Search/Services — GET 查看高级搜索能力目录 */
    services: () => getWppJson(ctx.baseUrl, "/Search/Services", opts),

    /** /Search/Gateway — 兼容旧版搜一搜网页网关 */
    gateway: (query: string) => dispatch("/Search/Gateway", { query }),

    /** /Search/Query — 通用分类搜索 */
    query: (query: string, category = "", cursor = "") =>
      dispatch("/Search/Query", { query, category, cursor }),

    /** /Search/Service/{name} — 高级搜索能力调用入口 */
    service: (name: string, query = "", params: Record<string, unknown> = {}) =>
      dispatch(`/Search/Service/${name}`, { query, ...params }),
  };
}

export type WppSearchApi = ReturnType<typeof makeWppSearch>;