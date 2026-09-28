// src/dispatch/agent-tools/finder-meta.ts - Finder tag (15)
// v1.3.18 P1-核心1 fix (2026-08-10): 改成 lazy-evaluate ctx 模式
// 2026-09-28 (上一轮): getRecommend/follow/like/comment/finderLiveDetail 五处已按 vendor swagger 重写 schema
//   (原先的 page/operation/objectId/finderId/liveId 不是 vendor 字段且部分从不透传);
//   comment 补齐 11 字段 (CommentId/ObjectNonceId/Scene/SessionBuffer 不再硬编码),
//   finderLiveDetail 暴露 FinderNonceID (原先恒为空).
// 2026-09-28 (上轮): sendFinderDm / getFinderUserPage / getFinderCommentList 三处已按 vendor 契约重写
//   (旧的 sessionId/content/finderId/objectId 不是 vendor 字段, 且 LastBuffer/ObjectNonceId/FinderUsername
//   完全缺失或从不透传). 命名沿用前两轮: HTTP body 逐字 vendor PascalCase, schema 对外 camelCase.
//
// ===== 2026-09-28 (本轮) — 上一轮注释列出的 6 类残留差异已**全部清掉** =====
//   1. searchFinderUser    — 旧 schema 只有 keyword → send 层发 `{keyword}` (非 vendor 字段) ⇒ **必静默失效**.
//                            现改为 vendor DefaultParamDoc 的 {FinderUsername, Value}, body 逐字.
//   2. getFinderCommentDetail — 与 getFinderCommentList 逐字段对齐 (同一 param doc 不得再分叉):
//                            objectId → Id; Id/RootCommentId String → Type.Number (vendor integer int64);
//                            补出 LastBuffer/ObjectNonceId; RootCommentId 缺省 "" → 0.
//   3. getFinderMsgSessionId — toFinderId → finderUsername (vendor FinderUsername).
//   4. decryptFinderComment  — encryptedContent → content (vendor Content). ⚠️ 另有语义疑点, 见下.
//   5. getFinderTopicList    — 补出 lastBuffer (原先 send 层恒 "" → 无法翻页); 属性序改按 vendor 文档序.
//   6. playVideo / playVideoStop — playVideo 5 键补齐到 vendor 全 15 属性 (缺的 feed_id/object_nonce_id/
//                            range_bytes/referer/urls/user_agent/interval_seconds/request_interval_ms 全补);
//                            schema 键保留 camelCase, body 逐字 vendor snake_case (裁定理由见 playVideo 条目).
//
// 【本轮后 finder 侧是否仍有同类差异】—— schema↔vendor 的**键名/键集/类型**层面: **已无**.
//   判定依据: 对全部 19 个 finder 工具逐一自动化比对 vendor param doc 的属性名、属性个数与 JSON 类型
//   (归一化后匹配, 覆盖 PascalCase/camelCase/snake_case 三种命名), 结果 19/19 全等; 并对 6 类端点
//   实测了真实发出的 POST body (本地 HTTP server 抓包), 键名与 vendor 逐字一致.
//   ⇒ 若后续再出现「同 doc 类型分叉」, 用同一比对脚本即可回归.
//
// 【仍存在的、非「同类差异」的两点 (如实列出)】
//   A. decryptWeComSession / decryptFinderComment: v1.9.2 已**新增**正确命名 decryptWeComSession;
//      旧 decryptFinderComment 保留为 deprecation alias (LLM 仍可用), 计划在 v2.0 移除. 详见该工具条目注释.
//   B. playVideo 的命名与 body 缺省策略为本层自行裁定 (vendor 该 doc 无 required、15 个 description 全空,
//      无 vendor 语义可依据). 裁定与理由见该工具条目; 这是**判断**, 不是与 vendor 的差异.
//   C. int64 精度风险 (前两轮引入, 本轮新增 getFinderCommentDetail 同受): vendor 对
//      GetCommentList / GetCommentDetail / FindLiveDetail 的 ID 字段声明 integer int64, 我们用
//      Type.Number 对齐 (Go int64 拒收 JSON 字符串). 但 JS number 是 IEEE754 double, 仅能精确表示
//      |v| ≤ 2^53-1 (9007199254740991, 16 位); 微信视频号真实内容 ID 常为 19 位
//      (如 1426183783175864217) → 超出精确范围会被静默四舍五入. 若线上发现「ID 明明正确却查不到
//      内容」, 优先怀疑此处 — 根治需 vendor 侧接受字符串.
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
    /**
     * /Finder/Search — 搜索视频号用户.
     * vendor Finder.DefaultParamDoc (**通用占位 doc**; /Finder/Search 是唯一使用它的 Finder 端点;
     *   2 字段, swagger 未声明 required): {FinderUsername string, Value string}.
     * v1.9.2 契约重写 — 本轮**最高优先**: 旧 schema 只有 `keyword`, send 层发 `{keyword}` ——
     *   **keyword 不是 vendor 字段**, Go 端无 unknown-field 报错、只会按零值处理 → 该调用此前**必然静默失效**.
     * 必填取 Value (我的判断, 非 vendor 规定): 其描述「查询时可填搜索关键词」——本次搜索的操作数,
     *   没有它就不是一次搜索. FinderUsername 设为**可选**(非必填): 其描述为「视频号 username，
     *   来自搜索或详情响应」, 即它本身是**搜索的产物**, 若设为必填会让「首次按关键词搜索」这个
     *   最基本的用法无法调用 (鸡生蛋). vendor 示例两者都给, 但它给的是上一轮搜索响应里的值,
     *   属可选补充而非前置条件. ⚠️ 该 doc 名为 Default(占位), 语义本就不精确 —— 此裁定已尽力贴合描述.
     * 缺省: FinderUsername 无则 "" (与同文件 getRecommend 对 FinderEnt/FinderUsername 的处理一致).
     */
    searchFinderUser: [
        "搜索视频号用户. value=搜索关键词 (vendor Value); finderUsername=视频号 username, 来自上一轮搜索/详情响应, 没有则留空.",
        Type.Object({
            finderUsername: Type.Optional(Type.String({ description: "视频号 username; 来自搜索或详情响应, 无则留空 (vendor FinderUsername)" })),
            value: Type.String({ description: "搜索关键词 (vendor Value, example '人工智能')" }),
        }),
        (finderUsername, value) => getFinderApi().search(finderUsername ?? "", value ?? ""),
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
        (finderEnt, finderUsername, latitude, longitude, pullType, specialRequestScene, tabTipsObjectId) => getFinderApi().getRecommend({
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
        (finderUsername, opType, userver) => getFinderApi().follow(finderUsername, opType, userver),
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
        (id, finderUsername, commentId, curLikeCount, likeId, likeUsername, objectNonceId, opType, scene, sessionBuffer) => getFinderApi().like({
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
        (username, id, content, commentId, objectNonceId, opType, replyCommentId, replyUsername, rootCommentId, scene, sessionBuffer) => getFinderApi().comment({
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
        (finderUsername, text) => getFinderApi().finderSendText(finderUsername, text),
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
            lastBuffer: Type.Optional(Type.String({ description: "上一页返回的翻页凭据; 首页留空 (vendor LastBuffer)" })),
        }),
        (target, lastBuffer) => getFinderApi().targetUserPage(target, lastBuffer),
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
        (finderObjectId, finderNonceId) => getFinderApi().finderLiveDetail(finderObjectId, finderNonceId),
    ],
    /**
     * /Finder/Decrypt — ⚠️ **语义疑点: 这不是「解密视频号评论」**.
     * vendor Finder.DecryptParamDoc (1 字段, 无 required): {Content string}, 描述
     *   「十六进制企业微信会话记录；不用于视频号或小微内容」; swagger summary 更是
     *   「解密企业微信会话记录（非视频号/小微）」.
     * → 该端点解密的是**企业微信会话记录**, vendor 两处措辞都明示**与视频号内容无关**.
     *   本工具名 decryptFinderComment / 旧描述「解密视频号评论内容」是**语义误用**, 不只是键名问题:
     *   它被放在 Finder tag 下 (vendor 自身归类), 但能力面属于企微. 若真的需要解锁视频号评论密文,
     *   本端点给不了 —— 应另找视频号域的解密入口 (本轮 swagger 的 Finder tag 内不存在第二个解密端点).
     * 本轮处理: 只修 schema 键名 (encryptedContent → content, 对应 vendor Content), 描述改为如实陈述,
     *   **保留工具名 decryptFinderComment 不变** —— 工具名是 LLM 可见的对外标识, 改名属破坏性变更,
     *   超出「清差异」范围, 需单独决策 (见文件顶部注释).
     */
    /**
     * v1.9.2 (改名): 新增正确命名的 `decryptWeComSession`, 语义清晰; 同时保留
     * `decryptFinderComment` 作向后兼容 (deprecation alias), 旧调用不破. 详见工具条目注释.
     */
    decryptWeComSession: [
        "解密企业微信会话记录 (vendor /Finder/Decrypt, 十六进制串). 摘要: 该端点能力面是**企业微信**, 不用于视频号/小微内容.",
        Type.Object({ content: Type.String({ description: "十六进制企业微信会话记录 (vendor Content, example '0123456789abcdef')" }) }),
        (content) => getFinderApi().decrypt(content),
    ],
    /** @deprecated 历史命名, 实际能力是企微而非视频号. 新代码请用 `decryptWeComSession`. 保留此名仅为向后兼容, 计划在 v2.0 移除. */
    decryptFinderComment: [
        "[deprecated → decryptWeComSession] 解密企业微信会话记录 (vendor Content, 十六进制串). " +
            "注意: 本端点**不用于视频号/小微内容** —— 工具名沿用历史命名, 实际能力面是企业微信会话记录, 不是视频号评论.",
        Type.Object({ content: Type.String({ description: "十六进制企业微信会话记录 (vendor Content, example '0123456789abcdef')" }) }),
        (content) => getFinderApi().decrypt(content),
    ],
    /**
     * /Finder/FinderGetMsgSessionId — 获取视频号私信会话 ID.
     * vendor Finder.FinderGetMsgSessionIdParamDoc (1 字段, 无 required): {FinderUsername string}, 描述「目标视频号 username」.
     * 必填 (我的判断): 不给目标 username 则不知取哪个会话的 ID. 旧的 `toFinderId` 不是 vendor 字段 →
     *   (本层键名对不上; send 层 body 键本已正确, 故传入值仍能到达, 但按 schema 传参会错位).
     */
    getFinderMsgSessionId: [
        "获取视频号私信会话 ID. finderUsername=目标视频号 username.",
        Type.Object({
            finderUsername: Type.String({ description: "目标视频号 username (vendor FinderUsername)" }),
        }),
        (finderUsername) => getFinderApi().finderGetMsgSessionId(finderUsername),
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
     * /Finder/Findergettopiclist — 主题(话题)列表.
     * vendor Finder.FinderGetTopicListParamDoc (2 字段, swagger 未声明 required):
     *   {LastBuffer string, TopTitle string}.
     * v1.9.2 契约重写: 旧 schema 只暴露 topTitle, LastBuffer 在 send 层恒硬编码 "" → **无法翻页**;
     *   现将 LastBuffer 一并暴露. 属性序按 vendor 文档序 (LastBuffer 在前).
     * 两者均不设必填 (我的判断): LastBuffer 描述「首页留空」, TopTitle 描述只是「话题分类标题」,
     *   是**过滤条件**而非必需操作数 —— 全不带即为「列出全部话题」这个合法用法.
     * 缺省: LastBuffer「首页留空」→ ""; TopTitle 无过滤 → "".
     */
    getFinderTopicList: [
        "获取视频号主题(话题)列表. lastBuffer=上一页返回的翻页凭据, 首页留空; topTitle=话题分类标题 (过滤条件, 可留空).",
        Type.Object({
            lastBuffer: Type.Optional(Type.String({ description: "上一页返回的翻页凭据; 首页留空 (vendor LastBuffer)" })),
            topTitle: Type.Optional(Type.String({ description: "话题分类标题, 可留空 (vendor TopTitle, example '热门话题')" })),
        }),
        (lastBuffer, topTitle) => getFinderApi().finderGetTopicList(lastBuffer ?? "", topTitle ?? ""),
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
            rootCommentId: Type.Optional(Type.Number({ description: "根评论 ID; 获取全部评论时传 0 (默认 0, vendor RootCommentId int64)" })),
        }),
        (finderUsername, id, lastBuffer, objectNonceId, rootCommentId) => getFinderApi().getCommentList({ finderUsername, id, lastBuffer, objectNonceId, rootCommentId }),
    ],
    /**
     * /Finder/GetCommentDetail — 查看指定内容.
     * vendor Finder.GetCommentDetailParamDoc (**与上面 getFinderCommentList 共用同一 param doc**;
     *   5 字段, swagger 未声明 required):
     *   {FinderUsername string, Id integer int64, LastBuffer string, ObjectNonceId string, RootCommentId integer int64}.
     * v1.9.2 契约重写 (与 getFinderCommentList **逐字段对齐** —— 两者 vendor doc 相同, 类型/键名不得再分叉):
     *   旧 schema {finderUsername, objectId, rootCommentId?:String} 的差异:
     *     - objectId ≠ vendor Id (注意: send 层旧实现把 objectId 喂进 Id, 值仍能到达, 属**键名错位**而非丢失);
     *     - Id / RootCommentId 旧为 String, vendor 是 integer int64 → 改 Type.Number 与
     *       getFinderCommentList 一致 (JSON 字符串会被 Go int64 unmarshal 拒绝); int64 精度风险见文件顶部;
     *     - LastBuffer / ObjectNonceId 完全未暴露 (send 层恒 "") → 补上 (否则无法翻页/无法带内容凭据);
     *     - 旧 rootCommentId 缺省 "" 而 vendor 是 integer「获取全部评论时传 0」→ 缺省改 0.
     * 必填取 FinderUsername + Id (我的判断, 非 vendor 规定; 与 getFinderCommentList 同款判据):
     *   两者缺失时「看谁的内容 / 看哪条内容的评论」无法确定.
     * 缺省: LastBuffer「首页留空」→ ""; ObjectNonceId 是内容响应里的业务凭据, 无合理缺省 → "";
     *   RootCommentId「获取全部评论时传 0」→ 0.
     */
    getFinderCommentDetail: [
        "查看指定内容的详情/评论. 必填 finderUsername (作者 username) + id (内容 ID, 数字); " +
            "lastBuffer=上一页返回的翻页凭据, 首页留空; objectNonceId=内容响应中的业务凭据; " +
            "rootCommentId=根评论 ID, 获取全部评论时传 0 (默认 0).",
        Type.Object({
            finderUsername: Type.String({ description: "作者视频号 username (vendor FinderUsername)" }),
            id: Type.Number({ description: "内容 ID (vendor Id, integer int64, example 123456789)" }),
            lastBuffer: Type.Optional(Type.String({ description: "上一页返回的翻页凭据; 首页留空 (vendor LastBuffer)" })),
            objectNonceId: Type.Optional(Type.String({ description: "内容响应中的业务凭据 (vendor ObjectNonceId)" })),
            rootCommentId: Type.Optional(Type.Number({ description: "根评论 ID; 获取全部评论时传 0 (默认 0, vendor RootCommentId int64)" })),
        }),
        (finderUsername, id, lastBuffer, objectNonceId, rootCommentId) => getFinderApi().getCommentDetail(finderUsername, id, lastBuffer, objectNonceId, rootCommentId),
    ],
    /**
     * /Finder/PlayVideo — 启动视频号 CDN 分片播放任务.
     * vendor Finder.PlayVideoParamDoc (15 字段, **全 snake_case**, swagger 未声明 required,
     *   且**15 个字段 description 全为空**).
     *
     * 【命名裁定】schema 对外**保留 camelCase** (与同文件其余 14 个 finder 工具一致), HTTP body 逐字
     *   vendor snake_case. 理由: (a) ToolMeta 是面向 LLM 的对外契约层, 本文件其余条目已建立
     *   camelCase 的稳定约定, 单为这一个端点改用 snake_case 会让同一 tag 内出现两套命名, 反而增加
     *   模型选参的负担; (b) vendor 在本 tag 内自相矛盾 (其余端点 PascalCase、这组 snake_case),
     *   属 vendor 侧不一致, 不是我们改对外约定的理由; (c) 差异不丢信息 —— 每个 schema 属性的
     *   description 都显式标注了对应 vendor 字段名, 映射可逐条核对.
     *   (备选 snake_case 方案的唯一好处是「schema 键名 = body 键名」少一层映射, 但代价是破坏本文件
     *    既有约定, 判为不划算.)
     *
     * 属性序 = vendor PlayVideoParamDoc 序 (async, feed_id, finder_username, interval_seconds, loop,
     *   loop_count, object_id, object_nonce_id, play_seconds, play_url, range_bytes, referer,
     *   request_interval_ms, urls, user_agent) —— fn 形参序与之严格一致 (_shared.ts:3,11 约定).
     * 全字段不设必填 (我的判断, 非 vendor 规定): vendor 该 doc 无 required, 且无 description 可据以
     *   判定哪个是操作数; 强行指定必填缺乏依据. 缺省策略见 send 层同端点注释 (未提供则不发).
     */
    playVideo: [
        "启动视频号 CDN 分片播放任务. 全部参数选传 —— 常用: objectId (内容 ID) / objectNonceId " +
            "(内容响应里的业务凭据) / feedId / finderUsername (作者) / playUrl (播放地址, 优先用带签名的 CDN 地址); " +
            "播放控制: async (默认 true) / loop / loopCount / playSeconds / intervalSeconds; " +
            "分片与请求: rangeBytes / requestIntervalMs / urls (分片地址数组) / referer / userAgent.",
        Type.Object({
            async: Type.Optional(Type.Boolean({ description: "是否异步返回, 不阻塞等待播放完成 (vendor async, 默认 true)" })),
            feedId: Type.Optional(Type.String({ description: "视频号 feed ID (vendor feed_id)" })),
            finderUsername: Type.Optional(Type.String({ description: "作者视频号 username (vendor finder_username)" })),
            intervalSeconds: Type.Optional(Type.Number({ description: "分片播放间隔秒数 (vendor interval_seconds)" })),
            loop: Type.Optional(Type.Boolean({ description: "是否循环播放 (vendor loop)" })),
            loopCount: Type.Optional(Type.Number({ description: "循环次数 (vendor loop_count)" })),
            objectId: Type.Optional(Type.String({ description: "视频内容 ID (vendor object_id)" })),
            objectNonceId: Type.Optional(Type.String({ description: "内容响应中的业务凭据 (vendor object_nonce_id)" })),
            playSeconds: Type.Optional(Type.Number({ description: "播放秒数 (vendor play_seconds)" })),
            playUrl: Type.Optional(Type.String({ description: "播放地址 (vendor play_url, 带签名 token 的 CDN 地址)" })),
            rangeBytes: Type.Optional(Type.Number({ description: "分片字节数 (vendor range_bytes)" })),
            referer: Type.Optional(Type.String({ description: "请求 Referer (vendor referer)" })),
            requestIntervalMs: Type.Optional(Type.Number({ description: "请求间隔毫秒 (vendor request_interval_ms)" })),
            urls: Type.Optional(Type.Array(Type.String(), { description: "资源地址数组 (vendor urls, array[string])" })),
            userAgent: Type.Optional(Type.String({ description: "请求 User-Agent (vendor user_agent)" })),
        }),
        (async, feedId, finderUsername, intervalSeconds, loop, loopCount, objectId, objectNonceId, playSeconds, playUrl, rangeBytes, referer, requestIntervalMs, urls, userAgent) => getFinderApi().playVideo({
            async, feedId, finderUsername, intervalSeconds, loop, loopCount, objectId, objectNonceId,
            playSeconds, playUrl, rangeBytes, referer, requestIntervalMs, urls, userAgent,
        }),
    ],
    /**
     * /Finder/PlayVideoStop — 停止视频号播放任务.
     * vendor Finder.PlayVideoStopParamDoc (1 字段, 无 required): {task_id string}.
     * schema 键沿用 camelCase → taskId (命名裁定同 playVideo); body 键逐字 vendor snake_case `task_id`
     *   (该组 vendor 全 snake_case, 本工具旧代码 body 键本就是 task_id, 无需改动).
     * taskId 设为必填 (我的判断): 其描述即「PlayVideo 返回的 task_id」, 不指明停哪个任务则调用无意义.
     */
    playVideoStop: [
        "停止视频号播放任务. taskId=playVideo 返回的任务 ID (vendor task_id).",
        Type.Object({
            taskId: Type.String({ description: "要停止的任务 ID (vendor task_id, 来自 playVideo 响应)" }),
        }),
        (taskId) => getFinderApi().playVideoStop(taskId),
    ],
    /** /Finder/PlayVideoStatus — 视频播放状态 (v1.3.67 新 API GET) */
    playVideoStatus: [
        "查询视频号播放任务状态. taskId=任务 ID.",
        Type.Object({ taskId: Type.String() }),
        (taskId) => getFinderApi().playVideoStatus(taskId),
    ],
    /** /Finder/PlayVideoTasks — 播放任务列表 (v1.3.67 新 API GET) */
    playVideoTasks: [
        "列出视频号播放任务 (运行中 + 24h 内已结束).",
        Type.Object({}),
        () => getFinderApi().playVideoTasks(),
    ],
};
//# sourceMappingURL=finder-meta.js.map