import { info, warn, debug, logObj as log, formatErr } from "../core/logger.js";
import { WppInboundDebouncer, } from "./debouncer.js";
import { shouldTrigger, } from "./triggers.js";
import { enrichBatch } from "./enrich.js";
import { parseQuoteXml, extractReferencedFromReplyContext, extractReferencedFromApp } from "./parser/quote.js";
import { captureQuoteSvrid } from "./quote-svrid.js";
import { extractPairCode } from "../pairing-store.js";
import { getMessageById } from "../storage/db/messages.js";
import { getMessageByMsgIdOrNewId } from "../db.js";
import { parseRelayText, isRelayMessage } from "./relay.js";
import { isRedPacketMessage, processRedPacket } from "./hongbao.js";
import { extractAtUserList } from "./parser/mention.js";
import { payloadToAllInboundMessages } from "./parser.js";
import { SeenTracker, buildDedupeKey } from "../webhook-receiver.js";
import { enrichImageMessage, enrichImageMessageFromV1, enrichImageMessageFromV1Cdn, enrichFileMessage, enrichFileMessageFromV1Binary, enrichVideoMessage, enrichVideoMessageFromV1, isV1SchemaVideo, enrichVoiceMessage, enrichVoiceMessageFromV1, isV1SchemaVoice, enrichFileMessageViaMcp, isV1SchemaImage, isV1SchemaFile } from "./media-enrich.js";
import { getDefaultAccountRegistry } from "../account-state.js";
const pendingEnrichs = new Map();
const RELAY_THROTTLE_MS = 5 * 60 * 1000;
const relayTriggerAt = new Map();
export function __resetRelayThrottle() {
    relayTriggerAt.clear();
}
function trackEnrich(key, fn) {
    const p = fn().finally(() => pendingEnrichs.delete(key));
    pendingEnrichs.set(key, p.then(() => undefined));
    return p;
}
export async function waitForPendingEnrich(accountId, sender, timeoutMs = 10_000) {
    const p = pendingEnrichs.get(`${accountId}:${sender}`);
    if (!p)
        return;
    try {
        await Promise.race([p, new Promise((r) => setTimeout(r, timeoutMs))]);
    }
    catch {
    }
}
export function clearPendingEnrichs() {
    pendingEnrichs.clear();
}
export function __testSetPendingEnrich(key, fn) {
    const p = fn().finally(() => pendingEnrichs.delete(key));
    pendingEnrichs.set(key, p.then(() => undefined));
}
export function createWppInboundHandler(opts) {
    const debouncer = new WppInboundDebouncer({
        onFlush: async (batch) => {
            for (const m of batch) {
                if (m.msgType === 3 && opts.vendorCtx) {
                    const v0Path = m.content.includes("<img");
                    if (v0Path) {
                        try {
                            const imgR = await enrichImageMessage(opts.vendorCtx, m.content);
                            if (imgR.mediaUrl) {
                                m.content = `${m.content}\n[图片] ${imgR.mediaUrl}`;
                                log.info(`[WPP v1.2.0] image enrich ok: msgId=${m.msgId} url=${imgR.mediaUrl}`);
                            }
                        }
                        catch (e) {
                            log.warn(`[WPP v1.2.0] image enrich failed (non-fatal): ${formatErr(e)}`, { msgId: m.msgId });
                        }
                    }
                    else {
                        const v1Info = isV1SchemaImage(m.raw);
                        if (v1Info.isV1 && v1Info.localId && v1Info.toWxid) {
                            let imgR = null;
                            if (v1Info.cdnDownloadCtx) {
                                try {
                                    imgR = await trackEnrich(`${m.accountId}:${m.fromWxid}`, () => enrichImageMessageFromV1Cdn(opts.vendorCtx, v1Info.cdnDownloadCtx, v1Info.md5));
                                    if (imgR.mediaUrl) {
                                        m.content = `${m.content}\n[图片] ${imgR.mediaUrl}`;
                                        log.info(`[WPP v1.2.5 IMAGE-CDN-DOWNLOAD] image enrich ok: msgId=${m.msgId} url=${imgR.mediaUrl} size=${imgR.mediaSize}`);
                                    }
                                    else {
                                        log.info(`[WPP v1.2.5 IMAGE-CDN-DOWNLOAD] miss (fallback DownloadImg): msgId=${m.msgId} err=${imgR.error}`);
                                        imgR = null;
                                    }
                                }
                                catch (e) {
                                    log.warn(`[WPP v1.2.5 IMAGE-CDN-DOWNLOAD] exception (fallback): ${formatErr(e)}`, { msgId: m.msgId });
                                    imgR = null;
                                }
                            }
                            if (!imgR) {
                                try {
                                    imgR = await enrichImageMessageFromV1(opts.vendorCtx, v1Info.localId, v1Info.toWxid, v1Info.md5, v1Info.dataLen);
                                    if (imgR.mediaUrl) {
                                        m.content = `${m.content}\n[图片] ${imgR.mediaUrl} (注: vendor v1 schema 推送, 仅下载首 64KB, 大图部分可能截断)`;
                                        log.info(`[WPP v1.2.0 V1-SCHEMA-ENRICH] image enrich ok: msgId=${m.msgId} localId=${v1Info.localId} url=${imgR.mediaUrl} size=${imgR.mediaSize}`);
                                    }
                                    else {
                                        log.warn(`[WPP v1.2.0] v1 schema image enrich returned no url: msgId=${m.msgId} localId=${v1Info.localId} error=${imgR.error}`, { msgId: m.msgId });
                                    }
                                }
                                catch (e) {
                                    log.warn(`[WPP v1.2.0] v1 schema image enrich failed (non-fatal): ${formatErr(e)}`, { msgId: m.msgId });
                                }
                            }
                        }
                    }
                }
                if (m.msgType === 43 && opts.vendorCtx) {
                    let vR = null;
                    const v1Video = isV1SchemaVideo(m.raw);
                    if (v1Video.isV1 && v1Video.videoCtx) {
                        try {
                            vR = await trackEnrich(`${m.accountId}:${m.fromWxid}`, () => enrichVideoMessageFromV1(opts.vendorCtx, v1Video.videoCtx));
                            if (!vR.mediaUrl) {
                                log.info(`[WPP v1.3.8 VIDEO-DOWNLOAD] miss (fallback XML): msgId=${m.msgId} err=${vR.error}`);
                                vR = null;
                            }
                        }
                        catch (e) {
                            log.warn(`[WPP v1.3.8 VIDEO-DOWNLOAD] exception (fallback): ${formatErr(e)}`, { msgId: m.msgId });
                            vR = null;
                        }
                    }
                    if (!vR && (m.content.includes("<videomsg") || m.content.includes("videomsg"))) {
                        try {
                            vR = await enrichVideoMessage(opts.vendorCtx, m.content);
                        }
                        catch (e) {
                            log.warn(`[WPP v1.2.0] video enrich exception: ${formatErr(e)}`, { msgId: m.msgId });
                            vR = null;
                        }
                    }
                    if (vR?.mediaUrl) {
                        m.content = `${m.content}\n[视频] ${vR.mediaUrl}`;
                        log.info(`[WPP v1.3.8] video enrich ok: msgId=${m.msgId} url=${vR.mediaUrl}`);
                    }
                    else if (vR?.error) {
                        log.warn(`[WPP v1.3.8] video enrich failed (non-fatal): err=${vR.error}`, { msgId: m.msgId });
                    }
                }
                if (m.msgType === 42) {
                    const pushContent = m.raw?.push_content;
                    const cardMatch = pushContent?.match(/\[名片\]\s*([^\s:：]+)/);
                    const cardName = cardMatch?.[1]?.trim();
                    if (cardName) {
                        m.content = `${m.content}\n[名片] ${cardName}`;
                        log.info(`[WPP v1.3.12 CARD] contact card: msgId=${m.msgId} name=${cardName}`);
                    }
                    else {
                        log.info(`[WPP v1.3.12 CARD] contact card (无名称): msgId=${m.msgId}`);
                    }
                }
                if (m.msgType === 34 && opts.vendorCtx) {
                    let vR = null;
                    const v1Voice = isV1SchemaVoice(m.raw);
                    if (v1Voice.isV1 && v1Voice.voiceCtx) {
                        try {
                            const rawVoice = m.raw?.voice;
                            const vendorTranscript = typeof rawVoice?.transcript === "string" && rawVoice.transcript.length > 0
                                ? rawVoice.transcript
                                : undefined;
                            vR = await trackEnrich(`${m.accountId}:${m.fromWxid}`, () => enrichVoiceMessageFromV1(opts.vendorCtx, v1Voice.voiceCtx, vendorTranscript));
                            if (!vR.mediaUrl) {
                                log.info(`[WPP v1.2.6 VOICE-DOWNLOAD-BINARY] miss (fallback): msgId=${m.msgId} err=${vR.error}`);
                                vR = null;
                            }
                        }
                        catch (e) {
                            log.warn(`[WPP v1.2.6 VOICE-DOWNLOAD-BINARY] exception (fallback): ${formatErr(e)}`, { msgId: m.msgId });
                            vR = null;
                        }
                    }
                    if (!vR && m.content.includes("<voicemsg")) {
                        try {
                            vR = await enrichVoiceMessage(opts.vendorCtx, m.content);
                        }
                        catch (e) {
                            log.warn(`[WPP v1.2.0] voice enrich exception: ${formatErr(e)}`, { msgId: m.msgId });
                            vR = null;
                        }
                    }
                    if (vR?.mediaUrl) {
                        const sttText = vR.filename ?? "";
                        const sttSuffix = sttText ? `\n[转写] ${sttText}` : "";
                        m.content = `${m.content}\n[语音] ${vR.mediaUrl}${sttSuffix}`;
                        log.info(`[WPP v1.2.6] voice enrich ok: msgId=${m.msgId} url=${vR.mediaUrl} stt=${sttText ? "yes" : "no"}`);
                    }
                    else if (vR?.error) {
                        log.warn(`[WPP v1.2.6] voice enrich failed (non-fatal): err=${vR.error}`, { msgId: m.msgId });
                    }
                }
                const isV0FileContent = m.content.includes("<appmsg") &&
                    (m.content.includes("<type>6</type>") || m.content.includes("<type>8</type>"));
                if (opts.vendorCtx && (m.msgType === 6 || (m.msgType === 49 && isV0FileContent))) {
                    try {
                        const fR = await enrichFileMessage(opts.vendorCtx, m.content);
                        if (fR.mediaUrl) {
                            m.content = `${m.content}\n[文件] ${fR.filename} (${fR.size ?? "?"} bytes) ${fR.mediaUrl}`;
                            log.info(`[WPP v1.2.0] file enrich ok: msgId=${m.msgId} name=${fR.filename} url=${fR.mediaUrl} (msgType=${m.msgType})`);
                        }
                        else {
                            m.content = `${m.content}\n[文件] ${fR.filename} (${fR.size ?? "?"} bytes, 下载失败: ${fR.error ?? "unknown"})`;
                            log.warn(`[WPP v1.2.0] file enrich failed (non-fatal): name=${fR.filename} err=${fR.error}`, {
                                msgId: m.msgId,
                            });
                        }
                    }
                    catch (e) {
                        log.warn(`[WPP v1.2.0] file enrich exception: ${formatErr(e)}`, { msgId: m.msgId });
                    }
                }
                else if (m.msgType === 49) {
                    const v1File = isV1SchemaFile(m.raw);
                    if (v1File.isV1) {
                        const filename = v1File.filename ?? "(未知文件名)";
                        const ext = v1File.ext ?? "";
                        const localId = m.raw?.local_id;
                        let gotUrl = false;
                        if (opts.vendorCtx && v1File.downloadCtx) {
                            try {
                                const fR = await trackEnrich(`${m.accountId}:${m.fromWxid}`, () => enrichFileMessageFromV1Binary(opts.vendorCtx, v1File.downloadCtx, filename, ext));
                                if (fR.mediaUrl) {
                                    m.content = `${m.content}\n[文件] ${filename} (${ext ? ext.toUpperCase() : "未知格式"}, ${fR.size ?? "?"} bytes) ${fR.mediaUrl}`;
                                    log.info(`[WPP v1.2.5 FILE-DOWNLOAD-BINARY] ok: msgId=${m.msgId} name=${filename} url=${fR.mediaUrl}`);
                                    gotUrl = true;
                                }
                                else {
                                    log.info(`[WPP v1.2.5 FILE-DOWNLOAD-BINARY] miss (fallback to MCP): msgId=${m.msgId} name=${filename} err=${fR.error}`);
                                }
                            }
                            catch (e) {
                                log.warn(`[WPP v1.2.5 FILE-DOWNLOAD-BINARY] exception (fallback): ${formatErr(e)}`, { msgId: m.msgId });
                            }
                        }
                        if (!gotUrl && opts.vendorCtx && localId && opts.mcpEnabled !== false) {
                            try {
                                const fR = await enrichFileMessageViaMcp(localId, filename, m.accountId);
                                if (fR.mediaUrl) {
                                    m.content = `${m.content}\n[文件] ${filename} (${ext ? ext.toUpperCase() : "未知格式"}) ${fR.mediaUrl}`;
                                    log.info(`[WPP v1.2.0 VENDOR-MCP] file via MCP ok: msgId=${m.msgId} localId=${localId} url=${fR.mediaUrl}`);
                                    gotUrl = true;
                                }
                                else {
                                    log.info(`[WPP v1.2.0 VENDOR-MCP] file via MCP miss (fallback): msgId=${m.msgId} localId=${localId} err=${fR.error}`);
                                }
                            }
                            catch (e) {
                                log.warn(`[WPP v1.2.0 VENDOR-MCP] file via MCP exception: ${formatErr(e)}`, { msgId: m.msgId });
                            }
                        }
                        if (!gotUrl) {
                            m.content = `${m.content}\n[系统提示-文件限制] 此文件消息仅有文件名元数据, vendor 当前不提供文件内容下载 (MCP 增强未命中), 你无法读取文件内容。\n禁止: 用 find/ls 搜索 *.pdf 或任何文件、猜测/拼接文件路径、读取系统里任何现有文件 (可能是旧文件误导)。\n只需: 基于文件名回复用户 (例如"收到文件 ${filename}, 但当前平台无法读取文件内容, 需要内容请换图片或文本发送"), 或询问用户是否改用文本/图片发送。`;
                            log.info(`[WPP v1.2.0 NO-PATH-GUESS] file msg (v1 schema) fallback: msgId=${m.msgId} name=${filename} ext=${ext}`);
                        }
                    }
                }
                if (m.content.includes("<refermsg")) {
                    try {
                        await captureQuoteSvrid(m.content, m.accountId);
                    }
                    catch (e) {
                        warn(`quote svrid capture err (non-fatal): ${formatErr(e)}`);
                    }
                }
                if (m.msgType === 49) {
                    let quotedMsgId = "";
                    try {
                        const appRef = extractReferencedFromApp(m.raw);
                        if (appRef) {
                            quotedMsgId = appRef.newMsgId ?? appRef.svrId ?? "";
                        }
                        else if (m.content.includes("<refermsg")) {
                            const parsed = parseQuoteXml(m.content);
                            quotedMsgId = parsed?.msgId ?? "";
                        }
                        else {
                            const rc = extractReferencedFromReplyContext(m.raw);
                            if (rc?.svrId || rc?.newMsgId) {
                                quotedMsgId = rc.svrId ?? rc.newMsgId ?? "";
                            }
                        }
                        if (quotedMsgId) {
                            const quoted = await getMessageByMsgIdOrNewId(quotedMsgId, undefined, m.accountId, { direction: "any" })
                                ?? (await getMessageById(quotedMsgId, m.accountId));
                            if (quoted?.content) {
                                const mediaMatch = quoted.content.match(/\[(图片|视频|语音|文件)\]\s+(?:[^\n]*?)\s*(https?:\/\/\S+)/);
                                if (mediaMatch) {
                                    const tag = mediaMatch[1] ?? "媒体";
                                    const ossUrl = mediaMatch[2] ?? "";
                                    info(`[WPP v1.2.0] QUOTE media inject: msgId=${m.msgId} quoted.msgId=${quotedMsgId} type=${tag} ossUrl=${ossUrl}`);
                                    m.content = `${m.content}\n[引用${tag}] ${ossUrl}`;
                                }
                            }
                        }
                    }
                    catch (e) {
                        warn(`quote media inject err (non-fatal): ${formatErr(e)}`);
                    }
                }
            }
            const ctxForTriggerEarly = { ...opts.triggerCtx, allowFrom: opts.triggerCtx.allowFrom };
            const persistResults = new Map();
            for (const m of batch) {
                const t = shouldTrigger(m, opts.triggerConfig, ctxForTriggerEarly);
                persistResults.set(m, t);
            }
            const persistBatch = batch.filter((m) => persistResults.get(m)?.via !== "blocked");
            const r = await enrichBatch(persistBatch);
            if (r.failed > 0) {
                warn(`inbound batch persist: ${r.failed}/${persistBatch.length} failed (skipped ${batch.length - persistBatch.length} blocked)`);
            }
            for (const m of batch) {
                if (opts.parseRelay !== false && isRelayMessage(m)) {
                    try {
                        const relay = parseRelayText(m.content);
                        info(`relay detected: title="${relay.title.slice(0, 30)}", items=${relay.items.length} msgType=${m.msgType}`);
                        m.content = `[接龙] ${relay.title}\n` +
                            relay.items.map((it) => `${it.index}. ${it.text ?? ""}`).join("\n");
                    }
                    catch (e) {
                        warn(`relay parse failed: ${formatErr(e)}`);
                    }
                }
                if (m.peerKind === "group") {
                    const atList = extractAtUserList(m.content);
                    if (atList.length > 0) {
                        m.raw.atUserList = atList;
                    }
                }
                if (isRedPacketMessage(m)) {
                    processRedPacket(m);
                    continue;
                }
            }
            const triggerResults = persistResults;
            const dispatched = [];
            for (const [m, t] of triggerResults) {
                if (m.peerId === "filehelper" && /^\s*\//.test(m.content))
                    continue;
                if (opts.enableDispatch !== false && isRelayMessage(m)) {
                    const t = triggerResults.get(m);
                    if (t?.via === "blocked")
                        continue;
                    const titleKey = (m.content ?? "").split("\n")[0]?.slice(0, 30) ?? "";
                    const throttleKey = `${m.accountId}:${m.peerId}:${titleKey}`;
                    const now = Date.now();
                    if (relayTriggerAt.size > 1000) {
                        for (const [k, ts] of relayTriggerAt) {
                            if (now - ts > RELAY_THROTTLE_MS)
                                relayTriggerAt.delete(k);
                        }
                    }
                    const lastAt = relayTriggerAt.get(throttleKey) ?? 0;
                    if (now - lastAt >= RELAY_THROTTLE_MS) {
                        relayTriggerAt.set(throttleKey, now);
                        m.trigger = "msgType";
                        dispatched.push(m);
                        info(`relay force-trigger dispatch: peer=${m.peerId} msgId=${m.msgId} via=msgType (throttle key=${throttleKey.slice(0, 40)})`);
                    }
                    else {
                        debug(`relay throttled (last ${Math.round((now - lastAt) / 1000)}s ago, TTL ${RELAY_THROTTLE_MS / 1000}s): ${throttleKey.slice(0, 40)}`);
                    }
                    continue;
                }
                if (t.triggered && t.via !== "blocked") {
                    m.trigger = t.via ?? "at";
                    if (t.via === "at" || t.via === "keyword" || t.via === "msgType" ||
                        t.via === "quoteBot" || t.via === "group-open") {
                        dispatched.push(m);
                    }
                }
            }
            if (opts.enableDispatch !== false && opts.onPairingAttempt &&
                (opts.dmPairingEnabled || opts.triggerCtx.dmPairingEnabled)) {
                for (const m of batch) {
                    if (m.peerKind !== "direct")
                        continue;
                    const t = triggerResults.get(m);
                    if (t?.via !== "blocked")
                        continue;
                    if (opts.triggerCtx.botWxid && m.fromWxid === opts.triggerCtx.botWxid)
                        continue;
                    const code = extractPairCode(m.content);
                    if (code) {
                        try {
                            await opts.onPairingAttempt({ msg: m, code });
                            log.info(`[WPP v1.2.3 PAIRING] attempt handled: account=${opts.accountId} from=${m.fromWxid}`);
                        }
                        catch (e) {
                            log.warn(`[WPP v1.2.3] pairing attempt failed (non-fatal): ${formatErr(e)}`, { accountId: opts.accountId, fromWxid: m.fromWxid });
                        }
                    }
                }
            }
            if (opts.enableDispatch !== false && opts.onFileHelperCommand) {
                for (const m of batch) {
                    if (m.peerId !== "filehelper")
                        continue;
                    const cmd = m.content.trim();
                    if (!/^\//.test(cmd))
                        continue;
                    try {
                        await opts.onFileHelperCommand({ msg: m, command: cmd });
                        log.info(`[WPP v1.3.39 FILEHELPER] command handled: ${cmd.split(/\s+/)[0]}`);
                    }
                    catch (e) {
                        log.warn(`[WPP v1.3.39 FILEHELPER] command failed: ${formatErr(e)}`);
                    }
                }
            }
            if (dispatched.length === 0)
                return;
            info(`inbound dispatch: ${dispatched.length}/${batch.length} triggered (vias: ${dispatched.map((d) => d.trigger).join(",")})`);
            if (opts.enableDispatch !== false && opts.onDispatch) {
                for (const m of dispatched) {
                    await opts.onDispatch(m, batch);
                }
            }
        },
        onError: (err, batch) => {
            warn(`inbound batch error: ${formatErr(err)}`, { size: batch.length });
        },
    });
    const seenTracker = new SeenTracker();
    return {
        handle: async (payload) => {
            const msgs = payloadToAllInboundMessages(opts.accountId, payload);
            try {
                const acct = getDefaultAccountRegistry().get(opts.accountId);
                const selfWxid = acct?.selfWxid;
                if (selfWxid) {
                    for (const m of msgs) {
                        if (m.peerKind === "direct") {
                            if (m.fromWxid === selfWxid && m.toWxid) {
                                m.peerId = m.toWxid;
                            }
                        }
                    }
                }
            }
            catch (e) {
                warn(`peerId fixup skipped (non-fatal): ${formatErr(e)}`);
            }
            if (msgs.length === 0) {
                const payloadData = payload?.Data;
                const payloadMsgs = payloadData?.messages;
                const msgCount = Array.isArray(payloadMsgs) ? payloadMsgs.length : undefined;
                warn(`inbound parse dropped: account=${opts.accountId} payloadKeys=${Object.keys((payload ?? {})).join(",")} dataKeys=${Object.keys(payloadData ?? {}).join(",")} messagesLen=${msgCount ?? "n/a"}`);
                return;
            }
            for (const m of msgs) {
                const dk = buildDedupeKey(undefined, m.newMsgId, m.msgId, m.content);
                if (!seenTracker.check(dk)) {
                    continue;
                }
                if (m.msgId || m.newMsgId) {
                    try {
                        const existing = await getMessageByMsgIdOrNewId(m.msgId, m.newMsgId, m.accountId);
                        if (existing) {
                            log.debug(`inbound dedup (db): skip msgId=${m.msgId} newMsgId=${m.newMsgId} (already persisted)`);
                            continue;
                        }
                    }
                    catch (e) {
                        log.warn(`inbound dedup (db) check failed: ${formatErr(e)}`, { msgId: m.msgId });
                    }
                }
                debouncer.enqueue(m);
            }
        },
        flushAll: async () => {
            await debouncer.flushAll();
        },
    };
}
