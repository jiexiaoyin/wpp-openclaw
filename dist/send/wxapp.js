import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppWxapp(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        addAvatar: (imgBase64) => dispatch("/Wxapp/AddAvatar", { imgBase64 }),
        addMobile: (phoneNumber) => dispatch("/Wxapp/AddMobile", { phoneNumber }),
        cloudCallFunction: (appId, functionName, data) => dispatch("/Wxapp/CloudCallFunction", { appId, functionName, data: JSON.stringify(data) }),
        delMobile: (phoneId) => dispatch("/Wxapp/DelMobile", { phoneId }),
        dellAvatar: () => dispatch("/Wxapp/DellAvatar", {}),
        getCreditScoreParam: () => dispatch("/Wxapp/GETCreditScoreParam", {}),
        getAllMobile: () => dispatch("/Wxapp/GetAllMobile", {}),
        getRandomAvatar: () => dispatch("/Wxapp/GetRandomAvatar", {}),
        getUnionPay: (orderId) => dispatch("/Wxapp/GetUnionPay", { orderId }),
        getUserOpenId: (appId) => dispatch("/Wxapp/GetUserOpenId", { appId }),
        getWxAppRecord: (appId) => dispatch("/Wxapp/GetWxAppRecord", { appId }),
        jsGetSessionid: (appId, url) => dispatch("/Wxapp/JSGetSessionid", { appId, url }),
        jsLogin: (appId) => dispatch("/Wxapp/JSLogin", { appId }),
        jsOperateWxData: (appId, data) => dispatch("/Wxapp/JSOperateWxData", { appId, data: JSON.stringify(data) }),
        uploadAvatarImg: (imgBase64) => dispatch("/Wxapp/UploadAvatarImg", { imgBase64 }),
        verifyPlugin: (appId, url) => dispatch("/Wxapp/Verifyplugin", { appId, url }),
        addWxAppRecord: (username) => dispatch("/Wxapp/Wxapp/AddWxAppRecord", { username }),
        getPullPay: (appId) => dispatch("/Wxapp/Wxapp/GetpullPay", { appId }),
        jsGetSessionidQRcode: (appId, url) => dispatch("/Wxapp/Wxapp/JSGetSessionidQRcode", { appId, url }),
        qrcodeAuthLogin: (qrcodeUrl) => dispatch("/Wxapp/Wxapp/QrcodeAuthLogin", { qrcodeUrl }),
        deleteOauthApp: (appid) => dispatch("/Wxapp/DeleteOauthApp", { appid }),
        getOauthList: () => dispatch("/Wxapp/GetOauthList", {}),
        jsLoginCustomized: (appid) => dispatch("/Wxapp/JSLoginCustomized", { appid }),
    };
}
