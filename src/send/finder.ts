// src/send/finder.ts - Finder tag (15 endpoints)
// v1.1.27 FINDER-FIELD-FIX (2026-08-08 P1-2): 字段名对齐 swagger
//   之前: objectId/sessionId/topicId 等通用名 → vendor Go 匹配不上
//   fix: Username/Id/FinderUsername/Text 等 vendor 字段名

import { postWppJson, getWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppFinder(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /Finder/Comment — 评论 (Username + Id + Content + CommentId + OpType + Scene + ...) */
    comment: (username: string, finderId: string, content: string, opType = 1, rootCommentId = "", replyCommentId = "", replyUsername = "") =>
      dispatch("/Finder/Comment", {
        Username: username,
        Id: finderId,
        Content: content,
        OpType: opType,
        CommentId: "",
        ObjectNonceId: "",
        ReplyCommentId: replyCommentId,
        ReplyUsername: replyUsername,
        RootCommentId: rootCommentId,
        Scene: 1,
        SessionBuffer: "",
      }),

    /** /Finder/Decrypt — 评论(解密) (Content) */
    decrypt: (encryptContent: string) =>
      dispatch("/Finder/Decrypt", { Content: encryptContent }),

    /** /Finder/FinderGetMsgSessionId — 获取私信会话 ID (FinderUsername) */
    finderGetMsgSessionId: (toFinderId: string) =>
      dispatch("/Finder/FinderGetMsgSessionId", { FinderUsername: toFinderId }),

    /** /Finder/FinderLiveDetail — 直播详情 (FinderObjectID + FinderNonceID) */
    finderLiveDetail: (finderObjectId: string, finderNonceId: string) =>
      dispatch("/Finder/FinderLiveDetail", { FinderObjectID: finderObjectId, FinderNonceID: finderNonceId }),

    /** /Finder/FinderSearchList — 搜索列表 (EmptyObject, query in path?) */
    finderSearchList: () => dispatch("/Finder/FinderSearchList", {}),

    /** /Finder/FinderSendText — 发送私信文字 (FinderUsername + Text) */
    finderSendText: (finderUsername: string, text: string) =>
      dispatch("/Finder/FinderSendText", { FinderUsername: finderUsername, Text: text }),

    /** /Finder/Findergettopiclist — 主题列表 (LastBuffer + TopTitle) */
    finderGetTopicList: (topTitle = "", lastBuffer = "") =>
      dispatch("/Finder/Findergettopiclist", { TopTitle: topTitle, LastBuffer: lastBuffer }),

    /** /Finder/Follow — 关注 (DefaultParamDoc, 通过 query/header 携带 finderId) */
    follow: (finderId: string) =>
      dispatch("/Finder/Follow", { finderId }),

    /** /Finder/GetCommentDetail — 评论详情 (v1.2.1 swagger-alignment: GetCommentDetailParamDoc {FinderUsername, Id, LastBuffer, ObjectNonceId, RootCommentId}) */
    getCommentDetail: (finderUsername: string, id: string, rootCommentId = "") =>
      dispatch("/Finder/GetCommentDetail", {
        FinderUsername: finderUsername,
        Id: id,
        RootCommentId: rootCommentId,
        LastBuffer: "",
        ObjectNonceId: "",
      }),

    /** /Finder/GetCommentList — 评论列表/详情 */
    getCommentList: (finderId: string, rootCommentId = "") =>
      dispatch("/Finder/GetCommentList", { Id: finderId, RootCommentId: rootCommentId }),

    /** /Finder/GetRecommend — 推荐 */
    getRecommend: () => dispatch("/Finder/GetRecommend", {}),

    /** /Finder/Like — 点赞 */
    like: (finderId: string) =>
      dispatch("/Finder/Like", { Id: finderId }),

    /** /Finder/Search — 用户搜索 */
    search: (keyword: string) => dispatch("/Finder/Search", { keyword }),

    /** /Finder/TargetUserPage — 查看指定人首页 (v1.2.1 swagger-alignment: TargetUserPageParamDoc {LastBuffer, Target}) */
    targetUserPage: (target: string) =>
      dispatch("/Finder/TargetUserPage", { Target: target, LastBuffer: "" }),

    /** /Finder/UserPrepare — 用户中心 */
    userPrepare: () => dispatch("/Finder/UserPrepare", {}),

    // ===== v1.3.67 新 vendor: 视频号播放控制 =====

    /** /Finder/PlayVideo — 播放视频号视频 (v1.3.67 新 API; object_id/finder_username/play_url 选传 + 高级参数) */
    playVideo: (opts: {
      objectId?: string; finderUsername?: string; playUrl?: string;
      loop?: boolean; loopCount?: number; playSeconds?: number; async?: boolean;
    }) => dispatch("/Finder/PlayVideo", {
      ...(opts.objectId ? { object_id: opts.objectId } : {}),
      ...(opts.finderUsername ? { finder_username: opts.finderUsername } : {}),
      ...(opts.playUrl ? { play_url: opts.playUrl } : {}),
      loop: opts.loop ?? false,
      loop_count: opts.loopCount ?? 0,
      play_seconds: opts.playSeconds ?? 0,
      async: opts.async ?? true,
    }),

    /** /Finder/PlayVideoStop — 停止视频播放任务 (v1.3.67 新 API; task_id=PlayVideo 返回) */
    playVideoStop: (taskId: string) =>
      dispatch("/Finder/PlayVideoStop", { task_id: taskId }),

    /** /Finder/PlayVideoStatus — 视频播放状态 (v1.3.67 新 API GET; task_id) */
    playVideoStatus: (taskId: string) =>
      getWppJson(ctx.baseUrl, `/Finder/PlayVideoStatus?task_id=${encodeURIComponent(taskId)}`, opts),

    /** /Finder/PlayVideoTasks — 视频播放任务列表 (v1.3.67 新 API GET) */
    playVideoTasks: () =>
      getWppJson(ctx.baseUrl, "/Finder/PlayVideoTasks", opts),
  };
}

export type WppFinderApi = ReturnType<typeof makeWppFinder>;