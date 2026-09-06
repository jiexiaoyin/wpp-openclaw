// src/send/label.ts - Label tag (5 endpoints: 标签管理)
import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppLabel(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        /** /Label/Add (v1.2.1 swagger-alignment: AddParamDoc {LabelName}) */
        add: (labelName) => dispatch("/Label/Add", { LabelName: labelName }),
        /** /Label/Delete */
        delete: (labelId) => dispatch("/Label/Delete", { labelId }),
        /** /Label/GetList */
        getList: () => dispatch("/Label/GetList", {}),
        /** /Label/UpdateList (v1.2.1 swagger-alignment: UpdateListParamDoc {LabelID, ToWxids}) */
        updateList: (labelId, wxidList) => dispatch("/Label/UpdateList", { LabelID: labelId, ToWxids: wxidList.join(",") }),
        /** /Label/UpdateName */
        updateName: (labelId, labelName) => dispatch("/Label/UpdateName", { labelId, labelName }),
        /** /Label/GetWXFriendListByLabel — 按标签拉好友 (v1.3.67 新 API; labelId 必须 number) */
        getWXFriendListByLabel: (labelId) => dispatch("/Label/GetWXFriendListByLabel", { labelId: Number(labelId) }),
    };
}
//# sourceMappingURL=label.js.map