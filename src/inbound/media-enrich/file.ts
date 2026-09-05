// src/inbound/media-enrich/file.ts - 文件消息 enrich (v0 XML + v1 Binary + MCP)
// 从 media-enrich.ts v1.3.26 拆分 (2026-08-10, P3-2): 仅搬运, 不优化

import { logObj as log, formatErr } from "../../core/logger.js";
import { safeFetchWithCap } from "../../util/safe-fetch.js";
import { parseFileXml } from "./xml.js";
import { loadOssConfig, uploadToOss, ossUploadBuffer, buildOssKey } from "./shared.js";
import type { WppAccountCtx } from "../../send/factory.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

/**
 * v1 schema 文件的下载凭证 (新版 vendor 8/10 推送: file.download_context)
 * download_context 结构: { attach_id, user_name, data_len, endpoint, section:{start_pos, data_len} }
 */
export interface V1FileDownloadCtx {
  attachId: string;
  userName: string;
  dataLen: number;
  endpoint?: string;
}
/**
 * 判定 v1 schema 文件 (raw_payload kind=app, app.category=file)
 * v1.2.5: 新版 vendor 推送带 file.download_context → 可完整下载 (DownloadFileBinary)
 */
export function isV1SchemaFile(raw: unknown): {
  isV1: boolean;
  filename?: string;
  ext?: string;
  downloadCtx?: V1FileDownloadCtx;
} {
  if (!raw || typeof raw !== "object") return { isV1: false };
  const r = raw as Record<string, unknown>;
  // v1 schema 特征: kind === "app" + app.category === "file"
  if (r.kind === "app" && typeof r.app === "object" && r.app !== null) {
    const app = r.app as Record<string, unknown>;
    if (app.category === "file") {
      // 新版: file.download_context (完整下载凭证)
      let downloadCtx: V1FileDownloadCtx | undefined;
      const fileObj = r.file as Record<string, unknown> | undefined;
      const dc = fileObj?.download_context as Record<string, unknown> | undefined;
      if (dc && typeof dc.attach_id === "string") {
        downloadCtx = {
          attachId: dc.attach_id,
          userName: typeof dc.user_name === "string" ? dc.user_name : "",
          dataLen: typeof dc.data_len === "number" ? dc.data_len : 0,
          endpoint: typeof dc.endpoint === "string" ? dc.endpoint : undefined,
        };
      }
      return {
        isV1: true,
        filename: typeof app.title === "string" ? app.title : undefined,
        ext: typeof app.file_extension === "string" ? app.file_extension : undefined,
        downloadCtx,
      };
    }
  }
  return { isV1: false };
}
/**
 * 文件 enrich: /Tools/DownloadFile → base64 → OSS → 公网 URL
 * 失败 fallback: 标注文件名 + 大小, AI 知道有文件但无法下载
 */
export interface FileEnrichResult {
  mediaUrl: string | null;
  filename: string;
  size: number | null;
  error?: string;
}
export async function enrichFileMessage(
  _ctx: WppAccountCtx,
  xml: string,
): Promise<FileEnrichResult> {
  const parsed = parseFileXml(xml);
  if (!parsed) return { mediaUrl: null, filename: "", size: null, error: "no aeskey/fileNo in xml" };
  // v0 XML 文件下载在新 vendor 不可用: /Tools/DownloadFile 需要 v1 download_context
  // (app_id/attach_id/data_len/user_name), v0 XML 仅 aeskey+fileno → 直接标注失败, 不发无效请求
  return {
    mediaUrl: null,
    filename: parsed.filename,
    size: parsed.size ?? null,
    error: "v0 XML file download unsupported on new vendor (needs v1 download_context)",
  };
}
/**
 * v1.2.5 FILE-DOWNLOAD-BINARY: 用新版 DownloadFileBinary 完整下载 v1 schema 文件。
 * 新版 vendor (8/10) 推送 file.download_context (attach_id/user_name/data_len), 直接提交
 * 即可让服务端自动拉全部分片 → 返回原始文件字节流 → 上传 OSS → 公网 URL。
 *
 * 调用方式 (实测):
 *   POST {baseUrl}/api/Tools/DownloadFileBinary?authcode=<authcode>   ← authcode 必须走 query!
 *   Header: TokenKey: <tokenKey>
 *   Body: { attach_id, user_name, data_len, section: {start_pos, data_len} }
 *   返回: 原始文件字节 (Content-Disposition 附件, 不经 Base64)
 */
export async function enrichFileMessageFromV1Binary(
  ctx: WppAccountCtx,
  downloadCtx: V1FileDownloadCtx,
  filename: string,
  ext: string,
): Promise<FileEnrichResult> {
  if (!downloadCtx.attachId) {
    return { mediaUrl: null, filename, size: null, error: "no attach_id in download_context" };
  }
  const oss = loadOssConfig();
  if (!oss) return { mediaUrl: null, filename, size: null, error: "oss credentials missing" };
  let tmpPath: string | null = null;
  try {
    //   原本裸 fetch + 整文件进 Buffer, 恶意 vendor 推送可 OOM
    const url = `${ctx.baseUrl.replace(/\/$/, "")}/api/Tools/DownloadFileBinary?authcode=${encodeURIComponent(ctx.authcode ?? "")}`;
    const buf = await safeFetchWithCap(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "TokenKey": ctx.tokenKey,
        },
        body: JSON.stringify({
          attach_id: downloadCtx.attachId,
          user_name: downloadCtx.userName,
          data_len: downloadCtx.dataLen,
          section: { start_pos: 0, data_len: downloadCtx.dataLen },
        }),
        signal: AbortSignal.timeout(30_000),
      },
      100 * 1024 * 1024, // 100MB hard cap (file 通常 <50MB)
    );
    if (buf.length === 0 || buf.length < 10) {
      return { mediaUrl: null, filename, size: null, error: `DownloadFileBinary empty (${buf.length} bytes)` };
    }

    const safeExt = ext ? ext.replace(/[^\w]/g, "").toLowerCase() : "bin";
    tmpPath = path.join(os.tmpdir(), `wpp-file-v1-${crypto.randomBytes(6).toString("hex")}.${safeExt}`);
    fs.writeFileSync(tmpPath, buf);

    const hash = crypto.createHash("md5").update(filename).digest("hex").slice(0, 12);
    const safeName = filename.replace(/[^\w.\-]/g, "_");
    const ossKey = buildOssKey(ctx.accountId, "files", `${hash}-${safeName}`);
    const ossUrl = await uploadToOss(oss, tmpPath, ossKey);
    log.info(`[WPP v1.2.5 FILE-DOWNLOAD-BINARY] download ok: ${filename} (${buf.length} bytes) → ${ossUrl}`);
    return { mediaUrl: ossUrl, filename, size: buf.length };
  } catch (e) {
    log.warn(`[WPP v1.2.5 FILE-DOWNLOAD-BINARY] download failed: ${formatErr(e)}`, { filename });
    return { mediaUrl: null, filename, size: null, error: (e as Error).message };
  } finally {
    if (tmpPath) try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}
/**
 * v1.2.0 VENDOR-MCP: v1 schema 文件通过 vendor MCP 尝试下载
 * 流程: MCP wechat_get_recent_messages 拿完整 payload → 找 CDN URL → 下载 → OSS → 公网 URL
 * 失败 (MCP 不可用 / 无 CDN URL / 下载失败) → 返回 null, 调用方走确定性回复兜底
 */
export async function enrichFileMessageViaMcp(
  localId: number,
  filename: string,
  accountId?: string,
): Promise<FileEnrichResult> {
  const { resolveFileViaMcp: mcpResolve } = await import("../../vendor-mcp-client.js");
  // v1.3.60 MULTI-ACCOUNT: 传 accountId → MCP 用对应账号 token
  const resolved = await mcpResolve(localId, filename, accountId);
  if (!resolved?.cdnUrl) {
    return { mediaUrl: null, filename, size: null, error: "mcp no cdn url" };
  }
  // 2. 下载 CDN URL (v1.2.1 P2-fix: 抽 ossUploadBuffer 复用上传逻辑)
  try {
    const buf = await safeFetchWithCap(resolved.cdnUrl, { signal: AbortSignal.timeout(30_000) }, 100 * 1024 * 1024);
    if (buf.length === 0) return { mediaUrl: null, filename, size: null, error: "cdn empty body" };
    const url = await ossUploadBuffer(buf, filename, "wpp/mcp-files");
    log.info(`[WPP v1.2.0 VENDOR-MCP] file enrich via MCP OSS: ${url} (${buf.length} bytes, ${filename})`);
    return { mediaUrl: url, filename, size: buf.length };
  } catch (e) {
    log.warn(`[WPP v1.2.0 VENDOR-MCP] file enrich via MCP failed: ${formatErr(e)}`, { filename });
    return { mediaUrl: null, filename, size: null, error: (e as Error).message };
  }
}
