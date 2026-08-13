import { logObj as log } from "../../core/logger.js";
import { execAsync } from "../../util/exec.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
const OSS_CREDENTIALS_PATH = process.env.OSS_CREDENTIALS_PATH ||
    path.join(os.homedir(), ".openclaw", "credentials", "oss-credentials.json");
export function buildOssKey(accountId, type, filename) {
    const date = new Date().toISOString().slice(0, 10);
    return `wpp/${accountId || "default"}/${type}/${date}/${filename}`;
}
export function loadOssConfig() {
    try {
        const raw = fs.readFileSync(OSS_CREDENTIALS_PATH, "utf8");
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
export async function uploadToOss(oss, localPath, ossKey) {
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
        const r = await execAsync("ossutil", [
            "cp",
            localPath,
            `oss://${oss.bucket}/${ossKey}`,
            "--endpoint",
            oss.endpoint,
            "-f",
        ], { timeoutMs: 60_000 });
        if (r.code === 0) {
            return `https://${oss.bucket}.${oss.endpoint}/${ossKey}`;
        }
        lastErr = r;
        log.warn(`[WPP v1.2.0] ossutil cp attempt ${attempt}/3 failed (code=${r.code} signal=${r.signal ?? "none"}) stderr=${(r.stderr || r.stdout).slice(0, 100)}`);
        if (attempt < 3)
            await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
    throw new Error(`ossutil cp failed after 3 retries (last code=${lastErr?.code} signal=${lastErr?.signal ?? "none"}): ${((lastErr?.stderr ?? lastErr?.stdout) ?? "").slice(0, 200)}`);
}
export async function downloadImageBase64(ctx, aesKey, fileNo) {
    const { postWppJson } = await import("../../api/client.js");
    const { ctxToCallOpts } = await import("../../send/factory.js");
    const resp = await postWppJson(ctx.baseUrl, "/Tools/CdnDownloadImage", { fileAesKey: aesKey, fileNo }, ctxToCallOpts(ctx));
    const image = resp.Data?.Image;
    if (!image) {
        throw new Error(`CdnDownloadImage missing Image: code=${resp.Code} value=${resp.CodeValue ?? ""}`);
    }
    return image;
}
export async function ossUploadBuffer(buf, filename, prefix, opts) {
    const oss = loadOssConfig();
    if (!oss)
        throw new Error("oss credentials missing");
    const ext = (filename.match(/\.([a-zA-Z0-9]+)$/) || [])[1] || "bin";
    const tmpPath = path.join(os.tmpdir(), `wpp-upload-${crypto.randomBytes(6).toString("hex")}.${ext}`);
    try {
        fs.writeFileSync(tmpPath, buf);
        const hash = crypto.createHash("md5").update(filename).digest("hex").slice(0, 12);
        const safeName = filename.replace(/[^\w.\-]/g, "_");
        const ossKey = opts?.accountId && opts?.type
            ? buildOssKey(opts.accountId, opts.type, `${hash}-${safeName}`)
            : `${prefix}/${hash}-${safeName}`;
        return await uploadToOss(oss, tmpPath, ossKey);
    }
    finally {
        try {
            fs.unlinkSync(tmpPath);
        }
        catch { }
    }
}
export async function downloadByEndpoint(ctx, endpoint, aesKey, fileNo, extraBody = {}) {
    const { postWppJson } = await import("../../api/client.js");
    const { ctxToCallOpts } = await import("../../send/factory.js");
    const resp = await postWppJson(ctx.baseUrl, endpoint, { aesKey, fileId: fileNo, ...extraBody }, ctxToCallOpts(ctx));
    const data = (resp.Data ?? {});
    const b64 = (typeof data.File === "string" && data.File) ||
        (typeof data.file === "string" && data.file) ||
        (typeof data.Video === "string" && data.Video) ||
        (typeof data.video === "string" && data.video) ||
        (typeof data.Voice === "string" && data.Voice) ||
        (typeof data.voice === "string" && data.voice) ||
        (typeof data.Buffer === "string" && data.Buffer) ||
        (typeof data.buffer === "string" && data.buffer) ||
        "";
    if (!b64) {
        throw new Error(`${endpoint} missing binary data: code=${resp.Code} value=${resp.CodeValue ?? ""}`);
    }
    return b64;
}
