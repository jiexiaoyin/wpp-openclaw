import { Type } from "typebox";
import { makeWppFriend } from "../../send/friend.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";
function getFriendApi() {
    const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
    if (!state)
        throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
    return makeWppFriend({
        baseUrl: state.config.apiBaseUrl,
        tokenKey: state.config.tokenKey,
        authcode: state.authcode,
        accountId: getCurrentAccountId() ?? "default",
    });
}
export const FRIEND_META = {
    getContactList: [
        "获取通讯录好友列表 (一次性全量).",
        Type.Object({}),
        () => getFriendApi().getContractList(),
    ],
    getContactDetail: [
        "获取指定 wxid 的好友详情.",
        Type.Object({ wxid: Type.String() }),
        (wxid) => getFriendApi().getContractDetail(wxid),
    ],
    getFriendState: [
        "查询好友状态 (在线/性别/地区).",
        Type.Object({ wxid: Type.String() }),
        (wxid) => getFriendApi().getFriendState(wxid),
    ],
    searchContact: [
        "按关键字搜索联系人.",
        Type.Object({ keyword: Type.String() }),
        (keyword) => getFriendApi().search(keyword),
    ],
    sendFriendRequest: [
        "添加联系人 (发好友请求). content 留空也允许.",
        Type.Object({
            v1: Type.String(),
            v2: Type.String(),
            content: Type.Optional(Type.String()),
        }),
        (v1, v2) => getFriendApi().sendRequest(v1, v2),
    ],
    passFriendVerify: [
        "通过好友请求 (v1/v2 来自 inbound 事件 payload).",
        Type.Object({ v1: Type.String(), v2: Type.String() }),
        (v1, v2) => getFriendApi().passVerify(v1, v2),
    ],
    setFriendRemarks: [
        "设置好友备注.",
        Type.Object({ wxid: Type.String(), remark: Type.String() }),
        (wxid, remark) => getFriendApi().setRemarks(wxid, remark),
    ],
    toggleBlacklist: [
        "加入/移除黑名单. operation: add|remove.",
        Type.Object({
            wxid: Type.String(),
            operation: Type.Union([Type.Literal("add"), Type.Literal("remove")]),
        }),
        (wxid, _operation) => getFriendApi().blacklist(wxid, 1),
    ],
    deleteFriend: [
        "删除好友.",
        Type.Object({ wxid: Type.String() }),
        (wxid) => getFriendApi().delete(wxid),
    ],
    lbsFind: [
        "附近的人.",
        Type.Object({
            latitude: Type.Number(),
            longitude: Type.Number(),
            radius: Type.Optional(Type.Number({ description: "米" })),
        }),
        (latitude, longitude, _radius) => getFriendApi().lbsFind(latitude, longitude),
    ],
};
