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

    /** /Tools/GetA8Key — swagger Tools.GetA8KeyParamDoc {reqUrl*, codeType, codeVersion, cookieBase64, flag, netType, opCode, scene}
     *  v1.6.0: 旧码发 `url`, 厂商要的是 `reqUrl` (非大小写差异). 其余为可选透传. */
    getA8Key: (
      url: string,
      extra?: { codeType?: number; codeVersion?: number; cookieBase64?: string; flag?: number; netType?: string; opCode?: number; scene?: number },
    ) => dispatch("/Tools/GetA8Key", { reqUrl: url, ...(extra ?? {}) }),

    /** /Tools/GetBandCardList */
    getBandCardList: () => dispatch("/Tools/GetBandCardList", {}),

    /** /Tools/GetBoundHardDevices */
    getBoundHardDevices: () => dispatch("/Tools/GetBoundHardDevices", {}),

    /** /Tools/GetCdnDns */
    getCdnDns: () => dispatch("/Tools/GetCdnDns", {}),

    /** /Tools/HelperVerification — 辅助验证手机号
     *  swagger Tools.HelperVerificationParamDoc {gcc*, mobile*}. v1.6.0: 旧码发单个 `code` (该字段
     *  在 swagger 里根本不存在) — 改为国家码 + 手机号. */
    helperVerification: (gcc: string, mobile: string) =>
      dispatch("/Tools/HelperVerification", { gcc, mobile }),

    /** /Tools/OauthSdkApp */
    oauthSdkApp: (appId: string) => dispatch("/Tools/OauthSdkApp", { appId }),

    /** /Tools/ThirdAppGrant — 第三方 APP 授权
     *  swagger Tools.ThirdAppGrantParamDoc {url*, appid*}. v1.6.0: 旧码发 {appId, scope} —
     *  `appId` 能靠大小写不敏感对上 `appid`, 但必填的 `url` 完全没发. */
    thirdAppGrant: (url: string, appid: string) =>
      dispatch("/Tools/ThirdAppGrant", { url, appid }),

    /** /Tools/UploadFile — swagger Tools.UploadParamDoc {base64*} */
    uploadFile: (base64: string) => dispatch("/Tools/UploadFile", { base64 }),

    /**
     * ⚠️ v1.6.0 SWAGGER-323 — **纠正一个从 v1.4.1 起就错的端点绑定**.
     *
     * 事实 (老板 2026-09-13 亲口确认 + 容器 swagger 双向印证):
     *   `/Tools/setproxy` = **设置/删除代理IP** (必填 `proxy`, 传空串恢复直连) —— **本来就是**,
     *   厂商从没换过语义; `/Tools/SetStep` = 修改微信步数 (必填 `step`)。两个端点一直并存。
     *
     * 误绑由来 (commit 7795b4a v1.4.1):
     *   当时记「新端点 SetStep 有 vendor bug (Step.go:107 index out of range panic → HTTP 500)」,
     *   于是把步数改发到 setproxy 作**权宜**, 并附一条观察「实测 2026-08-20 发 `{steps}` ⇒ Code:1 可用」。
     *   现在看这条观察恰恰是反证: setproxy 只读 `proxy`, 未知字段 `steps` 被 Go 静默忽略 ⇒ `proxy` 取零值
     *   空串 ⇒ **恢复直连**, 厂商照常回成功码。所以那次调用**既没改步数、还可能把账号的出口代理清了**。
     *   (与该观察完全自洽 ⇒ 当年并无「步数可用」这回事。)
     *
     * 现改正: 步数回 `/Tools/SetStep`, setproxy 按其真实语义单列成 setProxy。
     * ⚠️ 仍待老板在活账号确认两点: ① `SetStep` 的 Step.go:107 panic 在 v09102 是否已修 (swagger 只列 200);
     *    ② 有没有账号因历史上那几次调用被静默改成了直连 (厂商无「查代理」端点, 只能靠 setproxy 回写)。
     */
    setStep: (steps: number) => dispatch("/Tools/SetStep", { step: steps }),

    /** /Tools/setproxy — 设置/删除代理IP (swagger Tools.SetProxyParamDoc {proxy*}).
     *  传空字符串恢复直连; 格式 host:port. */
    setProxy: (proxy: string) => dispatch("/Tools/setproxy", { proxy }),

    /**
     * /Tools/DownloadMiniProgramCover — 下载小程序卡片封面 (v1.6.0 SWAGGER-323 新端点).
     * swagger: Tools.CdnDownloadImageParamDoc {url | file_no+file_aes_key} (usedBy=2, 与 CdnDownloadImage 同形).
     * 用法: 把 WS/Webhook 小程序消息里 `app.cover_image.download_context` **原样**作为请求体
     *   (它自带 url 或 file_no+file_aes_key), 服务端返回 Data.Image = base64 封面图。
     * 提供一个 `downloadContext` 便捷入口 + 三个显式字段入口 (缺 url 时用 file_no/file_aes_key)。
     */
    downloadMiniProgramCover: (p: {
      url?: string;
      fileNo?: string;
      fileAesKey?: string;
    }) =>
      dispatch("/Tools/DownloadMiniProgramCover", {
        ...(p.url ? { url: p.url } : {}),
        ...(p.fileNo ? { file_no: p.fileNo } : {}),
        ...(p.fileAesKey ? { file_aes_key: p.fileAesKey } : {}),
      }),

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
