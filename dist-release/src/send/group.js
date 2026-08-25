import { postWppJson, getWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppGroup(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        addMember: (chatroomId, wxidList) => dispatch("/Group/AddChatRoomMember", {
            ChatRoomName: chatroomId,
            ToWxids: wxidList.join(","),
        }),
        consentToJoin: (_chatroomId, url) => dispatch("/Group/ConsentToJoin", { Url: url }),
        create: (wxidList) => dispatch("/Group/CreateChatRoom", { ToWxids: wxidList.join(",") }),
        delMember: (chatroomId, wxidList) => dispatch("/Group/DelChatRoomMember", {
            ChatRoomName: chatroomId,
            ToWxids: wxidList.join(","),
        }),
        facingCreate: (latitude, longitude, opCode = 1, password = "") => dispatch("/Group/FacingCreateChatRoom", { Latitude: latitude, Longitude: longitude, OpCode: opCode, Password: password }),
        getInfo: (chatroomId) => dispatch("/Group/GetChatRoomInfo", { QID: chatroomId }),
        getInfoDetail: (chatroomId) => dispatch("/Group/GetChatRoomInfoDetail", { QID: chatroomId }),
        getMemberDetail: (chatroomId, _wxid) => dispatch("/Group/GetChatRoomMemberDetail", { QID: chatroomId }),
        getQRCode: (chatroomId) => dispatch("/Group/GetQRCode", { QID: chatroomId }),
        groupList: () => getWppJson(ctx.baseUrl, "/Group/GroupList", opts),
        inviteMember: (chatroomId, wxidList) => dispatch("/Group/InviteChatRoomMember", {
            ChatRoomName: chatroomId,
            ToWxids: wxidList.join(","),
        }),
        list: () => getWppJson(ctx.baseUrl, "/Group/List", opts),
        moveContractList: (chatroomId, val = 1) => dispatch("/Group/MoveContractList", { QID: chatroomId, Val: val }),
        operateAdmin: (chatroomId, wxid, operation) => dispatch("/Group/OperateChatRoomAdmin", { QID: chatroomId, ToWxids: wxid, Val: operation }),
        operateInfo: (chatroomId, content, actionType = "name") => {
            const path = actionType === "announcement"
                ? "/Group/SetChatRoomAnnouncement"
                : actionType === "remarks"
                    ? "/Group/SetChatRoomRemarks"
                    : "/Group/SetChatRoomName";
            return dispatch(path, { QID: chatroomId, Content: content });
        },
        setChatRoomName: (chatroomId, content) => dispatch("/Group/SetChatRoomName", { QID: chatroomId, Content: content }),
        setChatRoomAnnouncement: (chatroomId, content) => dispatch("/Group/SetChatRoomAnnouncement", { QID: chatroomId, Content: content }),
        setChatRoomRemarks: (chatroomId, content) => dispatch("/Group/SetChatRoomRemarks", { QID: chatroomId, Content: content }),
        quit: (chatroomId) => dispatch("/Group/Quit", { QID: chatroomId }),
        scanIntoGroup: (url) => dispatch("/Group/ScanIntoGroup", { Url: url }),
        scanIntoGroupEnterprise: (url) => dispatch("/Group/ScanIntoGroupEnterprise", { Url: url }),
        sendPat: (chatroomId, wxid, scene = 1) => dispatch("/Group/SendPat", { QID: chatroomId, ToUserName: wxid, Scene: scene }),
        setAccessVerify: (chatroomId, enabled) => dispatch("/Group/SetChatroomAccessVerify", { QID: chatroomId, Enable: enabled ? 1 : 0 }),
        transferOwner: (chatroomId, newOwnerWxid) => dispatch("/Group/SendTransferGroupOwner", { QID: chatroomId, NewOwnerUserName: newOwnerWxid }),
    };
}
