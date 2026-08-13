// src/dispatch/agent-tools/tools-meta.ts - Tools tag (15)
// v1.3.18 P1-核心1 fix (2026-08-10): 改成 lazy-evaluate ctx 模式

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppTools } from "../../send/tools.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";

function getToolsApi() {
  const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
  if (!state) throw new Error("account not found: default");
  return makeWppTools({
    baseUrl: state.config.apiBaseUrl,
    tokenKey: state.config.tokenKey,
    authcode: state.authcode,
    accountId: getCurrentAccountId() ?? "default",
  });
}

export const TOOLS_META: ToolMeta = {
  /** /Tools/DownloadImg */
  downloadImg: [
    "下载高清图片 (从 CDN). fileId 来自消息 content xml 的 image tag.",
    Type.Object({
      aesKey: Type.String(),
      fileId: Type.String(),
    }),
    (aesKey: string, fileId: string) => getToolsApi().downloadImg(aesKey, fileId),
  ],
  /** /Tools/DownloadVideo */
  downloadVideo: [
    "下载视频.",
    Type.Object({
      aesKey: Type.String(),
      fileId: Type.String(),
    }),
    (aesKey: string, fileId: string) => getToolsApi().downloadVideo(aesKey, fileId),
  ],
  /** /Tools/DownloadVoice */
  downloadVoice: [
    "下载语音.",
    Type.Object({
      aesKey: Type.String(),
      fileId: Type.String(),
      durationMs: Type.Optional(Type.Number()),
    }),
    (aesKey: string, fileId: string, durationMs?: number) => getToolsApi().downloadVoice(aesKey, fileId, durationMs),
  ],
  /** /Tools/DownloadFile */
  downloadFile: [
    "下载文件 (v1.2.1 P1-fix: 需 appID/attachId, vendor v1 文件消息不提供, 可能失败).",
    Type.Object({
      appID: Type.String(),
      attachId: Type.String(),
      userName: Type.String(),
    }),
    (appID: string, attachId: string, userName: string) => getToolsApi().downloadFile(appID, attachId, userName),
  ],
  /** /Tools/CdnDownloadImage */
  cdnDownloadImage: [
    "CDN 单独下载高清图片.",
    Type.Object({
      aesKey: Type.String(),
      fileId: Type.String(),
    }),
    (aesKey: string, fileId: string) => getToolsApi().cdnDownloadImage(aesKey, fileId),
  ],
  /** /Tools/UploadFile */
  uploadFile: [
    "上传文件. fileType 例: image/png, video/mp4.",
    Type.Object({
      fileBase64: Type.String(),
      fileType: Type.String(),
    }),
    (fileBase64: string, fileType: string) => getToolsApi().uploadFile(fileBase64, fileType),
  ],
  /** /Tools/GetA8Key */
  getA8Key: [
    "公众号 A8 Key (open 文章用).",
    Type.Object({ url: Type.String() }),
    (url: string) => getToolsApi().getA8Key(url),
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
  /** /Tools/setproxy */
  setStepCount: [
    "修改微信运动步数.",
    Type.Object({ steps: Type.Number() }),
    (steps: number) => getToolsApi().setStep(steps),
  ],
  // ===== v1.3.25 SWAGGER-254: 新增 2 个 (media-enrich 已用, 补 AI 工具) =====

  /** /Tools/DownloadFileBinary — 完整下载微信文件 */
  downloadFileBinary: [
    "完整下载微信文件 (二进制). fileNo 来自 file.download_context.",
    Type.Object({
      fileNo: Type.String({ description: "文件 download_context 标识" }),
      fileName: Type.Optional(Type.String()),
    }),
    (fileNo: string, fileName?: string) => getToolsApi().downloadFileBinary(fileNo, fileName ?? ""),
  ],
  /** /Tools/DownloadVoiceBinary — 下载微信语音原文件 */
  downloadVoiceBinary: [
    "下载微信语音原文件 (二进制). msgId/newMsgId 来自语音消息.",
    Type.Object({
      msgId: Type.Number(),
      newMsgId: Type.String(),
    }),
    (msgId: number, newMsgId: string) => getToolsApi().downloadVoiceBinary(msgId, newMsgId),
  ],
};