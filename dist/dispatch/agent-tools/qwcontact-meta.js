import { Type } from "typebox";
import { makeWppQWContact } from "../../send/index.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";
function getQwc() {
    const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
    if (!state)
        throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
    return makeWppQWContact({
        baseUrl: state.config.apiBaseUrl,
        tokenKey: state.config.tokenKey,
        authcode: state.authcode,
        accountId: getCurrentAccountId() ?? "default",
    });
}
export const QW_CONTACT_META = {
    qwContactSearch: ["搜索企业微信联系人.", Type.Object({ keyword: Type.String() }), (keyword) => getQwc().searchQWContact(keyword)],
    qwContactApply: [
        "企业微信申请加好友.",
        Type.Object({ v1: Type.String(), v2: Type.String() }),
        (v1, v2) => getQwc().qwApplyAddContact(v1, v2),
    ],
    qwContactAdd: [
        "企业微信主动加好友.",
        Type.Object({ v1: Type.String(), v2: Type.String() }),
        (v1, v2) => getQwc().qwAddContact(v1, v2),
    ],
};
