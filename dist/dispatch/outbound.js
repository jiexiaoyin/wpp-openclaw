import { logObj as log, formatErr } from "../core/logger.js";
import { getDefaultAccountRegistry } from "../account-state.js";
import { saveMessage } from "../db.js";
import { extractOutboundMsgIds } from "../send/msg.js";
import { uploadMediaToOss } from "./media-oss.js";
import { resolveImageToBase64 } from "../api/resolve-media.js";
import { execAsync } from "../util/exec.js";
import { safeFetchWithCap } from "../util/safe-fetch.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
const TEXT_CHUNK_LIMIT = 6000;
function isSendOk(r) {
    if (r.Code !== 0 && r.Code !== 200)
        return false;
    const baseRet = r.Data?.BaseResponse?.ret;
    return baseRet === 0 || baseRet === undefined;
}
export async function generateVideoThumbnailBase64(videoUrlOrPath) {
    let tmpIn = null;
    let tmpOut = null;
    try {
        if (videoUrlOrPath.startsWith("http")) {
            tmpIn = path.join(os.tmpdir(), `wpp-vthumb-in-${crypto.randomBytes(6).toString("hex")}.mp4`);
            const buf = await safeFetchWithCap(videoUrlOrPath, { signal: AbortSignal.timeout(30_000) }, 50 * 1024 * 1024);
            if (buf.length === 0)
                return null;
            fs.writeFileSync(tmpIn, buf);
        }
        else {
            tmpIn = videoUrlOrPath;
        }
        tmpOut = path.join(os.tmpdir(), `wpp-vthumb-${crypto.randomBytes(6).toString("hex")}.jpg`);
        const r = await execAsync("ffmpeg", [
            "-y", "-autorotate", "1", "-i", tmpIn, "-ss", "1", "-frames:v", "1",
            "-q:v", "5", "-vf", "scale=720:-2", tmpOut,
        ], { timeoutMs: 20_000 });
        if (r.code !== 0 || !fs.existsSync(tmpOut))
            return null;
        const b64 = fs.readFileSync(tmpOut).toString("base64");
        log.debug(`[WPP v1.3.8 VIDEO-THUMB] generated ${b64.length} bytes base64`);
        return b64;
    }
    catch (e) {
        log.warn(`[WPP v1.3.8 VIDEO-THUMB] failed (non-fatal, no thumb): ${formatErr(e)}`);
        return null;
    }
    finally {
        try {
            if (tmpIn && tmpIn !== videoUrlOrPath)
                fs.unlinkSync(tmpIn);
        }
        catch { }
        try {
            if (tmpOut)
                fs.unlinkSync(tmpOut);
        }
        catch { }
    }
}
function inferPeerKind(toWxid) {
    return toWxid.endsWith("@chatroom") ? "group" : "direct";
}
function inferVoiceFileName(urlOrPath) {
    const base = (urlOrPath.split("?")[0] ?? "").split("/").pop() ?? "";
    return base || "voice.mp3";
}
async function persistOutbound(state, peerKind, toWxid, msgType, content, r) {
    try {
        const ids = extractOutboundMsgIds(r);
        await saveMessage({
            account_id: state.accountId,
            msg_id: ids.newMsgId ?? ids.msgId ?? null,
            new_msg_id: ids.newMsgId ?? null,
            direction: "outbound",
            peer_kind: peerKind,
            peer_id: toWxid,
            msg_type: msgType,
            content,
            raw_payload: r.raw,
        });
    }
    catch (e) {
        log.warn(`persist outbound err: ${formatErr(e)}`);
    }
}
export async function sendText(accountId, toWxid, text, ats) {
    const state = getDefaultAccountRegistry().get(accountId);
    if (!state)
        return { ok: false, error: `account not found: ${accountId}` };
    const peerKind = inferPeerKind(toWxid);
    let accumulated = "";
    let lastMsgId;
    let lastNewId;
    let lastCreateTime;
    const chunks = text.length <= TEXT_CHUNK_LIMIT ? [text] : chunkMarkdown(text, TEXT_CHUNK_LIMIT);
    for (const chunk of chunks) {
        accumulated += chunk;
        const r = await state.apiClient.sendText(toWxid, chunk, ats);
        if (!isSendOk(r)) {
            const baseRet = r.Data?.BaseResponse?.ret;
            return { ok: false, error: `vendor Code=${r.Code} ret=${baseRet ?? "?"}`, msgId: lastMsgId, newMsgId: lastNewId };
        }
        const ids = extractOutboundMsgIds(r);
        lastMsgId = ids.msgId;
        lastNewId = ids.newMsgId;
        lastCreateTime = ids.createTime;
        await persistOutbound(state, peerKind, toWxid, "text", chunk, r);
    }
    return { ok: true, msgId: lastMsgId, newMsgId: lastNewId, createTime: lastCreateTime };
}
export async function sendImage(accountId, toWxid, imageUrlOrPath) {
    const state = getDefaultAccountRegistry().get(accountId);
    if (!state)
        return { ok: false, error: `account not found: ${accountId}` };
    let ossContent = imageUrlOrPath;
    try {
        const b64 = await resolveImageToBase64(imageUrlOrPath);
        const buf = Buffer.from(b64, "base64");
        if (buf.length > 0) {
            const ossUrl = await uploadMediaToOss(buf, "image", "jpg", accountId);
            if (ossUrl)
                ossContent = ossUrl;
        }
    }
    catch (e) {
        log.warn(`[WPP v1.3.22 SELF-MEDIA-OSS] image base64/upload skipped (keep source): ${formatErr(e)}`);
    }
    const r = await state.apiClient.sendImage(toWxid, imageUrlOrPath);
    const peerKind = inferPeerKind(toWxid);
    if (!isSendOk(r)) {
        const baseRet = r.Data?.BaseResponse?.ret;
        return { ok: false, error: `vendor Code=${r.Code} ret=${baseRet ?? "?"}` };
    }
    await persistOutbound(state, peerKind, toWxid, "image", ossContent, r);
    const ids = extractOutboundMsgIds(r);
    return { ok: true, msgId: ids.msgId, newMsgId: ids.newMsgId, createTime: ids.createTime };
}
export async function sendVoice(accountId, toWxid, voiceUrlOrPath, durationMs, formatHint) {
    const state = getDefaultAccountRegistry().get(accountId);
    if (!state)
        return { ok: false, error: `account not found: ${accountId}` };
    let ossContent = voiceUrlOrPath;
    let vendorInput = voiceUrlOrPath;
    let actualDurationMs = durationMs;
    try {
        const { encodeMp3ToSilk } = await import("./silk-encoder.js");
        const { silkBuffer, voiceDurationMs } = await encodeMp3ToSilk(voiceUrlOrPath);
        actualDurationMs = actualDurationMs ?? voiceDurationMs;
        const ossUrl = await uploadMediaToOss(silkBuffer, "voice", "silk", accountId);
        if (ossUrl)
            ossContent = ossUrl;
        vendorInput = `data:audio/silk;base64,${silkBuffer.toString("base64")}`;
        log.info(`[WPP v1.3.48 SILK-ENCODER] mp3 → silk (${silkBuffer.length} bytes, ${voiceDurationMs}ms) → vendor /Msg/SendVoice`);
    }
    catch (e) {
        const errMsg = formatErr(e);
        log.warn(`[WPP v1.3.53 VOICE-DEGRADE] silk 转码失败, 降级发文件: ${errMsg}`);
        try {
            const buf = await safeFetchWithCap(voiceUrlOrPath, { signal: AbortSignal.timeout(60_000) }, 50 * 1024 * 1024);
            if (buf.length === 0)
                return { ok: false, error: `silk 转码失败 (${errMsg}) + 文件降级下载空` };
            const fileName = inferVoiceFileName(voiceUrlOrPath);
            const fileR = await state.apiClient.sendFileViaApp(toWxid, fileName, buf.toString("base64"), buf.length);
            if (!isSendOk(fileR)) {
                const baseRet = fileR.Data?.BaseResponse?.ret;
                return { ok: false, error: `silk 转码失败 (${errMsg}) + 文件降级 vendor Code=${fileR.Code} ret=${baseRet ?? "?"}` };
            }
            await persistOutbound(state, inferPeerKind(toWxid), toWxid, "file", voiceUrlOrPath, fileR);
            const ids = extractOutboundMsgIds(fileR);
            return { ok: true, msgId: ids.msgId };
        }
        catch (e2) {
            return { ok: false, error: `silk 转码失败 (${errMsg}) + 文件降级失败: ${formatErr(e2)}` };
        }
    }
    const r = await state.apiClient.sendVoice(toWxid, vendorInput, actualDurationMs, formatHint ?? "silk");
    const peerKind = inferPeerKind(toWxid);
    if (!isSendOk(r)) {
        const baseRet = r.Data?.BaseResponse?.ret;
        return { ok: false, error: `vendor Code=${r.Code} ret=${baseRet ?? "?"}` };
    }
    await persistOutbound(state, peerKind, toWxid, "voice", ossContent, r);
    const ids = extractOutboundMsgIds(r);
    return { ok: true, msgId: ids.msgId, newMsgId: ids.newMsgId, createTime: ids.createTime };
}
export async function sendVideo(accountId, toWxid, videoUrlOrPath, thumbUrl) {
    const state = getDefaultAccountRegistry().get(accountId);
    if (!state)
        return { ok: false, error: `account not found: ${accountId}` };
    let imageBase64 = thumbUrl ?? "";
    if (!imageBase64) {
        imageBase64 = (await generateVideoThumbnailBase64(videoUrlOrPath)) ?? "";
        if (imageBase64)
            log.info(`[WPP v1.3.8 VIDEO-THUMB] auto-generated thumb for video (${videoUrlOrPath.slice(0, 60)})`);
    }
    let ossContent = videoUrlOrPath;
    try {
        const b64 = await resolveImageToBase64(videoUrlOrPath);
        const buf = Buffer.from(b64, "base64");
        if (buf.length > 0) {
            const ossUrl = await uploadMediaToOss(buf, "video", "mp4", accountId);
            if (ossUrl)
                ossContent = ossUrl;
        }
    }
    catch (e) {
        log.warn(`[WPP v1.3.22 SELF-MEDIA-OSS] video base64/upload skipped (keep source): ${formatErr(e)}`);
    }
    const r = await state.apiClient.sendVideo(toWxid, videoUrlOrPath, imageBase64);
    const peerKind = inferPeerKind(toWxid);
    if (!isSendOk(r)) {
        const baseRet = r.Data?.BaseResponse?.ret;
        return { ok: false, error: `vendor Code=${r.Code} ret=${baseRet ?? "?"}` };
    }
    await persistOutbound(state, peerKind, toWxid, "video", ossContent, r);
    const ids = extractOutboundMsgIds(r);
    return { ok: true, msgId: ids.msgId, newMsgId: ids.newMsgId, createTime: ids.createTime };
}
export async function revokeMsg(accountId, toWxid, msgId, newMsgId, createTime) {
    const state = getDefaultAccountRegistry().get(accountId);
    if (!state)
        return { ok: false, error: `account not found: ${accountId}` };
    const r = await state.apiClient.revokeMsg(msgId, newMsgId, toWxid, createTime);
    if (!isSendOk(r)) {
        const baseRet = r.Data?.BaseResponse?.ret;
        return { ok: false, error: `vendor Code=${r.Code} ret=${baseRet ?? "?"}` };
    }
    return { ok: true };
}
export function chunkMarkdown(text, limit) {
    if (text.length <= limit)
        return [text];
    const out = [];
    let current = "";
    let inCodeBlock = false;
    const blocks = [];
    let buf = "";
    for (const line of text.split("\n")) {
        if (/^\s*```/.test(line))
            inCodeBlock = !inCodeBlock;
        const isBlank = /^\s*$/.test(line);
        if (isBlank && !inCodeBlock) {
            blocks.push(buf);
            buf = "";
        }
        else {
            buf = buf ? `${buf}\n${line}` : line;
        }
    }
    if (buf)
        blocks.push(buf);
    const paragraphs = blocks.map((b) => b.trim()).filter(Boolean);
    for (const para of paragraphs) {
        if (para.length <= limit) {
            if (current.length + para.length + 2 > limit) {
                if (current)
                    out.push(current);
                current = para;
            }
            else {
                current = current ? `${current}\n\n${para}` : para;
            }
            continue;
        }
        if (current) {
            out.push(current);
            current = "";
        }
        out.push(...chunkLongParagraph(para, limit));
    }
    if (current)
        out.push(current);
    return out;
}
const CODE_BLOCK_HARD_CAP = 2;
function chunkLongParagraph(text, limit) {
    const lines = text.split("\n");
    const out = [];
    let current = "";
    let inCodeBlock = false;
    for (const line of lines) {
        if (/^```/.test(line))
            inCodeBlock = !inCodeBlock;
        if (line.length > limit) {
            if (current) {
                out.push(current);
                current = "";
            }
            out.push(...hardSplitLine(line, limit));
            continue;
        }
        const separator = current ? "\n" : "";
        const wouldExceed = current.length + separator.length + line.length > limit;
        if (inCodeBlock && current.length + separator.length + line.length > limit * CODE_BLOCK_HARD_CAP) {
            out.push(current);
            current = line;
            continue;
        }
        if (wouldExceed && inCodeBlock) {
            current += `${separator}${line}`;
            continue;
        }
        if (wouldExceed) {
            out.push(current);
            current = line;
        }
        else {
            current = current ? `${current}${separator}${line}` : line;
        }
    }
    if (current)
        out.push(current);
    return out;
}
function hardSplitLine(line, limit) {
    const out = [];
    let start = 0;
    while (start < line.length) {
        let end = Math.min(start + limit, line.length);
        const ch = line.charCodeAt(end - 1);
        if (ch >= 0xd800 && ch <= 0xdbff && end < line.length)
            end -= 1;
        out.push(line.slice(start, end));
        start = end;
    }
    return out;
}
export function normalizePayload(text) {
    return text.trim();
}
export const chunker = (text) => text.length <= TEXT_CHUNK_LIMIT ? [text] : chunkMarkdown(text, TEXT_CHUNK_LIMIT);
