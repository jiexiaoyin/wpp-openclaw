// src/send/user.ts - User tag (18 endpoints: profile + account management)
import { postWppJson, getWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppUser(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        /** /User/BindQQ — 绑定QQ */
        bindQQ: (qq, password) => dispatch("/User/BindQQ", { qq, password }),
        /** /User/BindingEmail — 绑定邮箱 */
        bindingEmail: (email) => dispatch("/User/BindingEmail", { email }),
        /** /User/BindingMobile — 换绑手机号 */
        bindingMobile: (mobile, code) => dispatch("/User/BindingMobile", { mobile, code }),
        /** /User/CheckCanSetAlias — GET 检测环境 */
        checkCanSetAlias: () => getWppJson(ctx.baseUrl, "/User/CheckCanSetAlias", opts),
        /** /User/DelSafetyInfo — 删除登录设备 */
        delSafetyInfo: (uuid) => dispatch("/User/DelSafetyInfo", { uuid }),
        /** /User/GetContractProfile — 取个人信息 */
        getContractProfile: (wxid) => dispatch("/User/GetContractProfile", { wxid: wxid ?? "" }),
        /** /User/GetOnlineInfo — GET 在线信息 */
        getOnlineInfo: () => getWppJson(ctx.baseUrl, "/User/GetOnlineInfo", opts),
        /** /User/GetQRCode — 个人二维码 */
        getQRCode: () => dispatch("/User/GetQRCode", {}),
        /** /User/GetSafetyInfo — 登录设备管理 */
        getSafetyInfo: () => dispatch("/User/GetSafetyInfo", {}),
        /** /User/PrivacySettings — 隐私设置 */
        privacySettings: (opt, value) => dispatch("/User/PrivacySettings", { opt, value }),
        /** /User/ReportMotion — ReportMotion */
        reportMotion: (steps) => dispatch("/User/ReportMotion", { steps }),
        /** /User/SendVerifyMobile — 发送手机验证码 */
        sendVerifyMobile: (mobile) => dispatch("/User/SendVerifyMobile", { mobile }),
        /** /User/SetAlisa — 设置微信号 */
        setAlisa: (alias) => dispatch("/User/SetAlisa", { alias }),
        /** /User/SetPasswd — 修改密码 */
        setPasswd: (newPwd) => dispatch("/User/SetPasswd", { newPwd }),
        /** /User/UpdateProfile — 修改个人信息 (v1.2.1 swagger-alignment: UpdateProfileParam {NickName, Signature, Sex, City, Country, Province, Wxid}) */
        updateProfile: (nickname, signature, sex, wxid) => dispatch("/User/UpdateProfile", {
            NickName: nickname ?? "",
            Signature: signature ?? "",
            Sex: sex ?? 0,
            Wxid: wxid ?? "",
            City: "",
            Country: "",
            Province: "",
        }),
        /** /User/UploadHeadImage — 修改头像 */
        uploadHeadImage: (imgBase64) => dispatch("/User/UploadHeadImage", { imgBase64 }),
        /** /User/VerifyPasswd — 验证密码 */
        verifyPasswd: (password) => dispatch("/User/VerifyPasswd", { password }),
        /** /User/FriendVerification — 加我为朋友时需要验证 (v1.3.67 新 API; enabled=true 需验证) */
        friendVerification: (enabled) => dispatch("/User/FriendVerification", { enabled }),
        /** /User/AddMeMethods — 添加我的方式 (v1.3.67 新 API; 各字段 true=允许该方式添加) */
        addMeMethods: (opts) => dispatch("/User/AddMeMethods", opts),
    };
}
//# sourceMappingURL=user.js.map