import { Type } from "typebox";
import { makeWppSearch } from "../../send/search.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";
function getSearchApi() {
    const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
    if (!state)
        throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
    return makeWppSearch({
        baseUrl: state.config.apiBaseUrl,
        tokenKey: state.config.tokenKey,
        authcode: state.authcode,
        accountId: getCurrentAccountId() ?? "default",
    });
}
export const SEARCH_META = {
    searchAll: [
        "微信综合搜索 (文章/公众号/小程序一起).",
        Type.Object({ query: Type.String(), cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
        (query) => getSearchApi().all(query),
    ],
    searchArticles: [
        "公众号文章搜索.",
        Type.Object({ query: Type.String(), cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
        (query) => getSearchApi().articles(query),
    ],
    searchOfficialAccounts: [
        "公众号与账号搜索.",
        Type.Object({ query: Type.String(), cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
        (query) => getSearchApi().officialAccounts(query),
    ],
    searchMiniPrograms: [
        "小程序搜索.",
        Type.Object({ query: Type.String(), cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
        (query) => getSearchApi().miniPrograms(query),
    ],
    searchChannels: [
        "视频号内容搜索.",
        Type.Object({ query: Type.String(), cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
        (query) => getSearchApi().channels(query),
    ],
    searchMoments: [
        "朋友圈搜索.",
        Type.Object({ query: Type.String(), cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
        (query) => getSearchApi().moments(query),
    ],
    searchImages: [
        "图片搜索.",
        Type.Object({ query: Type.String(), cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
        (query) => getSearchApi().images(query),
    ],
    searchNews: [
        "新闻搜索.",
        Type.Object({ query: Type.String(), cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
        (query) => getSearchApi().news(query),
    ],
    searchBaike: [
        "百科搜索.",
        Type.Object({ query: Type.String(), cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
        (query) => getSearchApi().baike(query),
    ],
    searchBooks: [
        "读书搜索.",
        Type.Object({ query: Type.String(), cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
        (query) => getSearchApi().books(query),
    ],
    searchEmoji: [
        "表情搜索 (可分页).",
        Type.Object({ query: Type.String(), cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
        (query) => getSearchApi().emoji(query),
    ],
    searchAI: [
        "AI 搜索 (深度问答增强).",
        Type.Object({
            query: Type.String(),
            model: Type.Optional(Type.String()),
            sessionId: Type.Optional(Type.String()),
            turn: Type.Optional(Type.Number()),
        }),
        (query) => getSearchApi().ai(query),
    ],
    searchCapabilities: [
        "查看通用搜索支持的分类.",
        Type.Object({}),
        () => getSearchApi().capabilities(),
    ],
    searchServices: [
        "查看高级搜索能力目录.",
        Type.Object({}),
        () => getSearchApi().services(),
    ],
    searchGateway: [
        "兼容旧版搜一搜网页网关.",
        Type.Object({ query: Type.String() }),
        (query) => getSearchApi().gateway(query),
    ],
    searchQuery: [
        "通用分类搜索. category 可选 (空=全部).",
        Type.Object({
            query: Type.String(),
            category: Type.Optional(Type.String()),
        }),
        (query, category) => getSearchApi().query(query, category ?? ""),
    ],
    searchService: [
        "调用高级搜索能力 (name 是能力名).",
        Type.Object({
            name: Type.String({ description: "能力名" }),
            query: Type.Optional(Type.String()),
        }),
        (name, query) => getSearchApi().service(name, query ?? ""),
    ],
    channelsDetail: [
        "获取视频号内容详情. contentToken 来自视频号搜索结果.",
        Type.Object({ contentToken: Type.String() }),
        (contentToken) => getSearchApi().channelsDetail(contentToken),
    ],
    channelsComments: [
        "获取视频号评论. commentToken 来自搜索结果, cursor 翻页, rootCommentId 看一级评论的回复.",
        Type.Object({
            commentToken: Type.String(),
            cursor: Type.Optional(Type.String()),
            rootCommentId: Type.Optional(Type.String()),
        }),
        (commentToken, cursor, rootCommentId) => getSearchApi().channelsComments(commentToken, cursor ?? "", rootCommentId ?? ""),
    ],
    channelsMedia: [
        "获取视频号媒体流. mediaToken 来自搜索结果, download=1 下载 / 0 预览播放.",
        Type.Object({
            mediaToken: Type.String(),
            download: Type.Optional(Type.Number({ description: "1 下载, 0 预览" })),
        }),
        (mediaToken, download) => getSearchApi().channelsMedia(mediaToken, download ?? 0),
    ],
    channelsResolveShare: [
        "解析视频号分享链接 (weixin.qq.com/sph/... 分享链接), 返回可直接使用的业务字段.",
        Type.Object({ url: Type.String() }),
        (url) => getSearchApi().channelsResolveShare(url),
    ],
    aiConversation: [
        "获取 AI 搜索会话 (问答轮次/Markdown 答案/参考资料/建议追问). sessionId=会话 ID.",
        Type.Object({ sessionId: Type.String() }),
        (sessionId) => getSearchApi().aiConversation(sessionId),
    ],
    aiFollowUp: [
        "AI 搜索追问 (用首问返回的 sessionId 继续对话).",
        Type.Object({
            sessionId: Type.String(),
            query: Type.String(),
            clientMessageId: Type.Optional(Type.String()),
        }),
        (sessionId, query, clientMessageId) => getSearchApi().aiFollowUp(sessionId, query, clientMessageId ?? ""),
    ],
};
