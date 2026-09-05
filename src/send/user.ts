// src/send/user.ts - User tag (18 endpoints: profile + account management)

import { postWppJson, getWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppUser(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /User/BindQQ — 绑定QQ */
    bindQQ: (qq: string, password: string) =>
      dispatch("/User/BindQQ", { qq, password }),

    /** /User/BindingEmail — 绑定邮箱 */
    bindingEmail: (email: string) => dispatch("/User/BindingEmail", { email }),

    /** /User/BindingMobile — 换绑手机号 */
    bindingMobile: (mobile: string, code: string) =>
      dispatch("/User/BindingMobile", { mobile, code }),

    /** /User/CheckCanSetAlias — GET 检测环境 */
    checkCanSetAlias: () => getWppJson(ctx.baseUrl, "/User/CheckCanSetAlias", opts),

    /** /User/DelSafetyInfo — 删除登录设备 */
    delSafetyInfo: (uuid: string) =>
      dispatch("/User/DelSafetyInfo", { uuid }),


    /** /User/GetContractProfile — 取个人信息 */
    getContractProfile: (wxid?: string) =>
      dispatch("/User/GetContractProfile", { wxid: wxid ?? "" }),

    /** /User/GetOnlineInfo — GET 在线信息 */
    getOnlineInfo: () => getWppJson(ctx.baseUrl, "/User/GetOnlineInfo", opts),

    /** /User/GetQRCode — 个人二维码 */
    getQRCode: () => dispatch("/User/GetQRCode", {}),

    /** /User/GetSafetyInfo — 登录设备管理 */
    getSafetyInfo: () => dispatch("/User/GetSafetyInfo", {}),

    /** /User/PrivacySettings — 隐私设置 */
    privacySettings: (opt: number, value: number) =>
      dispatch("/User/PrivacySettings", { opt, value }),

    /** /User/ReportMotion — ReportMotion */
    reportMotion: (steps: number) =>
      dispatch("/User/ReportMotion", { steps }),

    /** /User/SendVerifyMobile — 发送手机验证码 */
    sendVerifyMobile: (mobile: string) =>
      dispatch("/User/SendVerifyMobile", { mobile }),

    /** /User/SetAlisa — 设置微信号 */
    setAlisa: (alias: string) => dispatch("/User/SetAlisa", { alias }),

    /** /User/SetPasswd — 修改密码 */
    setPasswd: (newPwd: string) => dispatch("/User/SetPasswd", { newPwd }),

    /** /User/UpdateProfile — 修改个人信息 (swagger User.UpdateProfileParamDoc {nickName, signature, sex, city, country, province}) */
    updateProfile: (nickname?: string, signature?: string, sex?: number) =>
      dispatch("/User/UpdateProfile", {
        nickName: nickname ?? "",
        signature: signature ?? "",
        sex: sex ?? 0,
        city: "",
        country: "",
        province: "",
      }),

    /** /User/UploadHeadImage — 修改头像 */
    uploadHeadImage: (imgBase64: string) =>
      dispatch("/User/UploadHeadImage", { imgBase64 }),

    /** /User/VerifyPasswd — 验证密码 */
    verifyPasswd: (password: string) =>
      dispatch("/User/VerifyPasswd", { password }),

    /** /User/FriendVerification — 加我为朋友时需要验证 (v1.3.67 新 API; enabled=true 需验证) */
    friendVerification: (enabled: boolean) =>
      dispatch("/User/FriendVerification", { enabled }),

    /** /User/AddMeMethods — 添加我的方式 (v1.3.67 新 API; 各字段 true=允许该方式添加) */
    addMeMethods: (opts: {
      phone?: boolean; wechat_id?: boolean; group_chat?: boolean; qr_code?: boolean; contact_card?: boolean;
    }) => dispatch("/User/AddMeMethods", opts),
  };
}

export type WppUserApi = ReturnType<typeof makeWppUser>;
