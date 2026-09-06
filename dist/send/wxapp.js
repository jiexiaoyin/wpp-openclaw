// src/send/wxapp.ts - Wxapp tag (20 endpoints: 小程序)
import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppWxapp(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        /** /Wxapp/AddAvatar */
        addAvatar: (imgBase64) => dispatch("/Wxapp/AddAvatar", { imgBase64 }),
        /** /Wxapp/AddMobile */
        addMobile: (phoneNumber) => dispatch("/Wxapp/AddMobile", { phoneNumber }),
        /** /Wxapp/CloudCallFunction */
        cloudCallFunction: (appId, functionName, data) => dispatch("/Wxapp/CloudCallFunction", { appId, functionName, data: JSON.stringify(data) }),
        /** /Wxapp/DelMobile */
        delMobile: (phoneId) => dispatch("/Wxapp/DelMobile", { phoneId }),
        /** /Wxapp/DellAvatar */
        dellAvatar: () => dispatch("/Wxapp/DellAvatar", {}),
        /** /Wxapp/GETCreditScoreParam */
        getCreditScoreParam: () => dispatch("/Wxapp/GETCreditScoreParam", {}),
        /** /Wxapp/GetAllMobile */
        getAllMobile: () => dispatch("/Wxapp/GetAllMobile", {}),
        /** /Wxapp/GetRandomAvatar */
        getRandomAvatar: () => dispatch("/Wxapp/GetRandomAvatar", {}),
        /** /Wxapp/GetUnionPay */
        getUnionPay: (orderId) => dispatch("/Wxapp/GetUnionPay", { orderId }),
        /** /Wxapp/GetUserOpenId */
        getUserOpenId: (appId) => dispatch("/Wxapp/GetUserOpenId", { appId }),
        /** /Wxapp/GetWxAppRecord */
        getWxAppRecord: (appId) => dispatch("/Wxapp/GetWxAppRecord", { appId }),
        /** /Wxapp/JSGetSessionid */
        jsGetSessionid: (appId, url) => dispatch("/Wxapp/JSGetSessionid", { appId, url }),
        /** /Wxapp/JSLogin */
        jsLogin: (appId) => dispatch("/Wxapp/JSLogin", { appId }),
        /** /Wxapp/JSOperateWxData */
        jsOperateWxData: (appId, data) => dispatch("/Wxapp/JSOperateWxData", { appId, data: JSON.stringify(data) }),
        /** /Wxapp/UploadAvatarImg */
        uploadAvatarImg: (imgBase64) => dispatch("/Wxapp/UploadAvatarImg", { imgBase64 }),
        /** /Wxapp/Verifyplugin */
        verifyPlugin: (appId, url) => dispatch("/Wxapp/Verifyplugin", { appId, url }),
        /** /Wxapp/Wxapp/AddWxAppRecord (v1.2.1 swagger-alignment: AddWxAppRecordParamDoc {username}) */
        addWxAppRecord: (username) => dispatch("/Wxapp/Wxapp/AddWxAppRecord", { username }),
        /** /Wxapp/Wxapp/GetpullPay */
        getPullPay: (appId) => dispatch("/Wxapp/Wxapp/GetpullPay", { appId }),
        /** /Wxapp/Wxapp/JSGetSessionidQRcode */
        jsGetSessionidQRcode: (appId, url) => dispatch("/Wxapp/Wxapp/JSGetSessionidQRcode", { appId, url }),
        /** /Wxapp/Wxapp/QrcodeAuthLogin */
        qrcodeAuthLogin: (qrcodeUrl) => dispatch("/Wxapp/Wxapp/QrcodeAuthLogin", { qrcodeUrl }),
        // ===== v1.3.67 新 vendor: 小程序 OAuth =====
        /** /Wxapp/DeleteOauthApp — 移除小程序授权 (v1.3.67 新 API; appid) */
        deleteOauthApp: (appid) => dispatch("/Wxapp/DeleteOauthApp", { appid }),
        /** /Wxapp/GetOauthList — 小程序授权列表 (v1.3.67 新 API; 无 body) */
        getOauthList: () => dispatch("/Wxapp/GetOauthList", {}),
        /** /Wxapp/JSLoginCustomized — 小程序定制登录 (v1.3.67 新 API; appid) */
        jsLoginCustomized: (appid) => dispatch("/Wxapp/JSLoginCustomized", { appid }),
    };
}
//# sourceMappingURL=wxapp.js.map