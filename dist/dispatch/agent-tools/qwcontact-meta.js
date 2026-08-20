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
    qwContactSearch: ["搜索企业微信联系人 (username=企业联系人).", Type.Object({ username: Type.String() }), (username) => getQwc().searchQWContact(username)],
    qwContactApply: [
        "企业微信申请加好友 (username=联系人标识, v1=验证凭据).",
        Type.Object({ username: Type.String(), v1: Type.String(), context: Type.Optional(Type.String()) }),
        (username, v1, context) => getQwc().qwApplyAddContact(username, v1, context ?? ""),
    ],
    qwContactAdd: [
        "企业微信主动加好友 (username=搜索结果联系人, v1=验证凭据).",
        Type.Object({ username: Type.String(), v1: Type.String() }),
        (username, v1) => getQwc().qwAddContact(username, v1),
    ],
};
