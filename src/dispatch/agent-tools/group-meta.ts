// src/dispatch/agent-tools/group-meta.ts - Group tag (23)

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppGroup } from "../../send/group.js";
import type { WppAccountCtx } from "../../send/factory.js";

const ctx: WppAccountCtx = { baseUrl: "", tokenKey: "", accountId: "" };
const api = makeWppGroup(ctx);

export const GROUP_META: ToolMeta = {
  /** /Group/GetChatRoomInfo */
  getChatroomInfo: [
    "获取群详情 (不含公告).",
    Type.Object({ chatroomId: Type.String() }),
    api.getInfo,
  ],
  /** /Group/GetChatRoomInfoDetail */
  getChatroomInfoDetail: [
    "获取群详情 (含公告).",
    Type.Object({ chatroomId: Type.String() }),
    api.getInfoDetail,
  ],
  /** /Group/GetChatRoomMemberDetail */
  getChatroomMemberDetail: [
    "获取群单个成员详情.",
    Type.Object({ chatroomId: Type.String(), wxid: Type.String() }),
    api.getMemberDetail,
  ],
  /** /Group/AddChatRoomMember */
  addChatRoomMember: [
    "邀请群成员 (40 人以内). wxidList 用逗号分隔 vendor 私聊 wxid.",
    Type.Object({
      chatroomId: Type.String(),
      wxidList: Type.String({ description: "wxid 数组, join(',') 后传" }),
    }),
    api.addMember,
  ],
  /** /Group/InviteChatRoomMember */
  inviteChatRoomMember: [
    "邀请群成员 (40 人以上, 走邀请链).",
    Type.Object({
      chatroomId: Type.String(),
      wxidList: Type.String({ description: "wxid 数组 join(',')" }),
    }),
    api.inviteMember,
  ],
  /** /Group/DelChatRoomMember */
  delChatRoomMember: [
    "删除群成员.",
    Type.Object({
      chatroomId: Type.String(),
      wxidList: Type.String(),
    }),
    api.delMember,
  ],
  /** /Group/CreateChatRoom */
  createChatRoom: [
    "创建群聊. wxidList 用逗号分隔.",
    Type.Object({
      wxidList: Type.String(),
      topic: Type.Optional(Type.String()),
    }),
    api.create,
  ],
  /** /Group/Quit */
  quitChatRoom: [
    "退出群聊.",
    Type.Object({ chatroomId: Type.String() }),
    api.quit,
  ],
  /** /Group/OperateChatRoomAdmin */
  operateChatRoomAdmin: [
    "群管理操作 (添加 / 删除 / 转让群主). operation: add|del|transfer.",
    Type.Object({
      chatroomId: Type.String(),
      wxid: Type.String(),
      operation: Type.Union([
        Type.Literal("add"),
        Type.Literal("del"),
        Type.Literal("transfer"),
      ]),
    }),
    api.operateAdmin,
  ],
  /** /Group/SendTransferGroupOwner */
  transferChatRoomOwner: [
    "转让群.",
    Type.Object({ chatroomId: Type.String(), newOwnerWxid: Type.String() }),
    api.transferOwner,
  ],
  /** /Group/SetChatRoomName */
  setChatRoomName: [
    "设置群名称.",
    Type.Object({ chatroomId: Type.String(), name: Type.String() }),
    api.setName,
  ],
  /** /Group/SetChatRoomAnnouncement */
  setChatRoomAnnouncement: [
    "设置群公告.",
    Type.Object({ chatroomId: Type.String(), content: Type.String() }),
    api.setAnnouncement,
  ],
  /** /Group/SetChatRoomRemarks */
  setChatRoomRemarks: [
    "设置群备注 (仅自己可见).",
    Type.Object({ chatroomId: Type.String(), remark: Type.String() }),
    api.setRemarks,
  ],
  /** /Group/SetChatroomAccessVerify */
  setChatroomAccessVerify: [
    "群聊邀请开关 (true=需要验证, false=直接进).",
    Type.Object({ chatroomId: Type.String(), enabled: Type.Boolean() }),
    api.setAccessVerify,
  ],
  /** /Group/SendPat */
  sendChatRoomPat: [
    "群拍一拍.",
    Type.Object({ chatroomId: Type.String(), wxid: Type.String() }),
    api.sendPat,
  ],
  /** /Group/GetQRCode */
  getChatRoomQRCode: [
    "获取群二维码.",
    Type.Object({ chatroomId: Type.String() }),
    api.getQRCode,
  ],
  /** /Group/List */
  getGroupList: [
    "获取群列表 (GET 业务路由).",
    Type.Object({}),
    api.list,
  ],
  /** /Group/ScanIntoGroup */
  scanIntoGroup: [
    "扫码进群 (url 是 group qr url).",
    Type.Object({ url: Type.String() }),
    api.scanIntoGroup,
  ],
  /** /Group/ConsentToJoin */
  consentToJoinGroup: [
    "同意进入群聊邀请.",
    Type.Object({ chatroomId: Type.String(), url: Type.String() }),
    api.consentToJoin,
  ],
  /** /Group/MoveContractList */
  moveContractList: [
    "群保存到通讯录.",
    Type.Object({ chatroomId: Type.String() }),
    api.moveContractList,
  ],
};
