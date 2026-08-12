// src/send/label.ts - Label tag (5 endpoints: 标签管理)

import { postWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppLabel(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /Label/Add (v1.2.1 swagger-alignment: AddParamDoc {LabelName}) */
    add: (labelName: string) =>
      dispatch("/Label/Add", { LabelName: labelName }),

    /** /Label/Delete */
    delete: (labelId: string) => dispatch("/Label/Delete", { labelId }),

    /** /Label/GetList */
    getList: () => dispatch("/Label/GetList", {}),

    /** /Label/UpdateList (v1.2.1 swagger-alignment: UpdateListParamDoc {LabelID, ToWxids}) */
    updateList: (labelId: string, wxidList: string[]) =>
      dispatch("/Label/UpdateList", { LabelID: labelId, ToWxids: wxidList.join(",") }),

    /** /Label/UpdateName */
    updateName: (labelId: string, labelName: string) =>
      dispatch("/Label/UpdateName", { labelId, labelName }),
  };
}

export type WppLabelApi = ReturnType<typeof makeWppLabel>;
