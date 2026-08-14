// src/inbound/media-enrich/image.ts - 图片消息 enrich (v0 XML + v1 schema + v1 CDN 完整大图)
// 从 media-enrich.ts v1.3.26 拆分 (2026-08-10, P3-2): 仅搬运, 不优化

import { logObj as log, formatErr } from "../../core/logger.js";
import { parseImageXml } from "./xml.js";
import { loadOssConfig, uploadToOss, downloadImageBase64, buildOssKey, sanitizeFilenamePart } from "./shared.js";
import type { WppAccountCtx } from "../../send/factory.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export interface ImageEnrichResult {
  mediaUrl: string | null;
  mediaSize: number | null;
  error?: string;
}
/**
 * 图片消息 enrich 主入口: 下载 → OSS 上传 → 公网 URL。
 * 任何失败都吞错返回 { mediaUrl: null } (不阻塞消息处理), 只 log warn。
 */
export async function enrichImageMessage(
  ctx: WppAccountCtx,
  xml: string,
): Promise<ImageEnrichResult> {
  const parsed = parseImageXml(xml);
  if (!parsed) {
    return { mediaUrl: null, mediaSize: null, error: "no aeskey/fileNo in xml" };
  }
  const oss = loadOssConfig();
  if (!oss) {
    return { mediaUrl: null, mediaSize: null, error: "oss credentials missing" };
  }
  let tmpPath: string | null = null;
  try {
    const b64 = await downloadImageBase64(ctx, parsed.aesKey, parsed.fileNo);
    const img = Buffer.from(b64, "base64");
    tmpPath = path.join(
      os.tmpdir(),
      `wpp-img-${crypto.randomBytes(6).toString("hex")}.jpg`,
    );
    fs.writeFileSync(tmpPath, img);
    const filename = `${sanitizeFilenamePart(parsed.md5)}.jpg`;
    const ossKey = buildOssKey(ctx.accountId, "images", filename);
    const url = await uploadToOss(oss, tmpPath, ossKey);
    log.info(`[WPP v1.2.0] image enrich OSS: ${url} (${img.length} bytes)`);
    return { mediaUrl: url, mediaSize: img.length };
  } catch (e) {
    log.warn(`[WPP v1.2.0] image enrich failed: ${formatErr(e)}`, {
      aesKey: parsed.aesKey,
    });
    return { mediaUrl: null, mediaSize: null, error: (e as Error).message };
  } finally {
    if (tmpPath) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
    }
  }
}
/**
 * v1 schema 图片 enrich: raw_payload kind=image, content="收到一张图片", 无 aeskey/cdnbigimgurl
 * 用 /Tools/DownloadImg {msgId: local_id, toWxid} → 首 64KB JPEG (vendor 硬限) → ossutil → 公网 URL
 *
 * @param ctx WppAccountCtx (含 vendor 凭证)
 * @param localId v1 schema 推送的 local_id (uint32, 实际是 vendor 内部 msgId)
 * @param toWxid 接收方 wxid (私聊=bot 自己, 群聊=群 ID)
 * @param md5 可选, 用于 OSS key 命名 (避免重复); 缺失时用 localId 哈希
 */
export async function enrichImageMessageFromV1(
  ctx: WppAccountCtx,
  localId: number,
  toWxid: string,
  md5?: string,
): Promise<ImageEnrichResult> {
  if (!Number.isInteger(localId) || localId <= 0 || localId > 0xffffffff) {
    return { mediaUrl: null, mediaSize: null, error: `invalid localId: ${localId}` };
  }
  const oss = loadOssConfig();
  if (!oss) {
    return { mediaUrl: null, mediaSize: null, error: "oss credentials missing" };
  }
  let tmpPath: string | null = null;
  try {
    const { postWppJson } = await import("../../api/client.js");
    const { ctxToCallOpts } = await import("../../send/factory.js");
    const resp = await postWppJson<{
      data?: { buffer: string; iLen?: number };
      totalLen?: number;
      BaseResponse?: { ret?: number; errMsg?: { string?: string } };
    }>(
      ctx.baseUrl,
      "/Tools/DownloadImg",
      { msgId: localId, toWxid, compressType: 0 },
      { ...ctxToCallOpts(ctx), timeoutMs: 30000, maxRetries: 1 },
    );
    const baseRet = resp.Data?.BaseResponse?.ret;
    if (resp.Code !== 0 || baseRet !== 0) {
      const errMsg = resp.Data?.BaseResponse?.errMsg?.string ?? `Code=${resp.Code}`;
      return { mediaUrl: null, mediaSize: null, error: `vendor ret: ${errMsg}` };
    }
    const buf = resp.Data?.data?.buffer;
    if (!buf) {
      return { mediaUrl: null, mediaSize: null, error: "vendor no data.buffer" };
    }
    const img = Buffer.from(buf, "base64");
    if (img.length < 100 || img[0] !== 0xff || img[1] !== 0xd8) {
      return { mediaUrl: null, mediaSize: null, error: `not a valid JPEG (len=${img.length}, head=${img.slice(0, 4).toString("hex")})` };
    }
    tmpPath = path.join(
      os.tmpdir(),
      `wpp-v1-img-${crypto.randomBytes(6).toString("hex")}.jpg`,
    );
    fs.writeFileSync(tmpPath, img);
    const filename = `${sanitizeFilenamePart(md5)}-${localId}.jpg`;
    const ossKey = buildOssKey(ctx.accountId, "images", filename);
    const url = await uploadToOss(oss, tmpPath, ossKey);
    log.info(
      `[WPP v1.2.0 V1-SCHEMA-ENRICH] image enrich (v1 schema) ok: localId=${localId} url=${url} (${img.length} bytes, vendor 64KB cap)`,
    );
    return { mediaUrl: url, mediaSize: img.length };
  } catch (e) {
    log.warn(`[WPP v1.2.0] v1 schema image enrich failed: ${formatErr(e)}`, { localId });
    return { mediaUrl: null, mediaSize: null, error: (e as Error).message };
  } finally {
    if (tmpPath) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
    }
  }
}
/**
 * v1.2.5 IMAGE-CDN-DOWNLOAD: 用新版 cdn_download_contexts 走 CdnDownloadImage 完整下载大图。
 * 新版 vendor (8/10) 推送 image.cdn_download_contexts (file_aes_key + file_no),
 * CdnDownloadImage 返回**完整大图** (非旧 DownloadImg 的 64KB 截断)。
 * 失败降级 → 返回 error (调用方 fallback 到 DownloadImg 64KB 或标注失败)。
 */
export async function enrichImageMessageFromV1Cdn(
  ctx: WppAccountCtx,
  cdnCtx: V1ImageCdnCtx,
  md5?: string,
): Promise<ImageEnrichResult> {
  if (!cdnCtx.fileAesKey || !cdnCtx.fileNo) {
    return { mediaUrl: null, mediaSize: null, error: "no file_aes_key/file_no in cdn_download_contexts" };
  }
  const oss = loadOssConfig();
  if (!oss) {
    return { mediaUrl: null, mediaSize: null, error: "oss credentials missing" };
  }
  let tmpPath: string | null = null;
  try {
    const b64 = await downloadImageBase64(ctx, cdnCtx.fileAesKey, cdnCtx.fileNo);
    const img = Buffer.from(b64, "base64");
    if (img.length < 100 || img[0] !== 0xff || img[1] !== 0xd8) {
      return { mediaUrl: null, mediaSize: null, error: `not a valid JPEG (len=${img.length})` };
    }
    tmpPath = path.join(os.tmpdir(), `wpp-v1-img-cdn-${crypto.randomBytes(6).toString("hex")}.jpg`);
    fs.writeFileSync(tmpPath, img);
    const filename = `${sanitizeFilenamePart(md5)}.jpg`;
    const ossKey = buildOssKey(ctx.accountId, "images", filename);
    const url = await uploadToOss(oss, tmpPath, ossKey);
    log.info(`[WPP v1.2.5 IMAGE-CDN-DOWNLOAD] ok: ${url} (${img.length} bytes, variant=${cdnCtx.variant ?? "?"})`);
    return { mediaUrl: url, mediaSize: img.length };
  } catch (e) {
    log.warn(`[WPP v1.2.5 IMAGE-CDN-DOWNLOAD] failed: ${formatErr(e)}`, { fileNo: cdnCtx.fileNo.slice(0, 20) });
    return { mediaUrl: null, mediaSize: null, error: (e as Error).message };
  } finally {
    if (tmpPath) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
    }
  }
}
/**
 * v1.2.5: 图片 CDN 下载凭证 (新版 vendor 8/10 推送: image.cdn_download_contexts)
 * 结构: [{ endpoint, file_aes_key, file_no, variant: "standard"|"thumbnail" }]
 */
export interface V1ImageCdnCtx {
  fileAesKey: string;
  fileNo: string;
  variant?: string;
}
/**
 * 判定 v1 schema 图片 (raw_payload kind=image + local_id, 无 v0 Content/ImgBuf)
 * v1.2.5: 新版推送带 image.cdn_download_contexts → 可走 CdnDownloadImage 完整大图 (非 64KB 截断)
 */
export function isV1SchemaImage(raw: unknown): {
  isV1: boolean;
  localId?: number;
  md5?: string;
  toWxid?: string;
  cdnDownloadCtx?: V1ImageCdnCtx;
} {
  if (!raw || typeof raw !== "object") return { isV1: false };
  const r = raw as Record<string, unknown>;
  // v1 schema 特征: kind === "image" + local_id (uint32 数字) + 无 v0 字段 (Content/ImgBuf)
  if (r.kind === "image" && typeof r.local_id === "number" && r.local_id > 0) {
    const isV1 = !("Content" in r) && !("ImgBuf" in r);
    if (!isV1) return { isV1: false };
    // 群聊用 conversation_id (群 ID), 私聊用 recipient_id (bot 自己)
    const toWxid =
      typeof r.conversation_id === "string" && r.conversation_id.endsWith("@chatroom")
        ? r.conversation_id
        : typeof r.recipient_id === "string"
        ? r.recipient_id
        : undefined;

    let cdnDownloadCtx: V1ImageCdnCtx | undefined;
    const imageObj = r.image as Record<string, unknown> | undefined;
    const cdnCtxs = imageObj?.cdn_download_contexts;
    if (Array.isArray(cdnCtxs)) {
      const standard = cdnCtxs.find(
        (c) => (c as Record<string, unknown>).variant === "standard",
      ) as Record<string, unknown> | undefined;
      const pick = standard ?? (cdnCtxs[0] as Record<string, unknown> | undefined);
      if (pick && typeof pick.file_aes_key === "string" && typeof pick.file_no === "string") {
        cdnDownloadCtx = {
          fileAesKey: pick.file_aes_key,
          fileNo: pick.file_no,
          variant: typeof pick.variant === "string" ? pick.variant : undefined,
        };
      }
    }

    return {
      isV1: true,
      localId: r.local_id as number,
      md5: typeof imageObj?.md5 === "string" ? imageObj.md5 : undefined,
      toWxid,
      cdnDownloadCtx,
    };
  }
  return { isV1: false };
}
