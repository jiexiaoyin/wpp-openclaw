import { postWppJson, getWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppTools(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        cdnDownloadImage: (aesKey, fileId) => dispatch("/Tools/CdnDownloadImage", { fileAesKey: aesKey, fileNo: fileId }),
        downloadFile: (appID, attachId, userName) => dispatch("/Tools/DownloadFile", { appID, attachId, userName }),
        downloadImg: (aesKey, fileId) => dispatch("/Tools/DownloadImg", { aesKey, fileId }),
        downloadVideo: (aesKey, fileId) => dispatch("/Tools/DownloadVideo", { aesKey, fileId }),
        downloadVoice: (aesKey, fileId, durationMs) => dispatch("/Tools/DownloadVoice", { aesKey, fileId, durationMs: durationMs ?? 0 }),
        generatePayQCode: () => getWppJson(ctx.baseUrl, "/Tools/GeneratePayQCode", opts),
        getA8Key: (url) => dispatch("/Tools/GetA8Key", { url }),
        getBandCardList: () => dispatch("/Tools/GetBandCardList", {}),
        getBoundHardDevices: () => dispatch("/Tools/GetBoundHardDevices", {}),
        getCdnDns: () => dispatch("/Tools/GetCdnDns", {}),
        helperVerification: (code) => dispatch("/Tools/HelperVerification", { code }),
        oauthSdkApp: (appId) => dispatch("/Tools/OauthSdkApp", { appId }),
        thirdAppGrant: (appId, scope) => dispatch("/Tools/ThirdAppGrant", { appId, scope }),
        uploadFile: (fileBase64, fileType) => dispatch("/Tools/UploadFile", { fileBase64, fileType }),
        setStep: (steps) => dispatch("/Tools/setproxy", { steps }),
        downloadFileBinary: (fileNo, fileName = "", toWxid = "") => dispatch("/Tools/DownloadFileBinary", { fileNo, fileName, toWxid }),
        downloadVoiceBinary: (msgId, newMsgId, toWxid = "") => dispatch("/Tools/DownloadVoiceBinary", { msg_id: msgId, new_msg_id: newMsgId, to_wxid: toWxid }),
    };
}
