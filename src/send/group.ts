// src/send/group.ts - Group tag (23 endpoints)

import { postWppJson, getWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppGroup(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /Group/AddChatRoomMember — 增加群成员(40人以内) */
    addMember: (chatroomId: string, wxidList: string[]) =>
      dispatch("/Group/AddChatRoomMember", { chatroomId, wxidList: wxidList.join(",") }),

    /** /Group/ConsentToJoin — 同意进入群聊 */
    consentToJoin: (chatroomId: string, url: string) =>
      dispatch("/Group/ConsentToJoin", { chatroomId, url }),

    /** /Group/CreateChatRoom — 创建群聊 */
    create: (wxidList: string[], topic?: string) =>
      dispatch("/Group/CreateChatRoom", { wxidList: wxidList.join(","), topic: topic ?? "" }),

    /** /Group/DelChatRoomMember — 删除群成员 */
    delMember: (chatroomId: string, wxidList: string[]) =>
      dispatch("/Group/DelChatRoomMember", { chatroomId, wxidList: wxidList.join(",") }),

    /** /Group/FacingCreateChatRoom — 创建面对面群 */
    facingCreate: (topic: string) =>
      dispatch("/Group/FacingCreateChatRoom", { topic }),

    /** /Group/GetChatRoomInfo — 群详情(无公告) */
    getInfo: (chatroomId: string) =>
      dispatch("/Group/GetChatRoomInfo", { chatroomId }),

    /** /Group/GetChatRoomInfoDetail — 群详情(带公告) */
    getInfoDetail: (chatroomId: string) =>
      dispatch("/Group/GetChatRoomInfoDetail", { chatroomId }),

    /** /Group/GetChatRoomMemberDetail — 群成员详情 */
    getMemberDetail: (chatroomId: string, wxid: string) =>
      dispatch("/Group/GetChatRoomMemberDetail", { chatroomId, wxid }),

    /** /Group/GetQRCode — 获取群二维码 */
    getQRCode: (chatroomId: string) =>
      dispatch("/Group/GetQRCode", { chatroomId }),

    /** /Group/GroupList — 群列表(GET 兼容路由) */
    groupList: () => getWppJson(ctx.baseUrl, "/Group/GroupList", opts),

    /** /Group/InviteChatRoomMember — 邀请群成员(40人以上) */
    inviteMember: (chatroomId: string, wxidList: string[]) =>
      dispatch("/Group/InviteChatRoomMember", {
        chatroomId,
        wxidList: wxidList.join(","),
      }),

    /** /Group/List — 群列表(GET 业务路由) */
    list: () => getWppJson(ctx.baseUrl, "/Group/List", opts),

    /** /Group/MoveContractList — 保存到通讯录 */
    moveContractList: (chatroomId: string) =>
      dispatch("/Group/MoveContractList", { chatroomId }),

    /** /Group/OperateChatRoomAdmin — 群管理(增删转让) */
    operateAdmin: (
      chatroomId: string,
      wxid: string,
      operation: "add" | "del" | "transfer",
    ) =>
      dispatch("/Group/OperateChatRoomAdmin", { chatroomId, wxid, operation }),

    /** /Group/Quit — 退出群聊 */
    quit: (chatroomId: string) => dispatch("/Group/Quit", { chatroomId }),

    /** /Group/ScanIntoGroup — 扫码进群 */
    scanIntoGroup: (url: string) => dispatch("/Group/ScanIntoGroup", { url }),

    /** /Group/ScanIntoGroupEnterprise — 扫码进群(企业) */
    scanIntoGroupEnterprise: (url: string) =>
      dispatch("/Group/ScanIntoGroupEnterprise", { url }),

    /** /Group/SendPat — 群拍一拍 */
    sendPat: (chatroomId: string, wxid: string) =>
      dispatch("/Group/SendPat", { chatroomId, wxid }),

    /** /Group/SendTransferGroupOwner — 转让群 */
    transferOwner: (chatroomId: string, newOwnerWxid: string) =>
      dispatch("/Group/SendTransferGroupOwner", { chatroomId, newOwnerWxid }),

    /** /Group/SetChatRoomAnnouncement — 设置群公告 */
    setAnnouncement: (chatroomId: string, content: string) =>
      dispatch("/Group/SetChatRoomAnnouncement", { chatroomId, content }),

    /** /Group/SetChatRoomName — 设置群名称 */
    setName: (chatroomId: string, name: string) =>
      dispatch("/Group/SetChatRoomName", { chatroomId, name }),

    /** /Group/SetChatRoomRemarks — 设置群备注 */
    setRemarks: (chatroomId: string, remark: string) =>
      dispatch("/Group/SetChatRoomRemarks", { chatroomId, remark }),

    /** /Group/SetChatroomAccessVerify — 群聊邀请开关 */
    setAccessVerify: (chatroomId: string, enabled: boolean) =>
      dispatch("/Group/SetChatroomAccessVerify", { chatroomId, enabled }),
  };
}

export type WppGroupApi = ReturnType<typeof makeWppGroup>;
