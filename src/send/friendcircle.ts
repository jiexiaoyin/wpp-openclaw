// src/send/friendcircle.ts - FriendCircle tag (11 endpoints)
// v1.1.27 FRIENDCIRCLE-FIELD-FIX (2026-08-08 P1-2): 字段名对齐 swagger
//   之前: snsId/wxid/firstPageMd5/commnetType/scope 静默失效
//   fix: id/towxid/fristpagemd5(typo)/type/function

import { postWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";
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
export function assertFriendCirclePublishAllowed(
  accountId: string,
  callerWxid?: string,
  getCfg?: () => { friendCirclePublishEnabled?: boolean; friendCirclePublishAllowFrom?: string[]; adminUsers?: string[] } | null | undefined,
): void {
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

export function makeWppFriendCircle(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /FriendCircle/Comment — 朋友圈点赞/评论 (content + id + type + replyCommnetId) */
    // v1.3.42 FIX (2026-08-11): replyCommnetId 默认 "" → 0. vendor Go 端 int32 字段传空字符串会 unmarshal 报错
    //   (json: cannot unmarshal string into Go struct field CommentParam.replyCommnetId of type int32), 实测确认.
    comment: (snsId: string, content: string, type: number = 1, replyCommnetId: number = 0) =>
      dispatch("/FriendCircle/Comment", { content, id: snsId, type, replyCommnetId }),

    /** /FriendCircle/GetCommnet — 获取评论内容 (xmlData) */
    getComment: (xmlData: string) =>
      dispatch("/FriendCircle/GetCommnet", { xmlData }),

    /** /FriendCircle/GetDetail — 特定人朋友圈 (towxid 在 GetIdDetailParamDoc 实际是 id) */
    getDetail: (wxid: string) =>
      dispatch("/FriendCircle/GetDetail", { towxid: wxid }),

    /** /FriendCircle/GetIdDetail — 特定 ID 详情 (id + towxid) */
    getIdDetail: (snsId: string, wxid = "") =>
      dispatch("/FriendCircle/GetIdDetail", { id: snsId, towxid: wxid }),

    /** /FriendCircle/GetList — 朋友圈首页列表 (fristpagemd5 vendor typo + maxid) */
    getList: (firstPageMd5 = "", maxid = "") =>
      dispatch("/FriendCircle/GetList", { fristpagemd5: firstPageMd5, maxid }),

    /** /FriendCircle/Messages — 发布朋友圈 (SnsPostItemDoc) */
    publish: (
      title: string,
      _content: string,
      mediaList?: { thumburl?: string; thumbmd5?: string; videourl?: string; videomd5?: string },
    ) => {
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
    operation: (snsId: string, type: 1 | 2 | 3) =>
      dispatch("/FriendCircle/Operation", { id: snsId, type }),

    /** /FriendCircle/PrivacySettings — 朋友圈权限 (function + value) */
    privacySettings: (functionType: string, value: number) =>
      dispatch("/FriendCircle/PrivacySettings", { function: functionType, value }),

    /** /FriendCircle/PushCommnet — 启动评论检查任务 (RequestParamsDoc) */
    pushComment: () => dispatch("/FriendCircle/PushCommnet", {}),

    /**
     * /FriendCircle/Upload — 上传朋友圈媒体 (发朋友圈用).
     * v1.3.23 FIX: swagger summary 误写"下载CDN视频", 实测是上传 (报错"朋友圈图片上传失败" + StartPos/TotalLen 分片).
     * 参数: key=媒体标识, base64=媒体内容.
     */
    upload: (key: string, base64: string) => dispatch("/FriendCircle/Upload", { key, base64 }),

    /**
     * v1.3.24 FRIENDCIRCLE-DOWNLOAD-VIDEO: /FriendCircle/DownloadVideo — 下载朋友圈视频 (隐藏端点, swagger 未列).
     * 老板提供参数 (2026-08-10): { key, url } — key=视频 md5 (或 media id/filekey), url=完整视频 CDN URL.
     * 实测 (2026-08-10): key=md5 + url=完整 URL → Code=0, Data=base64 视频 (mp4/isom), 1853612 bytes 完整下载.
     */
    downloadVideo: (key: string, url: string) => dispatch("/FriendCircle/DownloadVideo", { key, url }),

    /**
     * v1.3.25 SWAGGER-254: /FriendCircle/UploadVideo — 朋友圈上传 CDN 视频 (视频朋友圈发布前置).
     * 参数 (swagger SnsUploadVideoParamDoc): thumbData=缩略图 base64, videoData=视频 base64.
     */
    uploadVideo: (videoData: string, thumbData: string) =>
      dispatch("/FriendCircle/UploadVideo", { videoData, thumbData }),

    /**
     * v1.3.25 SWAGGER-254: /FriendCircle/UploadImage — 朋友圈上传 CDN 图片 (单张).
     * 参数 (CdnSnsImageUploadParamDoc): imageData=图片 base64.
     */
    uploadImage: (imageData: string) =>
      dispatch("/FriendCircle/UploadImage", { imageData }),

    /**
     * v1.3.25 SWAGGER-254: /FriendCircle/UploadImages — 朋友圈批量上传 CDN 图片.
     * 参数 (CdnSnsImagesUploadParamDoc): imageDataList=图片 base64 数组.
     */
    uploadImages: (imageDataList: string[]) =>
      dispatch("/FriendCircle/UploadImages", { imageDataList }),

    /**
     * v1.3.25 SWAGGER-254: /FriendCircle/MessagesRaw — 发布朋友圈 (原始 XML 兼容接口).
     * 参数 (MessagearameterDoc): content=文字, blackList, withUserList.
     * 可能解决图片朋友圈显示 XML 代码的问题 (原始 XML 接口).
     */
    messagesRaw: (content: string, blackList = "", withUserList = "") => {
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
    publishImages: async (title: string, imageBase64List: string[]) => {
      assertFriendCirclePublishAllowed(ctx.accountId); // v1.3.41 开关校验 (默认禁用)
      if (!imageBase64List.length || imageBase64List.length > 9) {
        throw new Error(`publishImages: image count must be 1-9 (got ${imageBase64List.length})`);
      }
      const items: unknown[] = [];
      for (const b64 of imageBase64List) {
        const up = await dispatch("/FriendCircle/UploadImage", { imageData: b64 });
        const item = (up.Data as Record<string, unknown> | undefined)?.publishItem;
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
    publishVideo: async (title: string, videoBase64: string, thumbBase64: string) => {
      assertFriendCirclePublishAllowed(ctx.accountId); // v1.3.41 开关校验 (默认禁用)
      const up = await dispatch("/FriendCircle/UploadVideo", {
        videoData: videoBase64,
        thumbData: thumbBase64,
      });
      const item = (up.Data as Record<string, unknown> | undefined)?.publishItem;
      if (up.Code !== 0 || !item) {
        throw new Error(`publishVideo: UploadVideo failed Code=${up.Code} ${up.CodeValue ?? ""}`);
      }
      return dispatch("/FriendCircle/Messages", { title, private: 0, video: item });
    },

    /**
     * v1.3.30 (2026-08-10): 用已有 publishItem 直接发布视频朋友圈.
     * 供 uploadVideo 后复用 item (或测试不同上传格式), 免二次上传.
     */
    publishVideoViaItem: async (title: string, videoItem: unknown) => {
      assertFriendCirclePublishAllowed(ctx.accountId); // v1.3.63 P1: 补 guard (原漏网)
      return dispatch("/FriendCircle/Messages", { title, private: 0, video: videoItem });
    },

    /**
     * v1.3.25 SWAGGER-254: /FriendCircle/SetBackgroundImage — 设置朋友圈背景图.
     */
    setBackgroundImage: (imageData: string) => {
      assertFriendCirclePublishAllowed(ctx.accountId); // v1.3.63 P1: 补 guard (原漏网)
      return dispatch("/FriendCircle/SetBackgroundImage", { imageData });
    },
  };
}

export type WppFriendCircleApi = ReturnType<typeof makeWppFriendCircle>;