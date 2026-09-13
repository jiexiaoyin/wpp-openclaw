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
        // ===== v1.6.0 SWAGGER-323: 好友申请自动化 (2) =====
        // 来源: 容器 swagger (v09102) Friend.FriendRequestListParamDoc / FriendAutoAcceptParamDoc.
        // 申请由 msg_type=37 同步消息自动进本地列表, 返回的 v1/v2/scene 可直接喂 PassVerify.
        /**
         * /Friend/GetFriendRequestList — 读好友申请列表.
         * swagger: {status: pending|accepted|all (默认 pending), page (从 1 开始, 默认 1), limit (1-100, 默认 20)}.
         */
        getFriendRequestList: (opt) => dispatch("/Friend/GetFriendRequestList", {
            ...(opt?.status ? { status: opt.status } : {}),
            ...(opt?.page !== undefined ? { page: opt.page } : {}),
            ...(opt?.limit !== undefined ? { limit: opt.limit } : {}),
        }),
        /**
         * /Friend/AutoAccept — 配置自动通过好友申请.
         * swagger: {enabled*, scenes[](留空=所有来源场景, 建议明确白名单), delay_seconds(0-300), process_pending}.
         * ⚠️ 这是**自动把陌生人加成好友**的开关 — 默认关闭且本包装不提供任何默认放行:
         *    调用方必须显式传 enabled=true 才会生效.
         */
        autoAccept: (enabled, opt) => dispatch("/Friend/AutoAccept", {
            enabled,
            ...(opt?.scenes ? { scenes: opt.scenes } : {}),
            ...(opt?.delaySeconds !== undefined ? { delay_seconds: opt.delaySeconds } : {}),
            ...(opt?.processPending !== undefined ? { process_pending: opt.processPending } : {}),
        }),
    };
}
//# sourceMappingURL=friend.js.map