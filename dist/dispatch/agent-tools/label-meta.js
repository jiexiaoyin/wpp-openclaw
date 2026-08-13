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
        (labelId, wxidList) => getLab().updateList(labelId, [wxidList]),
    ],
};
