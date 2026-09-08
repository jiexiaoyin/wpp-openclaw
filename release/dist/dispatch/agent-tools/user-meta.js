// src/dispatch/agent-tools/user-meta.ts - User tag (18)
// v1.3.18 P1-核心1 fix (2026-08-10): 改成 lazy-evaluate ctx 模式
import { Type } from "typebox";
import { makeWppUser } from "../../send/user.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";
function getUserApi() {
    const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
    if (!state)
        throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
    return makeWppUser({
        baseUrl: state.config.apiBaseUrl,
        tokenKey: state.config.tokenKey,
        authcode: state.authcode,
        accountId: getCurrentAccountId() ?? "default",
    });
}
export const USER_META = {
    /** /User/GetContractProfile */
    getMyProfile: [
        "取自己个人信息.",
        Type.Object({
            wxid: Type.Optional(Type.String({ description: "留空取自己" })),
        }),
        (wxid) => getUserApi().getContractProfile(wxid),
    ],
    /** /User/UpdateProfile */
    updateMyProfile: [
        "修改自己昵称/签名/性别. sex: 0=未知, 1=男, 2=女.",
        Type.Object({
            nickname: Type.Optional(Type.String()),
            signature: Type.Optional(Type.String()),
            sex: Type.Optional(Type.Number()),
        }),
        (nickname, signature, sex) => getUserApi().updateProfile(nickname, signature, sex),
    ],
    /** /User/UploadHeadImage */
    uploadHeadImage: [
        "修改自己头像.",
        Type.Object({ imgBase64: Type.String() }),
        (imgBase64) => getUserApi().uploadHeadImage(imgBase64),
    ],
    /** /User/GetQRCode */
    getMyQRCode: [
        "取个人二维码.",
        Type.Object({}),
        () => getUserApi().getQRCode(),
    ],
    /** /User/GetSafetyInfo */
    getLoginSafetyInfo: [
        "登录设备管理 (列出已登录设备).",
        Type.Object({}),
        () => getUserApi().getSafetyInfo(),
    ],
    /** /User/DelSafetyInfo */
    deleteLoginDevice: [
        "删除登录设备.",
        Type.Object({ uuid: Type.String() }),
        (uuid) => getUserApi().delSafetyInfo(uuid),
    ],
    /** /User/SetAlisa */
    setAlias: [
        "设置自己的微信号 (一次性).",
        Type.Object({ alias: Type.String() }),
        (alias) => getUserApi().setAlisa(alias),
    ],
    /** /User/PrivacySettings */
    setPrivacy: [
        "隐私设置. opt 见 vendor 文档 (e.g. 4=加好友权限).",
        Type.Object({ opt: Type.Number(), value: Type.Number() }),
        (opt, value) => getUserApi().privacySettings(opt, value),
    ],
    /** /User/SetPasswd */
    changePassword: [
        "修改自己的微信登录密码.",
        Type.Object({ newPwd: Type.String() }),
        (newPwd) => getUserApi().setPasswd(newPwd),
    ],
    /** /User/VerifyPasswd */
    verifyPassword: [
        "验证当前密码 (用于敏感操作前).",
        Type.Object({ password: Type.String() }),
        (password) => getUserApi().verifyPasswd(password),
    ],
    /** /User/ReportMotion */
    reportMotion: [
        "上报步数 (微信运动).",
        Type.Object({ steps: Type.Number() }),
        (steps) => getUserApi().reportMotion(steps),
    ],
    /** /User/BindingMobile */
    bindMobile: [
        "换绑手机号.",
        Type.Object({ mobile: Type.String(), code: Type.String() }),
        (mobile, code) => getUserApi().bindingMobile(mobile, code),
    ],
    /** /User/SendVerifyMobile */
    sendMobileVerifyCode: [
        "发送手机验证码.",
        Type.Object({ mobile: Type.String() }),
        (mobile) => getUserApi().sendVerifyMobile(mobile),
    ],
    /** /User/BindQQ */
    bindQQ: [
        "绑定 QQ 到当前微信号.",
        Type.Object({ qq: Type.String(), password: Type.String() }),
        (qq, password) => getUserApi().bindQQ(qq, password),
    ],
    /** /User/BindingEmail */
    bindEmail: [
        "绑定邮箱.",
        Type.Object({ email: Type.String() }),
        (email) => getUserApi().bindingEmail(email),
    ],
    /** /User/CheckCanSetAlias (GET) */
    canSetAlias: [
        "检测当前是否可以设置微信号 (GET).",
        Type.Object({}),
        () => getUserApi().checkCanSetAlias(),
    ],
    /** /User/FriendVerification — 加我为朋友需验证 (v1.3.67 新 API) */
    friendVerification: [
        "设置「加我为朋友时需要验证」. enabled=true 需验证, false 关闭.",
        Type.Object({ enabled: Type.Boolean() }),
        (enabled) => getUserApi().friendVerification(enabled),
    ],
    /** /User/AddMeMethods — 添加我的方式 (v1.3.67 新 API) */
    addMeMethods: [
        "设置「添加我的方式」(微信: 我→设置→朋友权限→添加我的方式). 只传要修改的字段, true=允许该方式添加.",
        Type.Object({
            phone: Type.Optional(Type.Boolean()),
            wechat_id: Type.Optional(Type.Boolean()),
            group_chat: Type.Optional(Type.Boolean()),
            qr_code: Type.Optional(Type.Boolean()),
            contact_card: Type.Optional(Type.Boolean()),
        }),
        (opts) => getUserApi().addMeMethods(opts),
    ],
};
//# sourceMappingURL=user-meta.js.map