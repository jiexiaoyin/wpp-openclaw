// src/send/tools.ts - Tools tag (15 endpoints: CDN downloads, payments, util)
import { postWppJson, getWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppTools(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        /** /Tools/CdnDownloadImage — swagger Tools.CdnDownloadImageParamDoc {file_aes_key*, file_no*} */
        cdnDownloadImage: (fileAesKey, fileNo) => dispatch("/Tools/CdnDownloadImage", { file_aes_key: fileAesKey, file_no: fileNo }),
        /** /Tools/DownloadFile — swagger Tools.DownloadAppAttachParamDoc {app_id, attach_id*, data_len*, section, user_name*} */
        downloadFile: (attachId, userName, dataLen, appId) => dispatch("/Tools/DownloadFile", {
            app_id: appId ?? "",
            attach_id: attachId,
            data_len: dataLen,
            section: { start_pos: 0, data_len: dataLen },
            user_name: userName,
        }),
        /** /Tools/DownloadImg — swagger Tools.DownloadParamDoc {to_wxid*, msg_id*, data_len*, compress_type, section} */
        downloadImg: (toWxid, msgId, dataLen, compressType) => dispatch("/Tools/DownloadImg", {
            to_wxid: toWxid,
            msg_id: msgId,
            data_len: dataLen,
            compress_type: compressType ?? 0,
            section: { start_pos: 0, data_len: dataLen },
        }),
        /** /Tools/DownloadVideo — swagger Tools.DownloadParamDoc (同 DownloadImg) */
        downloadVideo: (toWxid, msgId, dataLen, compressType) => dispatch("/Tools/DownloadVideo", {
            to_wxid: toWxid,
            msg_id: msgId,
            data_len: dataLen,
            compress_type: compressType ?? 0,
            section: { start_pos: 0, data_len: dataLen },
        }),
        /** /Tools/DownloadVoice — swagger Tools.DownloadVoiceParamDoc {fromUserName*, msgId*, length*, bufid} */
        downloadVoice: (fromUserName, msgId, length, bufid) => dispatch("/Tools/DownloadVoice", { fromUserName, msgId, length, bufid: bufid ?? "" }),
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
        /** /Tools/UploadFile — swagger Tools.UploadParamDoc {base64*} */
        uploadFile: (base64) => dispatch("/Tools/UploadFile", { base64 }),
        /** /Tools/setproxy — 修改微信步数. 保持用 setproxy (实测 2026-08-20 新 vendor Code:1 可用).
         *  新端点 /Tools/SetStep 有 vendor bug (Step.go:107 index out of range panic → HTTP 500), 勿切. */
        setStep: (steps) => dispatch("/Tools/setproxy", { steps }),
        /**
         * v1.3.25 SWAGGER-254: /Tools/DownloadFileBinary — 完整下载微信文件 (二进制).
         * swagger Tools.BinaryFileDownloadParamDoc {app_id, attach_id*, data_len*, file_name, section, user_name*}
         */
        downloadFileBinary: (attachId, userName, dataLen, fileName = "", appId) => dispatch("/Tools/DownloadFileBinary", {
            app_id: appId ?? "",
            attach_id: attachId,
            data_len: dataLen,
            file_name: fileName,
            section: { start_pos: 0, data_len: dataLen },
            user_name: userName,
        }),
        /**
         * v1.3.25 SWAGGER-254: /Tools/DownloadVoiceBinary — 下载微信语音原文件 (二进制).
         * swagger Tools.BinaryVoiceDownloadParamDoc (无必填; 注意 to_user_name 非 to_wxid)
         */
        downloadVoiceBinary: (msgId, newMsgId, toUserName = "", fromUserName = "", length = 0, format = 4) => dispatch("/Tools/DownloadVoiceBinary", {
            msg_id: msgId,
            new_msg_id: newMsgId,
            to_user_name: toUserName,
            from_user_name: fromUserName,
            length,
            format,
        }),
    };
}
//# sourceMappingURL=tools.js.map