// src/send/login.ts - Login tag (38 endpoints)

import { postWppJson, getWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx, type Resp } from "./factory.js";

export function makeWppLogin(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  return {
    /** /Login/62data — 62登陆(账号或密码) */
    login62data: async (body: Record<string, unknown>): Resp =>
      postWppJson(ctx.baseUrl, "/Login/62data", body, opts),

    /** /Login/62dataQRCodeApply — 申请二维码验证 */
    login62dataQRCodeApply: async (body: Record<string, unknown>): Resp =>
      postWppJson(ctx.baseUrl, "/Login/62dataQRCodeApply", body, opts),

    /** /Login/62dataSMSAgain — 重发验证码 */
    login62dataSMSAgain: async (body: Record<string, unknown>): Resp =>
      postWppJson(ctx.baseUrl, "/Login/62dataSMSAgain", body, opts),

    /** /Login/62dataSMSApply — 申请 SMS 验证 */
    login62dataSMSApply: async (body: Record<string, unknown>): Resp =>
      postWppJson(ctx.baseUrl, "/Login/62dataSMSApply", body, opts),

    /** /Login/62dataSMSVerify — SMS 验证校验 */
    login62dataSMSVerify: async (body: Record<string, unknown>): Resp =>
      postWppJson(ctx.baseUrl, "/Login/62dataSMSVerify", body, opts),

    /** /Login/A16Data — A16 登陆(android 8.0.50) */
    loginA16Data: async (body: Record<string, unknown>): Resp =>
      postWppJson(ctx.baseUrl, "/Login/A16Data", body, opts),

    /** /Login/A16Data848 — A16 新版云函数 */
    loginA16Data848: async (body: Record<string, unknown>): Resp =>
      postWppJson(ctx.baseUrl, "/Login/A16Data848", body, opts),

    /** /Login/AutoHeartBeat — 开启自动心跳 */
    loginAutoHeartBeat: async (body: Record<string, unknown> = {}): Resp =>
      postWppJson(ctx.baseUrl, "/Login/AutoHeartBeat", body, opts),

    /** /Login/Awaken — 唤醒登录(扫码) */
    loginAwaken: async (body: Record<string, unknown>): Resp =>
      postWppJson(ctx.baseUrl, "/Login/Awaken", body, opts),

    /** /Login/CheckMacQR — 检测 Mac 二维码 */
    loginCheckMacQR: async (uuid: string): Resp<{ status?: number; expired?: boolean }> =>
      postWppJson<{ status?: number; expired?: boolean }>(
        ctx.baseUrl,
        "/Login/CheckMacQR",
        { uuid },
        opts,
      ),

    /** /Login/CheckQR — 检测二维码 */
    loginCheckQR: async (uuid: string): Resp<{ status?: number; expired?: boolean; acctSectResp?: unknown }> =>
      postWppJson<{ status?: number; expired?: boolean; acctSectResp?: unknown }>(
        ctx.baseUrl,
        "/Login/CheckQR",
        { uuid },
        opts,
      ),

    /** /Login/ExtDeviceLoginConfirmGet — 新设备扫码登录 */
    loginExtDeviceLoginConfirmGet: async (body: Record<string, unknown>): Resp =>
      postWppJson(ctx.baseUrl, "/Login/ExtDeviceLoginConfirmGet", body, opts),

    /** /Login/ExtDeviceLoginConfirmOk — 新设备扫码确认 */
    loginExtDeviceLoginConfirmOk: async (body: Record<string, unknown>): Resp =>
      postWppJson(ctx.baseUrl, "/Login/ExtDeviceLoginConfirmOk", body, opts),

    /** /Login/Get62Data — 获取 62 数据 */
    loginGet62Data: async (body: Record<string, unknown>): Resp =>
      postWppJson(ctx.baseUrl, "/Login/Get62Data", body, opts),

    /** /Login/GetA16Data — 获取 A16 数据 */
    loginGetA16Data: async (body: Record<string, unknown>): Resp =>
      postWppJson(ctx.baseUrl, "/Login/GetA16Data", body, opts),

    /** /Login/GetCacheInfo — 获取登录缓存 */
    loginGetCacheInfo: async (): Resp => postWppJson(ctx.baseUrl, "/Login/GetCacheInfo", {}, opts),

    /** /Login/GetLoginQRCode862 — 二维码 (iPad 8.0.62) */
    loginGetLoginQRCode862: async (): Resp<{ qrcodeUrl?: string; uuid?: string }> =>
      postWppJson<{ qrcodeUrl?: string; uuid?: string }>(
        ctx.baseUrl,
        "/Login/GetLoginQRCode862",
        {},
        opts,
      ),

    /** /Login/GetQR — 二维码 (iPad) */
    loginGetQR: async (deviceType: string = "ipad"): Resp<{ qrcodeUrl?: string; qrcodeData?: string; uuid?: string }> =>
      postWppJson<{ qrcodeUrl?: string; qrcodeData?: string; uuid?: string }>(
        ctx.baseUrl,
        "/Login/GetQR",
        { deviceType },
        opts,
      ),

    /** /Login/GetQRMac — 二维码 (Mac) */
    loginGetQRMac: async (): Resp<{ qrcodeUrl?: string; qrcodeData?: string; uuid?: string }> =>
      postWppJson<{ qrcodeUrl?: string; qrcodeData?: string; uuid?: string }>(
        ctx.baseUrl,
        "/Login/GetQRMac",
        {},
        opts,
      ),

    /** /Login/GetQRMac_oversea — 二维码 (Mac, 海外) */
    loginGetQRMacOversea: async (): Resp =>
      postWppJson(ctx.baseUrl, "/Login/GetQRMac_oversea", {}, opts),

    /** /Login/GetQRPad — 二维码 (Pad) */
    loginGetQRPad: async (): Resp =>
      postWppJson(ctx.baseUrl, "/Login/GetQRPad", {}, opts),

    /** /Login/GetQRPadx — 二维码 (Pad-绕过) */
    loginGetQRPadx: async (): Resp =>
      postWppJson(ctx.baseUrl, "/Login/GetQRPadx", {}, opts),

    /** /Login/GetQRWatch — 二维码 (Car) */
    loginGetQRWatch: async (): Resp =>
      postWppJson(ctx.baseUrl, "/Login/GetQRWatch", {}, opts),

    /** /Login/GetQRWin — 二维码 (Windows) */
    loginGetQRWin: async (): Resp =>
      postWppJson(ctx.baseUrl, "/Login/GetQRWin", {}, opts),

    /** /Login/GetQRWinUnified — 二维码 (WinUnified) */
    loginGetQRWinUnified: async (): Resp =>
      postWppJson(ctx.baseUrl, "/Login/GetQRWinUnified", {}, opts),

    /** /Login/GetQRWinUwp — 二维码 (WinUwp-绕过) */
    loginGetQRWinUwp: async (): Resp =>
      postWppJson(ctx.baseUrl, "/Login/GetQRWinUwp", {}, opts),

    /** /Login/GetQR_oversea — 二维码 (iPad, 海外) */
    loginGetQROversea: async (): Resp =>
      postWppJson(ctx.baseUrl, "/Login/GetQR_oversea", {}, opts),

    /** /Login/GetQRx — 二维码 (iPad-绕过) */
    loginGetQRx: async (): Resp =>
      postWppJson(ctx.baseUrl, "/Login/GetQRx", {}, opts),

    /** /Login/GetQRx_oversea — 二维码 (iPad-绕过, 海外) */
    loginGetQRxOversea: async (): Resp =>
      postWppJson(ctx.baseUrl, "/Login/GetQRx_oversea", {}, opts),

    /** /Login/HarmonyLoginApi — 二维码 (鸿蒙平板) */
    loginHarmonyLoginApi: async (): Resp =>
      postWppJson(ctx.baseUrl, "/Login/HarmonyLoginApi", {}, opts),

    /** /Login/HeartBeat — 心跳包 */
    loginHeartBeat: async (): Resp => postWppJson(ctx.baseUrl, "/Login/HeartBeat", {}, opts),

    /** /Login/HeartBeatLogs — GET 心跳日志 */
    loginHeartBeatLogs: async (): Resp => getWppJson(ctx.baseUrl, "/Login/HeartBeatLogs", opts),

    /** /Login/HeartBeatLong — 长连接心跳 */
    loginHeartBeatLong: async (): Resp => postWppJson(ctx.baseUrl, "/Login/HeartBeatLong", {}, opts),

    /** /Login/LogOut — 退出登录 */
    loginLogOut: async (): Resp => postWppJson(ctx.baseUrl, "/Login/LogOut", {}, opts),

    /** /Login/LongLinkStatus — GET 长连接状态 */
    loginLongLinkStatus: async (): Resp => getWppJson(ctx.baseUrl, "/Login/LongLinkStatus", opts),

    /** /Login/Newinit — 初始化 */
    loginNewinit: async (body: Record<string, unknown>): Resp =>
      postWppJson(ctx.baseUrl, "/Login/Newinit", body, opts),

    /** /Login/TwiceAutoAuth — 二次登录 */
    loginTwiceAutoAuth: async (body: Record<string, unknown>): Resp =>
      postWppJson(ctx.baseUrl, "/Login/TwiceAutoAuth", body, opts),

    /** /Login/YPayVerificationcode — 提交验证 */
    loginYPayVerificationcode: async (body: Record<string, unknown>): Resp =>
      postWppJson(ctx.baseUrl, "/Login/YPayVerificationcode", body, opts),

    // ===== v1.3.67 新 vendor: 登录增强 =====

    /** /Login/GetLoginStatus — 聚合登录状态 (v1.3.67 GET; autoLogin 尝试会话恢复) */
    loginGetStatus: async (autoLogin = true): Resp =>
      getWppJson(ctx.baseUrl, `/Login/GetLoginStatus?autoLogin=${autoLogin}`, opts),

    /** /Login/SubmitLoginVerificationCode — 提交短信验证码 (v1.3.67; 需 X-Access-Token) */
    loginSubmitVerificationCode: async (code: string): Resp =>
      postWppJson(ctx.baseUrl, "/Login/SubmitLoginVerificationCode", { code }, opts),

    /** /Login/GetQRPadCloud — 获取二维码新版兼容 (v1.3.67) */
    loginGetQRPadCloud: async (deviceName = "我的 iPad", oversea = false): Resp =>
      postWppJson(ctx.baseUrl, "/Login/GetQRPadCloud", { DeviceName: deviceName, oversea }, opts),

    /** /Login/GetQRPadPPMT — 获取二维码 Pad PPMT 兼容 (v1.3.67) */
    loginGetQRPadPPMT: async (deviceName = "我的 iPad", oversea = false): Resp =>
      postWppJson(ctx.baseUrl, "/Login/GetQRPadPPMT", { DeviceName: deviceName, oversea }, opts),

    /** /Login/62dataQRCodeVerify — 62 数据二维码验证 (v1.3.67; Url=验证链接) */
    login62dataQRCodeVerify: async (url: string): Resp =>
      postWppJson(ctx.baseUrl, "/Login/62dataQRCodeVerify", { Url: url }, opts),

    /** /Login/CheckCanSetAlias — 检测能否设置微信号 (v1.3.67 GET) */
    loginCheckCanSetAlias: async (): Resp =>
      getWppJson(ctx.baseUrl, "/Login/CheckCanSetAlias", opts),
  };
}

/** Backward-compat type re-export */
export type WppLoginApi = ReturnType<typeof makeWppLogin>;

