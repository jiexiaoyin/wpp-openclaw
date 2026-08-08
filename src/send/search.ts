// src/send/search.ts - Search tag (18 endpoints: comprehensive 搜索)

import { postWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppSearch(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /Search/AI — AI 搜索 */
    ai: (keyword: string) => dispatch("/Search/AI", { keyword }),

    /** /Search/All — 综合 */
    all: (keyword: string) => dispatch("/Search/All", { keyword }),

    /** /Search/Articles — 公众号文章 */
    articles: (keyword: string) => dispatch("/Search/Articles", { keyword }),

    /** /Search/Baike — 百科 */
    baike: (keyword: string) => dispatch("/Search/Baike", { keyword }),

    /** /Search/Books — 读书 */
    books: (keyword: string) => dispatch("/Search/Books", { keyword }),

    /** /Search/Channels — 视频号内容 */
    channels: (keyword: string) => dispatch("/Search/Channels", { keyword }),

    /** /Search/Emoji — 表情 */
    emoji: (keyword: string, page?: number) =>
      dispatch("/Search/Emoji", { keyword, page: page ?? 0 }),

    /** /Search/Images — 图片 */
    images: (keyword: string) => dispatch("/Search/Images", { keyword }),

    /** /Search/Listen — 听一听 */
    listen: (keyword: string) => dispatch("/Search/Listen", { keyword }),

    /** /Search/Live — 直播 */
    live: (keyword: string) => dispatch("/Search/Live", { keyword }),

    /** /Search/MiniGames — 小游戏 */
    miniGames: (keyword: string) => dispatch("/Search/MiniGames", { keyword }),

    /** /Search/MiniPrograms — 小程序 */
    miniPrograms: (keyword: string) => dispatch("/Search/MiniPrograms", { keyword }),

    /** /Search/Moments — 朋友圈 */
    moments: (keyword: string) => dispatch("/Search/Moments", { keyword }),

    /** /Search/News — 新闻 */
    news: (keyword: string) => dispatch("/Search/News", { keyword }),

    /** /Search/OfficialAccounts — 公众号与账号 */
    officialAccounts: (keyword: string) =>
      dispatch("/Search/OfficialAccounts", { keyword }),

    /** /Search/Stickers — 贴图 */
    stickers: (keyword: string) => dispatch("/Search/Stickers", { keyword }),

    /** /Search/Underlines — 划线 */
    underlines: (keyword: string) => dispatch("/Search/Underlines", { keyword }),

    /** /Search/WeChatIndex — 微信指数 */
    weChatIndex: (keyword: string) => dispatch("/Search/WeChatIndex", { keyword }),
  };
}

export type WppSearchApi = ReturnType<typeof makeWppSearch>;
