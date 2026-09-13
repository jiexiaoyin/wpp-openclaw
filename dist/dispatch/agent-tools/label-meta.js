// src/dispatch/agent-tools/label-meta.ts - Label tag (标签, 5)
import { Type } from "typebox";
import { makeWppLabel } from "../../send/index.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";
function getLab() {
    const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
    if (!state)
        throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
    return makeWppLabel({
        baseUrl: state.config.apiBaseUrl,
        tokenKey: state.config.tokenKey,
        authcode: state.authcode,
        accountId: getCurrentAccountId() ?? "default",
    });
}
export const LABEL_META = {
    labelAdd: [
        "添加标签 (v1.2.1 swagger-alignment: 只传 LabelName).",
        Type.Object({
            labelName: Type.String(),
        }),
        (labelName) => getLab().add(labelName),
    ],
    labelDelete: ["删除标签.", Type.Object({ labelId: Type.String() }), (labelId) => getLab().delete(labelId)],
    labelGetList: ["获取标签列表.", Type.Object({}), () => getLab().getList()],
    labelUpdateName: [
        "修改标签名.",
        Type.Object({ labelId: Type.String(), labelName: Type.String() }),
        (labelId, labelName) => getLab().updateName(labelId, labelName),
    ],
    labelUpdateList: [
        "更新标签的成员列表.",
        Type.Object({
            labelId: Type.String(),
            wxidList: Type.String({ description: "wxid 数组 join(',')" }),
        }),
        // 原版 api.updateList(labelId, wxidList) — 但 api.updateList 签名是 (labelId, wxidList: string[])
        // 历史不一致, 不优化
        (labelId, wxidList) => getLab().updateList(labelId, [wxidList]),
    ],
    /** /Label/GetWXFriendListByLabel — 按标签拉好友 (v1.3.67 新 API; labelId number) */
    getWXFriendListByLabel: [
        "按标签拉取好友列表 (名称/备注/头像/标签). labelId=标签 ID (数字).",
        Type.Object({ labelId: Type.Number() }),
        (labelId) => getLab().getWXFriendListByLabel(labelId),
    ],
    /** /Label/UpdateOrder — 更新标签显示顺序 (v1.6.0 SWAGGER-323 新 API) */
    updateLabelOrder: [
        "更新通讯录标签的显示顺序. 数组顺序 = 目标显示顺序, 未列出的标签顺序不变. 标签 ID 用 getLabelList 拿.",
        Type.Object({
            labelIds: Type.Array(Type.Number(), { description: "按目标显示顺序排列的标签 ID 列表" }),
        }),
        (labelIds) => getLab().updateOrder(labelIds),
    ],
};
//# sourceMappingURL=label-meta.js.map