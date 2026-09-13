// src/send/user.ts - User tag (18 endpoints: profile + account management)
// v1.6.0 SWAGGER-323: 按容器 swagger (323 paths) 逐条对齐必填字段名.
//   以下 7 个端点的字段名与 swagger 必填项**真正不同名** (Go encoding/json 大小写不敏感也救不了,
//   旧码发过去 = 厂商收到零值), 全部改齐: SetAlisa / BindQQ / PrivacySettings / ReportMotion /
//   BindingMobile / SetPasswd / UploadHeadImage.

import { postWppJson, getWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppUser(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /User/BindQQ — 绑定QQ
     *  swagger User.BindQQParamDoc {account*:integer, password*}. v1.6.0: 旧码发 `qq`, 且是 integer
     *  字段 — 传字符串会触发新 vendor 的 json unmarshal 错误 (同 /Favor/Del 的 favId 先例). */
    bindQQ: (qq: string | number, password: string) =>
      dispatch("/User/BindQQ", { account: Number(qq), password }),

    /** /User/BindingEmail — 绑定邮箱 */
    bindingEmail: (email: string) => dispatch("/User/BindingEmail", { email }),

    /** /User/BindingMobile — 换绑手机号
     *  swagger User.BindMobileParamDoc {mobile*, verifycode*}. v1.6.0: 旧码发 `code`. */
    bindingMobile: (mobile: string, code: string) =>
      dispatch("/User/BindingMobile", { mobile, verifycode: code }),

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

    /** /User/PrivacySettings — 隐私设置
     *  swagger User.PrivacySettingsParamDoc {function*, value*}. v1.6.0: 旧码发 `opt`. */
    privacySettings: (opt: number, value: number) =>
      dispatch("/User/PrivacySettings", { function: opt, value }),

    /** /User/ReportMotion — 上报设备运动步数
     *  swagger User.ReportMotionParamDoc {deviceId*, deviceType*, stepCount*}. v1.6.0: 旧码只发 `steps`.
     *  deviceId = 当前登录设备标识, deviceType 默认 "ipad" (与 /Login/GetQR 口径一致). */
    reportMotion: (steps: number, deviceId = "", deviceType = "ipad") =>
      dispatch("/User/ReportMotion", { deviceId, deviceType, stepCount: steps }),

    /** /User/SendVerifyMobile — 发送手机验证码 */
    sendVerifyMobile: (mobile: string) =>
      dispatch("/User/SendVerifyMobile", { mobile }),

    /** /User/SetAlisa — 设置微信号
     *  swagger User.SetAlisaParamDoc {alisa*}. v1.6.0: **厂商自己拼错了** (alisa), 旧码发正确的
     *  `alias` 反而对不上 — 按厂商拼写发送, 保留对外的 alias 参数名. */
    setAlisa: (alias: string) => dispatch("/User/SetAlisa", { alisa: alias }),

    /** /User/SetPasswd — 修改密码
     *  swagger User.NewSetPasswdParamDoc {newPassword*, ticket*}. v1.6.0: 旧码只发 `newPwd` 且无 ticket.
     *  ticket = /User/VerifyPasswd 返回的修改凭据 — 所以改密码必须先 verifyPasswd 拿票据. */
    setPasswd: (newPwd: string, ticket: string) =>
      dispatch("/User/SetPasswd", { newPassword: newPwd, ticket }),

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

    /** /User/UploadHeadImage — 修改头像
     *  swagger User.UploadHeadImageParamDoc {base64*}. v1.6.0: 旧码发 `imgBase64`. */
    uploadHeadImage: (imgBase64: string) =>
      dispatch("/User/UploadHeadImage", { base64: imgBase64 }),

    /** /User/VerifyPasswd — 验证密码 (返回的 ticket 供 /User/SetPasswd 用) */
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
