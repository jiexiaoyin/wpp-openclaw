import { Type } from "typebox";
import { makeWppLogin } from "../../send/login.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";
function getLoginApi() {
    const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
    if (!state)
        throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
    return makeWppLogin({
        baseUrl: state.config.apiBaseUrl,
        tokenKey: state.config.tokenKey,
        authcode: state.authcode,
        accountId: getCurrentAccountId() ?? "default",
    });
}
export const LOGIN_META = {
    scanGetQR: [
        "获取登录二维码 (iPad). 触发后用另一个手机扫码, 走 WPP webhook 回调通知登录态.",
        Type.Object({ deviceType: Type.Optional(Type.String()) }),
        (deviceType) => getLoginApi().loginGetQR(deviceType),
    ],
    scanCheckQR: [
        "检测二维码状态. uuid 从扫到的回调里取. status: 0=已扫码, 1=未扫码, 2=过期.",
        Type.Object({ uuid: Type.String() }),
        (uuid) => getLoginApi().loginCheckQR(uuid),
    ],
    startAutoHeartBeat: [
        "开启自动心跳, 防止 vendor 端超时断连.",
        Type.Object({}),
        () => getLoginApi().loginAutoHeartBeat({}),
    ],
    sendHeartBeat: [
        "单次心跳 (手动). 一般不直接调, 自动心跳已包含.",
        Type.Object({}),
        () => getLoginApi().loginHeartBeat(),
    ],
    sendHeartBeatLong: [
        "长连接心跳包.",
        Type.Object({}),
        () => getLoginApi().loginHeartBeatLong(),
    ],
    getHeartBeatLogs: [
        "获取心跳日志 (GET).",
        Type.Object({}),
        () => getLoginApi().loginHeartBeatLogs(),
    ],
    getLoginCacheInfo: [
        "获取本地登录缓存 (wxid / token 缓存命中).",
        Type.Object({}),
        () => getLoginApi().loginGetCacheInfo(),
    ],
    getLongLinkStatus: [
        "查询 WS 长连接状态.",
        Type.Object({}),
        () => getLoginApi().loginLongLinkStatus(),
    ],
    logout: [
        "退出登录. 关闭 WS 长连接并清理 session.",
        Type.Object({}),
        () => getLoginApi().loginLogOut(),
    ],
    loginNewinit: [
        "执行 login 后 Newinit, 拉取通讯同步种子.",
        Type.Object({
            userInfo: Type.String({ description: "JSON.stringify login response" }),
        }),
        (userInfo) => getLoginApi().loginNewinit({ userInfo }),
    ],
};
