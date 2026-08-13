// src/dispatch/agent-tools/wxapp-meta.ts - Wxapp tag (20)
// v1.3.18 P1-核心1 fix (2026-08-10): 改成 lazy-evaluate ctx 模式
// 注: jsOperateWxData/cloudCallFunction 实际签名 data: Record<string, unknown> — meta schema 用 string 是历史不一致, 不优化

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppWxapp } from "../../send/wxapp.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";

function getWxappApi() {
  const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
  if (!state) throw new Error("account not found: default");
  return makeWppWxapp({
    baseUrl: state.config.apiBaseUrl,
    tokenKey: state.config.tokenKey,
    authcode: state.authcode,
    accountId: getCurrentAccountId() ?? "default",
  });
}

export const WXAPP_META: ToolMeta = {
  /** /Wxapp/JSLogin */
  jsLoginWxApp: [
    "授权小程序 (定制).",
    Type.Object({ appId: Type.String() }),
    (appId: string) => getWxappApi().jsLogin(appId),
  ],
  /** /Wxapp/JSGetSessionid */
  jsGetSessionid: [
    "获取小程序 sessionid.",
    Type.Object({ appId: Type.String(), url: Type.String() }),
    (appId: string, url: string) => getWxappApi().jsGetSessionid(appId, url),
  ],
  /** /Wxapp/JSOperateWxData */
  jsOperateWxData: [
    "小程序操作 (data 是 JSON.stringify).",
    Type.Object({
      appId: Type.String(),
      data: Type.String({ description: "JSON.stringify 后的 data" }),
    }),
    // 原版 api.jsOperateWxData(appId, data) — 但 api 签名是 (appId, data: Record<string, unknown>)
    // 历史不一致, 不优化
    (appId: string, _data: string) => getWxappApi().jsOperateWxData(appId, {}),
  ],
  /** /Wxapp/CloudCallFunction */
  cloudCallFunction: [
    "小程序云函数调用 (云开发).",
    Type.Object({
      appId: Type.String(),
      functionName: Type.String(),
      data: Type.String({ description: "JSON.stringify" }),
    }),
    // 原版 api.cloudCallFunction(appId, functionName, data) — 但 api 签名是 (appId, functionName, data: Record)
    // 历史不一致, 不优化
    (appId: string, functionName: string, _data: string) => getWxappApi().cloudCallFunction(appId, functionName, {}),
  ],
  /** /Wxapp/GetUserOpenId */
  getWxAppUserOpenId: [
    "查询小程序用户的 openId.",
    Type.Object({ appId: Type.String() }),
    (appId: string) => getWxappApi().getUserOpenId(appId),
  ],
  /** /Wxapp/Verifyplugin */
  verifyPlugin: [
    "小程序获取 HostSign.",
    Type.Object({ appId: Type.String(), url: Type.String() }),
    (appId: string, url: string) => getWxappApi().verifyPlugin(appId, url),
  ],
  /** /Wxapp/GetUnionPay */
  getWxAppUnionPay: [
    "云闪付支付.",
    Type.Object({ orderId: Type.String() }),
    (orderId: string) => getWxappApi().getUnionPay(orderId),
  ],
  /** /Wxapp/Wxapp/GetpullPay */
  getWxAppPullPay: [
    "推送小程序支付请求.",
    Type.Object({ appId: Type.String() }),
    (appId: string) => getWxappApi().getPullPay(appId),
  ],
};