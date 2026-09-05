// src/inbound/media-enrich/shared.ts - 媒体 enrich 共享基础设施 (OSS + vendor 下载 helper)
// 从 media-enrich.ts v1.3.26 拆分 (2026-08-10, P3-2): 仅搬运, 不优化

import { logObj as log } from "../../core/logger.js";
import { execAsync } from "../../util/exec.js";
import type { WppAccountCtx } from "../../send/factory.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const OSS_CREDENTIALS_PATH =
  process.env.OSS_CREDENTIALS_PATH ||
  path.join(os.homedir(), ".openclaw", "credentials", "oss-credentials.json");

/**
 * v1.3.34 OSS-STRUCTURE (2026-08-11 老板拍板): OSS key 统一格式 `wpp/{account}/{type}/{date}/{filename}`
 *   账号隔离 + 文件类型 + 日期归档 (方便检索/清理)。
 *   @param accountId 账号 id (e.g. "default")
 *   @param type 文件类型 (images/videos/voices/files)
 *   @param filename 文件名 (含扩展名)
 *   @returns OSS key (e.g. "wpp/default/images/2026-08-11/xxx.jpg")
 */
export function buildOssKey(accountId: string, type: string, filename: string): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `wpp/${accountId || "default"}/${type}/${date}/${filename}`;
}

/**
 * v1.3.63 P3 (2026-08-14 审阅): md5 文件名净化.
 *   v0 schema md5 是 hex digest, 但 v1 schema 的 md5 是自由字符串 → 直接拼进 OSS key 可污染路径/上下文.
 *   只允许 hex 字符串, 否则 fallback 随机 hex (不信任自由字符串).
 */
export function sanitizeFilenamePart(input: unknown, fallbackLen = 16): string {
  const s = typeof input === "string" ? input : "";
  if (/^[a-f0-9]{8,64}$/i.test(s)) return s.toLowerCase();
  return crypto.randomBytes(Math.ceil(fallbackLen / 2)).toString("hex").slice(0, fallbackLen);
}

interface OssConfig {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  endpoint: string;
}

export function loadOssConfig(): OssConfig | null {
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
 * 60s 超时 + 3 次重试 (OSS 临时网络抖动会 SIGKILL 超时进程 → enrich 失败)
 */
export async function uploadToOss(
  oss: OssConfig,
  localPath: string,
  ossKey: string,
): Promise<string> {
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
      `[WPP v1.3.74] ossutil cp attempt ${attempt}/3 failed (code=${r.code} signal=${r.signal ?? "none"}) stderr=${(r.stderr || r.stdout).slice(0, 100)}`,
    );
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  throw new Error(
    `ossutil cp failed after 3 retries (last code=${lastErr?.code} signal=${lastErr?.signal ?? "none"}): ${((lastErr?.stderr ?? lastErr?.stdout) ?? "").slice(0, 200)}`,
  );
}
/**
 * 调 vendor /Tools/CdnDownloadImage 下载图片 → base64 JPEG
 */
export async function downloadImageBase64(
  ctx: WppAccountCtx,
  aesKey: string,
  fileNo: string,
): Promise<string> {
  const { postWppJson } = await import("../../api/client.js");
  const { ctxToCallOpts } = await import("../../send/factory.js");
  const resp = await postWppJson<{ Image?: string }>(
    ctx.baseUrl,
    "/Tools/CdnDownloadImage",
    { file_aes_key: aesKey, file_no: fileNo },
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
/**
 * v1.2.1 P2-fix: 公共 OSS 上传 (buffer → tmp → ossutil → 公网 URL)。
 * 复用 media-enrich 各处的 hash+safeName+upload 逻辑, 避免 6 处重复。
 */
export async function ossUploadBuffer(
  buf: Buffer,
  filename: string,
  prefix: string,
  opts?: { accountId?: string; type?: string },
): Promise<string> {
  const oss = loadOssConfig();
  if (!oss) throw new Error("oss credentials missing");
  const ext = (filename.match(/\.([a-zA-Z0-9]+)$/) || [])[1] || "bin";
  const tmpPath = path.join(os.tmpdir(), `wpp-upload-${crypto.randomBytes(6).toString("hex")}.${ext}`);
  try {
    fs.writeFileSync(tmpPath, buf);
    const hash = crypto.createHash("md5").update(filename).digest("hex").slice(0, 12);
    const safeName = filename.replace(/[^\w.\-]/g, "_");
    // v1.3.34 OSS-STRUCTURE: opts 提供 → 用新格式 wpp/{account}/{type}/{date}/{hash}-{safeName}
    //   否则兼容老 prefix 调用 (e.g. MCP 路径)
    const ossKey = opts?.accountId && opts?.type
      ? buildOssKey(opts.accountId, opts.type, `${hash}-${safeName}`)
      : `${prefix}/${hash}-${safeName}`;
    return await uploadToOss(oss, tmpPath, ossKey);
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}
export interface MediaEnrichResult {
  mediaUrl: string | null;
  mediaSize: number | null;
  filename?: string;
  error?: string;
}
