import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppLabel(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        add: (labelName) => dispatch("/Label/Add", { LabelName: labelName }),
        delete: (labelId) => dispatch("/Label/Delete", { labelId }),
        getList: () => dispatch("/Label/GetList", {}),
        updateList: (labelId, wxidList) => dispatch("/Label/UpdateList", { LabelID: labelId, ToWxids: wxidList.join(",") }),
        updateName: (labelId, labelName) => dispatch("/Label/UpdateName", { labelId, labelName }),
    };
}
