// src/send/wxapp.ts - Wxapp tag (20 endpoints: 小程序)

import { postWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppWxapp(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /Wxapp/AddAvatar */
    addAvatar: (imgBase64: string) => dispatch("/Wxapp/AddAvatar", { imgBase64 }),

    /** /Wxapp/AddMobile */
    addMobile: (phoneNumber: string) => dispatch("/Wxapp/AddMobile", { phoneNumber }),

    /** /Wxapp/CloudCallFunction */
    cloudCallFunction: (appId: string, functionName: string, data: Record<string, unknown>) =>
      dispatch("/Wxapp/CloudCallFunction", { appId, functionName, data: JSON.stringify(data) }),

    /** /Wxapp/DelMobile */
    delMobile: (phoneId: string) => dispatch("/Wxapp/DelMobile", { phoneId }),

    /** /Wxapp/DellAvatar */
    dellAvatar: () => dispatch("/Wxapp/DellAvatar", {}),

    /** /Wxapp/GETCreditScoreParam */
    getCreditScoreParam: () => dispatch("/Wxapp/GETCreditScoreParam", {}),

    /** /Wxapp/GetAllMobile */
    getAllMobile: () => dispatch("/Wxapp/GetAllMobile", {}),

    /** /Wxapp/GetRandomAvatar */
    getRandomAvatar: () => dispatch("/Wxapp/GetRandomAvatar", {}),

    /** /Wxapp/GetUnionPay */
    getUnionPay: (orderId: string) => dispatch("/Wxapp/GetUnionPay", { orderId }),

    /** /Wxapp/GetUserOpenId */
    getUserOpenId: (appId: string) => dispatch("/Wxapp/GetUserOpenId", { appId }),

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

    /** /Wxapp/UploadAvatarImg */
    uploadAvatarImg: (imgBase64: string) => dispatch("/Wxapp/UploadAvatarImg", { imgBase64 }),

    /** /Wxapp/Verifyplugin */
    verifyPlugin: (appId: string, url: string) =>
      dispatch("/Wxapp/Verifyplugin", { appId, url }),

    /** /Wxapp/Wxapp/AddWxAppRecord */
    addWxAppRecord: (appId: string, record: Record<string, unknown>) =>
      dispatch("/Wxapp/Wxapp/AddWxAppRecord", { appId, record: JSON.stringify(record) }),

    /** /Wxapp/Wxapp/GetpullPay */
    getPullPay: (appId: string) => dispatch("/Wxapp/Wxapp/GetpullPay", { appId }),

    /** /Wxapp/Wxapp/JSGetSessionidQRcode */
    jsGetSessionidQRcode: (appId: string, url: string) =>
      dispatch("/Wxapp/Wxapp/JSGetSessionidQRcode", { appId, url }),

    /** /Wxapp/Wxapp/QrcodeAuthLogin */
    qrcodeAuthLogin: (qrcodeUrl: string) =>
      dispatch("/Wxapp/Wxapp/QrcodeAuthLogin", { qrcodeUrl }),
  };
}

export type WppWxappApi = ReturnType<typeof makeWppWxapp>;
