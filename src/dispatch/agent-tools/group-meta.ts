// src/dispatch/agent-tools/group-meta.ts - Group tag (23)
// v1.3.18 P1-核心1 fix (2026-08-10): 改成 lazy-evaluate ctx 模式
// 注: 部分工具参数与 api 实际签名差异保留 — 跟原版一样 (历史不一致, 不优化)

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppGroup } from "../../send/group.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";

function getGroupApi() {
  const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
  if (!state) throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
  return makeWppGroup({
    baseUrl: state.config.apiBaseUrl,
    tokenKey: state.config.tokenKey,
    authcode: state.authcode,
    accountId: getCurrentAccountId() ?? "default",
  });
}

export const GROUP_META: ToolMeta = {
  /** /Group/GetChatRoomInfo */
  getChatroomInfo: [
    "获取群详情 (不含公告).",
    Type.Object({ QID: Type.String() }),
    (qid: string) => getGroupApi().getInfo(qid),
  ],
  /** /Group/GetChatRoomInfoDetail */
  getChatroomInfoDetail: [
    "获取群详情 (含公告).",
    Type.Object({ QID: Type.String() }),
    (qid: string) => getGroupApi().getInfoDetail(qid),
  ],
  /** /Group/GetChatRoomMemberDetail */
  getChatroomMemberDetail: [
    "获取群单个成员详情.",
    Type.Object({ QID: Type.String(), ToUserName: Type.String() }),
    (qid: string, _toUserName: string) => getGroupApi().getMemberDetail(qid),
  ],
  /** /Group/AddChatRoomMember */
  addChatRoomMember: [
    "邀请群成员 (40 人以内). wxidList 用逗号分隔 vendor 私聊 wxid.",
    Type.Object({
      ChatRoomName: Type.String({ description: "群 ID (xxx@chatroom)" }),
      ToWxids: Type.String({ description: "wxid 数组 join(',')" }),
    }),
    (chatRoomName: string, toWxids: string) => getGroupApi().addMember(chatRoomName, [toWxids]),
  ],
  /** /Group/InviteChatRoomMember */
  inviteChatRoomMember: [
    "邀请群成员 (40 人以上, 走邀请链).",
    Type.Object({
      ChatRoomName: Type.String(),
      ToWxids: Type.String({ description: "wxid 数组 join(',')" }),
    }),
    (chatRoomName: string, toWxids: string) => getGroupApi().inviteMember(chatRoomName, [toWxids]),
  ],
  /** /Group/DelChatRoomMember */
  delChatRoomMember: [
    "删除群成员.",
    Type.Object({
      ChatRoomName: Type.String(),
      ToWxids: Type.String(),
    }),
    (chatRoomName: string, toWxids: string) => getGroupApi().delMember(chatRoomName, [toWxids]),
  ],
  /** /Group/CreateChatRoom */
  createChatRoom: [
    "创建群聊. wxidList 用逗号分隔.",
    Type.Object({
      ToWxids: Type.String(),
    }),
    (toWxids: string) => getGroupApi().create([toWxids]),
  ],
  /** /Group/Quit */
  quitChatRoom: [
    "退出群聊.",
    Type.Object({ QID: Type.String() }),
    (qid: string) => getGroupApi().quit(qid),
  ],
  /** /Group/OperateChatRoomAdmin */
  operateChatRoomAdmin: [
    "群管理操作. operation: 1=添加管理员 2=删除管理员 3=转让群主.",
    Type.Object({
      QID: Type.String(),
      ToWxids: Type.String({ description: "目标成员 wxid" }),
      Val: Type.Union([
        Type.Literal(1),
        Type.Literal(2),
        Type.Literal(3),
      ]),
    }),
    (qid: string, toWxids: string, val: 1 | 2 | 3) => getGroupApi().operateAdmin(qid, toWxids, val),
  ],
  /** v1.1.35 GROUP-GHOST-FIX: /Group/SendTransferGroupOwner */
  transferChatRoomOwner: [
    "转让群主 (新OwnerUserName).",
    Type.Object({ QID: Type.String(), NewOwnerUserName: Type.String() }),
    (qid: string, newOwnerUserName: string) => getGroupApi().transferOwner(qid, newOwnerUserName),
  ],
  /** v1.1.35 GROUP-GHOST-FIX: /Group/SetChatRoomName (operateChatRoomInfo 拆为 3 独立端点) */
  operateChatRoomInfo: [
    "修改群信息 (QID + Content). 实际调 SetChatRoomName.",
    Type.Object({ QID: Type.String(), Content: Type.String() }),
    (qid: string, content: string) => getGroupApi().operateInfo(qid, content, "name"),
  ],
  /** /Group/SetChatRoomAnnouncement */
  setChatRoomAnnouncement: [
    "设置群公告 (QID + Content).",
    Type.Object({ QID: Type.String(), Content: Type.String() }),
    (qid: string, content: string) => getGroupApi().operateInfo(qid, content, "announcement"),
  ],
  /** /Group/SetChatRoomName */
  setChatRoomName: [
    "设置群名称 (QID + Content).",
    Type.Object({ QID: Type.String(), Content: Type.String() }),
    (qid: string, content: string) => getGroupApi().operateInfo(qid, content, "name"),
  ],
  /** /Group/SetChatRoomRemarks */
  setChatRoomRemarks: [
    "设置群备注 (QID + Content).",
    Type.Object({ QID: Type.String(), Content: Type.String() }),
    (qid: string, content: string) => getGroupApi().operateInfo(qid, content, "remarks"),
  ],
  /** /Group/SendPat */
  sendChatRoomPat: [
    "群拍一拍.",
    Type.Object({ QID: Type.String(), ToUserName: Type.String(), Scene: Type.Optional(Type.Number()) }),
    (qid: string, toUserName: string, _scene?: number) => getGroupApi().sendPat(qid, toUserName),
  ],
  /** /Group/GetQRCode */
  getChatRoomQRCode: [
    "获取群二维码.",
    Type.Object({ QID: Type.String() }),
    (qid: string) => getGroupApi().getQRCode(qid),
  ],
  /** /Group/List */
  getGroupList: [
    "获取群列表 (GET 业务路由).",
    Type.Object({}),
    () => getGroupApi().list(),
  ],
  /** /Group/ScanIntoGroup */
  scanIntoGroup: [
    "扫码进群 (url 是 group qr url).",
    Type.Object({ Url: Type.String() }),
    (url: string) => getGroupApi().scanIntoGroup(url),
  ],
  /**
   * v1.3.20 P1-GROUP: /Group/FacingCreateChatRoom — 创建面对面群 (经纬度定位).
   * latitude/longitude 数字 (对齐 swagger Group.FacingCreateChatRoomParamDoc number).
   */
  facingCreateChatRoom: [
    "创建面对面群 (基于经纬度). latitude/longitude 是数字坐标.",
    Type.Object({
      latitude: Type.Number({ description: "纬度" }),
      longitude: Type.Number({ description: "经度" }),
      password: Type.Optional(Type.String({ description: "进群密码 (可选)" })),
    }),
    (latitude: number, longitude: number, password?: string) =>
      getGroupApi().facingCreate(String(latitude), String(longitude), 1, password ?? ""),
  ],
  /** /Group/GroupList — GET 兼容路由的群列表 */
  getGroupListCompat: [
    "获取群列表 (GET 兼容路由).",
    Type.Object({}),
    () => getGroupApi().groupList(),
  ],
  /** /Group/ScanIntoGroupEnterprise */
  scanIntoGroupEnterprise: [
    "扫码进群 (企业). url 是群二维码.",
    Type.Object({ Url: Type.String() }),
    (url: string) => getGroupApi().scanIntoGroupEnterprise(url),
  ],
  /** /Group/ConsentToJoin */
  consentToJoinGroup: [
    "同意进入群聊邀请.",
    Type.Object({ Url: Type.String({ description: "邀请 url" }) }),
    (url: string) => getGroupApi().consentToJoin("", url),
  ],
  /** /Group/MoveContractList */
  moveContractList: [
    "群保存到通讯录. Val 1=保存 0=取消.",
    Type.Object({ QID: Type.String(), Val: Type.Optional(Type.Number()) }),
    (qid: string, val?: number) => getGroupApi().moveContractList(qid, val ?? 1),
  ],
  /** /Group/SetChatroomAccessVerify */
  setChatroomAccessVerify: [
    "群聊邀请开关 (true=需要验证, false=直接进).",
    Type.Object({ QID: Type.String(), Enable: Type.Boolean() }),
    (qid: string, enable: boolean) => getGroupApi().setAccessVerify(qid, enable),
  ],
};