// src/send/group.ts - Group tag (23 endpoints)
// v1.1.27 GROUP-FIELD-FIX (2026-08-08 P0-C): 批量改字段名对齐 swagger definitions
//   之前: chatroomId/wxidList/wxid/name/remark/enabled/newOwnerWxid 全部用 snake_case 小写
//   vendor Go + swaggo 实际字段名: ChatRoomName/ToWxids/QID/Val/Content/Url/Enable/NewOwnerUserName 等
//   fix: 按 swagger 字段名 1:1 对齐, 不依赖大小写不敏感 (语义准确, 防误改 vendor 兼容层)

import { postWppJson, getWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppGroup(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /Group/AddChatRoomMember — 增加群成员 (ChatRoomName + ToWxids 逗号分隔) */
    addMember: (chatroomId: string, wxidList: string[]) =>
      dispatch("/Group/AddChatRoomMember", {
        ChatRoomName: chatroomId,
        ToWxids: wxidList.join(","),
      }),

    /** /Group/ConsentToJoin — 同意进入群聊 (Url 单独字段, 不需要 QID) */
    consentToJoin: (_chatroomId: string, url: string) =>
      dispatch("/Group/ConsentToJoin", { Url: url }),

    /** /Group/CreateChatRoom — 创建群聊 (仅 ToWxids 逗号分隔) */
    create: (wxidList: string[]) =>
      dispatch("/Group/CreateChatRoom", { ToWxids: wxidList.join(",") }),

    /** /Group/DelChatRoomMember — 删除群成员 (ChatRoomName + ToWxids) */
    delMember: (chatroomId: string, wxidList: string[]) =>
      dispatch("/Group/DelChatRoomMember", {
        ChatRoomName: chatroomId,
        ToWxids: wxidList.join(","),
      }),

    /** /Group/FacingCreateChatRoom — 创建面对面群 (Latitude/Longitude/OpCode/Password) */
    facingCreate: (latitude: string, longitude: string, opCode = 1, password = "") =>
      dispatch("/Group/FacingCreateChatRoom", { Latitude: latitude, Longitude: longitude, OpCode: opCode, Password: password }),

    /** /Group/GetChatRoomInfo — 群详情(无公告) (QID) */
    getInfo: (chatroomId: string) =>
      dispatch("/Group/GetChatRoomInfo", { QID: chatroomId }),

    /** /Group/GetChatRoomInfoDetail — 群详情(带公告) (QID) */
    getInfoDetail: (chatroomId: string) =>
      dispatch("/Group/GetChatRoomInfoDetail", { QID: chatroomId }),

    /** /Group/GetChatRoomMemberDetail — 群成员详情 (v1.2.1 swagger-alignment: 只传 QID) */
    getMemberDetail: (chatroomId: string, _wxid?: string) =>
      dispatch("/Group/GetChatRoomMemberDetail", { QID: chatroomId }),

    /** /Group/GetQRCode — 获取群二维码 (QID) */
    getQRCode: (chatroomId: string) =>
      dispatch("/Group/GetQRCode", { QID: chatroomId }),

    /** /Group/GroupList — 群列表(GET 兼容路由) */
    groupList: () => getWppJson(ctx.baseUrl, "/Group/GroupList", opts),

    /** /Group/InviteChatRoomMember — 邀请群成员 (ChatRoomName + ToWxids) */
    inviteMember: (chatroomId: string, wxidList: string[]) =>
      dispatch("/Group/InviteChatRoomMember", {
        ChatRoomName: chatroomId,
        ToWxids: wxidList.join(","),
      }),

    /** /Group/List — 群列表(GET 业务路由) */
    list: () => getWppJson(ctx.baseUrl, "/Group/List", opts),

    /** /Group/MoveContractList — 保存到通讯录 (QID + Val 1/0) */
    moveContractList: (chatroomId: string, val = 1) =>
      dispatch("/Group/MoveContractList", { QID: chatroomId, Val: val }),

    /** /Group/OperateChatRoomAdmin — 群管理(增删转让) (QID + ToWxids + Val 1/2/3) */
    operateAdmin: (
      chatroomId: string,
      wxid: string,
      operation: 1 | 2 | 3,
    ) =>
      dispatch("/Group/OperateChatRoomAdmin", { QID: chatroomId, ToWxids: wxid, Val: operation }),

    /**
     * v1.1.35 GROUP-GHOST-FIX (2026-08-08 23:35 接总立深度审阅 P0-1):
     *   之前调 /Group/OperateChatRoomInfo — vendor swagger 236 paths 无此端点 (ghost) → 5 个群管理工具全挂
     *   vendor 实际有 3 个独立端点: SetChatRoomName / SetChatRoomAnnouncement / SetChatRoomRemarks
     *   三端点参数相同 (QID + Content), 用 actionType 区分
     */
    operateInfo: (chatroomId: string, content: string, actionType: "name" | "announcement" | "remarks" = "name") => {
      const path =
        actionType === "announcement"
          ? "/Group/SetChatRoomAnnouncement"
          : actionType === "remarks"
            ? "/Group/SetChatRoomRemarks"
            : "/Group/SetChatRoomName";
      return dispatch(path, { QID: chatroomId, Content: content });
    },

    /** 设置群名称 (vendor /Group/SetChatRoomName) */
    setChatRoomName: (chatroomId: string, content: string) =>
      dispatch("/Group/SetChatRoomName", { QID: chatroomId, Content: content }),

    /** 设置群公告 (vendor /Group/SetChatRoomAnnouncement) */
    setChatRoomAnnouncement: (chatroomId: string, content: string) =>
      dispatch("/Group/SetChatRoomAnnouncement", { QID: chatroomId, Content: content }),

    /** 设置群备注 (vendor /Group/SetChatRoomRemarks) */
    setChatRoomRemarks: (chatroomId: string, content: string) =>
      dispatch("/Group/SetChatRoomRemarks", { QID: chatroomId, Content: content }),

    /** /Group/Quit — 退出群聊 (QID) */
    quit: (chatroomId: string) => dispatch("/Group/Quit", { QID: chatroomId }),

    /** /Group/ScanIntoGroup — 扫码进群 (Url) */
    scanIntoGroup: (url: string) => dispatch("/Group/ScanIntoGroup", { Url: url }),

    /** /Group/ScanIntoGroupEnterprise — 扫码进群(企业) (Url) */
    scanIntoGroupEnterprise: (url: string) =>
      dispatch("/Group/ScanIntoGroupEnterprise", { Url: url }),

    /** /Group/SendPat — 群拍一拍 (QID + Scene + ToUserName) */
    sendPat: (chatroomId: string, wxid: string, scene = 1) =>
      dispatch("/Group/SendPat", { QID: chatroomId, ToUserName: wxid, Scene: scene }),

    /** /Group/SetChatroomAccessVerify — 群聊邀请开关 (QID + Enable) */
    setAccessVerify: (chatroomId: string, enabled: boolean) =>
      dispatch("/Group/SetChatroomAccessVerify", { QID: chatroomId, Enable: enabled ? 1 : 0 }),

    /** v1.1.35 GROUP-GHOST-FIX: /Group/SendTransferGroupOwner (vendor 实际端点, 之前 TransferGroupOwner 是 ghost) */
    transferOwner: (chatroomId: string, newOwnerWxid: string) =>
      dispatch("/Group/SendTransferGroupOwner", { QID: chatroomId, NewOwnerUserName: newOwnerWxid }),
  };
}

export type WppGroupApi = ReturnType<typeof makeWppGroup>;