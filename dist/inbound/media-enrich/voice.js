import { logObj as log, formatErr } from "../../core/logger.js";
import { safeFetchWithCap } from "../../util/safe-fetch.js";
import { transcribeSilkBuffer } from "../../storage/stt.js";
import { parseVoiceXml } from "./xml.js";
import { loadOssConfig, uploadToOss, downloadByEndpoint, buildOssKey } from "./shared.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
export async function enrichVoiceMessage(ctx, xml) {
    const parsed = parseVoiceXml(xml);
    if (!parsed)
        return { mediaUrl: null, mediaSize: null, error: "no aeskey/fileNo in xml" };
    const oss = loadOssConfig();
    if (!oss)
        return { mediaUrl: null, mediaSize: null, error: "oss credentials missing" };
    let tmpPath = null;
    let sttText = null;
    try {
        const b64 = await downloadByEndpoint(ctx, "/Tools/DownloadVoice", parsed.aesKey, parsed.fileNo);
        const buf = Buffer.from(b64, "base64");
        tmpPath = path.join(os.tmpdir(), `wpp-voice-${crypto.randomBytes(6).toString("hex")}.silk`);
        fs.writeFileSync(tmpPath, buf);
        const filename = `${parsed.md5 ?? crypto.randomBytes(8).toString("hex")}.silk`;
        const ossKey = buildOssKey(ctx.accountId, "voices", filename);
        const url = await uploadToOss(oss, tmpPath, ossKey);
        try {
            const sttR = await transcribeSilkBuffer(buf);
            if (sttR?.text) {
                sttText = sttR.text;
                log.info(`[WPP v1.2.0] voice STT ok: text="${sttText.slice(0, 50)}${sttText.length > 50 ? "..." : ""}"`);
            }
        }
        catch (e) {
            log.warn(`[WPP v1.2.0] voice STT failed (non-fatal): ${formatErr(e)}`);
        }
        log.info(`[WPP v1.2.0] voice enrich OSS: ${url} (${buf.length} bytes, ${parsed.durationMs ?? "?"}ms)`);
        return { mediaUrl: url, mediaSize: buf.length, ...(sttText ? { filename: sttText } : {}) };
    }
    catch (e) {
        log.warn(`[WPP v1.2.0] voice enrich failed: ${formatErr(e)}`, { aesKey: parsed.aesKey });
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
export function isV1SchemaVoice(raw) {
    if (!raw || typeof raw !== "object")
        return { isV1: false };
    const r = raw;
    if (r.kind !== "voice")
        return { isV1: false };
    const vc = r.voice?.download_context;
    if (!vc || typeof vc.msg_id !== "number")
        return { isV1: false };
    return {
        isV1: true,
        voiceCtx: {
            msgId: vc.msg_id,
            newMsgId: typeof vc.new_msg_id === "string" ? vc.new_msg_id : "",
            clientMsgId: typeof vc.client_msg_id === "string" ? vc.client_msg_id : "",
            masterBufId: typeof vc.master_buf_id === "string" ? vc.master_buf_id : "0",
            format: typeof vc.format === "number" ? vc.format : 4,
            length: typeof vc.length === "number" ? vc.length : 0,
            chatRoomName: typeof vc.chat_room_name === "string" ? vc.chat_room_name : undefined,
            fromUserName: typeof vc.from_user_name === "string" ? vc.from_user_name : undefined,
            toUserName: typeof vc.to_user_name === "string" ? vc.to_user_name : undefined,
        },
    };
}
export async function enrichVoiceMessageFromV1(ctx, voiceCtx, vendorTranscript) {
    const oss = loadOssConfig();
    if (!oss)
        return { mediaUrl: null, mediaSize: null, error: "oss credentials missing" };
    let tmpPath = null;
    let sttText = null;
    const vendorText = vendorTranscript?.trim();
    if (vendorText) {
        sttText = vendorText;
        log.info(`[WPP v1.3.22 VENDOR-TRANSCRIPT] use vendor transcript (wechat_official): "${vendorText.slice(0, 50)}"`);
        return { mediaUrl: null, mediaSize: null, filename: sttText };
    }
    try {
        const url = `${ctx.baseUrl.replace(/\/$/, "")}/api/Tools/DownloadVoiceBinary?authcode=${encodeURIComponent(ctx.authcode ?? "")}`;
        const buf = await safeFetchWithCap(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "TokenKey": ctx.tokenKey },
            body: JSON.stringify({
                msg_id: voiceCtx.msgId,
                new_msg_id: voiceCtx.newMsgId,
                client_msg_id: voiceCtx.clientMsgId,
                master_buf_id: voiceCtx.masterBufId,
                format: voiceCtx.format,
                length: voiceCtx.length,
                chat_room_name: voiceCtx.chatRoomName,
                from_user_name: voiceCtx.fromUserName,
                to_user_name: voiceCtx.toUserName,
            }),
            signal: AbortSignal.timeout(30_000),
        }, 20 * 1024 * 1024);
        if (buf.length === 0) {
            return { mediaUrl: null, mediaSize: null, error: "DownloadVoiceBinary empty" };
        }
        tmpPath = path.join(os.tmpdir(), `wpp-voice-v1-${crypto.randomBytes(6).toString("hex")}.silk`);
        fs.writeFileSync(tmpPath, buf);
        try {
            const sttR = await transcribeSilkBuffer(buf);
            if (sttR?.text) {
                sttText = sttR.text;
                log.info(`[WPP v1.2.6 VOICE-DOWNLOAD-BINARY] STT ok: "${sttText.slice(0, 50)}${sttText.length > 50 ? "..." : ""}"`);
            }
        }
        catch (e) {
            log.warn(`[WPP v1.2.6] voice STT failed (non-fatal): ${formatErr(e)}`);
        }
        const filename = `${crypto.randomBytes(8).toString("hex")}.silk`;
        const ossKey = buildOssKey(ctx.accountId, "voices", filename);
        const ossUrl = await uploadToOss(oss, tmpPath, ossKey);
        log.info(`[WPP v1.2.6 VOICE-DOWNLOAD-BINARY] ok: ${ossUrl} (${buf.length} bytes)`);
        return { mediaUrl: ossUrl, mediaSize: buf.length, ...(sttText ? { filename: sttText } : {}) };
    }
    catch (e) {
        log.warn(`[WPP v1.2.6 VOICE-DOWNLOAD-BINARY] failed: ${formatErr(e)}`);
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
