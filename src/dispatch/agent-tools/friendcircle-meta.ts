// src/dispatch/agent-tools/friendcircle-meta.ts - FriendCircle tag (11)

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppFriendCircle } from "../../send/friendcircle.js";
import type { WppAccountCtx } from "../../send/factory.js";

const ctx: WppAccountCtx = { baseUrl: "", tokenKey: "", accountId: "" };
const api = makeWppFriendCircle(ctx);

export const FRIEND_CIRCLE_META: ToolMeta = {
  /** /FriendCircle/GetList */
  getFriendCircleList: [
    "获取朋友圈首页 (firstPageMd5 翻页).",
    Type.Object({
      firstPageMd5: Type.Optional(Type.String()),
    }),
    api.getList,
  ],
  /** /FriendCircle/GetDetail */
  getFriendCircleByUser: [
    "获取特定人朋友圈.",
    Type.Object({ wxid: Type.String() }),
    api.getDetail,
  ],
  /** /FriendCircle/GetIdDetail */
  getFriendCircleBySnsId: [
    "获取特定 snsId 详情.",
    Type.Object({ snsId: Type.String() }),
    api.getIdDetail,
  ],
  /** /FriendCircle/Messages */
  publishFriendCircle: [
    "发布朋友圈. mediaList 是图片 URL 数组 (最多 9).",
    Type.Object({
      content: Type.String(),
      mediaList: Type.Optional(Type.Array(Type.String())),
    }),
    api.publish,
  ],
  /** /FriendCircle/Comment */
  commentFriendCircle: [
    "朋友圈点赞/评论. commentType: 1=文字, 2=表情.",
    Type.Object({
      snsId: Type.String(),
      content: Type.String(),
      commentType: Type.Optional(Type.Number()),
    }),
    api.comment,
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
    api.operation,
  ],
  /** /FriendCircle/PrivacySettings */
  setFriendCirclePrivacy: [
    "朋友圈隐私设置. scope 查 vendor 文档.",
    Type.Object({ scope: Type.Number() }),
    api.privacySettings,
  ],
  /** /FriendCircle/GetCommnet */
  getFriendCircleComments: [
    "获取某朋友圈的所有评论.",
    Type.Object({ snsId: Type.String() }),
    api.getComment,
  ],
  /** /FriendCircle/PushCommnet */
  startFriendCircleCommentTask: [
    "启动评论检查后台任务, 转发 callback 形式的评论事件.",
    Type.Object({}),
    api.pushComment,
  ],
};
