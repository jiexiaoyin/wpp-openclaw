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
export async function uploadMediaToOss(buffer, type, ext, accountId = "default", credentialsPath) {
    try {
        const oss = loadOssConfig(credentialsPath);
        if (!oss)
            return null;
        const md5 = crypto.createHash("md5").update(buffer).digest("hex");
        const ossKey = buildOssKey(accountId, `${type}s`, `${md5}.${ext}`);
        const tmpDir = await mkdtemp(join(os.tmpdir(), "wpp-oss-"));
        const tmpPath = join(tmpDir, `media.${ext}`);
        try {
            await writeFile(tmpPath, buffer);
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
