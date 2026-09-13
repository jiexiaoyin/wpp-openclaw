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

    /** /Label/UpdateName — 修改标签名
     *  v1.6.0 SWAGGER-323: swagger Label.UpdateNameParamDoc {LabelID*, NewName*(新标签名称)}.
     *  旧码发 `labelName` (≠ NewName, 大小写不敏感也救不了). */
    updateName: (labelId: string, labelName: string) =>
      dispatch("/Label/UpdateName", { LabelID: labelId, NewName: labelName }),

    /** /Label/GetWXFriendListByLabel — 按标签拉好友 (v1.3.67 新 API; labelId 必须 number) */
    getWXFriendListByLabel: (labelId: number | string) =>
      dispatch("/Label/GetWXFriendListByLabel", { labelId: Number(labelId) }),

    /**
     * /Label/UpdateOrder — 更新标签显示顺序 (v1.6.0 SWAGGER-323 新端点).
     * swagger: Label.UpdateOrderParamDoc {LabelIDs*(按显示顺序排列的标签 ID 列表)}.
     * 传入的数组顺序 = 目标显示顺序 (厂商按数组下标落序), 未列出的标签顺序不变。
     */
    updateOrder: (labelIds: Array<number | string>) =>
      dispatch("/Label/UpdateOrder", { LabelIDs: labelIds.map(Number) }),
  };
}

export type WppLabelApi = ReturnType<typeof makeWppLabel>;
