// src/send/tools.ts - Tools tag (15 endpoints: CDN downloads, payments, util)

import { postWppJson, getWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppTools(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /Tools/CdnDownloadImage — swagger Tools.CdnDownloadImageParamDoc {file_aes_key*, file_no*} */
    cdnDownloadImage: (fileAesKey: string, fileNo: string) =>
      dispatch("/Tools/CdnDownloadImage", { file_aes_key: fileAesKey, file_no: fileNo }),

    /** /Tools/DownloadFile — swagger Tools.DownloadAppAttachParamDoc {app_id, attach_id*, data_len*, section, user_name*} */
    downloadFile: (attachId: string, userName: string, dataLen: number, appId?: string) =>
      dispatch("/Tools/DownloadFile", {
        app_id: appId ?? "",
        attach_id: attachId,
        data_len: dataLen,
        section: { start_pos: 0, data_len: dataLen },
        user_name: userName,
      }),

    /** /Tools/DownloadImg — swagger Tools.DownloadParamDoc {to_wxid*, msg_id*, data_len*, compress_type, section} */
    downloadImg: (toWxid: string, msgId: number, dataLen: number, compressType?: number) =>
      dispatch("/Tools/DownloadImg", {
        to_wxid: toWxid,
        msg_id: msgId,
        data_len: dataLen,
        compress_type: compressType ?? 0,
        section: { start_pos: 0, data_len: dataLen },
      }),

    /** /Tools/DownloadVideo — swagger Tools.DownloadParamDoc (同 DownloadImg) */
    downloadVideo: (toWxid: string, msgId: number, dataLen: number, compressType?: number) =>
      dispatch("/Tools/DownloadVideo", {
        to_wxid: toWxid,
        msg_id: msgId,
        data_len: dataLen,
        compress_type: compressType ?? 0,
        section: { start_pos: 0, data_len: dataLen },
      }),

    /** /Tools/DownloadVoice — swagger Tools.DownloadVoiceParamDoc {fromUserName*, msgId*, length*, bufid} */
    downloadVoice: (fromUserName: string, msgId: number, length: number, bufid?: string) =>
      dispatch("/Tools/DownloadVoice", { fromUserName, msgId, length, bufid: bufid ?? "" }),

    /** /Tools/GeneratePayQCode — GET 生成支付二维码 */
    generatePayQCode: () => getWppJson(ctx.baseUrl, "/Tools/GeneratePayQCode", opts),

    /** /Tools/GetA8Key */
    getA8Key: (url: string) => dispatch("/Tools/GetA8Key", { url }),

    /** /Tools/GetBandCardList */
    getBandCardList: () => dispatch("/Tools/GetBandCardList", {}),

    /** /Tools/GetBoundHardDevices */
    getBoundHardDevices: () => dispatch("/Tools/GetBoundHardDevices", {}),

    /** /Tools/GetCdnDns */
    getCdnDns: () => dispatch("/Tools/GetCdnDns", {}),

    /** /Tools/HelperVerification */
    helperVerification: (code: string) =>
      dispatch("/Tools/HelperVerification", { code }),

    /** /Tools/OauthSdkApp */
    oauthSdkApp: (appId: string) => dispatch("/Tools/OauthSdkApp", { appId }),

    /** /Tools/ThirdAppGrant */
    thirdAppGrant: (appId: string, scope: string) =>
      dispatch("/Tools/ThirdAppGrant", { appId, scope }),

    /** /Tools/UploadFile — swagger Tools.UploadParamDoc {base64*} */
    uploadFile: (base64: string) => dispatch("/Tools/UploadFile", { base64 }),

    /** /Tools/setproxy — 修改微信步数. 保持用 setproxy (实测 2026-08-20 新 vendor Code:1 可用).
     *  新端点 /Tools/SetStep 有 vendor bug (Step.go:107 index out of range panic → HTTP 500), 勿切. */
    setStep: (steps: number) => dispatch("/Tools/setproxy", { steps }),

    /**
     * v1.3.25 SWAGGER-254: /Tools/DownloadFileBinary — 完整下载微信文件 (二进制).
     * swagger Tools.BinaryFileDownloadParamDoc {app_id, attach_id*, data_len*, file_name, section, user_name*}
     */
    downloadFileBinary: (attachId: string, userName: string, dataLen: number, fileName = "", appId?: string) =>
      dispatch("/Tools/DownloadFileBinary", {
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
    downloadVoiceBinary: (msgId: number, newMsgId: string, toUserName = "", fromUserName = "", length = 0, format = 4) =>
      dispatch("/Tools/DownloadVoiceBinary", {
        msg_id: msgId,
        new_msg_id: newMsgId,
        to_user_name: toUserName,
        from_user_name: fromUserName,
        length,
        format,
      }),
  };
}

export type WppToolsApi = ReturnType<typeof makeWppTools>;
