// src/send/friend.ts - Friend tag (12 endpoints)

import { postWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppFriend(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /Friend/Blacklist — 黑名单 */
    blacklist: (wxid: string, operation: "add" | "remove") =>
      dispatch("/Friend/Blacklist", { wxid, operation }),

    /** /Friend/Delete — 删除好友 */
    delete: (wxid: string) => dispatch("/Friend/Delete", { wxid }),

    /** /Friend/GetContractDetail — 通讯录好友详情 */
    getContractDetail: (wxid: string) =>
      dispatch("/Friend/GetContractDetail", { wxid }),

    /** /Friend/GetContractList — 通讯录好友列表 */
    getContractList: () => dispatch("/Friend/GetContractList", {}),

    /** /Friend/GetFriendstate — 好友状态 */
    getFriendState: (wxid: string) =>
      dispatch("/Friend/GetFriendstate", { wxid }),

    /** /Friend/GetMFriend — 手机通讯录 */
    getMFriend: (phoneList: string[]) =>
      dispatch("/Friend/GetMFriend", { phoneList: phoneList.join(",") }),

    /** /Friend/LbsFind — 附近人 */
    lbsFind: (latitude: number, longitude: number, radius?: number) =>
      dispatch("/Friend/LbsFind", { latitude, longitude, radius: radius ?? 1000 }),

    /** /Friend/PassVerify — 通过好友请求 */
    passVerify: (v1: string, v2: string) =>
      dispatch("/Friend/PassVerify", { v1, v2 }),

    /** /Friend/Search — 搜索联系人 */
    search: (keyword: string) => dispatch("/Friend/Search", { keyword }),

    /** /Friend/SendRequest — 添加联系人 */
    sendRequest: (v1: string, v2: string, content?: string) =>
      dispatch("/Friend/SendRequest", { v1, v2, content: content ?? "" }),

    /** /Friend/SetRemarks — 设置好友备注 */
    setRemarks: (wxid: string, remark: string) =>
      dispatch("/Friend/SetRemarks", { wxid, remark }),

    /** /Friend/Upload — 上传通讯录 */
    upload: (phoneList: string[]) =>
      dispatch("/Friend/Upload", { phoneList: phoneList.join(",") }),
  };
}

export type WppFriendApi = ReturnType<typeof makeWppFriend>;
