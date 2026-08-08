// src/inbound/media-enrich.ts - 图片消息 enrich (仿 gewe enrich.js downloadAndUploadToOss)
// v1.1.20 (2026-08-08 接总立): 老板图片识别需求 — 图片消息进来自动:
//   1. 解析 XML 拿 aeskey + cdnthumburl (305f CDN fileNo)
//   2. 调 vendor /Tools/CdnDownloadImage {fileAesKey, fileNo} → base64 JPEG
//   3. ossutil 上传 OSS (openclaw-a/gewe/images/) → 公网 URL
//   4. 返回 URL (dispatcher 注入 Media, AI 视觉模型识别)
//
// 凭据来源 (仿 gewe):
//   - OSS: ~/.openclaw/credentials/oss-credentials.json (accessKeyId/accessKeySecret/bucket/endpoint)
//   - vendor: ctx (WppAccountCtx: baseUrl/tokenKey/authcode)

import { logObj as log, formatErr } from "../core/logger.js";
import { execAsync } from "../util/exec.js";
import type { WppAccountCtx } from "../send/factory.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const OSS_CREDENTIALS_PATH =
  process.env.OSS_CREDENTIALS_PATH ||
  path.join(os.homedir(), ".openclaw", "credentials", "oss-credentials.json");

interface OssConfig {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  endpoint: string;
}

function loadOssConfig(): OssConfig | null {
  try {
    const raw = fs.readFileSync(OSS_CREDENTIALS_PATH, "utf8");
    const d = JSON.parse(raw) as Partial<OssConfig>;
    if (!d.accessKeyId || !d.accessKeySecret || !d.bucket) return null;
    return {
      accessKeyId: d.accessKeyId,
      accessKeySecret: d.accessKeySecret,
      bucket: d.bucket,
      endpoint: d.endpoint || "oss-cn-hangzhou.aliyuncs.com",
    };
  } catch {
    return null;
  }
}

/**
 * ossutil cp 上传本地文件到 OSS, 返回公网 URL。
 * 仿 gewe OssBackend: `ossutil cp <local> oss://<bucket>/<key> --endpoint <endpoint> -f`
 */
async function uploadToOss(
  oss: OssConfig,
  localPath: string,
  ossKey: string,
): Promise<string> {
  // v1.1.29 ENRICH-ORDER-FIX (2026-08-08 21:10 接总立: 21:00:15 ossutil code=null 临时失败):
  //   21:00:15 那次 ossutil 跑超时被 SIGKILL (code=null, signal=SIGKILL) → enrich 失败 → AI 看不到 URL
  //   原因: vendor CdnDownloadImage / OSS 临时网络抖动, 30s 超时不够 → 改为 60s + 重试 3 次
  let lastErr: Awaited<ReturnType<typeof execAsync>> | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await execAsync(
      "ossutil",
      [
        "cp",
        localPath,
        `oss://${oss.bucket}/${ossKey}`,
        "--endpoint",
        oss.endpoint,
        "-f",
      ],
      { timeoutMs: 60_000 },
    );
    if (r.code === 0) {
      // 公网 URL: https://{bucket}.{endpoint}/{key}
      return `https://${oss.bucket}.${oss.endpoint}/${ossKey}`;
    }
    lastErr = r;
    log.warn(
      `[WPP v1.1.29] ossutil cp attempt ${attempt}/3 failed (code=${r.code} signal=${r.signal ?? "none"}) stderr=${(r.stderr || r.stdout).slice(0, 100)}`,
    );
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  throw new Error(
    `ossutil cp failed after 3 retries (last code=${lastErr?.code} signal=${lastErr?.signal ?? "none"}): ${((lastErr?.stderr ?? lastErr?.stdout) ?? "").slice(0, 200)}`,
  );
}

/**
 * 从图片 XML 提取 CDN 下载参数 (aeskey + cdnthumburl/cdnbigimgurl)
 */
export function parseImageXml(xml: string): {
  aesKey: string;
  fileNo: string;
  md5?: string;
} | null {
  const aesKey = xml.match(/aeskey="([^"]+)"/)?.[1];
  const fileNo =
    xml.match(/cdnbigimgurl="([^"]+)"/)?.[1] ||
    xml.match(/cdnmidimgurl="([^"]+)"/)?.[1] ||
    xml.match(/cdnthumburl="([^"]+)"/)?.[1];
  const md5 = xml.match(/md5="([^"]+)"/)?.[1];
  if (!aesKey || !fileNo) return null;
  return { aesKey, fileNo, md5 };
}

/**
 * 调 vendor /Tools/CdnDownloadImage 下载图片 → base64 JPEG
 */
async function downloadImageBase64(
  ctx: WppAccountCtx,
  aesKey: string,
  fileNo: string,
): Promise<string> {
  const { postWppJson } = await import("../api/client.js");
  const { ctxToCallOpts } = await import("../send/factory.js");
  const resp = await postWppJson<{ Image?: string }>(
    ctx.baseUrl,
    "/Tools/CdnDownloadImage",
    { fileAesKey: aesKey, fileNo },
    ctxToCallOpts(ctx),
  );
  const image = resp.Data?.Image;
  if (!image) {
    throw new Error(
      `CdnDownloadImage missing Image: code=${resp.Code} value=${resp.CodeValue ?? ""}`,
    );
  }
  return image;
}

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
    // 1. 下载 (base64 JPEG)
    const b64 = await downloadImageBase64(ctx, parsed.aesKey, parsed.fileNo);
    const img = Buffer.from(b64, "base64");
    // 2. 写临时文件
    tmpPath = path.join(
      os.tmpdir(),
      `wpp-img-${crypto.randomBytes(6).toString("hex")}.jpg`,
    );
    fs.writeFileSync(tmpPath, img);
    // 3. 上传 OSS (子目录 gewe/images/ 与 gewe 一致, 文件名用 md5)
    const filename = `${parsed.md5 ?? crypto.randomBytes(8).toString("hex")}.jpg`;
    const ossKey = `gewe/images/${filename}`;
    const url = await uploadToOss(oss, tmpPath, ossKey);
    log.info(`[WPP v1.1.20] image enrich OSS: ${url} (${img.length} bytes)`);
    return { mediaUrl: url, mediaSize: img.length };
  } catch (e) {
    log.warn(`[WPP v1.1.20] image enrich failed: ${formatErr(e)}`, {
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
