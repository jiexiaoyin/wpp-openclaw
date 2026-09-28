// src/dispatch/agent-tools/finder-meta.ts - Finder tag (15)
// v1.3.18 P1-核心1 fix (2026-08-10): 改成 lazy-evaluate ctx 模式
// 2026-09-28: getRecommend/follow/like/comment/finderLiveDetail 五处已按 vendor swagger 重写 schema
//   (原先的 page/operation/objectId/finderId/liveId 不是 vendor 字段且部分从不透传);
//   comment 补齐 11 字段 (CommentId/ObjectNonceId/Scene/SessionBuffer 不再硬编码),
//   finderLiveDetail 暴露 FinderNonceID (原先恒为空).

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppFinder } from "../../send/finder.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";

function getFinderApi() {
  const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
  if (!state) throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
  return makeWppFinder({
    baseUrl: state.config.apiBaseUrl,
    tokenKey: state.config.tokenKey,
    authcode: state.authcode,
    accountId: getCurrentAccountId() ?? "default",
  });
}

export const FINDER_META: ToolMeta = {
  /** /Finder/Search */
  searchFinderUser: [
    "搜索视频号用户.",
    Type.Object({ keyword: Type.String() }),
    (keyword: string) => getFinderApi().search(keyword),
  ],
  /**
   * /Finder/GetRecommend — 视频号推荐流.
   * vendor Finder.GetRecommendParamDoc: {FinderEnt, FinderUsername, Latitude, Longitude,
   *   PullType, SpecialRequestScene, TabTipsObjectId} (无 required).
   * 旧的 `page` 不是 vendor 字段 (从不透传) → 删除.
   */
  getFinderRecommend: [
    "获取视频号推荐流. 无位置信息时 latitude/longitude 传 0; 无企业号/当前号时对应字段留空.",
    Type.Object({
      finderEnt: Type.Optional(Type.String({ description: "企业视频号标识; 无时留空" })),
      finderUsername: Type.Optional(Type.String({ description: "当前视频号 username; 无时留空" })),
      latitude: Type.Optional(Type.Number({ description: "纬度整数值; 无位置时传 0" })),
      longitude: Type.Optional(Type.Number({ description: "经度整数值; 无位置时传 0" })),
      pullType: Type.Optional(Type.Number({ description: "拉取类型 (vendor example 1)" })),
      specialRequestScene: Type.Optional(Type.Number({ description: "特殊请求场景; 默认 0" })),
      tabTipsObjectId: Type.Optional(Type.Number({ description: "标签页内容 ID; 默认 0" })),
    }),
    (
      finderEnt?: string, finderUsername?: string, latitude?: number, longitude?: number,
      pullType?: number, specialRequestScene?: number, tabTipsObjectId?: number,
    ) => getFinderApi().getRecommend({
      finderEnt, finderUsername, latitude, longitude,
      pullType, specialRequestScene, tabTipsObjectId,
    }),
  ],
  /**
   * /Finder/Follow — 关注/取消关注视频号用户.
   * vendor Finder.FollowParamDoc: {FinderUsername, OpType, Userver} (无 required).
   * 旧的 `operation: follow|unfollow` 不是 vendor 字段 (从不透传) → 删除;
   *   关注/取关改由 opType (vendor「关注操作类型」) 表达.
   */
  followFinderUser: [
    "关注/取消关注视频号用户. finderUsername=视频号 username; opType=关注操作类型 (vendor example 1); " +
      "userver=对方版本标识, 优先填上一响应返回的值.",
    Type.Object({
      finderUsername: Type.String({ description: "视频号 username (来自 Search/上一响应)" }),
      opType: Type.Optional(Type.Number({ description: "关注操作类型 (vendor example 1)" })),
      userver: Type.Optional(Type.Number({ description: "对方版本标识; 优先使用上一响应的值 (vendor example 1)" })),
    }),
    (finderUsername: string, opType?: number, userver?: number) =>
      getFinderApi().follow(finderUsername, opType, userver),
  ],
  /**
   * /Finder/Like — 点赞/取消点赞视频号内容.
   * vendor Finder.LikeParamDoc: 10 字段, swagger 未声明 required.
   * 必填取 Id + FinderUsername (定位内容所必需): 两者缺失时「赞哪条内容/赞谁的内容」无法确定.
   * 其余按 vendor 描述可选 (CommentId/LikeId「留空」, LikeUsername「默认当前账号」, 计数/场景默认 0/example).
   * 旧的 `objectId` / `operation` 不是 vendor 字段 (从不透传) → 删除.
   */
  likeFinderPost: [
    "点赞/取消点赞视频号内容. 必填 id (内容 ID) + finderUsername (内容作者 username); " +
      "objectNonceId=内容响应里的业务凭据; opType=操作类型 (vendor example 1); " +
      "commentId/likeId 留空 (点赞内容/首次点赞时), likeUsername 留空=默认当前账号.",
    Type.Object({
      id: Type.String({ description: "内容 ID (vendor Id, example '123456789')" }),
      finderUsername: Type.String({ description: "内容作者 username" }),
      commentId: Type.Optional(Type.String({ description: "评论 ID; 点赞内容时留空" })),
      curLikeCount: Type.Optional(Type.Number({ description: "当前点赞数 (vendor example 0)" })),
      likeId: Type.Optional(Type.String({ description: "已有点赞 ID; 首次点赞留空" })),
      likeUsername: Type.Optional(Type.String({ description: "点赞用户 username; 留空=默认当前账号" })),
      objectNonceId: Type.Optional(Type.String({ description: "内容响应中的业务凭据" })),
      opType: Type.Optional(Type.Number({ description: "操作类型 (vendor example 1)" })),
      scene: Type.Optional(Type.Number({ description: "内容来源场景 (vendor example 1)" })),
      sessionBuffer: Type.Optional(Type.String({ description: "内容响应中的会话凭据" })),
    }),
    (
      id: string, finderUsername: string, commentId?: string, curLikeCount?: number,
      likeId?: string, likeUsername?: string, objectNonceId?: string,
      opType?: number, scene?: number, sessionBuffer?: string,
    ) => getFinderApi().like({
      id, finderUsername, commentId, curLikeCount, likeId,
      likeUsername, objectNonceId, opType, scene, sessionBuffer,
    }),
  ],
  /**
   * /Finder/Comment — 对视频号内容发表评论.
   * vendor Finder.CommentParamDoc: 11 字段, swagger 未声明 required.
   * 必填取 Username + Id + Content (我的判断, 非 vendor 规定): 前两者是「定位内容」所必需
   *   (与 like 同款判据), Content 是评论本体的文字, 缺了就不是一次发表评论.
   * 其余按 vendor 描述可选 (CommentId「新建根评论时留空」, ObjectNonceId/SessionBuffer 是内容响应里的凭据,
   *   OpType/Scene 取 example 1, Reply* 仅回复评论时才有值).
   * 旧的 `objectId` 不是 vendor 字段 (且被错位喂进 Username) → 删除.
   */
  commentFinderPost: [
    "评论视频号内容. 必填 username (内容作者 username) + id (内容 ID) + content (评论文字); " +
      "objectNonceId/sessionBuffer=内容响应里的业务/会话凭据; opType=操作类型 (vendor example 1); " +
      "回复某条评论时填 replyCommentId/replyUsername/rootCommentId, 新建根评论则 commentId 留空.",
    Type.Object({
      username: Type.String({ description: "内容作者 username (vendor Username, example 'finder_username_from_feed')" }),
      id: Type.String({ description: "内容 ID (vendor Id, example '123456789')" }),
      content: Type.String({ description: "评论文字 (vendor Content, example '内容很精彩')" }),
      commentId: Type.Optional(Type.String({ description: "评论 ID; 新建根评论时留空" })),
      objectNonceId: Type.Optional(Type.String({ description: "内容响应中的业务凭据" })),
      opType: Type.Optional(Type.Number({ description: "操作类型 (vendor example 1)" })),
      replyCommentId: Type.Optional(Type.String({ description: "要回复的评论 ID" })),
      replyUsername: Type.Optional(Type.String({ description: "要回复的用户 username" })),
      rootCommentId: Type.Optional(Type.String({ description: "根评论 ID" })),
      scene: Type.Optional(Type.Number({ description: "内容来源场景 (vendor example 1)" })),
      sessionBuffer: Type.Optional(Type.String({ description: "内容响应中的会话凭据" })),
    }),
    (
      username: string, id: string, content: string,
      commentId?: string, objectNonceId?: string, opType?: number,
      replyCommentId?: string, replyUsername?: string, rootCommentId?: string,
      scene?: number, sessionBuffer?: string,
    ) => getFinderApi().comment({
      username, id, content, commentId, objectNonceId, opType,
      replyCommentId, replyUsername, rootCommentId, scene, sessionBuffer,
    }),
  ],
  /** /Finder/FinderSendText */
  sendFinderDm: [
    "发视频号私信.",
    Type.Object({ sessionId: Type.String(), content: Type.String() }),
    (sessionId: string, content: string) => getFinderApi().finderSendText(sessionId, content),
  ],
  /** /Finder/TargetUserPage */
  getFinderUserPage: [
    "获取指定视频号用户主页数据.",
    Type.Object({ finderId: Type.String() }),
    (finderId: string) => getFinderApi().targetUserPage(finderId),
  ],
  /** /Finder/UserPrepare */
  getFinderMine: [
    "获取当前账号的视频号中心信息.",
    Type.Object({}),
    () => getFinderApi().userPrepare(),
  ],
  /**
   * /Finder/FinderLiveDetail — 获取视频号直播详情.
   * vendor Finder.FinderLiveDetailParamDoc: 2 字段, swagger 未声明 required.
   * 两者均设为必填 (我的判断, 非 vendor 规定): FinderObjectID 是「直播内容 ID」(定位哪个直播间),
   *   FinderNonceID 是「直播列表返回的业务凭据」(vendor 明示来自上游响应, 属必填的业务链路) — 缺一不可.
   * 旧的 `liveId` 不是 vendor 字段, 且 finderNonceId 恒被硬编码为空 → 删除/暴露.
   */
  getFinderLiveDetail: [
    "获取视频号直播详情. finderObjectId=直播内容 ID (vendor FinderObjectID, int64); " +
      "finderNonceId=直播列表返回的业务凭据 (vendor FinderNonceID, 来自上一响应, 必传).",
    Type.Object({
      finderObjectId: Type.Number({ description: "直播内容 ID (vendor FinderObjectID, int64, example 123456789)" }),
      finderNonceId: Type.String({ description: "直播列表返回的业务凭据 (来自上游响应)" }),
    }),
    (finderObjectId: number, finderNonceId: string) =>
      getFinderApi().finderLiveDetail(finderObjectId, finderNonceId),
  ],
  /**
   * v1.3.20 P3-FINDER: /Finder/Decrypt — 评论内容解密.
   */
  decryptFinderComment: [
    "解密视频号评论内容 (encryptedContent 是加密串).",
    Type.Object({ encryptedContent: Type.String() }),
    (encryptedContent: string) => getFinderApi().decrypt(encryptedContent),
  ],
  /**
   * v1.3.20 P3-FINDER: /Finder/FinderGetMsgSessionId — 获取私信会话 ID.
   */
  getFinderMsgSessionId: [
    "获取视频号私信会话 ID.",
    Type.Object({ toFinderId: Type.String() }),
    (toFinderId: string) => getFinderApi().finderGetMsgSessionId(toFinderId),
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
    (topTitle?: string) => getFinderApi().finderGetTopicList(topTitle ?? ""),
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
    (objectId: string, rootCommentId?: string) => getFinderApi().getCommentList(objectId, rootCommentId ?? ""),
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
    (finderUsername: string, objectId: string, rootCommentId?: string) =>
      getFinderApi().getCommentDetail(finderUsername, objectId, rootCommentId ?? ""),
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
    (objectId?: string, finderUsername?: string, playUrl?: string, loop?: boolean, playSeconds?: number) =>
      getFinderApi().playVideo({ objectId, finderUsername, playUrl, loop, playSeconds }),
  ],
  /** /Finder/PlayVideoStop — 停止视频播放 (v1.3.67 新 API) */
  playVideoStop: [
    "停止视频号播放任务. taskId=playVideo 返回的任务 ID.",
    Type.Object({ taskId: Type.String() }),
    (taskId: string) => getFinderApi().playVideoStop(taskId),
  ],
  /** /Finder/PlayVideoStatus — 视频播放状态 (v1.3.67 新 API GET) */
  playVideoStatus: [
    "查询视频号播放任务状态. taskId=任务 ID.",
    Type.Object({ taskId: Type.String() }),
    (taskId: string) => getFinderApi().playVideoStatus(taskId),
  ],
  /** /Finder/PlayVideoTasks — 播放任务列表 (v1.3.67 新 API GET) */
  playVideoTasks: [
    "列出视频号播放任务 (运行中 + 24h 内已结束).",
    Type.Object({}),
    () => getFinderApi().playVideoTasks(),
  ],
};