import { postWppJson, getWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppUser(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        bindQQ: (qq, password) => dispatch("/User/BindQQ", { qq, password }),
        bindingEmail: (email) => dispatch("/User/BindingEmail", { email }),
        bindingMobile: (mobile, code) => dispatch("/User/BindingMobile", { mobile, code }),
        checkCanSetAlias: () => getWppJson(ctx.baseUrl, "/User/CheckCanSetAlias", opts),
        delSafetyInfo: (uuid) => dispatch("/User/DelSafetyInfo", { uuid }),
        getContractProfile: (wxid) => dispatch("/User/GetContractProfile", { wxid: wxid ?? "" }),
        getOnlineInfo: () => getWppJson(ctx.baseUrl, "/User/GetOnlineInfo", opts),
        getQRCode: () => dispatch("/User/GetQRCode", {}),
        getSafetyInfo: () => dispatch("/User/GetSafetyInfo", {}),
        privacySettings: (opt, value) => dispatch("/User/PrivacySettings", { opt, value }),
        reportMotion: (steps) => dispatch("/User/ReportMotion", { steps }),
        sendVerifyMobile: (mobile) => dispatch("/User/SendVerifyMobile", { mobile }),
        setAlisa: (alias) => dispatch("/User/SetAlisa", { alias }),
        setPasswd: (newPwd) => dispatch("/User/SetPasswd", { newPwd }),
        updateProfile: (nickname, signature, sex, wxid) => dispatch("/User/UpdateProfile", {
            NickName: nickname ?? "",
            Signature: signature ?? "",
            Sex: sex ?? 0,
            Wxid: wxid ?? "",
            City: "",
            Country: "",
            Province: "",
        }),
        uploadHeadImage: (imgBase64) => dispatch("/User/UploadHeadImage", { imgBase64 }),
        verifyPasswd: (password) => dispatch("/User/VerifyPasswd", { password }),
        friendVerification: (enabled) => dispatch("/User/FriendVerification", { enabled }),
        addMeMethods: (opts) => dispatch("/User/AddMeMethods", opts),
    };
}
