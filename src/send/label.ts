// src/send/label.ts - Label tag (5 endpoints: 标签管理)

import { postWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppLabel(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /Label/Add */
    add: (labelName: string, wxidList?: string[]) =>
      dispatch("/Label/Add", {
        labelName,
        wxidList: wxidList ? wxidList.join(",") : "",
      }),

    /** /Label/Delete */
    delete: (labelId: string) => dispatch("/Label/Delete", { labelId }),

    /** /Label/GetList */
    getList: () => dispatch("/Label/GetList", {}),

    /** /Label/UpdateList */
    updateList: (labelId: string, wxidList: string[]) =>
      dispatch("/Label/UpdateList", { labelId, wxidList: wxidList.join(",") }),

    /** /Label/UpdateName */
    updateName: (labelId: string, labelName: string) =>
      dispatch("/Label/UpdateName", { labelId, labelName }),
  };
}

export type WppLabelApi = ReturnType<typeof makeWppLabel>;
