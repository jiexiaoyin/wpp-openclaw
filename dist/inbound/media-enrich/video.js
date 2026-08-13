import { logObj as log, formatErr } from "../../core/logger.js";
import { parseVideoXml } from "./xml.js";
import { loadOssConfig, uploadToOss, downloadByEndpoint, buildOssKey } from "./shared.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
export async function enrichVideoMessage(ctx, xml) {
    const parsed = parseVideoXml(xml);
    if (!parsed)
        return { mediaUrl: null, mediaSize: null, error: "no aeskey/fileNo in xml" };
    const oss = loadOssConfig();
    if (!oss)
        return { mediaUrl: null, mediaSize: null, error: "oss credentials missing" };
    let tmpPath = null;
    try {
        const b64 = await downloadByEndpoint(ctx, "/Tools/DownloadVideo", parsed.aesKey, parsed.fileNo);
        const buf = Buffer.from(b64, "base64");
        const ext = parsed.md5 ? "mp4" : "mp4";
        tmpPath = path.join(os.tmpdir(), `wpp-vid-${crypto.randomBytes(6).toString("hex")}.${ext}`);
        fs.writeFileSync(tmpPath, buf);
        const filename = `${parsed.md5 ?? crypto.randomBytes(8).toString("hex")}.mp4`;
        const ossKey = buildOssKey(ctx.accountId, "videos", filename);
        const url = await uploadToOss(oss, tmpPath, ossKey);
        log.info(`[WPP v1.2.0] video enrich OSS: ${url} (${buf.length} bytes)`);
        return { mediaUrl: url, mediaSize: buf.length };
    }
    catch (e) {
        log.warn(`[WPP v1.2.0] video enrich failed: ${formatErr(e)}`, { aesKey: parsed.aesKey });
        return { mediaUrl: null, mediaSize: null, error: e.message };
    }
    finally {
        if (tmpPath)
            try {
                fs.unlinkSync(tmpPath);
            }
            catch { }
    }
}
export function isV1SchemaVideo(raw) {
    if (!raw || typeof raw !== "object")
        return { isV1: false };
    const r = raw;
    if (r.kind !== "video")
        return { isV1: false };
    const vc = r.video?.download_context;
    if (!vc || typeof vc.msg_id !== "number")
        return { isV1: false };
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
export async function enrichVideoMessageFromV1(ctx, videoCtx) {
    const oss = loadOssConfig();
    if (!oss)
        return { mediaUrl: null, mediaSize: null, error: "oss credentials missing" };
    let tmpPath = null;
    try {
        const url = `${ctx.baseUrl.replace(/\/$/, "")}/api/Tools/DownloadVideo?authcode=${encodeURIComponent(ctx.authcode ?? "")}`;
        const chunks = [];
        let totalLen = videoCtx.dataLen;
        let startPos = 0;
        const CHUNK = 1048576;
        while (startPos < totalLen) {
            const sectionLen = Math.min(CHUNK, totalLen - startPos);
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
            const json = (await resp.json());
            const data = json.Data ?? {};
            if (typeof data.totalLen === "number")
                totalLen = data.totalLen;
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
            if (startPos >= totalLen)
                break;
            if (chunk.length === 0)
                break;
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
    }
    catch (e) {
        log.warn(`[WPP v1.3.8 VIDEO-DOWNLOAD] failed: ${formatErr(e)}`);
        return { mediaUrl: null, mediaSize: null, error: e.message };
    }
    finally {
        if (tmpPath)
            try {
                fs.unlinkSync(tmpPath);
            }
            catch { }
    }
}
