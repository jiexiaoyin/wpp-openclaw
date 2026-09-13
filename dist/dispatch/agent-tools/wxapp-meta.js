// src/dispatch/agent-tools/wxapp-meta.ts - Wxapp tag
// v1.3.18 P1-核心1 fix (2026-08-10): 改成 lazy-evaluate ctx 模式
// v1.6.5 (2026-09-13): jsOperateWxData/cloudCallFunction 的 data (**及 opt**) 曾经被 meta 丢掉 (恒发 {}) ⇒ 助手侧
//   这两条通道 100% 打不通. 已改为原样透传; 契约上的 data 是 **JSON 字符串**, 字符串原样发, 对象由 send 层序列化.
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
    /** /Wxapp/JSLogin */
    jsLoginWxApp: [
        "授权小程序, 返回授权后的 code. (定制版是另一个工具 jsLoginCustomized)",
        Type.Object({ appId: Type.String() }),
        (appId) => getWxappApi().jsLogin(appId),
    ],
    /** /Wxapp/JSGetSessionid */
    jsGetSessionid: [
        "获取小程序 sessionid.",
        Type.Object({ appId: Type.String(), url: Type.String() }),
        (appId, url) => getWxappApi().jsGetSessionid(appId, url),
    ],
    /** /Wxapp/JSOperateWxData — 小程序 JSAPI 通用通道 (v1.6.5: data/opt 必须真透传, 否则恒 -10001) */
    jsOperateWxData: [
        "小程序 JSAPI 通用通道. data 传 JSAPI 请求 JSON 字符串, 形如 " +
            '{"api_name":"webapi_getwxaasyncsecinfo","data":{},"opt":1}; opt: 1=写入 2=读取. ' +
            "实测: 空 data ⇒ -10001 invalid request, 非法 api_name ⇒ -12003 invalid api_name (成败只看 api_name).",
        Type.Object({
            appId: Type.String(),
            data: Type.String({
                description: 'JSAPI 请求 JSON 字符串, 形如 {"api_name":"webapi_getwxaasyncsecinfo","data":{},"opt":1}',
            }),
            opt: Type.Optional(Type.Number({ description: "操作类型: 1=写入 2=读取 (可选)" })),
        }),
        // v1.6.5 (2026-09-13): 旧码 (appId, _data) ⇒ 恒发 {} 且从不发 opt, 助手侧这条通道 100% 打不通. 现原样透传.
        (appId, data, opt) => getWxappApi().jsOperateWxData(appId, data, opt),
    ],
    /** /Wxapp/CloudCallFunction */
    cloudCallFunction: [
        "小程序云函数调用 (云开发). data = 云函数请求 JSON 字符串 (函数名与参数都在里面); 厂商契约只有 {appid, data}.",
        Type.Object({
            appId: Type.String(),
            data: Type.String({ description: "云函数请求 JSON 字符串 (含函数名/参数)" }),
        }),
        // v1.6.5: 旧码 (appId, functionName, _data) ⇒ 丢掉 data 且发了个契约里没有的顶层 functionName. 现原样透传 data.
        (appId, data) => getWxappApi().cloudCallFunction(appId, data),
    ],
    /** /Wxapp/GetUserOpenId */
    getWxAppUserOpenId: [
        "查询小程序用户的 openId. toWxId=目标用户 wxid/username.",
        Type.Object({ toWxId: Type.String({ description: "目标用户 wxid" }), appid: Type.String() }),
        (toWxId, appid) => getWxappApi().getUserOpenId(toWxId, appid),
    ],
    /** /Wxapp/Verifyplugin */
    verifyPlugin: [
        "小程序获取 HostSign.",
        Type.Object({ appId: Type.String(), url: Type.String() }),
        (appId, url) => getWxappApi().verifyPlugin(appId, url),
    ],
    /** /Wxapp/GetUnionPay */
    getWxAppUnionPay: [
        "云闪付支付. 参数来自小程序支付下单结果.",
        Type.Object({
            appid: Type.String(),
            sessionid: Type.String(),
            timeStamp: Type.String(),
            nonceStr: Type.String(),
            package: Type.String(),
            paySign: Type.String(),
        }),
        (appid, sessionid, timeStamp, nonceStr, pkgs, paySign) => getWxappApi().getUnionPay({ appid, sessionid, timeStamp, nonceStr, package: pkgs, paySign }),
    ],
    /** /Wxapp/Wxapp/GetpullPay */
    getWxAppPullPay: [
        "确认小程序支付. 参数来自小程序支付下单结果.",
        Type.Object({
            appid: Type.String(),
            sessionid: Type.String(),
            timeStamp: Type.String(),
            nonceStr: Type.String(),
            package: Type.String(),
            paySign: Type.String(),
        }),
        (appid, sessionid, timeStamp, nonceStr, pkgs, paySign) => getWxappApi().getPullPay({ appid, sessionid, timeStamp, nonceStr, package: pkgs, paySign }),
    ],
    /** /Wxapp/DeleteOauthApp — 移除小程序授权 (v1.3.67 新 API) */
    deleteOauthApp: [
        "移除小程序授权. appid=小程序 appid.",
        Type.Object({ appid: Type.String() }),
        (appid) => getWxappApi().deleteOauthApp(appid),
    ],
    /** /Wxapp/GetOauthList — 小程序授权列表 (v1.3.67 新 API) */
    getOauthList: [
        "获取小程序授权管理列表.",
        Type.Object({}),
        () => getWxappApi().getOauthList(),
    ],
    /** /Wxapp/JSLoginCustomized — 小程序定制登录 (v1.3.67 新 API) */
    jsLoginCustomized: [
        "小程序定制登录. appid=小程序 appid.",
        Type.Object({ appid: Type.String() }),
        (appid) => getWxappApi().jsLoginCustomized(appid),
    ],
};
//# sourceMappingURL=wxapp-meta.js.map