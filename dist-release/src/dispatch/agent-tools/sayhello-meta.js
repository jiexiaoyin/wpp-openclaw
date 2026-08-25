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
        "打招呼模式1 (扫二维码加好友). url=联系人二维码中可识别的链接(必填), verifyContent=好友申请说明(可选).",
        Type.Object({
            url: Type.String(),
            verifyContent: Type.Optional(Type.String()),
        }),
        (url, verifyContent) => getSay().modelv1(url, verifyContent ?? ""),
    ],
    sayHelloModelv2: [
        "打招呼模式2 (搜索加好友). toUserName=微信号或手机号(必填), content=好友申请说明(可选), scene=来源场景(默认15).",
        Type.Object({
            toUserName: Type.String(),
            content: Type.Optional(Type.String()),
            scene: Type.Optional(Type.Number()),
        }),
        (toUserName, content, scene) => getSay().modelv2(toUserName, content ?? "", scene ?? 15),
    ],
    sayHelloModelv3: [
        "打招呼模式3 (用搜索结果凭据提交申请). scene=来源场景, v3=联系人凭据, v4=备用凭据, verifyContent=申请说明.",
        Type.Object({
            scene: Type.Number(),
            v3: Type.String(),
            v4: Type.Optional(Type.String()),
            verifyContent: Type.Optional(Type.String()),
        }),
        (scene, v3, v4, verifyContent) => getSay().modelv3(scene, v3, v4 ?? "", verifyContent ?? ""),
    ],
};
