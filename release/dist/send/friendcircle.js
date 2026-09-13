// src/send/friendcircle.ts - FriendCircle tag (11 endpoints)
// v1.1.27 FRIENDCIRCLE-FIELD-FIX (2026-08-08 P1-2): 字段名对齐 swagger
//   之前: snsId/wxid/firstPageMd5/commnetType/scope 静默失效
//   fix: id/towxid/fristpagemd5(typo)/type/function
import { postWppJson, getWppJson, getWppBinary } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
import { getDefaultAccountRegistry } from "../account-state.js";
import { warn } from "../core/logger.js";
/**
 * v1.3.41 FRIENDCIRCLE-GUARD (老板 2026-08-11): 朋友圈发布开关校验.
 *   读 account 配置 friendCirclePublishEnabled (默认 false 关闭) — 关闭则拒绝任何发布.
 *   @param accountId 账号 id
 *   @param callerWxid 发起者 wxid (白名单校验用; 传入时检查 ∈ friendCirclePublishAllowFrom/adminUsers)
 *   @param getCfg 可注入的配置读取函数 (默认 registry; 测试可覆盖)
 *   @returns 是否允许发布; 拒绝时抛错
 */
export function assertFriendCirclePublishAllowed(accountId, callerWxid, getCfg) {
    const state = getCfg ? null : getDefaultAccountRegistry().get(accountId);
    const cfg = getCfg ? getCfg() : state?.config;
    // 开关默认关闭 — 防止任何人发朋友圈
    if (!cfg?.friendCirclePublishEnabled) {
        throw new Error("朋友圈发布未启用 (friendCirclePublishEnabled=false)");
    }
    // 白名单: 优先 friendCirclePublishAllowFrom, 缺省 adminUsers
    if (callerWxid) {
        const allow = cfg.friendCirclePublishAllowFrom && cfg.friendCirclePublishAllowFrom.length > 0
            ? cfg.friendCirclePublishAllowFrom
            : (cfg.adminUsers ?? []);
        if (!allow.includes(callerWxid)) {
            warn(`[WPP v1.3.41 GUARD] 朋友圈发布拒绝: ${callerWxid} 不在白名单`);
            throw new Error(`朋友圈发布无权限 (${callerWxid} 不在白名单)`);
        }
    }
}
export function makeWppFriendCircle(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        /** /FriendCircle/Comment — 朋友圈点赞/评论 (content + id + type + replyCommnetId) */
        // v1.3.42 FIX (2026-08-11): replyCommnetId 默认 "" → 0. vendor Go 端 int32 字段传空字符串会 unmarshal 报错
        //   (json: cannot unmarshal string into Go struct field CommentParam.replyCommnetId of type int32), 实测确认.
        comment: (snsId, content, type = 1, replyCommnetId = 0) => dispatch("/FriendCircle/Comment", { content, id: snsId, type, replyCommnetId }),
        /** /FriendCircle/GetCommnet — 获取评论内容 (xmlData) */
        getComment: (xmlData) => dispatch("/FriendCircle/GetCommnet", { xmlData }),
        /** /FriendCircle/GetDetail — 特定人朋友圈 (towxid 在 GetIdDetailParamDoc 实际是 id) */
        getDetail: (wxid) => dispatch("/FriendCircle/GetDetail", { towxid: wxid }),
        /** /FriendCircle/GetIdDetail — 特定 ID 详情 (id + towxid) */
        getIdDetail: (snsId, wxid = "") => dispatch("/FriendCircle/GetIdDetail", { id: snsId, towxid: wxid }),
        /** /FriendCircle/GetList — 朋友圈首页列表 (fristpagemd5 vendor typo + maxid) */
        getList: (firstPageMd5 = "", maxid = "") => dispatch("/FriendCircle/GetList", { fristpagemd5: firstPageMd5, maxid }),
        /** /FriendCircle/Messages — 发布朋友圈 (SnsPostItemDoc) */
        publish: (title, _content, mediaList) => {
            assertFriendCirclePublishAllowed(ctx.accountId); // v1.3.41 开关校验 (默认禁用)
            return dispatch("/FriendCircle/Messages", {
                title,
                blackList: "",
                private: 0,
                totalSize: 0,
                withUserList: "",
                ...(mediaList ?? {}),
            });
        },
        /** /FriendCircle/MmSnsSync — 查询正在评论转发的 ID */
        mmSnsSync: () => dispatch("/FriendCircle/MmSnsSync", {}),
        /** /FriendCircle/Operation — 朋友圈操作 (commnetId + id + type 1=删 2=设顶 3=取消) */
        operation: (snsId, type) => dispatch("/FriendCircle/Operation", { id: snsId, type }),
        /** /FriendCircle/PrivacySettings — 朋友圈权限 (function + value) */
        privacySettings: (functionType, value) => dispatch("/FriendCircle/PrivacySettings", { function: functionType, value }),
        /** /FriendCircle/PushCommnet — 启动评论检查任务并转发评论
         *  v1.6.0 SWAGGER-323: swagger FriendCircle.RequestParamsDoc {id*(朋友圈 ID), forwardAddr*(评论回调地址)}.
         *  旧码发空体 ⇒ 任务没有目标动态、也没有回调地址. */
        pushComment: (id, forwardAddr) => dispatch("/FriendCircle/PushCommnet", { id, forwardAddr }),
        /**
         * /FriendCircle/Upload — 上传朋友圈媒体 (发朋友圈用).
         * v1.3.23 FIX: swagger summary 误写"下载CDN视频", 实测是上传 (报错"朋友圈图片上传失败" + StartPos/TotalLen 分片).
         * 参数: key=媒体标识, base64=媒体内容.
         */
        upload: (key, base64) => dispatch("/FriendCircle/Upload", { key, base64 }),
        /**
         * v1.3.24 FRIENDCIRCLE-DOWNLOAD-VIDEO: /FriendCircle/DownloadVideo — 下载朋友圈视频 (隐藏端点, swagger 未列).
         * 老板提供参数 (2026-08-10): { key, url } — key=视频 md5 (或 media id/filekey), url=完整视频 CDN URL.
         * 实测 (2026-08-10): key=md5 + url=完整 URL → Code=0, Data=base64 视频 (mp4/isom), 1853612 bytes 完整下载.
         */
        downloadVideo: (key, url) => dispatch("/FriendCircle/DownloadVideo", { key, url }),
        /**
         * v1.3.25 SWAGGER-254: /FriendCircle/UploadVideo — 朋友圈上传 CDN 视频 (视频朋友圈发布前置).
         * 参数 (swagger SnsUploadVideoParamDoc): thumbData=缩略图 base64, videoData=视频 base64.
         */
        uploadVideo: (videoData, thumbData) => dispatch("/FriendCircle/UploadVideo", { videoData, thumbData }),
        /**
         * v1.3.25 SWAGGER-254: /FriendCircle/UploadImage — 朋友圈上传 CDN 图片 (单张).
         * 参数 (CdnSnsImageUploadParamDoc): imageData=图片 base64.
         */
        uploadImage: (imageData) => dispatch("/FriendCircle/UploadImage", { imageData }),
        /**
         * v1.3.25 SWAGGER-254: /FriendCircle/UploadImages — 朋友圈批量上传 CDN 图片.
         * 参数 (CdnSnsImagesUploadParamDoc): imageDataList=图片 base64 数组.
         */
        uploadImages: (imageDataList) => dispatch("/FriendCircle/UploadImages", { imageDataList }),
        /**
         * v1.3.25 SWAGGER-254: /FriendCircle/MessagesRaw — 发布朋友圈 (原始 XML 兼容接口).
         * 参数 (MessagearameterDoc): content=文字, blackList, withUserList.
         * 可能解决图片朋友圈显示 XML 代码的问题 (原始 XML 接口).
         */
        messagesRaw: (content, blackList = "", withUserList = "") => {
            assertFriendCirclePublishAllowed(ctx.accountId); // v1.3.63 P1: 补 guard (原漏网)
            return dispatch("/FriendCircle/MessagesRaw", { content, blackList, withUserList });
        },
        /**
         * v1.3.28 PublishImages (2026-08-10 老板实测): 发布**图片**朋友圈 (1-9 张).
         *
         * 背景: 原 publish() 用扁平字段 (thumburl/videourl), 只支持视频/链接, 不支持图片.
         *   实测 (2026-08-10): 图片朋友圈需 UploadImage → Data.publishItem → /Messages images 数组.
         *
         * 流程: 逐张 UploadImage 拿 publishItem → /FriendCircle/Messages { title, private:0, images:[items] }.
         * 任何一张上传失败 → throw (调用方拿到错误, 不半途发布).
         */
        publishImages: async (title, imageBase64List) => {
            assertFriendCirclePublishAllowed(ctx.accountId); // v1.3.41 开关校验 (默认禁用)
            if (!imageBase64List.length || imageBase64List.length > 9) {
                throw new Error(`publishImages: image count must be 1-9 (got ${imageBase64List.length})`);
            }
            const items = [];
            for (const b64 of imageBase64List) {
                const up = await dispatch("/FriendCircle/UploadImage", { imageData: b64 });
                const item = up.Data?.publishItem;
                if (up.Code !== 0 || !item) {
                    throw new Error(`publishImages: UploadImage failed Code=${up.Code} ${up.CodeValue ?? ""}`);
                }
                items.push(item);
            }
            return dispatch("/FriendCircle/Messages", { title, private: 0, images: items });
        },
        /**
         * v1.3.29 PublishVideo (2026-08-10 老板实测): 发布**视频**朋友圈.
         *
         * 背景: 同图片 — 原 publish() 用扁平字段 (thumburl/videourl), 但 swagger 要求嵌套 video 对象
         *   (SnsPostRequestDoc.video: videomd5/thumbmd5/videourl/thumburl/totalSize).
         *   实测 (2026-08-10): UploadVideo → Data.publishItem (含 totalSize 字符串) → /Messages video 对象.
         *
         * 流程: UploadVideo {videoData, thumbData} → publishItem → /Messages { title, private:0, video:item }.
         */
        publishVideo: async (title, videoBase64, thumbBase64) => {
            assertFriendCirclePublishAllowed(ctx.accountId); // v1.3.41 开关校验 (默认禁用)
            const up = await dispatch("/FriendCircle/UploadVideo", {
                videoData: videoBase64,
                thumbData: thumbBase64,
            });
            const item = up.Data?.publishItem;
            if (up.Code !== 0 || !item) {
                throw new Error(`publishVideo: UploadVideo failed Code=${up.Code} ${up.CodeValue ?? ""}`);
            }
            return dispatch("/FriendCircle/Messages", { title, private: 0, video: item });
        },
        /**
         * v1.3.30 (2026-08-10): 用已有 publishItem 直接发布视频朋友圈.
         * 供 uploadVideo 后复用 item (或测试不同上传格式), 免二次上传.
         */
        publishVideoViaItem: async (title, videoItem) => {
            assertFriendCirclePublishAllowed(ctx.accountId); // v1.3.63 P1: 补 guard (原漏网)
            return dispatch("/FriendCircle/Messages", { title, private: 0, video: videoItem });
        },
        /**
         * /FriendCircle/SetBackgroundImage — 设置朋友圈背景图.
         * v1.6.0 SWAGGER-323: swagger FriendCircle.SetBackgroundImageParamDoc
         *   {url*(背景大图地址), thumbUrl(背景缩略图地址)}.
         * 旧码发 `imageData` — 本端点 swagger 无此字段 (疑似从 /FriendCircle/UploadImage 复制而来,
         * 那儿才是 imageData). url 取 /FriendCircle/UploadImage 的上传结果.
         */
        setBackgroundImage: (url, thumbUrl = "") => {
            assertFriendCirclePublishAllowed(ctx.accountId); // v1.3.63 P1: 补 guard (原漏网)
            return dispatch("/FriendCircle/SetBackgroundImage", thumbUrl ? { url, thumbUrl } : { url });
        },
        /** /FriendCircle/GetCollectCircle — 读取收藏动态详情 (v1.3.67 新 API; sourceId=收藏来源标识) */
        getCollectCircle: (sourceId) => dispatch("/FriendCircle/GetCollectCircle", { sourceId }),
        /** /FriendCircle/SendFavItemCircle — 从收藏项发布朋友圈 (v1.3.67 新 API; favItemId=收藏项ID) */
        sendFavItemCircle: (favItemId, sourceId, blackList = "", locationMode = 1) => dispatch("/FriendCircle/SendFavItemCircle", {
            favItemId, sourceId, blackList, locationMode,
        }),
        /** /FriendCircle/SendOneIdCircle — 通过已有动态 id 再发朋友圈 (v1.3.67 新 API) */
        sendOneIdCircle: (id, blackList = "", locationMode = 1) => dispatch("/FriendCircle/SendOneIdCircle", { id, blackList, locationMode }),
        /** /FriendCircle/SetFriendCircleDays — 设置朋友圈可见范围 (v1.3.67 新 API; range=three_days/one_month/six_months/all) */
        setFriendCircleDays: (range) => dispatch("/FriendCircle/SetFriendCircleDays", { range }),
        /** /FriendCircle/ActiveTasks — 查询朋友圈评论转发任务 (v1.3.67 新 API) */
        activeTasks: () => dispatch("/FriendCircle/ActiveTasks", {}),
        // ===== v1.6.0 SWAGGER-323: 批量导出 (3) + 自动跟发 (2) =====
        // 来源: 容器 swagger (v09102) FriendCircle.BatchDownloadRequestDoc / AutoForwardParamDoc.
        // 批量导出是「建任务 → 轮询 → 取文件」三拍, 任务按 authcode 绑定的账号隔离.
        // 自动跟发只处理「开启后新观察到的」公开动态, 且发布侧仍受账号级风控间隔保护 —
        //   但发布本质仍是对外动作, 故与其它发布接口一致地走 assertFriendCirclePublishAllowed.
        /**
         * /FriendCircle/BatchDownload — 建朋友圈批量导出任务.
         * swagger: FriendCircle.BatchDownloadRequestDoc {towxid*, since, until, max_pages(≤500, 默认500), include_original}.
         * since/until 是 YYYY-MM-DD, 默认「近六个月 ~ 今天」(厂商侧默认, 不传即可).
         */
        batchDownload: (toWxid, opt) => dispatch("/FriendCircle/BatchDownload", {
            towxid: toWxid,
            ...(opt?.since ? { since: opt.since } : {}),
            ...(opt?.until ? { until: opt.until } : {}),
            ...(opt?.maxPages !== undefined ? { max_pages: opt.maxPages } : {}),
            ...(opt?.includeOriginal !== undefined ? { include_original: opt.includeOriginal } : {}),
        }),
        /** /FriendCircle/BatchDownloadStatus — 查导出任务进度 (task_id 走 query, GET) */
        batchDownloadStatus: (taskId) => getWppJson(ctx.baseUrl, `/FriendCircle/BatchDownloadStatus?task_id=${encodeURIComponent(taskId)}`, opts),
        /**
         * /FriendCircle/BatchDownloadFile — 取导出产物 (**原始文件流, 非 JSON**).
         * swagger: query {task_id*, name} — name = 朋友圈.zip (默认) / 朋友圈.md / 导出信息.json.
         * 走 getWppBinary (getWppJson 会 text() 解析, 会把二进制毁掉).
         */
        batchDownloadFile: (taskId, name = "") => getWppBinary(ctx.baseUrl, `/FriendCircle/BatchDownloadFile?task_id=${encodeURIComponent(taskId)}${name ? `&name=${encodeURIComponent(name)}` : ""}`, opts),
        /**
         * /FriendCircle/AutoForward — 配置指定用户朋友圈自动跟发.
         * swagger: FriendCircle.AutoForwardParamDoc {enabled*, source_wxid(开启时必填), delay_seconds(0-300),
         *   location_mode(0保留/1移除位置), black_list(逗号分隔或数组), content_owner_authorized}.
         * ⚠️ content_owner_authorized = 确认已获源内容所有者同步发布授权; 开启跟发时厂商要求为 true —
         *    这是**合规声明**, 由调用方负责, 这里不做默认放行.
         */
        autoForward: (enabled, opt) => {
            if (enabled)
                assertFriendCirclePublishAllowed(ctx.accountId); // 开启跟发 = 开启自动发布
            return dispatch("/FriendCircle/AutoForward", {
                enabled,
                ...(opt?.sourceWxid ? { source_wxid: opt.sourceWxid } : {}),
                ...(opt?.delaySeconds !== undefined ? { delay_seconds: opt.delaySeconds } : {}),
                ...(opt?.locationMode !== undefined ? { location_mode: opt.locationMode } : {}),
                ...(opt?.blackList !== undefined ? { black_list: opt.blackList } : {}),
                ...(opt?.contentOwnerAuthorized !== undefined
                    ? { content_owner_authorized: opt.contentOwnerAuthorized }
                    : {}),
            });
        },
        /** /FriendCircle/AutoForwardStatus — 查自动跟发策略与最近同步状态 (GET) */
        autoForwardStatus: () => getWppJson(ctx.baseUrl, "/FriendCircle/AutoForwardStatus", opts),
    };
}
//# sourceMappingURL=friendcircle.js.map