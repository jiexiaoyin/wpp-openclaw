// src/dispatch/agent-tools/friendcircle-meta.ts - FriendCircle tag (11)
// v1.3.18 P1-核心1 fix (2026-08-10): 改成 lazy-evaluate ctx 模式

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppFriendCircle } from "../../send/friendcircle.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";

function getFriendCircleApi() {
  const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
  if (!state) throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
  return makeWppFriendCircle({
    baseUrl: state.config.apiBaseUrl,
    tokenKey: state.config.tokenKey,
    authcode: state.authcode,
    accountId: getCurrentAccountId() ?? "default",
  });
}

export const FRIEND_CIRCLE_META: ToolMeta = {
  /** /FriendCircle/GetList */
  getFriendCircleList: [
    "获取朋友圈首页 (firstPageMd5 翻页).",
    Type.Object({
      firstPageMd5: Type.Optional(Type.String()),
    }),
    (firstPageMd5?: string) => getFriendCircleApi().getList(firstPageMd5 ?? ""),
  ],
  /** /FriendCircle/GetDetail */
  getFriendCircleByUser: [
    "获取特定人朋友圈.",
    Type.Object({ wxid: Type.String() }),
    (wxid: string) => getFriendCircleApi().getDetail(wxid),
  ],
  /** /FriendCircle/GetIdDetail */
  getFriendCircleBySnsId: [
    "获取特定 snsId 详情.",
    Type.Object({ snsId: Type.String() }),
    (snsId: string) => getFriendCircleApi().getIdDetail(snsId),
  ],
  /** /FriendCircle/Messages */
  // v1.3.41 FRIENDCIRCLE-GUARD (老板 2026-08-11): 发布工具从 agent-tools 移除 (默认禁用)
  //   朋友圈发布是对外公开操作, 不能任何人触发. send/friendcircle.ts 的
  //   publish/publishImages/publishVideo 内部有 assertFriendCirclePublishAllowed 开关校验
  //   (friendCirclePublishEnabled 默认 false + admin 白名单). 工具层不暴露发布, 防止 AI 误调.
  //   启用: 在 accounts/<id>.json 设 friendCirclePublishEnabled:true + 白名单, 再恢复工具注册.
  /** /FriendCircle/Comment */
  // v1.3.42 FIX (2026-08-11): 描述改对 vendor 语义 (1=点赞 2=文本评论, 原"1=文字 2=表情"误导 AI)
  //   + 加 replyCommnetId 可选参数 (默认 0, vendor int32 拒绝空字符串). 禁止用 likeFinderPost 点赞朋友圈 (那是视频号).
  commentFriendCircle: [
    "朋友圈点赞/评论 (走 /FriendCircle/Comment). commentType: 1=点赞, 2=文本评论. 点赞传 content=👍 + commentType=1. ⚠️ 朋友圈点赞不要用 likeFinderPost (那是视频号 Finder 的工具).",
    Type.Object({
      snsId: Type.String(),
      content: Type.String(),
      commentType: Type.Optional(Type.Number()),
      replyCommnetId: Type.Optional(Type.Number()),
    }),
    (snsId: string, content: string, commentType?: number, replyCommnetId?: number) =>
      getFriendCircleApi().comment(snsId, content, commentType ?? 1, replyCommnetId ?? 0),
  ],
  /** /FriendCircle/Operation */
  operateFriendCircle: [
    "朋友圈操作. op: delete|setTop|cancelSetTop.",
    Type.Object({
      snsId: Type.String(),
      op: Type.Union([
        Type.Literal("delete"),
        Type.Literal("setTop"),
        Type.Literal("cancelSetTop"),
      ]),
    }),
    // 原版 api.operation(snsId, op) — 但 api.operation 签名是 (snsId, type: 1|2|3)
    // 这是历史不一致, 跟 v1.3.18 修复无关, 不优化
    (snsId: string, _op: "delete" | "setTop" | "cancelSetTop") => getFriendCircleApi().operation(snsId, 1),
  ],
  /** /FriendCircle/PrivacySettings */
  setFriendCirclePrivacy: [
    "朋友圈隐私设置. scope 查 vendor 文档.",
    Type.Object({ scope: Type.Number() }),
    (scope: number) => getFriendCircleApi().privacySettings(String(scope), 0),
  ],
  /** /FriendCircle/GetCommnet */
  getFriendCircleComments: [
    "获取某朋友圈的所有评论.",
    Type.Object({ snsId: Type.String() }),
    // 原版 api.getComment(snsId) — 但 api.getComment 签名是 (xmlData: string)
    // 历史不一致, 不优化
    (snsId: string) => getFriendCircleApi().getComment(snsId),
  ],
  /** /FriendCircle/PushCommnet */
  startFriendCircleCommentTask: [
    "启动评论检查后台任务, 转发 callback 形式的评论事件. id=朋友圈动态 ID, forwardAddr=评论回调地址.",
    Type.Object({ id: Type.String(), forwardAddr: Type.String({ description: "评论回调地址" }) }),
    (id: string, forwardAddr: string) => getFriendCircleApi().pushComment(id, forwardAddr),
  ],
  /**
   * v1.3.20 P2-FRIENDCIRCLE: /FriendCircle/MmSnsSync — 查询正在评论/转发的 ID.
   * 用于检查朋友圈是否有新的评论/转发事件待处理.
   */
  syncFriendCircleSns: [
    "查询朋友圈正在评论/转发的 sns ID (用于同步评论事件).",
    Type.Object({}),
    () => getFriendCircleApi().mmSnsSync(),
  ],
  /**
   * v1.3.20 P2-FRIENDCIRCLE / v1.3.23 FIX: /FriendCircle/Upload — **上传**朋友圈媒体 (发朋友圈时用).
   * 实测 (2026-08-10): swagger summary 误写"下载CDN视频", 实际是上传 —
   *   传 base64 报 "朋友圈图片上传失败" + 返回 StartPos/TotalLen/Type (分片上传进度), Type:2=图片.
   * base64 是要上传的媒体内容 (图片/视频), key 是媒体标识.
   */
  uploadCircleMedia: [
    "上传朋友圈媒体 (发朋友圈时用). base64 是要上传的图片/视频内容, key 是媒体标识.",
    Type.Object({
      key: Type.String({ description: "媒体标识" }),
      base64: Type.String({ description: "要上传的图片/视频内容 (base64)" }),
    }),
    (key: string, base64: string) => getFriendCircleApi().upload(key, base64),
  ],
  /**
   * v1.3.24 FRIENDCIRCLE-DOWNLOAD-VIDEO: /FriendCircle/DownloadVideo — 下载朋友圈视频.
   * 老板提供参数 (2026-08-10): key=视频 md5 (或 media id), url=完整视频 CDN URL.
   * 返回 base64 视频数据 (Data 字段).
   */
  downloadCircleVideo: [
    "下载朋友圈视频. key=视频 md5 (或 media id), url=完整视频 CDN URL (来自 GetDetail ObjectDesc). 返回 base64 视频数据.",
    Type.Object({
      key: Type.String({ description: "视频 md5 或 media id" }),
      url: Type.String({ description: "完整视频 CDN URL" }),
    }),
    (key: string, url: string) => getFriendCircleApi().downloadVideo(key, url),
  ],
  // ===== v1.3.25 SWAGGER-254: 新增 5 个 =====

  /** /FriendCircle/UploadVideo — 上传朋友圈视频 */
  uploadCircleVideo: [
    "上传朋友圈视频 (发视频朋友圈前置). videoData=视频 base64, thumbData=缩略图 base64.",
    Type.Object({
      videoData: Type.String({ description: "视频内容 base64" }),
      thumbData: Type.String({ description: "缩略图 base64" }),
    }),
    (videoData: string, thumbData: string) => getFriendCircleApi().uploadVideo(videoData, thumbData),
  ],
  /** /FriendCircle/UploadImage — 上传单张朋友圈图片 */
  uploadCircleImage: [
    "上传单张朋友圈图片. imageData=图片 base64.",
    Type.Object({ imageData: Type.String({ description: "图片内容 base64" }) }),
    (imageData: string) => getFriendCircleApi().uploadImage(imageData),
  ],
  /** /FriendCircle/UploadImages — 批量上传朋友圈图片 */
  uploadCircleImages: [
    "批量上传朋友圈图片. imageDataList=图片 base64 数组.",
    Type.Object({
      imageDataList: Type.Array(Type.String(), { description: "图片 base64 数组" }),
    }),
    (imageDataList: string[]) => getFriendCircleApi().uploadImages(imageDataList),
  ],
  // v1.3.63 P1 (2026-08-14 审阅): publishCircleRaw 已移除 — AI 不该有原始 XML 发布能力
  //   (原绕过 guard 无 callerWxid 白名单; 发布走 publishCircle/publishImagesCircle/publishVideoCircle 复合工具带 guard)
  /** /FriendCircle/SetBackgroundImage — 设置朋友圈背景图 */
  setCircleBackgroundImage: [
    "设置朋友圈背景图. url=背景大图地址 (先用 uploadCircleImage 上传拿到), thumbUrl 可选缩略图地址.",
    Type.Object({
      url: Type.String({ description: "背景大图地址" }),
      thumbUrl: Type.Optional(Type.String({ description: "背景缩略图地址" })),
    }),
    (url: string, thumbUrl?: string) => getFriendCircleApi().setBackgroundImage(url, thumbUrl ?? ""),
  ],
  /** /FriendCircle/GetCollectCircle — 读取收藏动态 (v1.3.67 新 API) */
  getCollectCircle: [
    "读取收藏的朋友圈动态详情. sourceId=收藏来源标识.",
    Type.Object({ sourceId: Type.String() }),
    (sourceId: string) => getFriendCircleApi().getCollectCircle(sourceId),
  ],
  /** /FriendCircle/SendFavItemCircle — 从收藏项发朋友圈 (v1.3.67 新 API) */
  sendFavItemCircle: [
    "从收藏项发布朋友圈. favItemId=收藏项ID(数字), sourceId=收藏来源.",
    Type.Object({
      favItemId: Type.Number(),
      sourceId: Type.String(),
      blackList: Type.Optional(Type.String()),
      locationMode: Type.Optional(Type.Number({ description: "0保留位置 1移除 2自定义" })),
    }),
    (favItemId: number, sourceId: string, blackList = "", locationMode = 1) =>
      getFriendCircleApi().sendFavItemCircle(favItemId, sourceId, blackList, locationMode),
  ],
  /** /FriendCircle/SendOneIdCircle — 通过动态 id 再发 (v1.3.67 新 API) */
  sendOneIdCircle: [
    "通过已有动态 id 再发朋友圈 (支持文字/图片/视频/链接). id=原动态id.",
    Type.Object({
      id: Type.String(),
      blackList: Type.Optional(Type.String()),
      locationMode: Type.Optional(Type.Number({ description: "0保留位置 1移除 2自定义" })),
    }),
    (id: string, blackList = "", locationMode = 1) =>
      getFriendCircleApi().sendOneIdCircle(id, blackList, locationMode),
  ],
  /** /FriendCircle/SetFriendCircleDays — 设置朋友圈可见范围 (v1.3.67 新 API) */
  setFriendCircleDays: [
    "设置朋友圈可见范围. range=three_days/one_month/six_months/all.",
    Type.Object({
      range: Type.Union([
        Type.Literal("three_days"), Type.Literal("one_month"),
        Type.Literal("six_months"), Type.Literal("all"),
      ]),
    }),
    (range: "three_days" | "one_month" | "six_months" | "all") =>
      getFriendCircleApi().setFriendCircleDays(range),
  ],
  /** /FriendCircle/ActiveTasks — 查询朋友圈评论转发任务 (v1.3.67 新 API) */
  activeTasks: [
    "查询正在执行的朋友圈评论转发任务.",
    Type.Object({}),
    () => getFriendCircleApi().activeTasks(),
  ],

  // ===== v1.6.0 SWAGGER-323: 批量导出 (3) + 自动跟发 (2) =====

  /**
   * /FriendCircle/BatchDownload — 建朋友圈批量导出任务.
   * 三拍流程: 本工具建任务 (拿 task_id) → getFriendCircleExportStatus 轮询 → downloadFriendCircleExport 取文件.
   * 任务按服务端 authcode 绑定账号隔离 (只看得到自己账号建的任务).
   */
  exportFriendCircle: [
    "建朋友圈批量导出任务 (导出某人的朋友圈为 zip/md). 返回 task_id, 之后用 getFriendCircleExportStatus 轮询进度, 完成后用 downloadFriendCircleExport 取文件.",
    Type.Object({
      towxid: Type.String({ description: "目标用户 wxid (要导出谁的朋友圈)" }),
      since: Type.Optional(Type.String({ description: "起始日期 YYYY-MM-DD, 默认近六个月" })),
      until: Type.Optional(Type.String({ description: "结束日期 YYYY-MM-DD, 默认今天" })),
      maxPages: Type.Optional(Type.Number({ description: "最大分页数, 默认/上限 500" })),
      includeOriginal: Type.Optional(Type.Boolean({ description: "是否下载原图, 默认 true" })),
    }),
    (towxid: string, since?: string, until?: string, maxPages?: number, includeOriginal?: boolean) =>
      getFriendCircleApi().batchDownload(towxid, { since, until, maxPages, includeOriginal }),
  ],
  /** /FriendCircle/BatchDownloadStatus — 查导出任务进度 */
  getFriendCircleExportStatus: [
    "查询朋友圈批量导出任务进度 (返回分页/动态/原图/产物生成进度, files 里列出可下载的产物名).",
    Type.Object({ taskId: Type.String({ description: "exportFriendCircle 返回的 task_id" }) }),
    (taskId: string) => getFriendCircleApi().batchDownloadStatus(taskId),
  ],
  /**
   * /FriendCircle/BatchDownloadFile — 取导出产物 (原始文件流, 非 JSON).
   * 返回 bytes(字节数)+contentType+fileName — 内容本身太大, 不进 agent 上下文.
   */
  downloadFriendCircleExport: [
    "下载朋友圈批量导出的产物文件 (任务完成后才可下载). name 可选: 朋友圈.zip (默认) / 朋友圈.md / 导出信息.json. 返回文件字节数与文件名.",
    Type.Object({
      taskId: Type.String({ description: "exportFriendCircle 返回的 task_id" }),
      name: Type.Optional(Type.String({ description: "产物名, 默认 朋友圈.zip" })),
    }),
    async (taskId: string, name?: string) => {
      const r = await getFriendCircleApi().batchDownloadFile(taskId, name ?? "");
      // 文件内容不进 agent 上下文 — 只回报元信息
      return {
        Code: r.Code,
        CodeValue: r.CodeValue,
        fileName: r.fileName,
        contentType: r.contentType,
        sizeBytes: r.bytes?.byteLength ?? 0,
      };
    },
  ],
  /**
   * /FriendCircle/AutoForward — 配置朋友圈自动跟发.
   * ⚠️ 这是**自动发布**开关 (把 sourceWxid 的新动态同步发到自己朋友圈):
   *   - enabled=true 时厂商要求 content_owner_authorized=true (已获源内容所有者授权), 属调用方合规声明;
   *   - 与其它发布接口一致, 服务端还会校验 friendCirclePublishEnabled 账号开关 (默认关闭);
   *   - 首次启用请先确认账号白名单与开关。
   */
  setFriendCircleAutoForward: [
    "配置朋友圈自动跟发 (把 sourceWxid 的新公开动态自动同步发到自己朋友圈). enabled=true 时必须同时传 contentOwnerAuthorized=true 确认已获源内容所有者授权; 且账号级 friendCirclePublishEnabled 开关须已打开.",
    Type.Object({
      enabled: Type.Boolean({ description: "是否开启自动跟发" }),
      sourceWxid: Type.Optional(Type.String({ description: "被跟发的个人 wxid (开启时必填)" })),
      delaySeconds: Type.Optional(Type.Number({ description: "发现新动态后延迟发布秒数, 0-300" })),
      locationMode: Type.Optional(Type.Number({ description: "0=保留原位置, 1=移除位置" })),
      blackList: Type.Optional(Type.Array(Type.String(), { description: "不允许查看跟发动态的 wxid 列表" })),
      contentOwnerAuthorized: Type.Optional(Type.Boolean({ description: "确认已获源内容所有者同步发布授权, 开启时必须为 true" })),
    }),
    (enabled: boolean, sourceWxid?: string, delaySeconds?: number, locationMode?: number, blackList?: string[], contentOwnerAuthorized?: boolean) =>
      getFriendCircleApi().autoForward(enabled, {
        sourceWxid,
        delaySeconds,
        locationMode: locationMode === 0 ? 0 : locationMode === 1 ? 1 : undefined,
        blackList,
        contentOwnerAuthorized,
      }),
  ],
  /** /FriendCircle/AutoForwardStatus — 查自动跟发策略与最近状态 */
  getFriendCircleAutoForwardStatus: [
    "查询朋友圈自动跟发策略 (开关/来源账号) 与最近同步状态、已处理动态统计.",
    Type.Object({}),
    () => getFriendCircleApi().autoForwardStatus(),
  ],
};