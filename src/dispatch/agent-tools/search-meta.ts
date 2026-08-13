// src/dispatch/agent-tools/search-meta.ts - Search tag (18)
// v1.3.18 P1-核心1 fix (2026-08-10): 改成 lazy-evaluate ctx 模式

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppSearch } from "../../send/search.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";

function getSearchApi() {
  const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
  if (!state) throw new Error("account not found: default");
  return makeWppSearch({
    baseUrl: state.config.apiBaseUrl,
    tokenKey: state.config.tokenKey,
    authcode: state.authcode,
    accountId: getCurrentAccountId() ?? "default",
  });
}

export const SEARCH_META: ToolMeta = {
  /** /Search/All */
  searchAll: [
    "微信综合搜索 (文章/公众号/小程序一起).",
    Type.Object({ query: Type.String(), cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
    (query: string) => getSearchApi().all(query),
  ],
  /** /Search/Articles */
  searchArticles: [
    "公众号文章搜索.",
    Type.Object({ query: Type.String(), cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
    (query: string) => getSearchApi().articles(query),
  ],
  /** /Search/OfficialAccounts */
  searchOfficialAccounts: [
    "公众号与账号搜索.",
    Type.Object({ query: Type.String(), cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
    (query: string) => getSearchApi().officialAccounts(query),
  ],
  /** /Search/MiniPrograms */
  searchMiniPrograms: [
    "小程序搜索.",
    Type.Object({ query: Type.String(), cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
    (query: string) => getSearchApi().miniPrograms(query),
  ],
  /** /Search/Channels */
  searchChannels: [
    "视频号内容搜索.",
    Type.Object({ query: Type.String(), cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
    (query: string) => getSearchApi().channels(query),
  ],
  /** /Search/Moments */
  searchMoments: [
    "朋友圈搜索.",
    Type.Object({ query: Type.String(), cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
    (query: string) => getSearchApi().moments(query),
  ],
  /** /Search/Images */
  searchImages: [
    "图片搜索.",
    Type.Object({ query: Type.String(), cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
    (query: string) => getSearchApi().images(query),
  ],
  /** /Search/News */
  searchNews: [
    "新闻搜索.",
    Type.Object({ query: Type.String(), cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
    (query: string) => getSearchApi().news(query),
  ],
  /** /Search/Baike */
  searchBaike: [
    "百科搜索.",
    Type.Object({ query: Type.String(), cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
    (query: string) => getSearchApi().baike(query),
  ],
  /** /Search/Books */
  searchBooks: [
    "读书搜索.",
    Type.Object({ query: Type.String(), cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
    (query: string) => getSearchApi().books(query),
  ],
  /** /Search/Emoji */
  searchEmoji: [
    "表情搜索 (可分页).",
    Type.Object({ query: Type.String(), cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
    (query: string) => getSearchApi().emoji(query),
  ],
  /** /Search/AI */
  searchAI: [
    "AI 搜索 (深度问答增强).",
    Type.Object({
      query: Type.String(),
      model: Type.Optional(Type.String()),
      sessionId: Type.Optional(Type.String()),
      turn: Type.Optional(Type.Number()),
    }),
    (query: string) => getSearchApi().ai(query),
  ],
  // ===== v1.3.25 SWAGGER-254: 新增 5 个通用搜索 =====

  /** /Search/Capabilities — GET 通用搜索分类 */
  searchCapabilities: [
    "查看通用搜索支持的分类.",
    Type.Object({}),
    () => getSearchApi().capabilities(),
  ],
  /** /Search/Services — GET 高级搜索能力目录 */
  searchServices: [
    "查看高级搜索能力目录.",
    Type.Object({}),
    () => getSearchApi().services(),
  ],
  /** /Search/Gateway — 兼容旧版搜一搜网关 */
  searchGateway: [
    "兼容旧版搜一搜网页网关.",
    Type.Object({ query: Type.String() }),
    (query: string) => getSearchApi().gateway(query),
  ],
  /** /Search/Query — 通用分类搜索 */
  searchQuery: [
    "通用分类搜索. category 可选 (空=全部).",
    Type.Object({
      query: Type.String(),
      category: Type.Optional(Type.String()),
    }),
    (query: string, category?: string) => getSearchApi().query(query, category ?? ""),
  ],
  /** /Search/Service/{name} — 高级搜索能力调用 */
  searchService: [
    "调用高级搜索能力 (name 是能力名).",
    Type.Object({
      name: Type.String({ description: "能力名" }),
      query: Type.Optional(Type.String()),
    }),
    (name: string, query?: string) => getSearchApi().service(name, query ?? ""),
  ],
};