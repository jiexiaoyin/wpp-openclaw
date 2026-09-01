// src/dispatch/agent-tools/finder-meta.ts - Finder tag (15)
// v1.3.18 P1-核心1 fix (2026-08-10): 改成 lazy-evaluate ctx 模式
// 注: follow/like/comment/finderLiveDetail 等与 api 签名差异保留 — 跟原版一样 (meta schema 描述与 api 实际参数不一致是历史问题)
import { Type } from "typebox";
import { makeWppFinder } from "../../send/finder.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";
function getFinderApi() {
    const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
    if (!state)
        throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
    return makeWppFinder({
        baseUrl: state.config.apiBaseUrl,
        tokenKey: state.config.tokenKey,
        authcode: state.authcode,
        accountId: getCurrentAccountId() ?? "default",
    });
}
export const FINDER_META = {
    /** /Finder/Search */
    searchFinderUser: [
        "搜索视频号用户.",
        Type.Object({ keyword: Type.String() }),
        (keyword) => getFinderApi().search(keyword),
    ],
    /** /Finder/GetRecommend */
    getFinderRecommend: [
        "获取视频号推荐流.",
        Type.Object({ page: Type.Optional(Type.Number()) }),
        () => getFinderApi().getRecommend(),
    ],
    /** /Finder/Follow */
    followFinderUser: [
        "关注视频号用户. operation: follow|unfollow.",
        Type.Object({
            finderId: Type.String(),
            operation: Type.Union([Type.Literal("follow"), Type.Literal("unfollow")]),
        }),
        (finderId) => getFinderApi().follow(finderId),
    ],
    /** /Finder/Like */
    likeFinderPost: [
        "点赞视频号内容. operation: like|unlike.",
        Type.Object({
            objectId: Type.String(),
            operation: Type.Union([Type.Literal("like"), Type.Literal("unlike")]),
        }),
        (objectId) => getFinderApi().like(objectId),
    ],
    /** /Finder/Comment */
    commentFinderPost: [
        "评论视频号内容.",
        Type.Object({ objectId: Type.String(), content: Type.String() }),
        // 原版 api.comment(objectId, content) (username=objectId 是历史 bug, 与 v1.3.18 修复无关 — 不优化)
        (objectId, content) => getFinderApi().comment(objectId, "", content),
    ],
    /** /Finder/FinderSendText */
    sendFinderDm: [
        "发视频号私信.",
        Type.Object({ sessionId: Type.String(), content: Type.String() }),
        (sessionId, content) => getFinderApi().finderSendText(sessionId, content),
    ],
    /** /Finder/TargetUserPage */
    getFinderUserPage: [
        "获取指定视频号用户主页数据.",
        Type.Object({ finderId: Type.String() }),
        (finderId) => getFinderApi().targetUserPage(finderId),
    ],
    /** /Finder/UserPrepare */
    getFinderMine: [
        "获取当前账号的视频号中心信息.",
        Type.Object({}),
        () => getFinderApi().userPrepare(),
    ],
    /** /Finder/FinderLiveDetail */
    getFinderLiveDetail: [
        "获取视频号直播详情.",
        Type.Object({ liveId: Type.String() }),
        // 原版 api.finderLiveDetail(liveId) (finderNonceId 缺省, 是历史不一致, 不优化)
        (liveId) => getFinderApi().finderLiveDetail(liveId, ""),
    ],
    /**
     * v1.3.20 P3-FINDER: /Finder/Decrypt — 评论内容解密.
     */
    decryptFinderComment: [
        "解密视频号评论内容 (encryptedContent 是加密串).",
        Type.Object({ encryptedContent: Type.String() }),
        (encryptedContent) => getFinderApi().decrypt(encryptedContent),
    ],
    /**
     * v1.3.20 P3-FINDER: /Finder/FinderGetMsgSessionId — 获取私信会话 ID.
     */
    getFinderMsgSessionId: [
        "获取视频号私信会话 ID.",
        Type.Object({ toFinderId: Type.String() }),
        (toFinderId) => getFinderApi().finderGetMsgSessionId(toFinderId),
    ],
    /**
     * v1.3.20 P3-FINDER: /Finder/FinderSearchList — 搜索列表.
     */
    searchFinderList: [
        "获取视频号搜索列表.",
        Type.Object({}),
        () => getFinderApi().finderSearchList(),
    ],
    /**
     * v1.3.20 P3-FINDER: /Finder/Findergettopiclist — 主题列表.
     */
    getFinderTopicList: [
        "获取视频号主题列表.",
        Type.Object({
            topTitle: Type.Optional(Type.String({ description: "顶部标题 (可选)" })),
        }),
        (topTitle) => getFinderApi().finderGetTopicList(topTitle ?? ""),
    ],
    /**
     * v1.3.20 P3-FINDER: /Finder/GetCommentList — 评论列表/详情.
     */
    getFinderCommentList: [
        "获取视频号评论列表 (rootCommentId 可选用于翻页).",
        Type.Object({
            objectId: Type.String({ description: "视频号内容 Id" }),
            rootCommentId: Type.Optional(Type.String()),
        }),
        (objectId, rootCommentId) => getFinderApi().getCommentList(objectId, rootCommentId ?? ""),
    ],
    /**
     * v1.3.20 P3-FINDER: /Finder/GetCommentDetail — 评论详情.
     */
    getFinderCommentDetail: [
        "获取视频号评论详情.",
        Type.Object({
            finderUsername: Type.String(),
            objectId: Type.String({ description: "内容 Id" }),
            rootCommentId: Type.Optional(Type.String()),
        }),
        (finderUsername, objectId, rootCommentId) => getFinderApi().getCommentDetail(finderUsername, objectId, rootCommentId ?? ""),
    ],
    /** /Finder/PlayVideo — 视频号播放控制 (v1.3.67 新 API) */
    playVideo: [
        "播放视频号视频. objectId=视频内容Id, finderUsername=作者, playUrl=播放地址 (选传); loop=true 循环播放.",
        Type.Object({
            objectId: Type.Optional(Type.String()),
            finderUsername: Type.Optional(Type.String()),
            playUrl: Type.Optional(Type.String()),
            loop: Type.Optional(Type.Boolean()),
            playSeconds: Type.Optional(Type.Number({ description: "播放秒数, 0=不限" })),
        }),
        (opts) => getFinderApi().playVideo(opts),
    ],
    /** /Finder/PlayVideoStop — 停止视频播放 (v1.3.67 新 API) */
    playVideoStop: [
        "停止视频号播放任务. taskId=playVideo 返回的任务 ID.",
        Type.Object({ taskId: Type.String() }),
        (taskId) => getFinderApi().playVideoStop(taskId),
    ],
    /** /Finder/PlayVideoStatus — 视频播放状态 (v1.3.67 新 API GET) */
    playVideoStatus: [
        "查询视频号播放任务状态. taskId=任务 ID.",
        Type.Object({ taskId: Type.String() }),
        (taskId) => getFinderApi().playVideoStatus(taskId),
    ],
    /** /Finder/PlayVideoTasks — 播放任务列表 (v1.3.67 新 API GET) */
    playVideoTasks: [
        "列出视频号播放任务 (运行中 + 24h 内已结束).",
        Type.Object({}),
        () => getFinderApi().playVideoTasks(),
    ],
};
//# sourceMappingURL=finder-meta.js.map