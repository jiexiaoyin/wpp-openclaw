// src/send/tools.ts - Tools tag (15 endpoints: CDN downloads, payments, util)
import { postWppJson, getWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppTools(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        /** /Tools/CdnDownloadImage — CDN 下载高清图片 (v1.2.1 P1-fix: 字段对齐 swagger {fileAesKey, fileNo}) */
        cdnDownloadImage: (aesKey, fileId) => dispatch("/Tools/CdnDownloadImage", { fileAesKey: aesKey, fileNo: fileId }),
        /** /Tools/DownloadFile — 文件下载 (v1.2.1 P1-fix: swagger 字段是 appID/attachId, 非 aesKey/fileId) */
        downloadFile: (appID, attachId, userName) => dispatch("/Tools/DownloadFile", { appID, attachId, userName }),
        /** /Tools/DownloadImg */
        downloadImg: (aesKey, fileId) => dispatch("/Tools/DownloadImg", { aesKey, fileId }),
        /** /Tools/DownloadVideo */
        downloadVideo: (aesKey, fileId) => dispatch("/Tools/DownloadVideo", { aesKey, fileId }),
        /** /Tools/DownloadVoice */
        downloadVoice: (aesKey, fileId, durationMs) => dispatch("/Tools/DownloadVoice", { aesKey, fileId, durationMs: durationMs ?? 0 }),
        /** /Tools/GeneratePayQCode — GET 生成支付二维码 */
        generatePayQCode: () => getWppJson(ctx.baseUrl, "/Tools/GeneratePayQCode", opts),
        /** /Tools/GetA8Key */
        getA8Key: (url) => dispatch("/Tools/GetA8Key", { url }),
        /** /Tools/GetBandCardList */
        getBandCardList: () => dispatch("/Tools/GetBandCardList", {}),
        /** /Tools/GetBoundHardDevices */
        getBoundHardDevices: () => dispatch("/Tools/GetBoundHardDevices", {}),
        /** /Tools/GetCdnDns */
        getCdnDns: () => dispatch("/Tools/GetCdnDns", {}),
        /** /Tools/HelperVerification */
        helperVerification: (code) => dispatch("/Tools/HelperVerification", { code }),
        /** /Tools/OauthSdkApp */
        oauthSdkApp: (appId) => dispatch("/Tools/OauthSdkApp", { appId }),
        /** /Tools/ThirdAppGrant */
        thirdAppGrant: (appId, scope) => dispatch("/Tools/ThirdAppGrant", { appId, scope }),
        /** /Tools/UploadFile */
        uploadFile: (fileBase64, fileType) => dispatch("/Tools/UploadFile", { fileBase64, fileType }),
        /** /Tools/setproxy — 修改微信步数. 保持用 setproxy (实测 2026-08-20 新 vendor Code:1 可用).
         *  新端点 /Tools/SetStep 有 vendor bug (Step.go:107 index out of range panic → HTTP 500), 勿切. */
        setStep: (steps) => dispatch("/Tools/setproxy", { steps }),
        /**
         * v1.3.25 SWAGGER-254: /Tools/DownloadFileBinary — 完整下载微信文件 (二进制).
         * (media-enrich 已直接用, 补 wrapper + 注册)
         */
        downloadFileBinary: (fileNo, fileName = "", toWxid = "") => dispatch("/Tools/DownloadFileBinary", { fileNo, fileName, toWxid }),
        /**
         * v1.3.25 SWAGGER-254: /Tools/DownloadVoiceBinary — 下载微信语音原文件 (二进制).
         * (media-enrich 已直接用, 补 wrapper + 注册)
         */
        downloadVoiceBinary: (msgId, newMsgId, toWxid = "") => dispatch("/Tools/DownloadVoiceBinary", { msg_id: msgId, new_msg_id: newMsgId, to_wxid: toWxid }),
    };
}
//# sourceMappingURL=tools.js.map