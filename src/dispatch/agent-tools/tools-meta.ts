// src/dispatch/agent-tools/tools-meta.ts - Tools tag (15)

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppTools } from "../../send/tools.js";
import type { WppAccountCtx } from "../../send/factory.js";

const ctx: WppAccountCtx = { baseUrl: "", tokenKey: "", accountId: "" };
const api = makeWppTools(ctx);

export const TOOLS_META: ToolMeta = {
  /** /Tools/DownloadImg */
  downloadImg: [
    "下载高清图片 (从 CDN). fileId 来自消息 content xml 的 image tag.",
    Type.Object({
      aesKey: Type.String(),
      fileId: Type.String(),
    }),
    api.downloadImg,
  ],
  /** /Tools/DownloadVideo */
  downloadVideo: [
    "下载视频.",
    Type.Object({
      aesKey: Type.String(),
      fileId: Type.String(),
    }),
    api.downloadVideo,
  ],
  /** /Tools/DownloadVoice */
  downloadVoice: [
    "下载语音.",
    Type.Object({
      aesKey: Type.String(),
      fileId: Type.String(),
      durationMs: Type.Optional(Type.Number()),
    }),
    api.downloadVoice,
  ],
  /** /Tools/DownloadFile */
  downloadFile: [
    "下载文件.",
    Type.Object({
      aesKey: Type.String(),
      fileId: Type.String(),
    }),
    api.downloadFile,
  ],
  /** /Tools/CdnDownloadImage */
  cdnDownloadImage: [
    "CDN 单独下载高清图片.",
    Type.Object({
      aesKey: Type.String(),
      fileId: Type.String(),
    }),
    api.cdnDownloadImage,
  ],
  /** /Tools/UploadFile */
  uploadFile: [
    "上传文件. fileType 例: image/png, video/mp4.",
    Type.Object({
      fileBase64: Type.String(),
      fileType: Type.String(),
    }),
    api.uploadFile,
  ],
  /** /Tools/GetA8Key */
  getA8Key: [
    "公众号 A8 Key (open 文章用).",
    Type.Object({ url: Type.String() }),
    api.getA8Key,
  ],
  /** /Tools/GeneratePayQCode (GET) */
  generatePayQCode: [
    "生成支付二维码 (GET).",
    Type.Object({}),
    api.generatePayQCode,
  ],
  /** /Tools/GetCdnDns */
  getCdnDns: [
    "获取 CDN 服务器 DNS 信息.",
    Type.Object({}),
    api.getCdnDns,
  ],
  /** /Tools/GetBandCardList */
  getBankCardList: [
    "获取余额和银行卡信息.",
    Type.Object({}),
    api.getBandCardList,
  ],
  /** /Tools/setproxy */
  setStepCount: [
    "修改微信运动步数.",
    Type.Object({ steps: Type.Number() }),
    api.setStep,
  ],
};
