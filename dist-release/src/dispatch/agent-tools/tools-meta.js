import { Type } from "typebox";
import { makeWppTools } from "../../send/tools.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";
function getToolsApi() {
    const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
    if (!state)
        throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
    return makeWppTools({
        baseUrl: state.config.apiBaseUrl,
        tokenKey: state.config.tokenKey,
        authcode: state.authcode,
        accountId: getCurrentAccountId() ?? "default",
    });
}
export const TOOLS_META = {
    downloadImg: [
        "下载高清图片 (从 CDN). fileId 来自消息 content xml 的 image tag.",
        Type.Object({
            aesKey: Type.String(),
            fileId: Type.String(),
        }),
        (aesKey, fileId) => getToolsApi().downloadImg(aesKey, fileId),
    ],
    downloadVideo: [
        "下载视频.",
        Type.Object({
            aesKey: Type.String(),
            fileId: Type.String(),
        }),
        (aesKey, fileId) => getToolsApi().downloadVideo(aesKey, fileId),
    ],
    downloadVoice: [
        "下载语音.",
        Type.Object({
            aesKey: Type.String(),
            fileId: Type.String(),
            durationMs: Type.Optional(Type.Number()),
        }),
        (aesKey, fileId, durationMs) => getToolsApi().downloadVoice(aesKey, fileId, durationMs),
    ],
    downloadFile: [
        "下载文件 (v1.2.1 P1-fix: 需 appID/attachId, vendor v1 文件消息不提供, 可能失败).",
        Type.Object({
            appID: Type.String(),
            attachId: Type.String(),
            userName: Type.String(),
        }),
        (appID, attachId, userName) => getToolsApi().downloadFile(appID, attachId, userName),
    ],
    cdnDownloadImage: [
        "CDN 单独下载高清图片.",
        Type.Object({
            aesKey: Type.String(),
            fileId: Type.String(),
        }),
        (aesKey, fileId) => getToolsApi().cdnDownloadImage(aesKey, fileId),
    ],
    uploadFile: [
        "上传文件. fileType 例: image/png, video/mp4.",
        Type.Object({
            fileBase64: Type.String(),
            fileType: Type.String(),
        }),
        (fileBase64, fileType) => getToolsApi().uploadFile(fileBase64, fileType),
    ],
    getA8Key: [
        "公众号 A8 Key (open 文章用).",
        Type.Object({ url: Type.String() }),
        (url) => getToolsApi().getA8Key(url),
    ],
    generatePayQCode: [
        "生成支付二维码 (GET).",
        Type.Object({}),
        () => getToolsApi().generatePayQCode(),
    ],
    getCdnDns: [
        "获取 CDN 服务器 DNS 信息.",
        Type.Object({}),
        () => getToolsApi().getCdnDns(),
    ],
    getBankCardList: [
        "获取余额和银行卡信息.",
        Type.Object({}),
        () => getToolsApi().getBandCardList(),
    ],
    setStepCount: [
        "修改微信运动步数 (当天步数, 最高 98000).",
        Type.Object({ steps: Type.Number() }),
        (steps) => getToolsApi().setStep(steps),
    ],
    downloadFileBinary: [
        "完整下载微信文件 (二进制). fileNo 来自 file.download_context.",
        Type.Object({
            fileNo: Type.String({ description: "文件 download_context 标识" }),
            fileName: Type.Optional(Type.String()),
        }),
        (fileNo, fileName) => getToolsApi().downloadFileBinary(fileNo, fileName ?? ""),
    ],
    downloadVoiceBinary: [
        "下载微信语音原文件 (二进制). msgId/newMsgId 来自语音消息.",
        Type.Object({
            msgId: Type.Number(),
            newMsgId: Type.String(),
        }),
        (msgId, newMsgId) => getToolsApi().downloadVoiceBinary(msgId, newMsgId),
    ],
};
