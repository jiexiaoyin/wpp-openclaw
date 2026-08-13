import { Type } from "typebox";
import { makeWppSayHello } from "../../send/index.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";
function getSay() {
    const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
    if (!state)
        throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
    return makeWppSayHello({
        baseUrl: state.config.apiBaseUrl,
        tokenKey: state.config.tokenKey,
        authcode: state.authcode,
        accountId: getCurrentAccountId() ?? "default",
    });
}
export const SAY_HELLO_META = {
    sayHelloModelv1: [
        "打招呼模式1 (扫码).",
        Type.Object({ scene: Type.String(), v1: Type.String() }),
        (scene, v1) => getSay().modelv1(scene, v1),
    ],
    sayHelloModelv2: [
        "打招呼模式3 (v3/v4).",
        Type.Object({ v1: Type.String(), v2: Type.String() }),
        (v1, v2) => getSay().modelv2(v1, v2),
    ],
};
