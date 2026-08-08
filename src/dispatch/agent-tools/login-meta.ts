// src/dispatch/agent-tools/login-meta.ts - Login tag (38)

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppLogin } from "../../send/login.js";
import type { WppAccountCtx } from "../../send/factory.js";

const ctx: WppAccountCtx = {
  baseUrl: "",
  tokenKey: "",
  accountId: "",
};
const api = makeWppLogin(ctx);

export const LOGIN_META: ToolMeta = {
  /** 扫描二维码 (iPad) — 触发 vendor push 回调 */
  scanGetQR: [
    "获取登录二维码 (iPad). 触发后用另一个手机扫码, 走 WPP webhook 回调通知登录态.",
    Type.Object({ deviceType: Type.Optional(Type.String()) }),
    api.loginGetQR,
  ],
  /** /Login/CheckQR */
  scanCheckQR: [
    "检测二维码状态. uuid 从扫到的回调里取. status: 0=已扫码, 1=未扫码, 2=过期.",
    Type.Object({ uuid: Type.String() }),
    api.loginCheckQR,
  ],
  /** /Login/AutoHeartBeat — 开启自动心跳 */
  startAutoHeartBeat: [
    "开启自动心跳, 防止 vendor 端超时断连.",
    Type.Object({}),
    api.loginAutoHeartBeat,
  ],
  /** /Login/HeartBeat */
  sendHeartBeat: [
    "单次心跳 (手动). 一般不直接调, 自动心跳已包含.",
    Type.Object({}),
    api.loginHeartBeat,
  ],
  /** /Login/HeartBeatLong */
  sendHeartBeatLong: [
    "长连接心跳包.",
    Type.Object({}),
    api.loginHeartBeatLong,
  ],
  /** /Login/HeartBeatLogs (GET) */
  getHeartBeatLogs: [
    "获取心跳日志 (GET).",
    Type.Object({}),
    api.loginHeartBeatLogs,
  ],
  /** /Login/GetCacheInfo */
  getLoginCacheInfo: [
    "获取本地登录缓存 (wxid / token 缓存命中).",
    Type.Object({}),
    api.loginGetCacheInfo,
  ],
  /** /Login/LongLinkStatus (GET) */
  getLongLinkStatus: [
    "查询 WS 长连接状态.",
    Type.Object({}),
    api.loginLongLinkStatus,
  ],
  /** /Login/LogOut */
  logout: [
    "退出登录. 关闭 WS 长连接并清理 session.",
    Type.Object({}),
    api.loginLogOut,
  ],
  /** /Login/Newinit */
  loginNewinit: [
    "执行 login 后 Newinit, 拉取通讯录同步种子.",
    Type.Object({
      userInfo: Type.String({ description: "JSON.stringify login response" }),
    }),
    api.loginNewinit,
  ],
};
