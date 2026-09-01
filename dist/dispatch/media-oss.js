// src/dispatch/media-oss.ts - v1.3.22 SELF-MEDIA-OSS
// 自己发送的媒体消息 (图/视频/语音) 上传 OSS, 入库 content 用 OSS 公网 URL (老板拍板, 参考 gewe downloadAndUploadToOss)。
// 复用 media-enrich 的 OSS 配置 (~/.openclaw/credentials/oss-credentials.json) + ossutil 上传范式。
// 失败降级: 上传失败不阻塞发送 (返回 null, 入库仍用源 URL)。
import { readFileSync } from "node:fs";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execAsync } from "../util/exec.js";
import { logObj as log, formatErr } from "../core/logger.js";
import { buildOssKey } from "../inbound/media-enrich/shared.js";
const OSS_CREDENTIALS_PATH = process.env.OSS_CREDENTIALS_PATH ||
    join(os.homedir(), ".openclaw", "credentials", "oss-credentials.json");
function loadOssConfig(credentialsPath) {
    // v1.3.22: 支持运行时传 credentialsPath (测试注入; 生产默认 OSS_CREDENTIALS_PATH)
    const p = credentialsPath ?? process.env.OSS_CREDENTIALS_PATH ?? OSS_CREDENTIALS_PATH;
    try {
        const raw = readFileSync(p, "utf8");
        const d = JSON.parse(raw);
        if (!d.accessKeyId || !d.accessKeySecret || !d.bucket)
            return null;
        return {
            accessKeyId: d.accessKeyId,
            accessKeySecret: d.accessKeySecret,
            bucket: d.bucket,
            endpoint: d.endpoint || "oss-cn-hangzhou.aliyuncs.com",
        };
    }
    catch {
        return null;
    }
}
/**
 * 上传 buffer 到 OSS (wpp/v1/<type>/<md5>.<ext>), 返回公网 URL。
 * 失败返回 null (降级, 不阻塞发送)。
 */
export async function uploadMediaToOss(buffer, type, ext, accountId = "default", credentialsPath) {
    try {
        const oss = loadOssConfig(credentialsPath);
        if (!oss)
            return null;
        const md5 = crypto.createHash("md5").update(buffer).digest("hex");
        // v1.3.35 OSS-STRUCTURE: 新格式 wpp/{account}/{type}/{date}/{md5}.{ext}
        // v1.3.56 MULTI-ACCOUNT: accountId 用真实账号 (防多账号媒体路径冲突互相覆盖)
        const ossKey = buildOssKey(accountId, `${type}s`, `${md5}.${ext}`);
        const tmpDir = await mkdtemp(join(os.tmpdir(), "wpp-oss-"));
        const tmpPath = join(tmpDir, `media.${ext}`);
        try {
            await writeFile(tmpPath, buffer);
            // ossutil cp (60s 超时 + 3 重试, 同 media-enrich 范式)
            let lastErr;
            for (let attempt = 1; attempt <= 3; attempt++) {
                const r = await execAsync("ossutil", ["cp", tmpPath, `oss://${oss.bucket}/${ossKey}`, "--endpoint", oss.endpoint, "-f"], { timeoutMs: 60_000 });
                if (r.code === 0) {
                    const url = `https://${oss.bucket}.${oss.endpoint}/${ossKey}`;
                    log.info(`[WPP v1.3.22 SELF-MEDIA-OSS] uploaded ${type} → ${url} (${buffer.length} bytes)`);
                    return url;
                }
                lastErr = r;
                log.warn(`[WPP v1.3.22 SELF-MEDIA-OSS] ossutil attempt ${attempt}/3 failed code=${r.code}`);
                if (attempt < 3)
                    await new Promise((res) => setTimeout(res, 1000 * attempt));
            }
            throw new Error(`ossutil failed after 3 retries (last code=${lastErr?.code}): ${((lastErr?.stderr ?? lastErr?.stdout) ?? "").slice(0, 120)}`);
        }
        finally {
            await rm(tmpDir, { recursive: true, force: true });
        }
    }
    catch (e) {
        log.warn(`[WPP v1.3.22 SELF-MEDIA-OSS] upload ${type} failed (non-fatal, keep source URL): ${formatErr(e)}`);
        return null;
    }
}
//# sourceMappingURL=media-oss.js.map