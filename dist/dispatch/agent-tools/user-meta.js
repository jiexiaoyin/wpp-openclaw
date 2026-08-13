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
    getMyProfile: [
        "取自己个人信息.",
        Type.Object({
            wxid: Type.Optional(Type.String({ description: "留空取自己" })),
        }),
        (wxid) => getUserApi().getContractProfile(wxid),
    ],
    updateMyProfile: [
        "修改自己昵称/签名/性别. sex: 0=未知, 1=男, 2=女.",
        Type.Object({
            nickname: Type.Optional(Type.String()),
            signature: Type.Optional(Type.String()),
            sex: Type.Optional(Type.Number()),
        }),
        (nickname, signature, sex) => getUserApi().updateProfile(nickname, signature, sex),
    ],
    uploadHeadImage: [
        "修改自己头像.",
        Type.Object({ imgBase64: Type.String() }),
        (imgBase64) => getUserApi().uploadHeadImage(imgBase64),
    ],
    getMyQRCode: [
        "取个人二维码.",
        Type.Object({}),
        () => getUserApi().getQRCode(),
    ],
    getLoginSafetyInfo: [
        "登录设备管理 (列出已登录设备).",
        Type.Object({}),
        () => getUserApi().getSafetyInfo(),
    ],
    deleteLoginDevice: [
        "删除登录设备.",
        Type.Object({ uuid: Type.String() }),
        (uuid) => getUserApi().delSafetyInfo(uuid),
    ],
    setAlias: [
        "设置自己的微信号 (一次性).",
        Type.Object({ alias: Type.String() }),
        (alias) => getUserApi().setAlisa(alias),
    ],
    setPrivacy: [
        "隐私设置. opt 见 vendor 文档 (e.g. 4=加好友权限).",
        Type.Object({ opt: Type.Number(), value: Type.Number() }),
        (opt, value) => getUserApi().privacySettings(opt, value),
    ],
    changePassword: [
        "修改自己的微信登录密码.",
        Type.Object({ newPwd: Type.String() }),
        (newPwd) => getUserApi().setPasswd(newPwd),
    ],
    verifyPassword: [
        "验证当前密码 (用于敏感操作前).",
        Type.Object({ password: Type.String() }),
        (password) => getUserApi().verifyPasswd(password),
    ],
    reportMotion: [
        "上报步数 (微信运动).",
        Type.Object({ steps: Type.Number() }),
        (steps) => getUserApi().reportMotion(steps),
    ],
    bindMobile: [
        "换绑手机号.",
        Type.Object({ mobile: Type.String(), code: Type.String() }),
        (mobile, code) => getUserApi().bindingMobile(mobile, code),
    ],
    sendMobileVerifyCode: [
        "发送手机验证码.",
        Type.Object({ mobile: Type.String() }),
        (mobile) => getUserApi().sendVerifyMobile(mobile),
    ],
    bindQQ: [
        "绑定 QQ 到当前微信号.",
        Type.Object({ qq: Type.String(), password: Type.String() }),
        (qq, password) => getUserApi().bindQQ(qq, password),
    ],
    bindEmail: [
        "绑定邮箱.",
        Type.Object({ email: Type.String() }),
        (email) => getUserApi().bindingEmail(email),
    ],
    canSetAlias: [
        "检测当前是否可以设置微信号 (GET).",
        Type.Object({}),
        () => getUserApi().checkCanSetAlias(),
    ],
};
