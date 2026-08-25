import { logObj as log, formatErr } from "../../core/logger.js";
import { parseImageXml } from "./xml.js";
import { loadOssConfig, uploadToOss, downloadImageBase64, buildOssKey, sanitizeFilenamePart } from "./shared.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
export async function enrichImageMessage(ctx, xml) {
    const parsed = parseImageXml(xml);
    if (!parsed) {
        return { mediaUrl: null, mediaSize: null, error: "no aeskey/fileNo in xml" };
    }
    const oss = loadOssConfig();
    if (!oss) {
        return { mediaUrl: null, mediaSize: null, error: "oss credentials missing" };
    }
    let tmpPath = null;
    try {
        const b64 = await downloadImageBase64(ctx, parsed.aesKey, parsed.fileNo);
        const img = Buffer.from(b64, "base64");
        tmpPath = path.join(os.tmpdir(), `wpp-img-${crypto.randomBytes(6).toString("hex")}.jpg`);
        fs.writeFileSync(tmpPath, img);
        const filename = `${sanitizeFilenamePart(parsed.md5)}.jpg`;
        const ossKey = buildOssKey(ctx.accountId, "images", filename);
        const url = await uploadToOss(oss, tmpPath, ossKey);
        log.info(`[WPP v1.3.74] image enrich OSS: ${url} (${img.length} bytes)`);
        return { mediaUrl: url, mediaSize: img.length };
    }
    catch (e) {
        log.warn(`[WPP v1.3.74] image enrich failed: ${formatErr(e)}`, {
            aesKey: parsed.aesKey,
        });
        return { mediaUrl: null, mediaSize: null, error: e.message };
    }
    finally {
        if (tmpPath) {
            try {
                fs.unlinkSync(tmpPath);
            }
            catch {
            }
        }
    }
}
export async function enrichImageMessageFromV1(ctx, localId, toWxid, md5, dataLen) {
    if (!Number.isInteger(localId) || localId <= 0 || localId > 0xffffffff) {
        return { mediaUrl: null, mediaSize: null, error: `invalid localId: ${localId}` };
    }
    const oss = loadOssConfig();
    if (!oss) {
        return { mediaUrl: null, mediaSize: null, error: "oss credentials missing" };
    }
    let tmpPath = null;
    try {
        const { postWppJson } = await import("../../api/client.js");
        const { ctxToCallOpts } = await import("../../send/factory.js");
        const resp = await postWppJson(ctx.baseUrl, "/Tools/DownloadImg", {
            msg_id: localId,
            to_wxid: toWxid,
            data_len: dataLen ?? 0,
            compress_type: 0,
            ...(dataLen ? { section: { start_pos: 0, data_len: dataLen } } : {}),
        }, { ...ctxToCallOpts(ctx), timeoutMs: 30000, maxRetries: 1 });
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
        tmpPath = path.join(os.tmpdir(), `wpp-v1-img-${crypto.randomBytes(6).toString("hex")}.jpg`);
        fs.writeFileSync(tmpPath, img);
        const filename = `${sanitizeFilenamePart(md5)}-${localId}.jpg`;
        const ossKey = buildOssKey(ctx.accountId, "images", filename);
        const url = await uploadToOss(oss, tmpPath, ossKey);
        log.info(`[WPP v1.2.0 V1-SCHEMA-ENRICH] image enrich (v1 schema) ok: localId=${localId} url=${url} (${img.length} bytes, vendor 64KB cap)`);
        return { mediaUrl: url, mediaSize: img.length };
    }
    catch (e) {
        log.warn(`[WPP v1.3.74] v1 schema image enrich failed: ${formatErr(e)}`, { localId });
        return { mediaUrl: null, mediaSize: null, error: e.message };
    }
    finally {
        if (tmpPath) {
            try {
                fs.unlinkSync(tmpPath);
            }
            catch {
            }
        }
    }
}
export async function enrichImageMessageFromV1Cdn(ctx, cdnCtx, md5) {
    if (!cdnCtx.fileAesKey || !cdnCtx.fileNo) {
        return { mediaUrl: null, mediaSize: null, error: "no file_aes_key/file_no in cdn_download_contexts" };
    }
    const oss = loadOssConfig();
    if (!oss) {
        return { mediaUrl: null, mediaSize: null, error: "oss credentials missing" };
    }
    let tmpPath = null;
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
    }
    catch (e) {
        log.warn(`[WPP v1.2.5 IMAGE-CDN-DOWNLOAD] failed: ${formatErr(e)}`, { fileNo: cdnCtx.fileNo.slice(0, 20) });
        return { mediaUrl: null, mediaSize: null, error: e.message };
    }
    finally {
        if (tmpPath) {
            try {
                fs.unlinkSync(tmpPath);
            }
            catch {
            }
        }
    }
}
export function isV1SchemaImage(raw) {
    if (!raw || typeof raw !== "object")
        return { isV1: false };
    const r = raw;
    if (r.kind === "image" && typeof r.local_id === "number" && r.local_id > 0) {
        const isV1 = !("Content" in r) && !("ImgBuf" in r);
        if (!isV1)
            return { isV1: false };
        const toWxid = typeof r.conversation_id === "string" && r.conversation_id.endsWith("@chatroom")
            ? r.conversation_id
            : typeof r.recipient_id === "string"
                ? r.recipient_id
                : undefined;
        let cdnDownloadCtx;
        const imageObj = r.image;
        const cdnCtxs = imageObj?.cdn_download_contexts;
        if (Array.isArray(cdnCtxs)) {
            const standard = cdnCtxs.find((c) => c.variant === "standard");
            const pick = standard ?? cdnCtxs[0];
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
            localId: r.local_id,
            md5: typeof imageObj?.md5 === "string" ? imageObj.md5 : undefined,
            toWxid,
            dataLen: typeof imageObj?.data_len === "number"
                ? imageObj.data_len
                : typeof imageObj?.total_len === "number"
                    ? imageObj.total_len
                    : typeof imageObj?.file_size === "number"
                        ? imageObj.file_size
                        : typeof r.data_len === "number"
                            ? r.data_len
                            : undefined,
            cdnDownloadCtx,
        };
    }
    return { isV1: false };
}
