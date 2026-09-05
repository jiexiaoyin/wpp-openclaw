// src/inbound/media-enrich/video.ts - 视频消息 enrich (v0 XML + v1 download_context 分片)
// 从 media-enrich.ts v1.3.26 拆分 (2026-08-10, P3-2): 仅搬运, 不优化

import { logObj as log, formatErr } from "../../core/logger.js";
import { parseVideoXml } from "./xml.js";
import { loadOssConfig, uploadToOss, buildOssKey } from "./shared.js";
import type { MediaEnrichResult } from "./shared.js";
import type { WppAccountCtx } from "../../send/factory.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

/** 视频消息 (msgType=43) 下载 + OSS */
export async function enrichVideoMessage(
  _ctx: WppAccountCtx,
  xml: string,
): Promise<MediaEnrichResult> {
  const parsed = parseVideoXml(xml);
  if (!parsed) return { mediaUrl: null, mediaSize: null, error: "no aeskey/fileNo in xml" };
  // v0 XML 视频下载在新 vendor 不可用: /Tools/DownloadVideo 需要 v1 download_context
  // (to_wxid/msg_id/data_len), v0 XML 仅 aeskey+cdnvideourl → 直接标注失败, 不发无效请求
  return {
    mediaUrl: null,
    mediaSize: null,
    error: "v0 XML video download unsupported on new vendor (needs v1 download_context)",
  };
}
/**
 * v1.3.8 VIDEO-DOWNLOAD: 新版 vendor (8/10) 视频推送带 video.download_context,
 * 提交给 /Tools/DownloadVideo → 视频分片 → OSS 上传 → 公网 URL。
 * 结构: { msg_id, data_len, section:{start_pos,data_len}, to_wxid }
 */
export interface V1VideoDownloadCtx {
  msgId: number;
  dataLen: number;
  toWxid: string;
  compressType?: number;
}
/** 从 raw_payload 提取新版视频 download_context (kind=video + video.download_context) */
export function isV1SchemaVideo(raw: unknown): { isV1: boolean; videoCtx?: V1VideoDownloadCtx } {
  if (!raw || typeof raw !== "object") return { isV1: false };
  const r = raw as Record<string, unknown>;
  if (r.kind !== "video") return { isV1: false };
  const vc = (r.video as Record<string, unknown> | undefined)?.download_context as
    | Record<string, unknown>
    | undefined;
  if (!vc || typeof vc.msg_id !== "number") return { isV1: false };
  return {
    isV1: true,
    videoCtx: {
      msgId: vc.msg_id,
      dataLen: typeof vc.data_len === "number" ? vc.data_len : 0,
      toWxid: typeof vc.to_wxid === "string" ? vc.to_wxid : "",
      compressType: typeof vc.compress_type === "number" ? vc.compress_type : 0,
    },
  };
}
/** 用新版 DownloadVideo 下载视频 → OSS。失败返回 error (调用方降级)。 */
export async function enrichVideoMessageFromV1(
  ctx: WppAccountCtx,
  videoCtx: V1VideoDownloadCtx,
): Promise<MediaEnrichResult> {
  const oss = loadOssConfig();
  if (!oss) return { mediaUrl: null, mediaSize: null, error: "oss credentials missing" };
  let tmpPath: string | null = null;
  try {
    const url = `${ctx.baseUrl.replace(/\/$/, "")}/api/Tools/DownloadVideo?authcode=${encodeURIComponent(ctx.authcode ?? "")}`;
    const chunks: Buffer[] = [];
    let totalLen = videoCtx.dataLen;
    let startPos = 0;
    const CHUNK = 1048576; // 1MB 每段 (与 download_context.section 一致)
    while (startPos < totalLen) {
      const sectionLen = Math.min(CHUNK, totalLen - startPos);
      // 单段 1MB < 200MB cap → 用普通 safeFetch (这段走 host 白名单 + 协议校验就够)
      const safeMod = await import("../../util/safe-fetch.js");
      const resp = await safeMod.safeFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "TokenKey": ctx.tokenKey },
        body: JSON.stringify({
          to_wxid: videoCtx.toWxid,
          msg_id: videoCtx.msgId,
          data_len: totalLen,
          section: { start_pos: startPos, data_len: sectionLen },
          compress_type: videoCtx.compressType,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        return { mediaUrl: null, mediaSize: null, error: `DownloadVideo HTTP ${resp.status}: ${errText.slice(0, 200)}` };
      }
      const json = (await resp.json()) as {
        Data?: { totalLen?: number; data?: { buffer?: string }; Video?: string };
      };
      const data = json.Data ?? {};
      if (typeof data.totalLen === "number") totalLen = data.totalLen;
      const b64 = data.data?.buffer ?? data.Video ?? "";
      if (!b64) {
        return { mediaUrl: null, mediaSize: null, error: `DownloadVideo chunk ${startPos} no buffer` };
      }
      const chunk = Buffer.from(b64, "base64");
      if (chunk.length === 0) {
        return { mediaUrl: null, mediaSize: null, error: `DownloadVideo chunk ${startPos} empty` };
      }
      chunks.push(chunk);
      startPos += chunk.length;
      // 终止条件: 已拉到 totalLen (不要用 chunk.length < sectionLen — 每段固定 61440, 会提前 break)
      if (startPos >= totalLen) break;
      if (chunk.length === 0) break; // 无进展
      //   但若段 < 1MB (vendor 异常), 200 段其实只防 ~50MB; 改成按 totalBytes 严格 200MB)
      const totalBytes = chunks.reduce((s, c) => s + c.length, 0);
      const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
      if (totalBytes > MAX_VIDEO_BYTES) {
        return { mediaUrl: null, mediaSize: null, error: `video chunks exceeded ${MAX_VIDEO_BYTES} bytes` };
      }
    }
    const buf = Buffer.concat(chunks);
    if (buf.length === 0) {
      return { mediaUrl: null, mediaSize: null, error: "DownloadVideo empty" };
    }
    tmpPath = path.join(os.tmpdir(), `wpp-video-v1-${crypto.randomBytes(6).toString("hex")}.mp4`);
    fs.writeFileSync(tmpPath, buf);
    const filename = `${crypto.randomBytes(8).toString("hex")}.mp4`;
    const ossKey = buildOssKey(ctx.accountId, "videos", filename);
    const ossUrl = await uploadToOss(oss, tmpPath, ossKey);
    log.info(`[WPP v1.3.8 VIDEO-DOWNLOAD] ok: ${ossUrl} (${buf.length} bytes)`);
    return { mediaUrl: ossUrl, mediaSize: buf.length };
  } catch (e) {
    log.warn(`[WPP v1.3.8 VIDEO-DOWNLOAD] failed: ${formatErr(e)}`);
    return { mediaUrl: null, mediaSize: null, error: (e as Error).message };
  } finally {
    if (tmpPath) try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}
