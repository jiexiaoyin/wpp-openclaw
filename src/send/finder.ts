// src/send/finder.ts - Finder tag (15 endpoints: video channel / 视频号)

import { postWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppFinder(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /Finder/Comment — 评论 */
    comment: (objectId: string, content: string) =>
      dispatch("/Finder/Comment", { objectId, content }),

    /** /Finder/Decrypt — 评论(解密) */
    decrypt: (encryptContent: string) =>
      dispatch("/Finder/Decrypt", { encryptContent }),

    /** /Finder/FinderGetMsgSessionId — 获取私信会话 ID */
    finderGetMsgSessionId: (toFinderId: string) =>
      dispatch("/Finder/FinderGetMsgSessionId", { toFinderId }),

    /** /Finder/FinderLiveDetail — 直播详情 */
    finderLiveDetail: (liveId: string) =>
      dispatch("/Finder/FinderLiveDetail", { liveId }),

    /** /Finder/FinderSearchList — 搜索列表 */
    finderSearchList: (keyword: string) =>
      dispatch("/Finder/FinderSearchList", { keyword }),

    /** /Finder/FinderSendText — 发送私信文字 */
    finderSendText: (sessionId: string, content: string) =>
      dispatch("/Finder/FinderSendText", { sessionId, content }),

    /** /Finder/Findergettopiclist — 主题列表 */
    finderGetTopicList: (topicId: string) =>
      dispatch("/Finder/Findergettopiclist", { topicId }),

    /** /Finder/Follow — 关注 */
    follow: (finderId: string, operation: "follow" | "unfollow") =>
      dispatch("/Finder/Follow", { finderId, operation }),

    /** /Finder/GetCommentDetail — 评论详情 */
    getCommentDetail: (commentId: string) =>
      dispatch("/Finder/GetCommentDetail", { commentId }),

    /** /Finder/GetCommentList — 评论列表/详情 (支持 RootCommentId 翻页) */
    getCommentList: (objectId: string, rootCommentId?: string) =>
      dispatch("/Finder/GetCommentList", { objectId, rootCommentId: rootCommentId ?? "" }),

    /** /Finder/GetRecommend — 推荐 */
    getRecommend: (page?: number) =>
      dispatch("/Finder/GetRecommend", { page: page ?? 0 }),

    /** /Finder/Like — 点赞 */
    like: (objectId: string, operation: "like" | "unlike") =>
      dispatch("/Finder/Like", { objectId, operation }),

    /** /Finder/Search — 用户搜索 */
    search: (keyword: string) => dispatch("/Finder/Search", { keyword }),

    /** /Finder/TargetUserPage — 查看指定人首页 */
    targetUserPage: (finderId: string) =>
      dispatch("/Finder/TargetUserPage", { finderId }),

    /** /Finder/UserPrepare — 用户中心 */
    userPrepare: () => dispatch("/Finder/UserPrepare", {}),
  };
}

export type WppFinderApi = ReturnType<typeof makeWppFinder>;
