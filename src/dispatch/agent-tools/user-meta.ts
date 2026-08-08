// src/dispatch/agent-tools/user-meta.ts - User tag (18)

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppUser } from "../../send/user.js";
import type { WppAccountCtx } from "../../send/factory.js";

const ctx: WppAccountCtx = { baseUrl: "", tokenKey: "", accountId: "" };
const api = makeWppUser(ctx);

export const USER_META: ToolMeta = {
  /** /User/GetContractProfile */
  getMyProfile: [
    "取自己个人信息.",
    Type.Object({
      wxid: Type.Optional(Type.String({ description: "留空取自己" })),
    }),
    api.getContractProfile,
  ],
  /** /User/UpdateProfile */
  updateMyProfile: [
    "修改自己昵称/签名/性别. sex: 0=未知, 1=男, 2=女.",
    Type.Object({
      nickname: Type.Optional(Type.String()),
      signature: Type.Optional(Type.String()),
      sex: Type.Optional(Type.Number()),
    }),
    api.updateProfile,
  ],
  /** /User/UploadHeadImage */
  uploadHeadImage: [
    "修改自己头像.",
    Type.Object({ imgBase64: Type.String() }),
    api.uploadHeadImage,
  ],
  /** /User/GetQRCode */
  getMyQRCode: [
    "取个人二维码.",
    Type.Object({}),
    api.getQRCode,
  ],
  /** /User/GetSafetyInfo */
  getLoginSafetyInfo: [
    "登录设备管理 (列出已登录设备).",
    Type.Object({}),
    api.getSafetyInfo,
  ],
  /** /User/DelSafetyInfo */
  deleteLoginDevice: [
    "删除登录设备.",
    Type.Object({ uuid: Type.String() }),
    api.delSafetyInfo,
  ],
  /** /User/SetAlisa */
  setAlias: [
    "设置自己的微信号 (一次性).",
    Type.Object({ alias: Type.String() }),
    api.setAlisa,
  ],
  /** /User/PrivacySettings */
  setPrivacy: [
    "隐私设置. opt 见 vendor 文档 (e.g. 4=加好友权限).",
    Type.Object({ opt: Type.Number(), value: Type.Number() }),
    api.privacySettings,
  ],
  /** /User/SetPasswd */
  changePassword: [
    "修改自己的微信登录密码.",
    Type.Object({ newPwd: Type.String() }),
    api.setPasswd,
  ],
  /** /User/VerifyPasswd */
  verifyPassword: [
    "验证当前密码 (用于敏感操作前).",
    Type.Object({ password: Type.String() }),
    api.verifyPasswd,
  ],
  /** /User/ReportMotion */
  reportMotion: [
    "上报步数 (微信运动).",
    Type.Object({ steps: Type.Number() }),
    api.reportMotion,
  ],
  /** /User/BindingMobile */
  bindMobile: [
    "换绑手机号.",
    Type.Object({ mobile: Type.String(), code: Type.String() }),
    api.bindingMobile,
  ],
  /** /User/SendVerifyMobile */
  sendMobileVerifyCode: [
    "发送手机验证码.",
    Type.Object({ mobile: Type.String() }),
    api.sendVerifyMobile,
  ],
  /** /User/BindQQ */
  bindQQ: [
    "绑定 QQ 到当前微信号.",
    Type.Object({ qq: Type.String(), password: Type.String() }),
    api.bindQQ,
  ],
  /** /User/BindingEmail */
  bindEmail: [
    "绑定邮箱.",
    Type.Object({ email: Type.String() }),
    api.bindingEmail,
  ],
  /** /User/CheckCanSetAlias (GET) */
  canSetAlias: [
    "检测当前是否可以设置微信号 (GET).",
    Type.Object({}),
    api.checkCanSetAlias,
  ],
};
