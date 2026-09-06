// src/send/login.ts - Login tag (38 endpoints)
import { postWppJson, getWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppLogin(ctx) {
    const opts = ctxToCallOpts(ctx);
    return {
        /** /Login/62data — 62登陆(账号或密码) */
        login62data: async (body) => postWppJson(ctx.baseUrl, "/Login/62data", body, opts),
        /** /Login/62dataQRCodeApply — 申请二维码验证 */
        login62dataQRCodeApply: async (body) => postWppJson(ctx.baseUrl, "/Login/62dataQRCodeApply", body, opts),
        /** /Login/62dataSMSAgain — 重发验证码 */
        login62dataSMSAgain: async (body) => postWppJson(ctx.baseUrl, "/Login/62dataSMSAgain", body, opts),
        /** /Login/62dataSMSApply — 申请 SMS 验证 */
        login62dataSMSApply: async (body) => postWppJson(ctx.baseUrl, "/Login/62dataSMSApply", body, opts),
        /** /Login/62dataSMSVerify — SMS 验证校验 */
        login62dataSMSVerify: async (body) => postWppJson(ctx.baseUrl, "/Login/62dataSMSVerify", body, opts),
        /** /Login/A16Data — A16 登陆(android 8.0.50) */
        loginA16Data: async (body) => postWppJson(ctx.baseUrl, "/Login/A16Data", body, opts),
        /** /Login/A16Data848 — A16 新版云函数 */
        loginA16Data848: async (body) => postWppJson(ctx.baseUrl, "/Login/A16Data848", body, opts),
        /** /Login/AutoHeartBeat — 开启自动心跳 */
        loginAutoHeartBeat: async (body = {}) => postWppJson(ctx.baseUrl, "/Login/AutoHeartBeat", body, opts),
        /** /Login/Awaken — 唤醒登录(扫码) */
        loginAwaken: async (body) => postWppJson(ctx.baseUrl, "/Login/Awaken", body, opts),
        /** /Login/CheckMacQR — 检测 Mac 二维码 */
        loginCheckMacQR: async (uuid) => postWppJson(ctx.baseUrl, "/Login/CheckMacQR", { uuid }, opts),
        /** /Login/CheckQR — 检测二维码 */
        loginCheckQR: async (uuid) => postWppJson(ctx.baseUrl, "/Login/CheckQR", { uuid }, opts),
        /** /Login/ExtDeviceLoginConfirmGet — 新设备扫码登录 */
        loginExtDeviceLoginConfirmGet: async (body) => postWppJson(ctx.baseUrl, "/Login/ExtDeviceLoginConfirmGet", body, opts),
        /** /Login/ExtDeviceLoginConfirmOk — 新设备扫码确认 */
        loginExtDeviceLoginConfirmOk: async (body) => postWppJson(ctx.baseUrl, "/Login/ExtDeviceLoginConfirmOk", body, opts),
        /** /Login/Get62Data — 获取 62 数据 */
        loginGet62Data: async (body) => postWppJson(ctx.baseUrl, "/Login/Get62Data", body, opts),
        /** /Login/GetA16Data — 获取 A16 数据 */
        loginGetA16Data: async (body) => postWppJson(ctx.baseUrl, "/Login/GetA16Data", body, opts),
        /** /Login/GetCacheInfo — 获取登录缓存 */
        loginGetCacheInfo: async () => postWppJson(ctx.baseUrl, "/Login/GetCacheInfo", {}, opts),
        /** /Login/GetLoginQRCode862 — 二维码 (iPad 8.0.62) */
        loginGetLoginQRCode862: async () => postWppJson(ctx.baseUrl, "/Login/GetLoginQRCode862", {}, opts),
        /** /Login/GetQR — 二维码 (iPad) */
        loginGetQR: async (deviceType = "ipad") => postWppJson(ctx.baseUrl, "/Login/GetQR", { deviceType }, opts),
        /** /Login/GetQRMac — 二维码 (Mac) */
        loginGetQRMac: async () => postWppJson(ctx.baseUrl, "/Login/GetQRMac", {}, opts),
        /** /Login/GetQRMac_oversea — 二维码 (Mac, 海外) */
        loginGetQRMacOversea: async () => postWppJson(ctx.baseUrl, "/Login/GetQRMac_oversea", {}, opts),
        /** /Login/GetQRPad — 二维码 (Pad) */
        loginGetQRPad: async () => postWppJson(ctx.baseUrl, "/Login/GetQRPad", {}, opts),
        /** /Login/GetQRPadx — 二维码 (Pad-绕过) */
        loginGetQRPadx: async () => postWppJson(ctx.baseUrl, "/Login/GetQRPadx", {}, opts),
        /** /Login/GetQRWatch — 二维码 (Car) */
        loginGetQRWatch: async () => postWppJson(ctx.baseUrl, "/Login/GetQRWatch", {}, opts),
        /** /Login/GetQRWin — 二维码 (Windows) */
        loginGetQRWin: async () => postWppJson(ctx.baseUrl, "/Login/GetQRWin", {}, opts),
        /** /Login/GetQRWinUnified — 二维码 (WinUnified) */
        loginGetQRWinUnified: async () => postWppJson(ctx.baseUrl, "/Login/GetQRWinUnified", {}, opts),
        /** /Login/GetQRWinUwp — 二维码 (WinUwp-绕过) */
        loginGetQRWinUwp: async () => postWppJson(ctx.baseUrl, "/Login/GetQRWinUwp", {}, opts),
        /** /Login/GetQR_oversea — 二维码 (iPad, 海外) */
        loginGetQROversea: async () => postWppJson(ctx.baseUrl, "/Login/GetQR_oversea", {}, opts),
        /** /Login/GetQRx — 二维码 (iPad-绕过) */
        loginGetQRx: async () => postWppJson(ctx.baseUrl, "/Login/GetQRx", {}, opts),
        /** /Login/GetQRx_oversea — 二维码 (iPad-绕过, 海外) */
        loginGetQRxOversea: async () => postWppJson(ctx.baseUrl, "/Login/GetQRx_oversea", {}, opts),
        /** /Login/HarmonyLoginApi — 二维码 (鸿蒙平板) */
        loginHarmonyLoginApi: async () => postWppJson(ctx.baseUrl, "/Login/HarmonyLoginApi", {}, opts),
        /** /Login/HeartBeat — 心跳包 */
        loginHeartBeat: async () => postWppJson(ctx.baseUrl, "/Login/HeartBeat", {}, opts),
        /** /Login/HeartBeatLogs — GET 心跳日志 */
        loginHeartBeatLogs: async () => getWppJson(ctx.baseUrl, "/Login/HeartBeatLogs", opts),
        /** /Login/HeartBeatLong — 长连接心跳 */
        loginHeartBeatLong: async () => postWppJson(ctx.baseUrl, "/Login/HeartBeatLong", {}, opts),
        /** /Login/LogOut — 退出登录 */
        loginLogOut: async () => postWppJson(ctx.baseUrl, "/Login/LogOut", {}, opts),
        /** /Login/LongLinkStatus — GET 长连接状态 */
        loginLongLinkStatus: async () => getWppJson(ctx.baseUrl, "/Login/LongLinkStatus", opts),
        /** /Login/Newinit — 初始化 */
        loginNewinit: async (body) => postWppJson(ctx.baseUrl, "/Login/Newinit", body, opts),
        /** /Login/TwiceAutoAuth — 二次登录 */
        loginTwiceAutoAuth: async (body) => postWppJson(ctx.baseUrl, "/Login/TwiceAutoAuth", body, opts),
        /** /Login/YPayVerificationcode — 提交验证 */
        loginYPayVerificationcode: async (body) => postWppJson(ctx.baseUrl, "/Login/YPayVerificationcode", body, opts),
        // ===== v1.3.67 新 vendor: 登录增强 =====
        /** /Login/GetLoginStatus — 聚合登录状态 (v1.3.67 GET; autoLogin 尝试会话恢复) */
        loginGetStatus: async (autoLogin = true) => getWppJson(ctx.baseUrl, `/Login/GetLoginStatus?autoLogin=${autoLogin}`, opts),
        /** /Login/SubmitLoginVerificationCode — 提交短信验证码 (v1.3.67; 需 X-Access-Token) */
        loginSubmitVerificationCode: async (code) => postWppJson(ctx.baseUrl, "/Login/SubmitLoginVerificationCode", { code }, opts),
        /** /Login/GetQRPadCloud — 获取二维码新版兼容 (v1.3.67) */
        loginGetQRPadCloud: async (deviceName = "我的 iPad", oversea = false) => postWppJson(ctx.baseUrl, "/Login/GetQRPadCloud", { DeviceName: deviceName, oversea }, opts),
        /** /Login/GetQRPadPPMT — 获取二维码 Pad PPMT 兼容 (v1.3.67) */
        loginGetQRPadPPMT: async (deviceName = "我的 iPad", oversea = false) => postWppJson(ctx.baseUrl, "/Login/GetQRPadPPMT", { DeviceName: deviceName, oversea }, opts),
        /** /Login/62dataQRCodeVerify — 62 数据二维码验证 (v1.3.67; Url=验证链接) */
        login62dataQRCodeVerify: async (url) => postWppJson(ctx.baseUrl, "/Login/62dataQRCodeVerify", { Url: url }, opts),
        /** /Login/CheckCanSetAlias — 检测能否设置微信号 (v1.3.67 GET) */
        loginCheckCanSetAlias: async () => getWppJson(ctx.baseUrl, "/Login/CheckCanSetAlias", opts),
    };
}
//# sourceMappingURL=login.js.map