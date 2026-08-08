// src/dispatch/agent-tools/search-meta.ts - Search tag (18)

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppSearch } from "../../send/search.js";
import type { WppAccountCtx } from "../../send/factory.js";

const ctx: WppAccountCtx = { baseUrl: "", tokenKey: "", accountId: "" };
const api = makeWppSearch(ctx);

export const SEARCH_META: ToolMeta = {
  /** /Search/All */
  searchAll: [
    "微信综合搜索 (文章/公众号/小程序一起).",
    Type.Object({ keyword: Type.String() }),
    api.all,
  ],
  /** /Search/Articles */
  searchArticles: [
    "公众号文章搜索.",
    Type.Object({ keyword: Type.String() }),
    api.articles,
  ],
  /** /Search/OfficialAccounts */
  searchOfficialAccounts: [
    "公众号与账号搜索.",
    Type.Object({ keyword: Type.String() }),
    api.officialAccounts,
  ],
  /** /Search/MiniPrograms */
  searchMiniPrograms: [
    "小程序搜索.",
    Type.Object({ keyword: Type.String() }),
    api.miniPrograms,
  ],
  /** /Search/Channels */
  searchChannels: [
    "视频号内容搜索.",
    Type.Object({ keyword: Type.String() }),
    api.channels,
  ],
  /** /Search/Moments */
  searchMoments: [
    "朋友圈搜索.",
    Type.Object({ keyword: Type.String() }),
    api.moments,
  ],
  /** /Search/Images */
  searchImages: [
    "图片搜索.",
    Type.Object({ keyword: Type.String() }),
    api.images,
  ],
  /** /Search/News */
  searchNews: [
    "新闻搜索.",
    Type.Object({ keyword: Type.String() }),
    api.news,
  ],
  /** /Search/Baike */
  searchBaike: [
    "百科搜索.",
    Type.Object({ keyword: Type.String() }),
    api.baike,
  ],
  /** /Search/Books */
  searchBooks: [
    "读书搜索.",
    Type.Object({ keyword: Type.String() }),
    api.books,
  ],
  /** /Search/Emoji */
  searchEmoji: [
    "表情搜索 (可分页).",
    Type.Object({
      keyword: Type.String(),
      page: Type.Optional(Type.Number()),
    }),
    api.emoji,
  ],
  /** /Search/AI */
  searchAI: [
    "AI 搜索 (深度问答增强).",
    Type.Object({ keyword: Type.String() }),
    api.ai,
  ],
};
