import { Type } from "typebox";
import { makeWppWxapp } from "../../send/wxapp.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";
function getWxappApi() {
    const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
    if (!state)
        throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
    return makeWppWxapp({
        baseUrl: state.config.apiBaseUrl,
        tokenKey: state.config.tokenKey,
        authcode: state.authcode,
        accountId: getCurrentAccountId() ?? "default",
    });
}
export const WXAPP_META = {
    jsLoginWxApp: [
        "授权小程序 (定制).",
        Type.Object({ appId: Type.String() }),
        (appId) => getWxappApi().jsLogin(appId),
    ],
    jsGetSessionid: [
        "获取小程序 sessionid.",
        Type.Object({ appId: Type.String(), url: Type.String() }),
        (appId, url) => getWxappApi().jsGetSessionid(appId, url),
    ],
    jsOperateWxData: [
        "小程序操作 (data 是 JSON.stringify).",
        Type.Object({
            appId: Type.String(),
            data: Type.String({ description: "JSON.stringify 后的 data" }),
        }),
        (appId, _data) => getWxappApi().jsOperateWxData(appId, {}),
    ],
    cloudCallFunction: [
        "小程序云函数调用 (云开发).",
        Type.Object({
            appId: Type.String(),
            functionName: Type.String(),
            data: Type.String({ description: "JSON.stringify" }),
        }),
        (appId, functionName, _data) => getWxappApi().cloudCallFunction(appId, functionName, {}),
    ],
    getWxAppUserOpenId: [
        "查询小程序用户的 openId.",
        Type.Object({ appId: Type.String() }),
        (appId) => getWxappApi().getUserOpenId(appId),
    ],
    verifyPlugin: [
        "小程序获取 HostSign.",
        Type.Object({ appId: Type.String(), url: Type.String() }),
        (appId, url) => getWxappApi().verifyPlugin(appId, url),
    ],
    getWxAppUnionPay: [
        "云闪付支付.",
        Type.Object({ orderId: Type.String() }),
        (orderId) => getWxappApi().getUnionPay(orderId),
    ],
    getWxAppPullPay: [
        "推送小程序支付请求.",
        Type.Object({ appId: Type.String() }),
        (appId) => getWxappApi().getPullPay(appId),
    ],
    deleteOauthApp: [
        "移除小程序授权. appid=小程序 appid.",
        Type.Object({ appid: Type.String() }),
        (appid) => getWxappApi().deleteOauthApp(appid),
    ],
    getOauthList: [
        "获取小程序授权管理列表.",
        Type.Object({}),
        () => getWxappApi().getOauthList(),
    ],
    jsLoginCustomized: [
        "小程序定制登录. appid=小程序 appid.",
        Type.Object({ appid: Type.String() }),
        (appid) => getWxappApi().jsLoginCustomized(appid),
    ],
};
