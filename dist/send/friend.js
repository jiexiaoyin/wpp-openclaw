// src/send/friend.ts - Friend tag (12 endpoints)
// v1.1.27 FRIEND-FIELD-FIX (2026-08-08 P1-2): 批量改字段名对齐 swagger
//   之前: wxid/remark/operation 全部静默失效 → vendor Go 匹配不到
//   fix: toWxid/remarks/val + opcode/v1/v2/userName
import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppFriend(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        /** /Friend/Blacklist — 黑名单 (toWxid + val 1/2) */
        blacklist: (wxid, val) => dispatch("/Friend/Blacklist", { toWxid: wxid, val }),
        /** /Friend/Delete — 删除好友 (DefaultParamDoc 空 body, 通过 authcode 路由) */
        delete: (wxid) => dispatch("/Friend/Delete", { toWxid: wxid }),
        /** /Friend/GetContractDetail — 通讯录好友详情 (userName) */
        getContractDetail: (wxid) => dispatch("/Friend/GetContractDetail", { userName: wxid }),
        /** /Friend/GetContractList — 通讯录好友列表 */
        getContractList: () => dispatch("/Friend/GetContractList", {}),
        /** /Friend/GetFriendstate — 好友状态 (FriendRelationParamDoc: opCode + toWxid) */
        getFriendState: (wxid, opCode = 1) => dispatch("/Friend/GetFriendstate", { toWxid: wxid, opCode }),
        /** /Friend/GetMFriend — 手机通讯录 */
        getMFriend: (phoneList) => dispatch("/Friend/GetMFriend", { phoneList: phoneList.join(",") }),
        /** /Friend/LbsFind — 附近人 (v1.2.1 swagger-alignment: LbsFindParamDoc {latitude, longitude, opCode}) */
        lbsFind: (latitude, longitude, opCode) => dispatch("/Friend/LbsFind", { latitude, longitude, opCode: opCode ?? 1 }),
        /** /Friend/PassVerify — 通过好友请求 (opcode + scene + v1 + v2) */
        passVerify: (v1, v2, opcode = 1, scene = 1) => dispatch("/Friend/PassVerify", { opcode, scene, v1, v2 }),
        /** /Friend/Search — 搜索联系人 (keyword + fromScene + searchScene) */
        search: (keyword, fromScene = 1, searchScene = 1) => dispatch("/Friend/Search", { keyword, fromScene, searchScene }),
        /** /Friend/SendRequest — 添加联系人 (v1 + v2) */
        sendRequest: (v1, v2) => dispatch("/Friend/SendRequest", { v1, v2 }),
        /** /Friend/SetRemarks — 设置好友备注 (remarks + toWxid) */
        setRemarks: (wxid, remarks) => dispatch("/Friend/SetRemarks", { toWxid: wxid, remarks }),
        /** /Friend/Upload — 上传通讯录 (v1.2.1 swagger-alignment: UploadParamDoc {currentPhoneNo, opcode, phoneNo}) */
        upload: (phoneNo, opcode = "2", currentPhoneNo = "") => dispatch("/Friend/Upload", { phoneNo, opcode, currentPhoneNo }),
        /** /Friend/GetGHList — 通讯录完整拉取 (v1.3.67 新 API; 分页+批量补齐名称/备注/头像) */
        getGHList: () => dispatch("/Friend/GetGHList", {}),
    };
}
//# sourceMappingURL=friend.js.map