// src/inbound/media-enrich.ts - 媒体消息 enrich (下载 + OSS 上传 + 公网 URL)
// 双 schema 支持:
//   v0: content 含完整 XML (aeskey + cdn url) → /Tools/CdnDownloadImage 完整大图
//   v1: content = "收到一张图片" 总结, 无 XML → /Tools/DownloadImg + local_id, 但 vendor 单次硬限 64KB
// 凭据:
//   - OSS: ~/.openclaw/credentials/oss-credentials.json
//   - vendor: ctx (WppAccountCtx: baseUrl/tokenKey/authcode)
//
// v1.3.26 (2026-08-10, P3-2): 978 行按职责拆分到 media-enrich/ (shared/xml/image/file/voice/video),
//   本文件退化为薄 barrel re-export, 外部 import "./media-enrich.js" 契约不变.
export * from "./media-enrich/index.js";
//# sourceMappingURL=media-enrich.js.map