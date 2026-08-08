// src/dispatch/agent-tools/friend-meta.ts - Friend tag (12)

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppFriend } from "../../send/friend.js";
import type { WppAccountCtx } from "../../send/factory.js";

const ctx: WppAccountCtx = { baseUrl: "", tokenKey: "", accountId: "" };
const api = makeWppFriend(ctx);

export const FRIEND_META: ToolMeta = {
  /** /Friend/GetContractList */
  getContactList: [
    "获取通讯录好友列表 (一次性全量).",
    Type.Object({}),
    api.getContractList,
  ],
  /** /Friend/GetContractDetail */
  getContactDetail: [
    "获取指定 wxid 的好友详情.",
    Type.Object({ wxid: Type.String() }),
    api.getContractDetail,
  ],
  /** /Friend/GetFriendstate */
  getFriendState: [
    "查询好友状态 (在线/性别/地区).",
    Type.Object({ wxid: Type.String() }),
    api.getFriendState,
  ],
  /** /Friend/Search */
  searchContact: [
    "按关键字搜索联系人.",
    Type.Object({ keyword: Type.String() }),
    api.search,
  ],
  /** /Friend/SendRequest */
  sendFriendRequest: [
    "添加联系人 (发好友请求). content 留空也允许.",
    Type.Object({
      v1: Type.String(),
      v2: Type.String(),
      content: Type.Optional(Type.String()),
    }),
    api.sendRequest,
  ],
  /** /Friend/PassVerify */
  passFriendVerify: [
    "通过好友请求 (v1/v2 来自 inbound 事件 payload).",
    Type.Object({ v1: Type.String(), v2: Type.String() }),
    api.passVerify,
  ],
  /** /Friend/SetRemarks */
  setFriendRemarks: [
    "设置好友备注.",
    Type.Object({ wxid: Type.String(), remark: Type.String() }),
    api.setRemarks,
  ],
  /** /Friend/Blacklist */
  toggleBlacklist: [
    "加入/移除黑名单. operation: add|remove.",
    Type.Object({
      wxid: Type.String(),
      operation: Type.Union([Type.Literal("add"), Type.Literal("remove")]),
    }),
    api.blacklist,
  ],
  /** /Friend/Delete */
  deleteFriend: [
    "删除好友.",
    Type.Object({ wxid: Type.String() }),
    api.delete,
  ],
  /** /Friend/LbsFind */
  lbsFind: [
    "附近的人.",
    Type.Object({
      latitude: Type.Number(),
      longitude: Type.Number(),
      radius: Type.Optional(Type.Number({ description: "米" })),
    }),
    api.lbsFind,
  ],
};
