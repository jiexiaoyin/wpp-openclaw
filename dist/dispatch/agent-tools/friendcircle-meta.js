// src/dispatch/agent-tools/friendcircle-meta.ts - FriendCircle tag (11)
// v1.3.18 P1-核心1 fix (2026-08-10): 改成 lazy-evaluate ctx 模式
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
    /** /FriendCircle/GetList */
    getFriendCircleList: [
        "获取朋友圈首页 (firstPageMd5 翻页).",
        Type.Object({
            firstPageMd5: Type.Optional(Type.String()),
        }),
        (firstPageMd5) => getFriendCircleApi().getList(firstPageMd5 ?? ""),
    ],
    /** /FriendCircle/GetDetail */
    getFriendCircleByUser: [
        "获取特定人朋友圈.",
        Type.Object({ wxid: Type.String() }),
        (wxid) => getFriendCircleApi().getDetail(wxid),
    ],
    /** /FriendCircle/GetIdDetail */
    getFriendCircleBySnsId: [
        "获取特定 snsId 详情.",
        Type.Object({ snsId: Type.String() }),
        (snsId) => getFriendCircleApi().getIdDetail(snsId),
    ],
    /** /FriendCircle/Messages */
    // v1.3.41 FRIENDCIRCLE-GUARD (老板 2026-08-11): 发布工具从 agent-tools 移除 (默认禁用)
    //   朋友圈发布是对外公开操作, 不能任何人触发. send/friendcircle.ts 的
    //   publish/publishImages/publishVideo 内部有 assertFriendCirclePublishAllowed 开关校验
    //   (friendCirclePublishEnabled 默认 false + admin 白名单). 工具层不暴露发布, 防止 AI 误调.
    //   启用: 在 accounts/<id>.json 设 friendCirclePublishEnabled:true + 白名单, 再恢复工具注册.
    /** /FriendCircle/Comment */
    // v1.3.42 FIX (2026-08-11): 描述改对 vendor 语义 (1=点赞 2=文本评论, 原"1=文字 2=表情"误导 AI)
    //   + 加 replyCommnetId 可选参数 (默认 0, vendor int32 拒绝空字符串). 禁止用 likeFinderPost 点赞朋友圈 (那是视频号).
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
    /** /FriendCircle/Operation */
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
        // 原版 api.operation(snsId, op) — 但 api.operation 签名是 (snsId, type: 1|2|3)
        // 这是历史不一致, 跟 v1.3.18 修复无关, 不优化
        (snsId, _op) => getFriendCircleApi().operation(snsId, 1),
    ],
    /** /FriendCircle/PrivacySettings */
    setFriendCirclePrivacy: [
        "朋友圈隐私设置. scope 查 vendor 文档.",
        Type.Object({ scope: Type.Number() }),
        (scope) => getFriendCircleApi().privacySettings(String(scope), 0),
    ],
    /** /FriendCircle/GetCommnet */
    getFriendCircleComments: [
        "获取某朋友圈的所有评论.",
        Type.Object({ snsId: Type.String() }),
        // 原版 api.getComment(snsId) — 但 api.getComment 签名是 (xmlData: string)
        // 历史不一致, 不优化
        (snsId) => getFriendCircleApi().getComment(snsId),
    ],
    /** /FriendCircle/PushCommnet */
    startFriendCircleCommentTask: [
        "启动评论检查后台任务, 转发 callback 形式的评论事件.",
        Type.Object({}),
        () => getFriendCircleApi().pushComment(),
    ],
    /**
     * v1.3.20 P2-FRIENDCIRCLE: /FriendCircle/MmSnsSync — 查询正在评论/转发的 ID.
     * 用于检查朋友圈是否有新的评论/转发事件待处理.
     */
    syncFriendCircleSns: [
        "查询朋友圈正在评论/转发的 sns ID (用于同步评论事件).",
        Type.Object({}),
        () => getFriendCircleApi().mmSnsSync(),
    ],
    /**
     * v1.3.20 P2-FRIENDCIRCLE / v1.3.23 FIX: /FriendCircle/Upload — **上传**朋友圈媒体 (发朋友圈时用).
     * 实测 (2026-08-10): swagger summary 误写"下载CDN视频", 实际是上传 —
     *   传 base64 报 "朋友圈图片上传失败" + 返回 StartPos/TotalLen/Type (分片上传进度), Type:2=图片.
     * base64 是要上传的媒体内容 (图片/视频), key 是媒体标识.
     */
    uploadCircleMedia: [
        "上传朋友圈媒体 (发朋友圈时用). base64 是要上传的图片/视频内容, key 是媒体标识.",
        Type.Object({
            key: Type.String({ description: "媒体标识" }),
            base64: Type.String({ description: "要上传的图片/视频内容 (base64)" }),
        }),
        (key, base64) => getFriendCircleApi().upload(key, base64),
    ],
    /**
     * v1.3.24 FRIENDCIRCLE-DOWNLOAD-VIDEO: /FriendCircle/DownloadVideo — 下载朋友圈视频.
     * 老板提供参数 (2026-08-10): key=视频 md5 (或 media id), url=完整视频 CDN URL.
     * 返回 base64 视频数据 (Data 字段).
     */
    downloadCircleVideo: [
        "下载朋友圈视频. key=视频 md5 (或 media id), url=完整视频 CDN URL (来自 GetDetail ObjectDesc). 返回 base64 视频数据.",
        Type.Object({
            key: Type.String({ description: "视频 md5 或 media id" }),
            url: Type.String({ description: "完整视频 CDN URL" }),
        }),
        (key, url) => getFriendCircleApi().downloadVideo(key, url),
    ],
    // ===== v1.3.25 SWAGGER-254: 新增 5 个 =====
    /** /FriendCircle/UploadVideo — 上传朋友圈视频 */
    uploadCircleVideo: [
        "上传朋友圈视频 (发视频朋友圈前置). videoData=视频 base64, thumbData=缩略图 base64.",
        Type.Object({
            videoData: Type.String({ description: "视频内容 base64" }),
            thumbData: Type.String({ description: "缩略图 base64" }),
        }),
        (videoData, thumbData) => getFriendCircleApi().uploadVideo(videoData, thumbData),
    ],
    /** /FriendCircle/UploadImage — 上传单张朋友圈图片 */
    uploadCircleImage: [
        "上传单张朋友圈图片. imageData=图片 base64.",
        Type.Object({ imageData: Type.String({ description: "图片内容 base64" }) }),
        (imageData) => getFriendCircleApi().uploadImage(imageData),
    ],
    /** /FriendCircle/UploadImages — 批量上传朋友圈图片 */
    uploadCircleImages: [
        "批量上传朋友圈图片. imageDataList=图片 base64 数组.",
        Type.Object({
            imageDataList: Type.Array(Type.String(), { description: "图片 base64 数组" }),
        }),
        (imageDataList) => getFriendCircleApi().uploadImages(imageDataList),
    ],
    // v1.3.63 P1 (2026-08-14 审阅): publishCircleRaw 已移除 — AI 不该有原始 XML 发布能力
    //   (原绕过 guard 无 callerWxid 白名单; 发布走 publishCircle/publishImagesCircle/publishVideoCircle 复合工具带 guard)
    /** /FriendCircle/SetBackgroundImage — 设置朋友圈背景图 */
    setCircleBackgroundImage: [
        "设置朋友圈背景图. imageData=图片 base64.",
        Type.Object({ imageData: Type.String({ description: "背景图 base64" }) }),
        (imageData) => getFriendCircleApi().setBackgroundImage(imageData),
    ],
    /** /FriendCircle/GetCollectCircle — 读取收藏动态 (v1.3.67 新 API) */
    getCollectCircle: [
        "读取收藏的朋友圈动态详情. sourceId=收藏来源标识.",
        Type.Object({ sourceId: Type.String() }),
        (sourceId) => getFriendCircleApi().getCollectCircle(sourceId),
    ],
    /** /FriendCircle/SendFavItemCircle — 从收藏项发朋友圈 (v1.3.67 新 API) */
    sendFavItemCircle: [
        "从收藏项发布朋友圈. favItemId=收藏项ID(数字), sourceId=收藏来源.",
        Type.Object({
            favItemId: Type.Number(),
            sourceId: Type.String(),
            blackList: Type.Optional(Type.String()),
            locationMode: Type.Optional(Type.Number({ description: "0保留位置 1移除 2自定义" })),
        }),
        (favItemId, sourceId, blackList = "", locationMode = 1) => getFriendCircleApi().sendFavItemCircle(favItemId, sourceId, blackList, locationMode),
    ],
    /** /FriendCircle/SendOneIdCircle — 通过动态 id 再发 (v1.3.67 新 API) */
    sendOneIdCircle: [
        "通过已有动态 id 再发朋友圈 (支持文字/图片/视频/链接). id=原动态id.",
        Type.Object({
            id: Type.String(),
            blackList: Type.Optional(Type.String()),
            locationMode: Type.Optional(Type.Number({ description: "0保留位置 1移除 2自定义" })),
        }),
        (id, blackList = "", locationMode = 1) => getFriendCircleApi().sendOneIdCircle(id, blackList, locationMode),
    ],
    /** /FriendCircle/SetFriendCircleDays — 设置朋友圈可见范围 (v1.3.67 新 API) */
    setFriendCircleDays: [
        "设置朋友圈可见范围. range=three_days/one_month/six_months/all.",
        Type.Object({
            range: Type.Union([
                Type.Literal("three_days"), Type.Literal("one_month"),
                Type.Literal("six_months"), Type.Literal("all"),
            ]),
        }),
        (range) => getFriendCircleApi().setFriendCircleDays(range),
    ],
    /** /FriendCircle/ActiveTasks — 查询朋友圈评论转发任务 (v1.3.67 新 API) */
    activeTasks: [
        "查询正在执行的朋友圈评论转发任务.",
        Type.Object({}),
        () => getFriendCircleApi().activeTasks(),
    ],
};
//# sourceMappingURL=friendcircle-meta.js.map