// src/dispatch/agent-tools/tools-meta.ts - Tools tag (15)
// v1.3.18 P1-核心1 fix (2026-08-10): 改成 lazy-evaluate ctx 模式
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
    /** /Tools/DownloadImg — swagger {to_wxid, msg_id, data_len, compress_type, section} */
    downloadImg: [
        "下载图片 (分片). toWxid=会话ID, msgId=消息ID, dataLen=图片字节数.",
        Type.Object({
            toWxid: Type.String(),
            msgId: Type.Number(),
            dataLen: Type.Number(),
            compressType: Type.Optional(Type.Number()),
        }),
        (toWxid, msgId, dataLen, compressType) => getToolsApi().downloadImg(toWxid, msgId, dataLen, compressType),
    ],
    /** /Tools/DownloadVideo — swagger {to_wxid, msg_id, data_len, compress_type, section} */
    downloadVideo: [
        "下载视频 (分片). toWxid=会话ID, msgId=消息ID, dataLen=视频字节数.",
        Type.Object({
            toWxid: Type.String(),
            msgId: Type.Number(),
            dataLen: Type.Number(),
            compressType: Type.Optional(Type.Number()),
        }),
        (toWxid, msgId, dataLen, compressType) => getToolsApi().downloadVideo(toWxid, msgId, dataLen, compressType),
    ],
    /** /Tools/DownloadVoice — swagger {fromUserName, msgId, length, bufid} */
    downloadVoice: [
        "下载语音. fromUserName=发送人, msgId=消息ID, length=语音字节数.",
        Type.Object({
            fromUserName: Type.String(),
            msgId: Type.Number(),
            length: Type.Number(),
            bufid: Type.Optional(Type.String()),
        }),
        (fromUserName, msgId, length, bufid) => getToolsApi().downloadVoice(fromUserName, msgId, length, bufid),
    ],
    /** /Tools/DownloadFile — swagger {app_id, attach_id, data_len, section, user_name} */
    downloadFile: [
        "下载文件. attachId=文件标识, userName=发送人/群ID, dataLen=文件字节数.",
        Type.Object({
            attachId: Type.String(),
            userName: Type.String(),
            dataLen: Type.Number(),
            appId: Type.Optional(Type.String()),
        }),
        (attachId, userName, dataLen, appId) => getToolsApi().downloadFile(attachId, userName, dataLen, appId),
    ],
    /** /Tools/CdnDownloadImage — swagger {file_aes_key, file_no} */
    cdnDownloadImage: [
        "CDN 下载高清图片. fileAesKey/fileNo 来自 image.cdn_download_contexts.",
        Type.Object({
            fileAesKey: Type.String(),
            fileNo: Type.String(),
        }),
        (fileAesKey, fileNo) => getToolsApi().cdnDownloadImage(fileAesKey, fileNo),
    ],
    /** /Tools/UploadFile — swagger {base64} */
    uploadFile: [
        "上传文件 (base64 内容).",
        Type.Object({
            base64: Type.String(),
        }),
        (base64) => getToolsApi().uploadFile(base64),
    ],
    /** /Tools/GetA8Key */
    getA8Key: [
        "公众号 A8 Key (open 文章用).",
        Type.Object({ url: Type.String() }),
        (url) => getToolsApi().getA8Key(url),
    ],
    /** /Tools/GeneratePayQCode (GET) */
    generatePayQCode: [
        "生成支付二维码 (GET).",
        Type.Object({}),
        () => getToolsApi().generatePayQCode(),
    ],
    /** /Tools/GetCdnDns */
    getCdnDns: [
        "获取 CDN 服务器 DNS 信息.",
        Type.Object({}),
        () => getToolsApi().getCdnDns(),
    ],
    /** /Tools/GetBandCardList */
    getBankCardList: [
        "获取余额和银行卡信息.",
        Type.Object({}),
        () => getToolsApi().getBandCardList(),
    ],
    /** /Tools/setproxy — 修改微信步数 (走 setproxy; 新端点 SetStep 有 vendor bug panic, 勿用) */
    setStepCount: [
        "修改微信运动步数 (当天步数, 最高 98000).",
        Type.Object({ steps: Type.Number() }),
        (steps) => getToolsApi().setStep(steps),
    ],
    // ===== v1.3.25 SWAGGER-254: 新增 2 个 (media-enrich 已用, 补 AI 工具) =====
    /** /Tools/DownloadFileBinary — swagger {app_id, attach_id, data_len, file_name, section, user_name} */
    downloadFileBinary: [
        "完整下载微信文件 (二进制). attachId/userName/dataLen 来自 file.download_context.",
        Type.Object({
            attachId: Type.String(),
            userName: Type.String(),
            dataLen: Type.Number(),
            fileName: Type.Optional(Type.String()),
            appId: Type.Optional(Type.String()),
        }),
        (attachId, userName, dataLen, fileName, appId) => getToolsApi().downloadFileBinary(attachId, userName, dataLen, fileName ?? "", appId),
    ],
    /** /Tools/DownloadVoiceBinary — swagger Tools.BinaryVoiceDownloadParamDoc (无必填) */
    downloadVoiceBinary: [
        "下载微信语音原文件 (二进制). msgId/newMsgId 来自语音消息.",
        Type.Object({
            msgId: Type.Number(),
            newMsgId: Type.String(),
            toUserName: Type.Optional(Type.String()),
            fromUserName: Type.Optional(Type.String()),
            length: Type.Optional(Type.Number()),
            format: Type.Optional(Type.Number()),
        }),
        (msgId, newMsgId, toUserName, fromUserName, length, format) => getToolsApi().downloadVoiceBinary(msgId, newMsgId, toUserName, fromUserName, length, format),
    ],
};
//# sourceMappingURL=tools-meta.js.map