// src/send/wxapp.ts - Wxapp tag (20 endpoints: 小程序)
// v1.6.0 SWAGGER-323: 本 tag 是字段偏离的重灾区 — 头像/手机号/支付三族此前普遍发的字段
//   在 swagger 里不存在. 头像真实流程 = UploadAvatarImg(jpgLink) → 拿 aFilekey → AddAvatar(appid,nickName,aFilekey);
//   手机号 = AddMobile(appid,mobile,verifyCode) / DelMobile(appid,mobile);
//   支付三件套 (GetUnionPay / GetpullPay / JSGetSessionidQRcode) 共用同一组下单结果字段.

import { postWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

/** 小程序支付三件套共用的下单结果字段 (swagger UnionpayDataDoc / GetpullPayParamDoc / SessionidQRParamDoc 完全同形) */
export interface WppWxappPayParams {
  appid: string;
  sessionid: string;
  timeStamp: string;
  nonceStr: string;
  package: string;
  paySign: string;
}

export function makeWppWxapp(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /Wxapp/AddAvatar — 保存小程序头像
     *  v1.6.0: swagger AddAvatarParamDoc {appid*, nickName*, aFilekey*}.
     *  旧码发 `imgBase64` — 本端点是**保存**不是上传, aFilekey 来自 UploadAvatarImg. */
    addAvatar: (appid: string, nickName: string, aFilekey: string) =>
      dispatch("/Wxapp/AddAvatar", { appid, nickName, aFilekey }),

    /** /Wxapp/AddMobile — 小程序绑定手机号
     *  v1.6.0: swagger CheckVerifyCodeDataDoc {appid*, mobile*, verifyCode*}. 旧码发 `phoneNumber`. */
    addMobile: (appid: string, mobile: string, verifyCode: string) =>
      dispatch("/Wxapp/AddMobile", { appid, mobile, verifyCode }),

    /** /Wxapp/CloudCallFunction */
    cloudCallFunction: (appId: string, functionName: string, data: Record<string, unknown>) =>
      dispatch("/Wxapp/CloudCallFunction", { appId, functionName, data: JSON.stringify(data) }),

    /** /Wxapp/DelMobile — v1.6.0: swagger DelMobileDataDoc {appid*, mobile*}. 旧码发 `phoneId`. */
    delMobile: (appid: string, mobile: string) =>
      dispatch("/Wxapp/DelMobile", { appid, mobile }),

    /** /Wxapp/DellAvatar — v1.6.0: swagger DellAvatarParamDoc {avatarId*(integer)}. 旧码发空体. */
    dellAvatar: (avatarId: number | string) =>
      dispatch("/Wxapp/DellAvatar", { avatarId: Number(avatarId) }),

    /** /Wxapp/GETCreditScoreParam */
    getCreditScoreParam: () => dispatch("/Wxapp/GETCreditScoreParam", {}),

    /** /Wxapp/GetAllMobile — v1.6.0: swagger {appid*}. 旧码发空体. */
    getAllMobile: (appid: string) => dispatch("/Wxapp/GetAllMobile", { appid }),

    /** /Wxapp/GetRandomAvatar — v1.6.0: swagger DefaultParamDoc {appid*}. 旧码发空体. */
    getRandomAvatar: (appid: string) => dispatch("/Wxapp/GetRandomAvatar", { appid }),

    /** /Wxapp/GetUnionPay — 云闪付支付
     *  v1.6.0: swagger UnionpayDataDoc {appid*, sessionid*, timeStamp*, nonceStr*, package*, paySign*}.
     *  旧码只发 `orderId` (该字段 swagger 无) — 参数来自小程序支付下单结果. */
    getUnionPay: (p: WppWxappPayParams) => dispatch("/Wxapp/GetUnionPay", { ...p }),

    /** /Wxapp/GetUserOpenId
     *  v1.6.0: swagger GetUserOpenIdParamDoc {toWxId*(目标用户 username), appid*}. 旧码只发 `appId`. */
    getUserOpenId: (toWxId: string, appid: string) =>
      dispatch("/Wxapp/GetUserOpenId", { toWxId, appid }),

    /** /Wxapp/GetWxAppRecord */
    getWxAppRecord: (appId: string) => dispatch("/Wxapp/GetWxAppRecord", { appId }),

    /** /Wxapp/JSGetSessionid */
    jsGetSessionid: (appId: string, url: string) =>
      dispatch("/Wxapp/JSGetSessionid", { appId, url }),

    /** /Wxapp/JSLogin */
    jsLogin: (appId: string) => dispatch("/Wxapp/JSLogin", { appId }),

    /** /Wxapp/JSOperateWxData */
    jsOperateWxData: (appId: string, data: Record<string, unknown>) =>
      dispatch("/Wxapp/JSOperateWxData", { appId, data: JSON.stringify(data) }),

    /** /Wxapp/UploadAvatarImg — 上传小程序头像图片
     *  v1.6.0: swagger AddAvatarImgParamDoc {appid*, jpgLink*(可直接访问的 JPG 图片地址)}.
     *  旧码发 `imgBase64` — 厂商要的是 **URL** 不是 base64. 返回的 aFilekey 供 AddAvatar 用. */
    uploadAvatarImg: (appid: string, jpgLink: string) =>
      dispatch("/Wxapp/UploadAvatarImg", { appid, jpgLink }),

    /** /Wxapp/Verifyplugin */
    verifyPlugin: (appId: string, url: string) =>
      dispatch("/Wxapp/Verifyplugin", { appId, url }),

    /** /Wxapp/Wxapp/AddWxAppRecord (v1.2.1 swagger-alignment: AddWxAppRecordParamDoc {username}) */
    addWxAppRecord: (username: string) =>
      dispatch("/Wxapp/Wxapp/AddWxAppRecord", { username }),

    /** /Wxapp/Wxapp/GetpullPay — 确认小程序支付
     *  v1.6.0: swagger GetpullPayParamDoc = 支付六件套 (同 GetUnionPay). 旧码只发 `appId`. */
    getPullPay: (p: WppWxappPayParams) => dispatch("/Wxapp/Wxapp/GetpullPay", { ...p }),

    /** /Wxapp/Wxapp/JSGetSessionidQRcode — 获取小程序支付二维码
     *  v1.6.0: swagger SessionidQRParamDoc = 支付六件套 (同 GetUnionPay). 旧码发 {appId, url}. */
    jsGetSessionidQRcode: (p: WppWxappPayParams) =>
      dispatch("/Wxapp/Wxapp/JSGetSessionidQRcode", { ...p }),

    /** /Wxapp/Wxapp/QrcodeAuthLogin — 确认扫码授权登录
     *  v1.6.0: swagger QrcodeAuthLoginParamDoc {uuid*(获取二维码时返回的 UUID)}. 旧码发 `qrcodeUrl`. */
    qrcodeAuthLogin: (uuid: string) =>
      dispatch("/Wxapp/Wxapp/QrcodeAuthLogin", { uuid }),

    // ===== v1.3.67 新 vendor: 小程序 OAuth =====

    /** /Wxapp/DeleteOauthApp — 移除小程序授权 (v1.3.67 新 API; appid) */
    deleteOauthApp: (appid: string) =>
      dispatch("/Wxapp/DeleteOauthApp", { appid }),

    /** /Wxapp/GetOauthList — 小程序授权列表 (v1.3.67 新 API; 无 body) */
    getOauthList: () => dispatch("/Wxapp/GetOauthList", {}),

    /** /Wxapp/JSLoginCustomized — 小程序定制登录 (v1.3.67 新 API; appid) */
    jsLoginCustomized: (appid: string) =>
      dispatch("/Wxapp/JSLoginCustomized", { appid }),
  };
}

export type WppWxappApi = ReturnType<typeof makeWppWxapp>;
