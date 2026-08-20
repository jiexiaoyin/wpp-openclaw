import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppFriend(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        blacklist: (wxid, val) => dispatch("/Friend/Blacklist", { toWxid: wxid, val }),
        delete: (wxid) => dispatch("/Friend/Delete", { toWxid: wxid }),
        getContractDetail: (wxid) => dispatch("/Friend/GetContractDetail", { userName: wxid }),
        getContractList: () => dispatch("/Friend/GetContractList", {}),
        getFriendState: (wxid, opCode = 1) => dispatch("/Friend/GetFriendstate", { toWxid: wxid, opCode }),
        getMFriend: (phoneList) => dispatch("/Friend/GetMFriend", { phoneList: phoneList.join(",") }),
        lbsFind: (latitude, longitude, opCode) => dispatch("/Friend/LbsFind", { latitude, longitude, opCode: opCode ?? 1 }),
        passVerify: (v1, v2, opcode = 1, scene = 1) => dispatch("/Friend/PassVerify", { opcode, scene, v1, v2 }),
        search: (keyword, fromScene = 1, searchScene = 1) => dispatch("/Friend/Search", { keyword, fromScene, searchScene }),
        sendRequest: (v1, v2) => dispatch("/Friend/SendRequest", { v1, v2 }),
        setRemarks: (wxid, remarks) => dispatch("/Friend/SetRemarks", { toWxid: wxid, remarks }),
        upload: (phoneNo, opcode = "2", currentPhoneNo = "") => dispatch("/Friend/Upload", { phoneNo, opcode, currentPhoneNo }),
        getGHList: () => dispatch("/Friend/GetGHList", {}),
    };
}
