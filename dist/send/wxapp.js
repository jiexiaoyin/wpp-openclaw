// src/send/wxapp.ts - Wxapp tag (23 endpoints: 小程序)
// v1.6.0 SWAGGER-323: 本 tag 是字段偏离的重灾区 — 头像/手机号/支付三族此前普遍发的字段
//   在 swagger 里不存在. 头像真实流程 = UploadAvatarImg(jpgLink) → 拿 aFilekey → AddAvatar(appid,nickName,aFilekey);
//   手机号 = AddMobile(appid,mobile,verifyCode) / DelMobile(appid,mobile);
//   支付三件套 (GetUnionPay / GetpullPay / JSGetSessionidQRcode) 共用同一组下单结果字段.
// v1.6.5 (2026-09-13): jsOperateWxData 的 data/opt 与 cloudCallFunction 的 data **真透传** (旧码全丢),
//   getWxAppRecord 改无参 (契约如此). 详见各方法注释里的实测记录.
import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
/** data 字段按契约一律发 **JSON 字符串**: 调用方给对象则序列化, 给字符串则原样透传.
 *  (v1.6.5: 厂商的 data 形参是 string; 旧码把对象 stringify 后丢失了调用方的 data, 见 jsOperateWxData.) */
function jsonData(payload) {
    return typeof payload === "string" ? payload : JSON.stringify(payload);
}
export function makeWppWxapp(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        /** /Wxapp/AddAvatar — 保存小程序头像
         *  v1.6.0: swagger AddAvatarParamDoc {appid*, nickName*, aFilekey*}.
         *  旧码发 `imgBase64` — 本端点是**保存**不是上传, aFilekey 来自 UploadAvatarImg. */
        addAvatar: (appid, nickName, aFilekey) => dispatch("/Wxapp/AddAvatar", { appid, nickName, aFilekey }),
        /** /Wxapp/AddMobile — 小程序绑定手机号
         *  v1.6.0: swagger CheckVerifyCodeDataDoc {appid*, mobile*, verifyCode*}. 旧码发 `phoneNumber`. */
        addMobile: (appid, mobile, verifyCode) => dispatch("/Wxapp/AddMobile", { appid, mobile, verifyCode }),
        /** /Wxapp/CloudCallFunction — 小程序云开发云函数
         *  v1.6.5 (2026-09-13): 契约只有 {appid*, data} —— 旧码发的顶层 `functionName` 不在 swagger 里
         *  (Go 静默忽略未知字段 ⇒ 调用方以为传了函数名, 厂商从未收到). 现把 data 原样透传 (函数名/参数都在 data 内).
         *  ⚠️ 未端到端实测: 手上没有用云开发的 appid, 空 data 打过去是 -10001 invalid request. */
        cloudCallFunction: (appId, payload) => dispatch("/Wxapp/CloudCallFunction", { appid: appId, data: jsonData(payload) }),
        /** /Wxapp/DelMobile — v1.6.0: swagger DelMobileDataDoc {appid*, mobile*}. 旧码发 `phoneId`. */
        delMobile: (appid, mobile) => dispatch("/Wxapp/DelMobile", { appid, mobile }),
        /** /Wxapp/DellAvatar — v1.6.0: swagger DellAvatarParamDoc {avatarId*(integer)}. 旧码发空体. */
        dellAvatar: (avatarId) => dispatch("/Wxapp/DellAvatar", { avatarId: Number(avatarId) }),
        /** /Wxapp/GETCreditScoreParam */
        getCreditScoreParam: () => dispatch("/Wxapp/GETCreditScoreParam", {}),
        /** /Wxapp/GetAllMobile — v1.6.0: swagger {appid*}. 旧码发空体. */
        getAllMobile: (appid) => dispatch("/Wxapp/GetAllMobile", { appid }),
        /** /Wxapp/GetRandomAvatar — v1.6.0: swagger DefaultParamDoc {appid*}. 旧码发空体. */
        getRandomAvatar: (appid) => dispatch("/Wxapp/GetRandomAvatar", { appid }),
        /** /Wxapp/GetUnionPay — 云闪付支付
         *  v1.6.0: swagger UnionpayDataDoc {appid*, sessionid*, timeStamp*, nonceStr*, package*, paySign*}.
         *  旧码只发 `orderId` (该字段 swagger 无) — 参数来自小程序支付下单结果. */
        getUnionPay: (p) => dispatch("/Wxapp/GetUnionPay", { ...p }),
        /** /Wxapp/GetUserOpenId
         *  v1.6.0: swagger GetUserOpenIdParamDoc {toWxId*(目标用户 username), appid*}. 旧码只发 `appId`. */
        getUserOpenId: (toWxId, appid) => dispatch("/Wxapp/GetUserOpenId", { toWxId, appid }),
        /** /Wxapp/GetWxAppRecord — 当前账号最近使用的小程序记录
         *  v1.6.5: 契约**无参** (body 传空对象). 旧码发的 appId 厂商不认 —— 实测带/不带该字段响应逐字段相同.
         *  实测返回 Data.historyList[{username: gh_xxx@app, updateTime, versionType}] (本账号 6 条). */
        getWxAppRecord: () => dispatch("/Wxapp/GetWxAppRecord", {}),
        /** /Wxapp/JSGetSessionid
         *  ⚠️ 旧码多发一个 `url` — 契约只有 {appid} (见 swagger POST_Wxapp_JSGetSessionid). 本次未改:
         *  无实测证据判定厂商是否吃这个未文档化字段, 留待验证后再动. */
        jsGetSessionid: (appId, url) => dispatch("/Wxapp/JSGetSessionid", { appId, url }),
        /** /Wxapp/JSLogin */
        jsLogin: (appId) => dispatch("/Wxapp/JSLogin", { appId }),
        /** /Wxapp/JSOperateWxData — 小程序 JSAPI **通用通道** (2026-09-13 实测可用, v1.6.5 接通)
         *  data = JSAPI 请求 JSON `{"api_name":"...","data":{...},"opt":1}`; opt = 1 写入 / 2 读取.
         *  实测三态 (appid 苏新消费, 本机直连厂商):
         *    · data={"api_name":"webapi_getwxaasyncsecinfo","data":{},"opt":1} ⇒ errcode 0 + base64 载荷
         *      (解出来是 wxa_client_check / wxa_input_auth / api_cooldown_list 等微信侧配置)
         *    · data="{}" ⇒ jsapiBaseresponse.errmsg = "invalid request" (-10001)
         *    · data={"api_name":"login"} ⇒ "invalid api_name" (-12003)
         *  ⇒ 成败只看 data 里的 api_name. ⚠️ 旧码把 data 整个丢了 (meta 恒传 {}), 这条通道在助手侧 100% 走不通. */
        jsOperateWxData: (appId, payload, opt) => dispatch("/Wxapp/JSOperateWxData", {
            appid: appId,
            data: jsonData(payload),
            ...(opt === undefined ? {} : { opt }),
        }),
        /** /Wxapp/UploadAvatarImg — 上传小程序头像图片
         *  v1.6.0: swagger AddAvatarImgParamDoc {appid*, jpgLink*(可直接访问的 JPG 图片地址)}.
         *  旧码发 `imgBase64` — 厂商要的是 **URL** 不是 base64. 返回的 aFilekey 供 AddAvatar 用. */
        uploadAvatarImg: (appid, jpgLink) => dispatch("/Wxapp/UploadAvatarImg", { appid, jpgLink }),
        /** /Wxapp/Verifyplugin */
        verifyPlugin: (appId, url) => dispatch("/Wxapp/Verifyplugin", { appId, url }),
        /** /Wxapp/Wxapp/AddWxAppRecord (v1.2.1 swagger-alignment: AddWxAppRecordParamDoc {username}) */
        addWxAppRecord: (username) => dispatch("/Wxapp/Wxapp/AddWxAppRecord", { username }),
        /** /Wxapp/Wxapp/GetpullPay — 确认小程序支付
         *  v1.6.0: swagger GetpullPayParamDoc = 支付六件套 (同 GetUnionPay). 旧码只发 `appId`. */
        getPullPay: (p) => dispatch("/Wxapp/Wxapp/GetpullPay", { ...p }),
        /** /Wxapp/Wxapp/JSGetSessionidQRcode — 获取小程序支付二维码
         *  v1.6.0: swagger SessionidQRParamDoc = 支付六件套 (同 GetUnionPay). 旧码发 {appId, url}. */
        jsGetSessionidQRcode: (p) => dispatch("/Wxapp/Wxapp/JSGetSessionidQRcode", { ...p }),
        /** /Wxapp/Wxapp/QrcodeAuthLogin — 确认扫码授权登录
         *  v1.6.0: swagger QrcodeAuthLoginParamDoc {uuid*(获取二维码时返回的 UUID)}. 旧码发 `qrcodeUrl`. */
        qrcodeAuthLogin: (uuid) => dispatch("/Wxapp/Wxapp/QrcodeAuthLogin", { uuid }),
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