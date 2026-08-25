import { Type } from "typebox";
import { makeWppCustomized } from "../../send/index.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";
function getCus() {
    const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
    if (!state)
        throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
    return makeWppCustomized({
        baseUrl: state.config.apiBaseUrl,
        tokenKey: state.config.tokenKey,
        authcode: state.authcode,
        accountId: getCurrentAccountId() ?? "default",
    });
}
export const CUSTOMIZED_META = {
    customizedUniftyAuthBatch: [
        "批量开小程序 (定制接口, 仅 vendor 客户).",
        Type.Object({ appIds: Type.String({ description: "appId 数组 join(',')" }) }),
        (appIds) => getCus().wxctdUniftyAuthBatch(appIds),
    ],
};
