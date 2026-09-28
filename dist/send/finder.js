// src/send/finder.ts - Finder tag (19 endpoints)
// v1.1.27 FINDER-FIELD-FIX (2026-08-08 P1-2): 字段名对齐 swagger
//   之前: objectId/sessionId/topicId 等通用名 → vendor Go 匹配不上
//   fix: Username/Id/FinderUsername/Text 等 vendor 字段名
// 2026-09-28 (本轮): search / getCommentDetail / decrypt / finderGetMsgSessionId /
//   finderGetTopicList / playVideo 六处的签名与 body 按 vendor 契约重写
//   (search 的 `keyword` 是**非 vendor 字段** → 此前必静默失效; getCommentDetail 的 Id/RootCommentId
//   类型对齐 integer; finderGetTopicList 的 LastBuffer 与 playVideo 的 10 个缺失属性解除硬编码).
//   body 键一律逐字 vendor 原样 (含 playVideo 组的 snake_case); 各端点缺省依据见其条目注释.
//   注: 全 19 个端点的 schema↔vendor 键名/键集/类型已自动化比对通过 (19/19 相等).
import { postWppJson, getWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppFinder(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        /**
         * /Finder/Comment — 对视频号内容发表评论.
         * vendor Finder.CommentParamDoc (11 字段, swagger 未声明 required):
         *   {CommentId, Content, Id, ObjectNonceId, OpType, ReplyCommentId, ReplyUsername,
         *    RootCommentId, Scene, SessionBuffer, Username}.
         * v1.9.2 契约重写: 原先 CommentId/ObjectNonceId/Scene/SessionBuffer 被硬编码 (调用方无法传),
         *   且 Username/Id 由 meta 层错位喂入 → 改为全 11 字段可传参, 缺省按 vendor 描述取:
         *   CommentId「新建根评论时留空」→ ""; ObjectNonceId/SessionBuffer 是「内容响应中的凭据」, 无则 "" ;
         *   OpType/Scene 未给默认以外语义 → 取 vendor example 1; Reply* 无回复对象时留空.
         */
        comment: (opt) => dispatch("/Finder/Comment", {
            Username: opt.username,
            Id: opt.id,
            Content: opt.content,
            CommentId: opt.commentId ?? "",
            ObjectNonceId: opt.objectNonceId ?? "",
            OpType: opt.opType ?? 1,
            ReplyCommentId: opt.replyCommentId ?? "",
            ReplyUsername: opt.replyUsername ?? "",
            RootCommentId: opt.rootCommentId ?? "",
            Scene: opt.scene ?? 1,
            SessionBuffer: opt.sessionBuffer ?? "",
        }),
        /**
         * /Finder/Decrypt — 解密**企业微信会话记录** (Content).
         * vendor Finder.DecryptParamDoc (1 字段, swagger 未声明 required): {Content string}.
         * ⚠️ 语义更正 (v1.9.2): swagger summary 为「解密企业微信会话记录（非视频号/小微）」,
         *   Content 描述明示「十六进制企业微信会话记录；不用于视频号或小微内容」——
         *   **本端点与「解密视频号评论」无关**, 是企微会话记录解密 (见 meta 层同名注释).
         * 本层 body 键本已正确 (Content), 错的是 meta 层 schema 键 encryptedContent → 已修正.
         */
        decrypt: (content) => dispatch("/Finder/Decrypt", { Content: content }),
        /**
         * /Finder/FinderGetMsgSessionId — 获取视频号私信会话 ID.
         * vendor Finder.FinderGetMsgSessionIdParamDoc (1 字段, 无 required): {FinderUsername string}.
         * v1.9.2 契约重写: 本层 body 键本已正确 (FinderUsername), 错的是 meta 层 schema 键
         *   (toFinderId 不是 vendor 字段) → 调用方按 schema 传的值被错位喂入. 形参一并改回 vendor 语义.
         */
        finderGetMsgSessionId: (finderUsername) => dispatch("/Finder/FinderGetMsgSessionId", { FinderUsername: finderUsername }),
        /**
         * /Finder/FinderLiveDetail — 获取视频号直播详情.
         * vendor Finder.FinderLiveDetailParamDoc (2 字段, swagger 未声明 required):
         *   {FinderNonceID string, FinderObjectID integer int64}.
         * v1.9.2 契约重写: meta 层曾把 FinderNonceID 硬编码为 "" (调用方传不了), 已改为必须传;
         *   FinderObjectID 类型由 string 对齐 vendor 的 integer (JSON 字符串会被 Go int64 unmarshal 拒绝).
         *   FinderNonceID「直播列表返回的业务凭据」→ 来自上游响应的业务链路, 无合理缺省, 故不设默认值.
         */
        finderLiveDetail: (finderObjectId, finderNonceId) => dispatch("/Finder/FinderLiveDetail", { FinderObjectID: finderObjectId, FinderNonceID: finderNonceId }),
        /** /Finder/FinderSearchList — 搜索列表 (EmptyObject, query in path?) */
        finderSearchList: () => dispatch("/Finder/FinderSearchList", {}),
        /**
         * /Finder/FinderSendText — 向视频号用户发送私信文字.
         * vendor Finder.FinderSendTextParamDoc (2 字段, swagger 未声明 required): {FinderUsername, Text}.
         * v1.9.2 契约重写: 本层 body 键本已正确 (FinderUsername/Text), 错的是 meta 层 schema 键
         *   (sessionId/content 不是 vendor 字段) → 调用方按 schema 传的值被错位喂入, 甚至整段丢失.
         */
        finderSendText: (finderUsername, text) => dispatch("/Finder/FinderSendText", { FinderUsername: finderUsername, Text: text }),
        /**
         * /Finder/Findergettopiclist — 主题列表.
         * vendor Finder.FinderGetTopicListParamDoc (2 字段, swagger 未声明 required):
         *   {LastBuffer string, TopTitle string}.
         * v1.9.2 契约重写: 原先 TopTitle 可传但 LastBuffer 恒硬编码 "" → 调用方无法翻页;
         *   改为可传参. 缺省按 vendor 描述取: LastBuffer「首页留空」→ "". TopTitle 是分类过滤, 无则 "".
         *   形参顺序按 vendor 文档序 (LastBuffer 在前).
         */
        finderGetTopicList: (lastBuffer = "", topTitle = "") => dispatch("/Finder/Findergettopiclist", { LastBuffer: lastBuffer, TopTitle: topTitle }),
        /**
         * /Finder/Follow — 关注/取消关注视频号用户.
         * vendor Finder.FollowParamDoc (v09102): {FinderUsername, OpType, Userver}.
         * OpType/Userver 未给默认以外的语义, 缺省取 vendor example 值 1 (调用方应尽量传上一响应的 userver).
         */
        follow: (finderUsername, opType = 1, userver = 1) => dispatch("/Finder/Follow", { FinderUsername: finderUsername, OpType: opType, Userver: userver }),
        /**
         * /Finder/GetCommentDetail — 查看指定内容.
         * vendor Finder.GetCommentDetailParamDoc (**与 GetCommentList 共用同一 param doc**, 5 字段,
         *   swagger 未声明 required):
         *   {FinderUsername string, Id integer int64, LastBuffer string, ObjectNonceId string, RootCommentId integer int64}.
         * v1.9.2 契约重写: 原先 Id 收 string 且 RootCommentId 缺省 "" (vendor 均为 integer), 且
         *   LastBuffer/ObjectNonceId 恒硬编码 "" → 调用方无法翻页/无法带上内容凭据.
         *   **与 getCommentList 类型对齐**: Id/RootCommentId 同为 vendor integer int64 → 用 number
         *   (JSON 字符串会被 Go int64 unmarshal 拒绝); int64 精度风险见 meta 层文件顶部注释.
         *   缺省按 vendor 描述取: LastBuffer「首页留空」→ ""; RootCommentId「获取全部评论时传 0」→ 0;
         *   ObjectNonceId 是「内容响应中的业务凭据」, 无合理缺省 → "".
         */
        getCommentDetail: (finderUsername, id, lastBuffer = "", objectNonceId = "", rootCommentId = 0) => dispatch("/Finder/GetCommentDetail", {
            FinderUsername: finderUsername,
            Id: id,
            LastBuffer: lastBuffer,
            ObjectNonceId: objectNonceId,
            RootCommentId: rootCommentId,
        }),
        /**
         * /Finder/GetCommentList — 获取视频号内容评论列表.
         * vendor Finder.GetCommentDetailParamDoc (与 GetCommentDetail 共用, 5 字段, swagger 未声明 required):
         *   {FinderUsername string, Id integer int64, LastBuffer string, ObjectNonceId string, RootCommentId integer int64}.
         * v1.9.2 契约重写: 原先只发 {Id, RootCommentId}, FinderUsername/LastBuffer/ObjectNonceId 从不透传;
         *   Id/RootCommentId 类型对齐 vendor 的 integer (注意 Like/CommentParamDoc 的 Id 是 string, 本端点是 int64).
         *   缺省按 vendor 描述取: LastBuffer「首页留空」→ ""; RootCommentId「获取全部评论时传 0」→ 0;
         *   ObjectNonceId「内容响应中的业务凭据」→ 无合理缺省, 留空 "" (与 like/comment 对同名字段的处理一致).
         */
        getCommentList: (opt) => dispatch("/Finder/GetCommentList", {
            FinderUsername: opt.finderUsername,
            Id: opt.id,
            LastBuffer: opt.lastBuffer ?? "",
            ObjectNonceId: opt.objectNonceId ?? "",
            RootCommentId: opt.rootCommentId ?? 0,
        }),
        /**
         * /Finder/GetRecommend — 推荐流.
         * vendor Finder.GetRecommendParamDoc (v09102): {FinderEnt, FinderUsername, Latitude, Longitude,
         *   PullType, SpecialRequestScene, TabTipsObjectId}; 无位置时 Lat/Long 传 0, 企业号/当前号无则留空.
         * 全字段随 body 发出 (与 comment/getCommentDetail 同风格), 缺省取 vendor 描述值.
         */
        getRecommend: (opt) => dispatch("/Finder/GetRecommend", {
            FinderEnt: opt?.finderEnt ?? "",
            FinderUsername: opt?.finderUsername ?? "",
            Latitude: opt?.latitude ?? 0,
            Longitude: opt?.longitude ?? 0,
            PullType: opt?.pullType ?? 1,
            SpecialRequestScene: opt?.specialRequestScene ?? 0,
            TabTipsObjectId: opt?.tabTipsObjectId ?? 0,
        }),
        /**
         * /Finder/Like — 点赞/取消点赞内容.
         * vendor Finder.LikeParamDoc (v09102) 10 字段 (swagger 未声明 required).
         * 必填 Id + FinderUsername (定位内容所必需); 其余「留空/默认」按 vendor 描述取空串或 example 值.
         */
        like: (opt) => dispatch("/Finder/Like", {
            Id: opt.id,
            FinderUsername: opt.finderUsername,
            CommentId: opt.commentId ?? "",
            CurLikeCount: opt.curLikeCount ?? 0,
            LikeId: opt.likeId ?? "",
            LikeUsername: opt.likeUsername ?? "",
            ObjectNonceId: opt.objectNonceId ?? "",
            OpType: opt.opType ?? 1,
            Scene: opt.scene ?? 1,
            SessionBuffer: opt.sessionBuffer ?? "",
        }),
        /**
         * /Finder/Search — 用户搜索.
         * vendor Finder.DefaultParamDoc (通用占位 doc, 2 字段, swagger 未声明 required):
         *   {FinderUsername string, Value string}. 注意 /Finder/Search 是**唯一**使用该 doc 的 Finder 端点.
         * v1.9.2 契约重写: 原先发 `{keyword}` —— **keyword 不是 vendor 字段**, Go 端匹配不上,
         *   该调用此前必然静默失效 (vendor 无 unknown-field 报错, 只会按零值处理).
         *   改为逐字 field 名; 缺省按 vendor 描述取: Value「查询时可填搜索关键词」是本次搜索的操作数,
         *   FinderUsername「来自搜索或详情响应」无则留空 "".
         */
        search: (finderUsername, value) => dispatch("/Finder/Search", { FinderUsername: finderUsername, Value: value }),
        /**
         * /Finder/TargetUserPage — 查看指定视频号用户首页.
         * vendor Finder.TargetUserPageParamDoc (2 字段, swagger 未声明 required): {LastBuffer, Target}.
         * v1.9.2 契约重写: 原先 LastBuffer 恒硬编码 "" → 调用方无法翻页; 改为可传参.
         *   缺省按 vendor 描述取: LastBuffer「首页留空」→ "".
         */
        targetUserPage: (target, lastBuffer = "") => dispatch("/Finder/TargetUserPage", { Target: target, LastBuffer: lastBuffer }),
        /** /Finder/UserPrepare — 用户中心 */
        userPrepare: () => dispatch("/Finder/UserPrepare", {}),
        // ===== v1.3.67 新 vendor: 视频号播放控制 =====
        /**
         * /Finder/PlayVideo — 启动视频号 CDN 分片播放任务.
         * vendor Finder.PlayVideoParamDoc (15 字段, **全 snake_case**, swagger 未声明 required,
         *   且**所有字段 description 均为空** → 无 vendor 语义可依据, 缺省策略由本层自行裁定):
         *   {async, feed_id, finder_username, interval_seconds, loop, loop_count, object_id,
         *    object_nonce_id, play_seconds, play_url, range_bytes, referer, request_interval_ms,
         *    urls(array[string]), user_agent}.
         * 缺省策略 (我的判断, 非 vendor 规定 —— vendor 该 doc 无 description/required 可循):
         *   调用方未提供的字段**不发**(而非发 0/""): 对 play_url/urls/interval_seconds/range_bytes
         *   这类字段, 发一个 0 或空串可能被后端当成「真实的空值」而报错或产生副作用, 缺省不发明比
         *   发明一个假值更安全. 判据用 `!== undefined` 而非真值判断 —— 保证 `loop:false` /
         *   `loop_count:0` 这类**显式假值/零值仍能发出** (真值判断会把它们吃掉).
         *   唯一例外: async 未给时取 true (沿用本端点改写前的既有缺省; vendor 示例亦为 true).
         * 行为变更提示: 改写前 loop / loop_count / play_seconds 是**无条件**发出 (false/0/0),
         *   现改为「未提供则不发」—— 见上, 这三个的旧缺省是凭空发明的, 不再保留.
         */
        playVideo: (opts) => dispatch("/Finder/PlayVideo", {
            // 逐字 vendor snake_case; 顺序同 PlayVideoParamDoc
            ...(opts.async !== undefined ? { async: opts.async } : { async: true }),
            ...(opts.feedId !== undefined ? { feed_id: opts.feedId } : {}),
            ...(opts.finderUsername !== undefined ? { finder_username: opts.finderUsername } : {}),
            ...(opts.intervalSeconds !== undefined ? { interval_seconds: opts.intervalSeconds } : {}),
            ...(opts.loop !== undefined ? { loop: opts.loop } : {}),
            ...(opts.loopCount !== undefined ? { loop_count: opts.loopCount } : {}),
            ...(opts.objectId !== undefined ? { object_id: opts.objectId } : {}),
            ...(opts.objectNonceId !== undefined ? { object_nonce_id: opts.objectNonceId } : {}),
            ...(opts.playSeconds !== undefined ? { play_seconds: opts.playSeconds } : {}),
            ...(opts.playUrl !== undefined ? { play_url: opts.playUrl } : {}),
            ...(opts.rangeBytes !== undefined ? { range_bytes: opts.rangeBytes } : {}),
            ...(opts.referer !== undefined ? { referer: opts.referer } : {}),
            ...(opts.requestIntervalMs !== undefined ? { request_interval_ms: opts.requestIntervalMs } : {}),
            ...(opts.urls !== undefined ? { urls: opts.urls } : {}),
            ...(opts.userAgent !== undefined ? { user_agent: opts.userAgent } : {}),
        }),
        /**
         * /Finder/PlayVideoStop — 停止视频号播放任务.
         * vendor Finder.PlayVideoStopParamDoc (1 字段, 无 required): {task_id string}.
         * TaskId 设为必填 (我的判断): 不指明停哪个任务则调用无意义. body 键逐字 vendor snake_case (本就正确).
         */
        playVideoStop: (taskId) => dispatch("/Finder/PlayVideoStop", { task_id: taskId }),
        /** /Finder/PlayVideoStatus — 视频播放状态 (v1.3.67 新 API GET; task_id) */
        playVideoStatus: (taskId) => getWppJson(ctx.baseUrl, `/Finder/PlayVideoStatus?task_id=${encodeURIComponent(taskId)}`, opts),
        /** /Finder/PlayVideoTasks — 视频播放任务列表 (v1.3.67 新 API GET) */
        playVideoTasks: () => getWppJson(ctx.baseUrl, "/Finder/PlayVideoTasks", opts),
    };
}
//# sourceMappingURL=finder.js.map