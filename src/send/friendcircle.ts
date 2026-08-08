// src/send/friendcircle.ts - FriendCircle tag (11 endpoints: 朋友圈 / Moments)

import { postWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppFriendCircle(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /FriendCircle/Comment — 朋友圈点赞/评论 */
    comment: (snsId: string, content: string, commentType?: number) =>
      dispatch("/FriendCircle/Comment", { snsId, content, commentType: commentType ?? 1 }),

    /** /FriendCircle/GetCommnet — 获取评论内容 */
    getComment: (snsId: string) =>
      dispatch("/FriendCircle/GetCommnet", { snsId }),

    /** /FriendCircle/GetDetail — 特定人朋友圈 */
    getDetail: (wxid: string) => dispatch("/FriendCircle/GetDetail", { wxid }),

    /** /FriendCircle/GetIdDetail — 特定 ID 详情 */
    getIdDetail: (snsId: string) =>
      dispatch("/FriendCircle/GetIdDetail", { snsId }),

    /** /FriendCircle/GetList — 朋友圈首页列表 */
    getList: (firstPageMd5?: string) =>
      dispatch("/FriendCircle/GetList", { firstPageMd5: firstPageMd5 ?? "" }),

    /** /FriendCircle/Messages — 发布朋友圈 */
    publish: (content: string, mediaList?: string[]) =>
      dispatch("/FriendCircle/Messages", {
        content,
        mediaList: mediaList ? mediaList.join(",") : "",
      }),

    /** /FriendCircle/MmSnsSync — 查询正在评论转发的 ID */
    mmSnsSync: () => dispatch("/FriendCircle/MmSnsSync", {}),

    /** /FriendCircle/Operation — 朋友圈操作 */
    operation: (snsId: string, op: "delete" | "setTop" | "cancelSetTop") =>
      dispatch("/FriendCircle/Operation", { snsId, op }),

    /** /FriendCircle/PrivacySettings — 朋友圈权限 */
    privacySettings: (scope: number) =>
      dispatch("/FriendCircle/PrivacySettings", { scope }),

    /** /FriendCircle/PushCommnet — 启动评论检查任务 */
    pushComment: () => dispatch("/FriendCircle/PushCommnet", {}),

    /** /FriendCircle/Upload — 朋友圈下载 CDN 视频 */
    upload: (cdnUrl: string) => dispatch("/FriendCircle/Upload", { cdnUrl }),
  };
}

export type WppFriendCircleApi = ReturnType<typeof makeWppFriendCircle>;
