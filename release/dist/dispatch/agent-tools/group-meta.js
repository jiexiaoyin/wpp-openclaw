import { Type } from "typebox";
import { makeWppGroup } from "../../send/group.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";
function getGroupApi() {
    const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
    if (!state)
        throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
    return makeWppGroup({
        baseUrl: state.config.apiBaseUrl,
        tokenKey: state.config.tokenKey,
        authcode: state.authcode,
        accountId: getCurrentAccountId() ?? "default",
    });
}
export const GROUP_META = {
    getChatroomInfo: [
        "获取群详情 (不含公告).",
        Type.Object({ QID: Type.String() }),
        (qid) => getGroupApi().getInfo(qid),
    ],
    getChatroomInfoDetail: [
        "获取群详情 (含公告).",
        Type.Object({ QID: Type.String() }),
        (qid) => getGroupApi().getInfoDetail(qid),
    ],
    getChatroomMemberDetail: [
        "获取群单个成员详情.",
        Type.Object({ QID: Type.String(), ToUserName: Type.String() }),
        (qid, _toUserName) => getGroupApi().getMemberDetail(qid),
    ],
    addChatRoomMember: [
        "邀请群成员 (40 人以内). wxidList 用逗号分隔 vendor 私聊 wxid.",
        Type.Object({
            ChatRoomName: Type.String({ description: "群 ID (xxx@chatroom)" }),
            ToWxids: Type.String({ description: "wxid 数组 join(',')" }),
        }),
        (chatRoomName, toWxids) => getGroupApi().addMember(chatRoomName, [toWxids]),
    ],
    inviteChatRoomMember: [
        "邀请群成员 (40 人以上, 走邀请链).",
        Type.Object({
            ChatRoomName: Type.String(),
            ToWxids: Type.String({ description: "wxid 数组 join(',')" }),
        }),
        (chatRoomName, toWxids) => getGroupApi().inviteMember(chatRoomName, [toWxids]),
    ],
    delChatRoomMember: [
        "删除群成员.",
        Type.Object({
            ChatRoomName: Type.String(),
            ToWxids: Type.String(),
        }),
        (chatRoomName, toWxids) => getGroupApi().delMember(chatRoomName, [toWxids]),
    ],
    createChatRoom: [
        "创建群聊. wxidList 用逗号分隔.",
        Type.Object({
            ToWxids: Type.String(),
        }),
        (toWxids) => getGroupApi().create([toWxids]),
    ],
    quitChatRoom: [
        "退出群聊.",
        Type.Object({ QID: Type.String() }),
        (qid) => getGroupApi().quit(qid),
    ],
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
        (qid, toWxids, val) => getGroupApi().operateAdmin(qid, toWxids, val),
    ],
    transferChatRoomOwner: [
        "转让群主 (新OwnerUserName).",
        Type.Object({ QID: Type.String(), NewOwnerUserName: Type.String() }),
        (qid, newOwnerUserName) => getGroupApi().transferOwner(qid, newOwnerUserName),
    ],
    operateChatRoomInfo: [
        "修改群信息 (QID + Content). 实际调 SetChatRoomName.",
        Type.Object({ QID: Type.String(), Content: Type.String() }),
        (qid, content) => getGroupApi().operateInfo(qid, content, "name"),
    ],
    setChatRoomAnnouncement: [
        "设置群公告 (QID + Content).",
        Type.Object({ QID: Type.String(), Content: Type.String() }),
        (qid, content) => getGroupApi().operateInfo(qid, content, "announcement"),
    ],
    setChatRoomName: [
        "设置群名称 (QID + Content).",
        Type.Object({ QID: Type.String(), Content: Type.String() }),
        (qid, content) => getGroupApi().operateInfo(qid, content, "name"),
    ],
    setChatRoomRemarks: [
        "设置群备注 (QID + Content).",
        Type.Object({ QID: Type.String(), Content: Type.String() }),
        (qid, content) => getGroupApi().operateInfo(qid, content, "remarks"),
    ],
    sendChatRoomPat: [
        "群拍一拍.",
        Type.Object({ QID: Type.String(), ToUserName: Type.String(), Scene: Type.Optional(Type.Number()) }),
        (qid, toUserName, _scene) => getGroupApi().sendPat(qid, toUserName),
    ],
    getChatRoomQRCode: [
        "获取群二维码.",
        Type.Object({ QID: Type.String() }),
        (qid) => getGroupApi().getQRCode(qid),
    ],
    getGroupList: [
        "获取群列表 (GET 业务路由).",
        Type.Object({}),
        () => getGroupApi().list(),
    ],
    scanIntoGroup: [
        "扫码进群 (url 是 group qr url).",
        Type.Object({ Url: Type.String() }),
        (url) => getGroupApi().scanIntoGroup(url),
    ],
    facingCreateChatRoom: [
        "创建面对面群 (基于经纬度). latitude/longitude 是数字坐标.",
        Type.Object({
            latitude: Type.Number({ description: "纬度" }),
            longitude: Type.Number({ description: "经度" }),
            password: Type.Optional(Type.String({ description: "进群密码 (可选)" })),
        }),
        (latitude, longitude, password) => getGroupApi().facingCreate(String(latitude), String(longitude), 1, password ?? ""),
    ],
    getGroupListCompat: [
        "获取群列表 (GET 兼容路由).",
        Type.Object({}),
        () => getGroupApi().groupList(),
    ],
    scanIntoGroupEnterprise: [
        "扫码进群 (企业). url 是群二维码.",
        Type.Object({ Url: Type.String() }),
        (url) => getGroupApi().scanIntoGroupEnterprise(url),
    ],
    consentToJoinGroup: [
        "同意进入群聊邀请.",
        Type.Object({ Url: Type.String({ description: "邀请 url" }) }),
        (url) => getGroupApi().consentToJoin("", url),
    ],
    moveContractList: [
        "群保存到通讯录. Val 1=保存 0=取消.",
        Type.Object({ QID: Type.String(), Val: Type.Optional(Type.Number()) }),
        (qid, val) => getGroupApi().moveContractList(qid, val ?? 1),
    ],
    setChatroomAccessVerify: [
        "群聊邀请开关 (true=需要验证, false=直接进).",
        Type.Object({ QID: Type.String(), Enable: Type.Boolean() }),
        (qid, enable) => getGroupApi().setAccessVerify(qid, enable),
    ],
};
