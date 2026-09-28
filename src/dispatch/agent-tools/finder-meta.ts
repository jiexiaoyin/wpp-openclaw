// src/dispatch/agent-tools/finder-meta.ts - Finder tag (15)
// v1.3.18 P1-核心1 fix (2026-08-10): 改成 lazy-evaluate ctx 模式
// 2026-09-28: getRecommend/follow/like/comment/finderLiveDetail 五处已按 vendor swagger 重写 schema
//   (原先的 page/operation/objectId/finderId/liveId 不是 vendor 字段且部分从不透传);
//   comment 补齐 11 字段 (CommentId/ObjectNonceId/Scene/SessionBuffer 不再硬编码),
//   finderLiveDetail 暴露 FinderNonceID (原先恒为空).
// 2026-09-28 (本轮): sendFinderDm / getFinderUserPage / getFinderCommentList 三处已按 vendor 契约重写
//   (旧的 sessionId/content/finderId/objectId 不是 vendor 字段, 且 LastBuffer/ObjectNonceId/FinderUsername
//   完全缺失或从不透传). 命名沿用前两轮: HTTP body 逐字 vendor PascalCase, schema 对外 camelCase.
//
// ⚠️ int64 精度风险 (本轮引入, 与上一轮 finderObjectId 同源): vendor 对 GetCommentList /
//   FindLiveDetail 的 ID 字段声明 integer int64, 我们用 Type.Number 对齐 (Go int64 拒收 JSON 字符串).
//   但 JS number 是 IEEE754 double, 仅能精确表示 |v| ≤ 2^53-1 (9007199254740991, 16 位);
//   微信视频号真实内容 ID 常为 19 位 (如 1426183783175864217) → 超出精确范围会被静默四舍五入.
//   若线上发现「ID 明明正确却查不到内容」, 优先怀疑此处 — 根治需 vendor 侧接受字符串.
//
// 仍有残留差异的端点 (未在本轮范围内, 供后续处理, 按严重度排序):
//   1. searchFinderUser (/Finder/Search) — 最严重: send 层 body 发 `{keyword}`, 而 vendor
//      Finder.DefaultParamDoc 要求 {FinderUsername, Value} → keyword 不是 vendor 字段, 该调用当前**必静默失效**.
//   2. getFinderCommentDetail (/Finder/GetCommentDetail) — 与本轮 GetCommentList 共用同一 param doc 但未重写:
//      schema 键 objectId ≠ vendor Id; Id/RootCommentId 仍是 String (vendor integer int64);
//      LastBuffer/ObjectNonceId 未暴露 (send 层恒 "").
//   3. getFinderMsgSessionId — schema 键 toFinderId ≠ vendor FinderUsername.
//   4. decryptFinderComment — schema 键 encryptedContent, vendor 字段名是 Content.
//   5. getFinderTopicList — vendor {LastBuffer, TopTitle}, schema 只暴露 topTitle (lastBuffer 恒 "").
//   6. playVideo / playVideoStop — vendor 用 snake_case (object_id/finder_username/task_id 等),
//      schema 是 camelCase; playVideo 另缺 feed_id/object_nonce_id/range_bytes/referer/urls 等 vendor 属性.

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
  /**
   * /Finder/FinderSendText — 向视频号用户发送私信文字.
   * vendor Finder.FinderSendTextParamDoc: {FinderUsername string, Text string}, swagger 未声明 required.
   * 两者均设为必填 (我的判断, 非 vendor 规定): 缺 FinderUsername 不知发给谁, 缺 Text 无内容可发.
   * 旧的 sessionId/content 不是 vendor 字段 → 删除. (send 层 body 键本已正确, 是本层键名对不上,
   *   实测旧 schema 下按 vendor 字段传参会发出一个只有 authcode 的空 body.)
   */
  sendFinderDm: [
    "发视频号私信. finderUsername=目标视频号 username (来自 Search 响应); text=要发送的文字.",
    Type.Object({
      finderUsername: Type.String({ description: "目标视频号 username (vendor FinderUsername, 来自 Search 响应)" }),
      text: Type.String({ description: "要发送的文字 (vendor Text)" }),
    }),
    (finderUsername: string, text: string) => getFinderApi().finderSendText(finderUsername, text),
  ],
  /**
   * /Finder/TargetUserPage — 查看指定视频号用户首页.
   * vendor Finder.TargetUserPageParamDoc: {LastBuffer string, Target string}, swagger 未声明 required.
   * 必填只取 Target (我的判断, 非 vendor 规定): 缺它不知看谁的主页; LastBuffer「首页留空」→ 可选.
   * 旧的 finderId 不是 vendor 字段 (vendor 用 Target); 且 LastBuffer 在 send 层恒硬编码 "" → 无法翻页 → 暴露.
   */
  getFinderUserPage: [
    "获取指定视频号用户主页数据. target=目标视频号 username; lastBuffer=上一页返回的翻页凭据, 首页留空.",
    Type.Object({
      target: Type.String({ description: "目标视频号 username (vendor Target)" }),
      lastBuffer: Type.Optional(
        Type.String({ description: "上一页返回的翻页凭据; 首页留空 (vendor LastBuffer)" }),
      ),
    }),
    (target: string, lastBuffer?: string) => getFinderApi().targetUserPage(target, lastBuffer),
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
   * v1.3.20 P3-FINDER: /Finder/GetCommentList — 获取视频号内容评论列表.
   * vendor Finder.GetCommentDetailParamDoc (与 GetCommentDetail 共用; 5 字段, swagger 未声明 required):
   *   {FinderUsername string, Id integer int64, LastBuffer string, ObjectNonceId string, RootCommentId integer int64}.
   * 必填取 FinderUsername + Id (我的判断, 非 vendor 规定, 与 like/comment 同款判据):
   *   两者缺失时「看谁的内容 / 看哪条内容的评论」无法确定.
   * 其余按 vendor 描述可选: LastBuffer「首页留空」, ObjectNonceId 是内容响应里的业务凭据
   *   (与 like/comment 对同名字段的处理一致, 留空), RootCommentId「获取全部评论时传 0」→ 默认 0.
   * 类型: Id / RootCommentId 在 vendor 明示 integer int64 —— 注意与 LikeParamDoc / CommentParamDoc
   *   的 Id:string 不同 (同名字段在 vendor 各端点的 Go 类型不一致). 按上一轮 finderObjectId 的同款判据
   *   用 Type.Number 对齐 (JSON 字符串会被 Go int64 unmarshal 拒绝); int64 精度风险见文件顶部注释.
   * 旧的 objectId 不是 vendor 字段 (vendor 用 Id); FinderUsername/LastBuffer/ObjectNonceId 完全缺失;
   *   RootCommentId 旧为可选 string 且 send 层默认 "" (vendor 是 integer) → 一并修正.
   */
  getFinderCommentList: [
    "获取视频号内容评论列表. 必填 finderUsername (作者 username) + id (内容 ID, 数字); " +
      "lastBuffer=上一页返回的翻页凭据, 首页留空; objectNonceId=内容响应中的业务凭据; " +
      "rootCommentId=根评论 ID, 获取全部评论时传 0 (默认 0).",
    Type.Object({
      finderUsername: Type.String({ description: "作者视频号 username (vendor FinderUsername)" }),
      id: Type.Number({ description: "内容 ID (vendor Id, integer int64, example 123456789)" }),
      lastBuffer: Type.Optional(Type.String({ description: "上一页返回的翻页凭据; 首页留空 (vendor LastBuffer)" })),
      objectNonceId: Type.Optional(Type.String({ description: "内容响应中的业务凭据 (vendor ObjectNonceId)" })),
      rootCommentId: Type.Optional(
        Type.Number({ description: "根评论 ID; 获取全部评论时传 0 (默认 0, vendor RootCommentId int64)" }),
      ),
    }),
    (finderUsername: string, id: number, lastBuffer?: string, objectNonceId?: string, rootCommentId?: number) =>
      getFinderApi().getCommentList({ finderUsername, id, lastBuffer, objectNonceId, rootCommentId }),
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