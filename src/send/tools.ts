// src/send/tools.ts - Tools tag (15 endpoints: CDN downloads, payments, util)

import { postWppJson, getWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppTools(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /Tools/CdnDownloadImage — CDN 下载高清图片 (v1.2.1 P1-fix: 字段对齐 swagger {fileAesKey, fileNo}) */
    cdnDownloadImage: (aesKey: string, fileId: string) =>
      dispatch("/Tools/CdnDownloadImage", { fileAesKey: aesKey, fileNo: fileId }),

    /** /Tools/DownloadFile — 文件下载 (v1.2.1 P1-fix: swagger 字段是 appID/attachId, 非 aesKey/fileId) */
    downloadFile: (appID: string, attachId: string, userName: string) =>
      dispatch("/Tools/DownloadFile", { appID, attachId, userName }),

    /** /Tools/DownloadImg */
    downloadImg: (aesKey: string, fileId: string) =>
      dispatch("/Tools/DownloadImg", { aesKey, fileId }),

    /** /Tools/DownloadVideo */
    downloadVideo: (aesKey: string, fileId: string) =>
      dispatch("/Tools/DownloadVideo", { aesKey, fileId }),

    /** /Tools/DownloadVoice */
    downloadVoice: (aesKey: string, fileId: string, durationMs?: number) =>
      dispatch("/Tools/DownloadVoice", { aesKey, fileId, durationMs: durationMs ?? 0 }),

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

    /** /Tools/UploadFile */
    uploadFile: (fileBase64: string, fileType: string) =>
      dispatch("/Tools/UploadFile", { fileBase64, fileType }),

    /** /Tools/setproxy — 修改微信步数 */
    setStep: (steps: number) => dispatch("/Tools/setproxy", { steps }),

    /**
     * v1.3.25 SWAGGER-254: /Tools/DownloadFileBinary — 完整下载微信文件 (二进制).
     * (media-enrich 已直接用, 补 wrapper + 注册)
     */
    downloadFileBinary: (fileNo: string, fileName = "", toWxid = "") =>
      dispatch("/Tools/DownloadFileBinary", { fileNo, fileName, toWxid }),

    /**
     * v1.3.25 SWAGGER-254: /Tools/DownloadVoiceBinary — 下载微信语音原文件 (二进制).
     * (media-enrich 已直接用, 补 wrapper + 注册)
     */
    downloadVoiceBinary: (msgId: number, newMsgId: string, toWxid = "") =>
      dispatch("/Tools/DownloadVoiceBinary", { msg_id: msgId, new_msg_id: newMsgId, to_wxid: toWxid }),
  };
}

export type WppToolsApi = ReturnType<typeof makeWppTools>;
