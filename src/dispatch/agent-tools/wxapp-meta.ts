// src/dispatch/agent-tools/wxapp-meta.ts - Wxapp tag (20)

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppWxapp } from "../../send/wxapp.js";
import type { WppAccountCtx } from "../../send/factory.js";

const ctx: WppAccountCtx = { baseUrl: "", tokenKey: "", accountId: "" };
const api = makeWppWxapp(ctx);

export const WXAPP_META: ToolMeta = {
  /** /Wxapp/JSLogin */
  jsLoginWxApp: [
    "授权小程序 (定制).",
    Type.Object({ appId: Type.String() }),
    api.jsLogin,
  ],
  /** /Wxapp/JSGetSessionid */
  jsGetSessionid: [
    "获取小程序 sessionid.",
    Type.Object({ appId: Type.String(), url: Type.String() }),
    api.jsGetSessionid,
  ],
  /** /Wxapp/JSOperateWxData */
  jsOperateWxData: [
    "小程序操作 (data 是 JSON.stringify).",
    Type.Object({
      appId: Type.String(),
      data: Type.String({ description: "JSON.stringify 后的 data" }),
    }),
    api.jsOperateWxData,
  ],
  /** /Wxapp/CloudCallFunction */
  cloudCallFunction: [
    "小程序云函数调用 (云开发).",
    Type.Object({
      appId: Type.String(),
      functionName: Type.String(),
      data: Type.String({ description: "JSON.stringify" }),
    }),
    api.cloudCallFunction,
  ],
  /** /Wxapp/GetUserOpenId */
  getWxAppUserOpenId: [
    "查询小程序用户的 openId.",
    Type.Object({ appId: Type.String() }),
    api.getUserOpenId,
  ],
  /** /Wxapp/Verifyplugin */
  verifyPlugin: [
    "小程序获取 HostSign.",
    Type.Object({ appId: Type.String(), url: Type.String() }),
    api.verifyPlugin,
  ],
  /** /Wxapp/GetUnionPay */
  getWxAppUnionPay: [
    "云闪付支付.",
    Type.Object({ orderId: Type.String() }),
    api.getUnionPay,
  ],
  /** /Wxapp/Wxapp/GetpullPay */
  getWxAppPullPay: [
    "推送小程序支付请求.",
    Type.Object({ appId: Type.String() }),
    api.getPullPay,
  ],
};
