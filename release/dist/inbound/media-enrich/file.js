import { logObj as log, formatErr } from "../../core/logger.js";
import { safeFetchWithCap } from "../../util/safe-fetch.js";
import { parseFileXml } from "./xml.js";
import { loadOssConfig, uploadToOss, downloadByEndpoint, ossUploadBuffer, buildOssKey } from "./shared.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
export function isV1SchemaFile(raw) {
    if (!raw || typeof raw !== "object")
        return { isV1: false };
    const r = raw;
    if (r.kind === "app" && typeof r.app === "object" && r.app !== null) {
        const app = r.app;
        if (app.category === "file") {
            let downloadCtx;
            const fileObj = r.file;
            const dc = fileObj?.download_context;
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
export async function enrichFileMessage(ctx, xml) {
    const parsed = parseFileXml(xml);
    if (!parsed)
        return { mediaUrl: null, filename: "", size: null, error: "no aeskey/fileNo in xml" };
    const oss = loadOssConfig();
    if (!oss)
        return { mediaUrl: null, filename: parsed.filename, size: parsed.size ?? null, error: "oss credentials missing" };
    let tmpPath = null;
    try {
        const b64 = await downloadByEndpoint(ctx, "/Tools/DownloadFile", parsed.aesKey, parsed.fileNo);
        const buf = Buffer.from(b64, "base64");
        tmpPath = path.join(os.tmpdir(), `wpp-file-${crypto.randomBytes(6).toString("hex")}.${parsed.fileext}`);
        fs.writeFileSync(tmpPath, buf);
        const hash = crypto.createHash("md5").update(parsed.filename).digest("hex").slice(0, 12);
        const safeName = parsed.filename.replace(/[^\w.\-]/g, "_");
        const ossKey = buildOssKey(ctx.accountId, "files", `${hash}-${safeName}`);
        const url = await uploadToOss(oss, tmpPath, ossKey);
        log.info(`[WPP v1.3.74] file enrich OSS: ${url} (${buf.length} bytes, ${parsed.filename})`);
        return { mediaUrl: url, filename: parsed.filename, size: buf.length };
    }
    catch (e) {
        log.warn(`[WPP v1.3.74] file enrich failed: ${formatErr(e)}`, { filename: parsed.filename });
        return { mediaUrl: null, filename: parsed.filename, size: parsed.size ?? null, error: e.message };
    }
    finally {
        if (tmpPath)
            try {
                fs.unlinkSync(tmpPath);
            }
            catch { }
    }
}
export async function enrichFileMessageFromV1Binary(ctx, downloadCtx, filename, ext) {
    if (!downloadCtx.attachId) {
        return { mediaUrl: null, filename, size: null, error: "no attach_id in download_context" };
    }
    const oss = loadOssConfig();
    if (!oss)
        return { mediaUrl: null, filename, size: null, error: "oss credentials missing" };
    let tmpPath = null;
    try {
        const url = `${ctx.baseUrl.replace(/\/$/, "")}/api/Tools/DownloadFileBinary?authcode=${encodeURIComponent(ctx.authcode ?? "")}`;
        const buf = await safeFetchWithCap(url, {
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
        }, 100 * 1024 * 1024);
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
    }
    catch (e) {
        log.warn(`[WPP v1.2.5 FILE-DOWNLOAD-BINARY] download failed: ${formatErr(e)}`, { filename });
        return { mediaUrl: null, filename, size: null, error: e.message };
    }
    finally {
        if (tmpPath)
            try {
                fs.unlinkSync(tmpPath);
            }
            catch { }
    }
}
export async function enrichFileMessageViaMcp(localId, filename, accountId) {
    const { resolveFileViaMcp: mcpResolve } = await import("../../vendor-mcp-client.js");
    const resolved = await mcpResolve(localId, filename, accountId);
    if (!resolved?.cdnUrl) {
        return { mediaUrl: null, filename, size: null, error: "mcp no cdn url" };
    }
    try {
        const buf = await safeFetchWithCap(resolved.cdnUrl, { signal: AbortSignal.timeout(30_000) }, 100 * 1024 * 1024);
        if (buf.length === 0)
            return { mediaUrl: null, filename, size: null, error: "cdn empty body" };
        const url = await ossUploadBuffer(buf, filename, "wpp/mcp-files");
        log.info(`[WPP v1.2.0 VENDOR-MCP] file enrich via MCP OSS: ${url} (${buf.length} bytes, ${filename})`);
        return { mediaUrl: url, filename, size: buf.length };
    }
    catch (e) {
        log.warn(`[WPP v1.2.0 VENDOR-MCP] file enrich via MCP failed: ${formatErr(e)}`, { filename });
        return { mediaUrl: null, filename, size: null, error: e.message };
    }
}
