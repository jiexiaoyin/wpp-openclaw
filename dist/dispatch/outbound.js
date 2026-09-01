// src/dispatch/outbound.ts - OpenClaw channel outbound
// 范式仿 本项目/src/dispatch/outbound.ts
// G3 重构: getAccountState → getDefaultAccountRegistry().get (走 class API, 替代 module facade)
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
// v1.3.63 P2-CHUNKER-MARKDOWN (2026-08-13 老板反馈): 4000 → 6000
// 微信 iPad 协议实际支持更长 (厂商 @wecom/aibot-node-sdk 跟 vendor 文档都没明确硬限, 但 6000 是经验安全值)
// 提升后单 chunk 携带信息更多, 减少长消息分包数量 (优化 cron 推送体验)
const TEXT_CHUNK_LIMIT = 6000;
/**
 * v1.3.18 P1-核心3 fix (2026-08-10): 统一发送判据 — Code=0 只是 HTTP 200, 真正成功看 Data.BaseResponse.ret === 0
 *   之前: 5 个 send 函数只看 r.Code, 不查 Data.BaseResponse.ret → vendor 返 Code=0 + ret=-2 时误报成功
 *   现在: 看 Code && ret, 与 quote-reply.ts:220 已正确判据保持一致
 *   兼容: undefined ret 视为成功 (老 vendor 不返 BaseResponse 兌底)
 */
function isSendOk(r) {
    if (r.Code !== 0 && r.Code !== 200)
        return false;
    const baseRet = r.Data?.BaseResponse?.ret;
    return baseRet === 0 || baseRet === undefined;
}
/**
 * v1.3.8 VIDEO-THUMB: 从视频 URL/路径抽首帧生成缩略图 base64 (微信端发视频必须带缩略图才显示)。
 * ffmpeg 抽 1s 帧 → JPEG base64。失败返回 null (不阻塞, 降级无缩略图)。
 * v1.3.18 P1-安全2 + F5 fix (2026-08-10): safeFetchWithCap (50MB cap + host 白名单),
 *   原本 fetch 整个视频 (F5), 现在 50MB cap (实际只取 1 帧缩略图, 不需要全视频)
 */
export async function generateVideoThumbnailBase64(videoUrlOrPath) {
    let tmpIn = null;
    let tmpOut = null;
    try {
        // 下载远程视频到临时文件 (OSS URL)
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
/** v1.3.53 VOICE-DEGRADE: 从 URL/路径推文件名兑底 (文件降级显示用) */
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
    // chunk long texts (Markdown-aware 简化版: 按 \n\n 切)
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
    // v1.3.22 SELF-MEDIA-OSS: 发图前取 base64 → 上传 OSS (供入库用 OSS 公网 URL)
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
    // v1.3.22: 入库 content 用 OSS URL (自己发的图可查可引用)
    await persistOutbound(state, peerKind, toWxid, "image", ossContent, r);
    const ids = extractOutboundMsgIds(r);
    return { ok: true, msgId: ids.msgId, newMsgId: ids.newMsgId, createTime: ids.createTime };
}
export async function sendVoice(accountId, toWxid, voiceUrlOrPath, durationMs, formatHint) {
    const state = getDefaultAccountRegistry().get(accountId);
    if (!state)
        return { ok: false, error: `account not found: ${accountId}` };
    // ============================================================
    // v1.3.48 SILK-ENCODER (2026-08-12 接总立 P0, 修复 vendor /Msg/SendVoice ret=-2 静默拒收)
    //
    // 根因: vendor /Msg/SendVoice 只接受 silk base64 (24kHz mono + !SILK_V3 头),
    //   但 WPP plugin sendVoice 路径一直把 mp3 base64 直接传过去 → vendor 拒收 ret=-2
    // 老板 query 8-12 10:44: "参考 gewe 插件之前发送语音的逻辑看看"
    // 老板 8-12 10:23: "语音要注意格式转化问题呀"
    // 老板 6-12 21:50 历史已诊断过 silk 转码 bug, 7-24 01:54 老板拍板过 silk encoder 范式
    // 8-12 10:17 AI 误判 framework sendMessage ok=true 是真成功 (实际是 wrapper 不抛错 + 静默 ret=-2)
    //
    // 修复 (仿 GeWe v1.4.4 src/send/voice.ts:230 geweConvertAndSendMp3AsVoice):
    //   1. mp3 → ffmpeg PCM 24kHz mono (-ar 24000 -ac 1)
    //   2. PCM → silk encoder -tencent -quiet (生成微信 silk 期望的 0x02 + !SILK_V3 头)
    //   3. silkBuffer base64 → data: URI → 传给 vendor /Msg/SendVoice (原 vendor 接口只接 Base64, 不接 URL)
    //   4. 传不出去降级为 sendFile (老板 6-12 16:36 偏好: 成功发为语音, 失败降级文件)
    //
    // 不动现有 sendImage/sendFile/sendVideo (它们各自路径正确)
    // 不动现有 v1.3.22 SELF-MEDIA-OSS 入库逻辑 (ossContent 用 silk URL)
    // ============================================================
    let ossContent = voiceUrlOrPath;
    let vendorInput = voiceUrlOrPath;
    let actualDurationMs = durationMs;
    try {
        const { encodeMp3ToSilk } = await import("./silk-encoder.js");
        const { silkBuffer, voiceDurationMs } = await encodeMp3ToSilk(voiceUrlOrPath);
        actualDurationMs = actualDurationMs ?? voiceDurationMs;
        // 上传 OSS (v1.3.22 SELF-MEDIA-OSS 入库用)
        const ossUrl = await uploadMediaToOss(silkBuffer, "voice", "silk", accountId);
        if (ossUrl)
            ossContent = ossUrl;
        // 给 vendor 的输入改成 silk base64 (data: URI)
        vendorInput = `data:audio/silk;base64,${silkBuffer.toString("base64")}`;
        log.info(`[WPP v1.3.48 SILK-ENCODER] mp3 → silk (${silkBuffer.length} bytes, ${voiceDurationMs}ms) → vendor /Msg/SendVoice`);
    }
    catch (e) {
        // v1.3.53 VOICE-DEGRADE (2026-08-12 接总立 P3-1, 老板 6-12 16:36 偏好): silk 转码失败 → 降级为文件消息
        //   - 绝不给 /Msg/SendVoice 传 mp3 (vendor 只收 silk, 直传必 ret=-2)
        //   - 但 mp3 可当文件发 → 用户拿到可播放的音频文件, 不是啥都拿不到
        //   - 文件降级也失败 → 才整体失败
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
    // v1.3.57 P1-2: 用 extractOutboundMsgIds (vendor 响应在 Data.List[0].NewMsgId, 顶层 msgId 是 undefined)
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
    // v1.3.22 SELF-MEDIA-OSS: 发视频前取 base64 → 上传 OSS (入库用 OSS 公网 URL)
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
    // v1.3.57 P1-2: 用 extractOutboundMsgIds (与 text/image 一致, 拿 newMsgId/createTime)
    const ids = extractOutboundMsgIds(r);
    return { ok: true, msgId: ids.msgId, newMsgId: ids.newMsgId, createTime: ids.createTime };
}
export async function revokeMsg(accountId, toWxid, msgId, newMsgId, createTime) {
    const state = getDefaultAccountRegistry().get(accountId);
    if (!state)
        return { ok: false, error: `account not found: ${accountId}` };
    //   (实测 now → vendor ret=0 但不真撤; server time → 撤回成功 + 推送 10002 撤回事件)
    const r = await state.apiClient.revokeMsg(msgId, newMsgId, toWxid, createTime);
    if (!isSendOk(r)) {
        const baseRet = r.Data?.BaseResponse?.ret;
        return { ok: false, error: `vendor Code=${r.Code} ret=${baseRet ?? "?"}` };
    }
    return { ok: true };
}
// ============ v1.1.17 恢复 (被 sendApp 删除时误删, 从备份恢复) ============
/**
 * v1.3.63 P2-CHUNKER-MARKDOWN (2026-08-13 老板反馈):真正的 markdown-aware chunker
 *   旧版注释说"按段落 (\n\n) 切"但实际用 `\n` 切 → 长段落(多行无空行)从中间切开
 *   新版:
 *   1. 优先按段落 (\n\n / \n\n+) 切
 *   2. 段落 > limit 时, 按行 (\n) 切
 *   3. 行 > limit 时, 硬切字符 (markdown 元素已破, 保 vendor 接受)
 *   4. 代码块 (```...```) 跨 chunk 不切断 (关键! 否则渲染坏)
 *   5. 表格行 (|...|) 跨 chunk 不切断
 *   6. 列表项 (- / * / 数字.) 保持完整
 */
/**
 * v1.3.63 P2-CHUNKER-MARKDOWN + P1-2/P2-1/P2-2 fix (2026-08-14 审阅):
 *   - P1-2: 巨型代码块单 chunk 超限 → 加 CODE_BLOCK_HARD_CAP 强制切分
 *   - P2-1: 代码块内含空行 → 围栏被段级切分拆断 → 切段前扫围栏跳过块内空行
 *   - P2-2: hardSplitLine 按 UTF-16 码元切会切断 emoji/生僻字 → codePointAt 对齐
 */
export function chunkMarkdown(text, limit) {
    if (text.length <= limit)
        return [text];
    const out = [];
    let current = "";
    let inCodeBlock = false;
    // P2-1: 扫整个文本跟踪代码块围栏状态, 段级切分 (空行) 跳过块内空行
    const blocks = [];
    let buf = "";
    for (const line of text.split("\n")) {
        if (/^\s*```/.test(line))
            inCodeBlock = !inCodeBlock;
        const isBlank = /^\s*$/.test(line);
        // 块内空行: 仍记录该行 (保留内容), 但不作为段落边界
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
        // 段落 ≤ limit
        if (para.length <= limit) {
            // 当前 chunk 加这个段落会不会超? (留 2 字符给 \n\n 分隔)
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
        // 段落 > limit → 先 flush current, 切这个长段
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
/**
 * v1.3.63 P2-CHUNKER-MARKDOWN + P1-2: 切长段落 (单段 > limit)
 * - 保护 ``` 代码块 (跨 chunk 不切断, 但超 CODE_BLOCK_HARD_CAP 强制切防 vendor 截断)
 * - 保护 | 表格行
 * - 单行超 limit 硬切字符
 */
const CODE_BLOCK_HARD_CAP = 2; // 代码块允许超过 limit 的倍数, 超则强制切分
function chunkLongParagraph(text, limit) {
    const lines = text.split("\n");
    const out = [];
    let current = "";
    let inCodeBlock = false;
    for (const line of lines) {
        // 跟踪代码块状态: ``` 开头切换
        if (/^```/.test(line))
            inCodeBlock = !inCodeBlock;
        // 单行超 limit → 硬切
        if (line.length > limit) {
            if (current) {
                out.push(current);
                current = "";
            }
            out.push(...hardSplitLine(line, limit));
            continue;
        }
        // 当前 chunk 加这一行会不会超?
        const separator = current ? "\n" : "";
        const wouldExceed = current.length + separator.length + line.length > limit;
        // 代码块中: 超限但未达硬 cap → 推迟切分 (优先保持代码块完整)
        // 但加这行会超硬 cap → 强制切 (P1-2, 保证单 chunk ≤ limit*2, 防超 vendor 限)
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
            // 普通超限 → 切: flush current, 重新开始
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
/**
 * v1.3.63 P2-CHUNKER-MARKDOWN + P2-2 fix: 硬切单行 (单行 > limit)
 * 按 codePointAt 对齐切 (不切断 emoji/生僻字代理对), 每段 ≤ limit 字符
 */
function hardSplitLine(line, limit) {
    const out = [];
    let start = 0;
    while (start < line.length) {
        let end = Math.min(start + limit, line.length);
        // 若切点落在高代理位 (星面字符前半), 后移一位避免切断代理对
        const ch = line.charCodeAt(end - 1);
        if (ch >= 0xd800 && ch <= 0xdbff && end < line.length)
            end -= 1;
        out.push(line.slice(start, end));
        start = end;
    }
    return out;
}
/** normalize payload before sending (频道唯一 stub — 后续可加更多转换) */
export function normalizePayload(text) {
    return text.trim();
}
/** chunker 入口 */
export const chunker = (text) => text.length <= TEXT_CHUNK_LIMIT ? [text] : chunkMarkdown(text, TEXT_CHUNK_LIMIT);
//# sourceMappingURL=outbound.js.map