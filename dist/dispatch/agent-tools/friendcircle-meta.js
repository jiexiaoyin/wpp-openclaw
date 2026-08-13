import { Type } from "typebox";
import { makeWppFriendCircle } from "../../send/friendcircle.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";
function getFriendCircleApi() {
    const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
    if (!state)
        throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
    return makeWppFriendCircle({
        baseUrl: state.config.apiBaseUrl,
        tokenKey: state.config.tokenKey,
        authcode: state.authcode,
        accountId: getCurrentAccountId() ?? "default",
    });
}
export const FRIEND_CIRCLE_META = {
    getFriendCircleList: [
        "获取朋友圈首页 (firstPageMd5 翻页).",
        Type.Object({
            firstPageMd5: Type.Optional(Type.String()),
        }),
        (firstPageMd5) => getFriendCircleApi().getList(firstPageMd5 ?? ""),
    ],
    getFriendCircleByUser: [
        "获取特定人朋友圈.",
        Type.Object({ wxid: Type.String() }),
        (wxid) => getFriendCircleApi().getDetail(wxid),
    ],
    getFriendCircleBySnsId: [
        "获取特定 snsId 详情.",
        Type.Object({ snsId: Type.String() }),
        (snsId) => getFriendCircleApi().getIdDetail(snsId),
    ],
    commentFriendCircle: [
        "朋友圈点赞/评论 (走 /FriendCircle/Comment). commentType: 1=点赞, 2=文本评论. 点赞传 content=👍 + commentType=1. ⚠️ 朋友圈点赞不要用 likeFinderPost (那是视频号 Finder 的工具).",
        Type.Object({
            snsId: Type.String(),
            content: Type.String(),
            commentType: Type.Optional(Type.Number()),
            replyCommnetId: Type.Optional(Type.Number()),
        }),
        (snsId, content, commentType, replyCommnetId) => getFriendCircleApi().comment(snsId, content, commentType ?? 1, replyCommnetId ?? 0),
    ],
    operateFriendCircle: [
        "朋友圈操作. op: delete|setTop|cancelSetTop.",
        Type.Object({
            snsId: Type.String(),
            op: Type.Union([
                Type.Literal("delete"),
                Type.Literal("setTop"),
                Type.Literal("cancelSetTop"),
            ]),
        }),
        (snsId, _op) => getFriendCircleApi().operation(snsId, 1),
    ],
    setFriendCirclePrivacy: [
        "朋友圈隐私设置. scope 查 vendor 文档.",
        Type.Object({ scope: Type.Number() }),
        (scope) => getFriendCircleApi().privacySettings(String(scope), 0),
    ],
    getFriendCircleComments: [
        "获取某朋友圈的所有评论.",
        Type.Object({ snsId: Type.String() }),
        (snsId) => getFriendCircleApi().getComment(snsId),
    ],
    startFriendCircleCommentTask: [
        "启动评论检查后台任务, 转发 callback 形式的评论事件.",
        Type.Object({}),
        () => getFriendCircleApi().pushComment(),
    ],
    syncFriendCircleSns: [
        "查询朋友圈正在评论/转发的 sns ID (用于同步评论事件).",
        Type.Object({}),
        () => getFriendCircleApi().mmSnsSync(),
    ],
    uploadCircleMedia: [
        "上传朋友圈媒体 (发朋友圈时用). base64 是要上传的图片/视频内容, key 是媒体标识.",
        Type.Object({
            key: Type.String({ description: "媒体标识" }),
            base64: Type.String({ description: "要上传的图片/视频内容 (base64)" }),
        }),
        (key, base64) => getFriendCircleApi().upload(key, base64),
    ],
    downloadCircleVideo: [
        "下载朋友圈视频. key=视频 md5 (或 media id), url=完整视频 CDN URL (来自 GetDetail ObjectDesc). 返回 base64 视频数据.",
        Type.Object({
            key: Type.String({ description: "视频 md5 或 media id" }),
            url: Type.String({ description: "完整视频 CDN URL" }),
        }),
        (key, url) => getFriendCircleApi().downloadVideo(key, url),
    ],
    uploadCircleVideo: [
        "上传朋友圈视频 (发视频朋友圈前置). videoData=视频 base64, thumbData=缩略图 base64.",
        Type.Object({
            videoData: Type.String({ description: "视频内容 base64" }),
            thumbData: Type.String({ description: "缩略图 base64" }),
        }),
        (videoData, thumbData) => getFriendCircleApi().uploadVideo(videoData, thumbData),
    ],
    uploadCircleImage: [
        "上传单张朋友圈图片. imageData=图片 base64.",
        Type.Object({ imageData: Type.String({ description: "图片内容 base64" }) }),
        (imageData) => getFriendCircleApi().uploadImage(imageData),
    ],
    uploadCircleImages: [
        "批量上传朋友圈图片. imageDataList=图片 base64 数组.",
        Type.Object({
            imageDataList: Type.Array(Type.String(), { description: "图片 base64 数组" }),
        }),
        (imageDataList) => getFriendCircleApi().uploadImages(imageDataList),
    ],
    publishCircleRaw: [
        "发布朋友圈 (原始 XML 兼容接口). content=文字内容, blackList/withUserList 可选.",
        Type.Object({
            content: Type.String({ description: "朋友圈文字" }),
            blackList: Type.Optional(Type.String()),
            withUserList: Type.Optional(Type.String()),
        }),
        (content, blackList, withUserList) => getFriendCircleApi().messagesRaw(content, blackList ?? "", withUserList ?? ""),
    ],
    setCircleBackgroundImage: [
        "设置朋友圈背景图. imageData=图片 base64.",
        Type.Object({ imageData: Type.String({ description: "背景图 base64" }) }),
        (imageData) => getFriendCircleApi().setBackgroundImage(imageData),
    ],
};
