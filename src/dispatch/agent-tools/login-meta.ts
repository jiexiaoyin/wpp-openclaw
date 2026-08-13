// src/dispatch/agent-tools/login-meta.ts - Login tag (38)
//   修前: 模块顶层 const ctx = { baseUrl: "", tokenKey: "", accountId: "" } → 入库 account_id=""
//   修后: 每个 tool fn 运行时调 getLoginApi() 拿真 ctx → 入库有真 account_id

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppLogin } from "../../send/login.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";

function getLoginApi() {
  const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
  if (!state) throw new Error("account not found: default");
  return makeWppLogin({
    baseUrl: state.config.apiBaseUrl,
    tokenKey: state.config.tokenKey,
    authcode: state.authcode,
    accountId: getCurrentAccountId() ?? "default",
  });
}

export const LOGIN_META: ToolMeta = {
  /** 扫描二维码 (iPad) — 触发 vendor push 回调 */
  scanGetQR: [
    "获取登录二维码 (iPad). 触发后用另一个手机扫码, 走 WPP webhook 回调通知登录态.",
    Type.Object({ deviceType: Type.Optional(Type.String()) }),
    (deviceType?: string) => getLoginApi().loginGetQR(deviceType),
  ],
  /** /Login/CheckQR */
  scanCheckQR: [
    "检测二维码状态. uuid 从扫到的回调里取. status: 0=已扫码, 1=未扫码, 2=过期.",
    Type.Object({ uuid: Type.String() }),
    (uuid: string) => getLoginApi().loginCheckQR(uuid),
  ],
  /** /Login/AutoHeartBeat — 开启自动心跳 */
  startAutoHeartBeat: [
    "开启自动心跳, 防止 vendor 端超时断连.",
    Type.Object({}),
    // 原版 api.loginAutoHeartBeat — 但 api 签名是 (body: Record<string, unknown>)
    // 历史不一致, 不优化
    () => getLoginApi().loginAutoHeartBeat({}),
  ],
  /** /Login/HeartBeat */
  sendHeartBeat: [
    "单次心跳 (手动). 一般不直接调, 自动心跳已包含.",
    Type.Object({}),
    () => getLoginApi().loginHeartBeat(),
  ],
  /** /Login/HeartBeatLong */
  sendHeartBeatLong: [
    "长连接心跳包.",
    Type.Object({}),
    () => getLoginApi().loginHeartBeatLong(),
  ],
  /** /Login/HeartBeatLogs (GET) */
  getHeartBeatLogs: [
    "获取心跳日志 (GET).",
    Type.Object({}),
    () => getLoginApi().loginHeartBeatLogs(),
  ],
  /** /Login/GetCacheInfo */
  getLoginCacheInfo: [
    "获取本地登录缓存 (wxid / token 缓存命中).",
    Type.Object({}),
    () => getLoginApi().loginGetCacheInfo(),
  ],
  /** /Login/LongLinkStatus (GET) */
  getLongLinkStatus: [
    "查询 WS 长连接状态.",
    Type.Object({}),
    () => getLoginApi().loginLongLinkStatus(),
  ],
  /** /Login/LogOut */
  logout: [
    "退出登录. 关闭 WS 长连接并清理 session.",
    Type.Object({}),
    () => getLoginApi().loginLogOut(),
  ],
  /** /Login/Newinit */
  loginNewinit: [
    "执行 login 后 Newinit, 拉取通讯同步种子.",
    Type.Object({
      userInfo: Type.String({ description: "JSON.stringify login response" }),
    }),
    // 原版 api.loginNewinit(userInfo) — 但 api 签名是 (body: Record<string, unknown>)
    // 历史不一致, 不优化
    (userInfo: string) => getLoginApi().loginNewinit({ userInfo }),
  ],
};