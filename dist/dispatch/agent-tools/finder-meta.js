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
    searchFinderUser: [
        "搜索视频号用户.",
        Type.Object({ keyword: Type.String() }),
        (keyword) => getFinderApi().search(keyword),
    ],
    getFinderRecommend: [
        "获取视频号推荐流.",
        Type.Object({ page: Type.Optional(Type.Number()) }),
        () => getFinderApi().getRecommend(),
    ],
    followFinderUser: [
        "关注视频号用户. operation: follow|unfollow.",
        Type.Object({
            finderId: Type.String(),
            operation: Type.Union([Type.Literal("follow"), Type.Literal("unfollow")]),
        }),
        (finderId) => getFinderApi().follow(finderId),
    ],
    likeFinderPost: [
        "点赞视频号内容. operation: like|unlike.",
        Type.Object({
            objectId: Type.String(),
            operation: Type.Union([Type.Literal("like"), Type.Literal("unlike")]),
        }),
        (objectId) => getFinderApi().like(objectId),
    ],
    commentFinderPost: [
        "评论视频号内容.",
        Type.Object({ objectId: Type.String(), content: Type.String() }),
        (objectId, content) => getFinderApi().comment(objectId, "", content),
    ],
    sendFinderDm: [
        "发视频号私信.",
        Type.Object({ sessionId: Type.String(), content: Type.String() }),
        (sessionId, content) => getFinderApi().finderSendText(sessionId, content),
    ],
    getFinderUserPage: [
        "获取指定视频号用户主页数据.",
        Type.Object({ finderId: Type.String() }),
        (finderId) => getFinderApi().targetUserPage(finderId),
    ],
    getFinderMine: [
        "获取当前账号的视频号中心信息.",
        Type.Object({}),
        () => getFinderApi().userPrepare(),
    ],
    getFinderLiveDetail: [
        "获取视频号直播详情.",
        Type.Object({ liveId: Type.String() }),
        (liveId) => getFinderApi().finderLiveDetail(liveId, ""),
    ],
    decryptFinderComment: [
        "解密视频号评论内容 (encryptedContent 是加密串).",
        Type.Object({ encryptedContent: Type.String() }),
        (encryptedContent) => getFinderApi().decrypt(encryptedContent),
    ],
    getFinderMsgSessionId: [
        "获取视频号私信会话 ID.",
        Type.Object({ toFinderId: Type.String() }),
        (toFinderId) => getFinderApi().finderGetMsgSessionId(toFinderId),
    ],
    searchFinderList: [
        "获取视频号搜索列表.",
        Type.Object({}),
        () => getFinderApi().finderSearchList(),
    ],
    getFinderTopicList: [
        "获取视频号主题列表.",
        Type.Object({
            topTitle: Type.Optional(Type.String({ description: "顶部标题 (可选)" })),
        }),
        (topTitle) => getFinderApi().finderGetTopicList(topTitle ?? ""),
    ],
    getFinderCommentList: [
        "获取视频号评论列表 (rootCommentId 可选用于翻页).",
        Type.Object({
            objectId: Type.String({ description: "视频号内容 Id" }),
            rootCommentId: Type.Optional(Type.String()),
        }),
        (objectId, rootCommentId) => getFinderApi().getCommentList(objectId, rootCommentId ?? ""),
    ],
    getFinderCommentDetail: [
        "获取视频号评论详情.",
        Type.Object({
            finderUsername: Type.String(),
            objectId: Type.String({ description: "内容 Id" }),
            rootCommentId: Type.Optional(Type.String()),
        }),
        (finderUsername, objectId, rootCommentId) => getFinderApi().getCommentDetail(finderUsername, objectId, rootCommentId ?? ""),
    ],
};
