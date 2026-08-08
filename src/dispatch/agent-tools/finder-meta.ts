// src/dispatch/agent-tools/finder-meta.ts - Finder tag (15)

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppFinder } from "../../send/finder.js";
import type { WppAccountCtx } from "../../send/factory.js";

const ctx: WppAccountCtx = { baseUrl: "", tokenKey: "", accountId: "" };
const api = makeWppFinder(ctx);

export const FINDER_META: ToolMeta = {
  /** /Finder/Search */
  searchFinderUser: [
    "搜索视频号用户.",
    Type.Object({ keyword: Type.String() }),
    api.search,
  ],
  /** /Finder/GetRecommend */
  getFinderRecommend: [
    "获取视频号推荐流.",
    Type.Object({ page: Type.Optional(Type.Number()) }),
    api.getRecommend,
  ],
  /** /Finder/Follow */
  followFinderUser: [
    "关注视频号用户. operation: follow|unfollow.",
    Type.Object({
      finderId: Type.String(),
      operation: Type.Union([Type.Literal("follow"), Type.Literal("unfollow")]),
    }),
    api.follow,
  ],
  /** /Finder/Like */
  likeFinderPost: [
    "点赞视频号内容. operation: like|unlike.",
    Type.Object({
      objectId: Type.String(),
      operation: Type.Union([Type.Literal("like"), Type.Literal("unlike")]),
    }),
    api.like,
  ],
  /** /Finder/Comment */
  commentFinderPost: [
    "评论视频号内容.",
    Type.Object({ objectId: Type.String(), content: Type.String() }),
    api.comment,
  ],
  /** /Finder/FinderSendText */
  sendFinderDm: [
    "发视频号私信.",
    Type.Object({ sessionId: Type.String(), content: Type.String() }),
    api.finderSendText,
  ],
  /** /Finder/TargetUserPage */
  getFinderUserPage: [
    "获取指定视频号用户主页数据.",
    Type.Object({ finderId: Type.String() }),
    api.targetUserPage,
  ],
  /** /Finder/UserPrepare */
  getFinderMine: [
    "获取当前账号的视频号中心信息.",
    Type.Object({}),
    api.userPrepare,
  ],
  /** /Finder/FinderLiveDetail */
  getFinderLiveDetail: [
    "获取视频号直播详情.",
    Type.Object({ liveId: Type.String() }),
    api.finderLiveDetail,
  ],
};
