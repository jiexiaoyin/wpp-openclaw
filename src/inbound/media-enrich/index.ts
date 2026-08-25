// src/inbound/media-enrich/index.ts - 双层 barrel (v1.3.26 拆分, 2026-08-10 P3-2)
// 外部入口 media-enrich.ts re-export 本文件; 显式列出公共符号, 不泄漏 shared 内部 helper
// 注意: interface 是 type-only, 必须用 `export type {}` (否则运行时 ESM 报 no export)

// ===== 值导出 (函数) =====
export { parseImageXml, parseFileXml, parseVideoXml, parseVoiceXml } from "./xml.js";
export { enrichImageMessage, enrichImageMessageFromV1, enrichImageMessageFromV1Cdn, isV1SchemaImage } from "./image.js";
export { isV1SchemaFile, enrichFileMessage, enrichFileMessageFromV1Binary, enrichFileMessageViaMcp } from "./file.js";
export { isV1SchemaVoice, enrichVoiceMessage, enrichVoiceMessageFromV1 } from "./voice.js";
export { isV1SchemaVideo, enrichVideoMessage, enrichVideoMessageFromV1 } from "./video.js";

// ===== 类型导出 (interface, type-only) =====
export type { ImageEnrichResult, V1ImageCdnCtx } from "./image.js";
export type { V1FileDownloadCtx, FileEnrichResult } from "./file.js";
export type { MediaEnrichResult } from "./shared.js";
export type { V1VoiceDownloadCtx } from "./voice.js";
export type { V1VideoDownloadCtx } from "./video.js";
