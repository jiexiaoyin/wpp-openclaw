// src/inbound/handler.ts - 主入口 (debouncer + 4-way triggers + enrich)

import { info, warn, debug, logObj as log, formatErr } from "../core/logger.js";
import {
  WppInboundDebouncer,
  type DebouncerCallbacks,
} from "./debouncer.js";
import {
  shouldTrigger,
  type WppTriggerConfig,
  type WppAccountTriggerCtx,
} from "./triggers.js";
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
import { enrichImageMessage, enrichImageMessageFromV1, enrichImageMessageFromV1Cdn, enrichFileMessage, enrichFileMessageFromV1Binary, enrichVideoMessage, enrichVideoMessageFromV1, isV1SchemaVideo, enrichVoiceMessage, enrichVoiceMessageFromV1, isV1SchemaVoice, enrichFileMessageViaMcp, isV1SchemaImage, isV1SchemaFile, type ImageEnrichResult, type MediaEnrichResult } from "./media-enrich.js";
import { getDefaultAccountRegistry } from "../account-state.js";
import type { WppInboundMessage, WppWebhookPayload } from "../types.js";
import type { WppAccountCtx } from "../send/factory.js";
import {
  judgeHeartflow,
  recordRawMessage,
  getChatState,
  buildChatContextSummary,
  getRawBuffer,
  formatRawMessages,
  lastBotReply,
  secondsSinceLastReply,
  recordActiveReply,
  recordPassiveMessage,
  type HeartflowConfig,
} from "./heartflow.js";
import {
  updateJargonFromMessage,
  recordJargonMessage,
  shouldTriggerMine,
  mineJargonForGroup,
  getRecentMessages,
  type JargonConfig,
} from "./jargon.js";

// 问题: 群聊发文件/图 (enrich 慢, 下载大文件几秒) + @机器人, 触发消息 dispatch 时文件还没入库。
// 解法: enrich 时 trackEnrich 记录 promise, 触发 dispatch 前 waitForPendingEnrich 等待同 sender 的 enrich 完成。
const pendingEnrichs = new Map<string, Promise<void>>();

// v1.3.54 RELAY-TRIGGER 节流: 同群同接龙标题, RELAY_THROTTLE_MS 内只触发一次 AI 鼓励。
// 背景: vendor 每次有人接龙都推送完整接龙 (type=49 app), 若不节流 AI 每条都回 → 刷屏。
// key = `${peerId}:${content 首行前 30 字}` (同一接龙 title 指纹); 被 @ 的消息 content 不同 → 不受节流影响。
const RELAY_THROTTLE_MS = 5 * 60 * 1000;
const relayTriggerAt = new Map<string, number>();
/** 测试注入: 重置接龙节流状态 (防测试间污染) */
export function __resetRelayThrottle(): void {
  relayTriggerAt.clear();
}

/** 追踪一次 enrich (key = accountId:sender, 同 sender 串行) */
function trackEnrich<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const p = fn().finally(() => pendingEnrichs.delete(key));
  // 存 Promise<void> 变体 (只等完成), waitForPendingEnrich 用
  pendingEnrichs.set(key, p.then(() => undefined));
  return p;
}

/**
 * 等待同 sender 的 pending enrich 完成 (触发 dispatch 前调, 防 AI 看不到刚发的文件/图)。
 * 超时降级: 极端大文件下载超时 → 不阻塞触发 (AI 少看到该文件, 可接受)。
 */
export async function waitForPendingEnrich(
  accountId: string,
  sender: string,
  timeoutMs = 10_000,
): Promise<void> {
  const p = pendingEnrichs.get(`${accountId}:${sender}`);
  if (!p) return;
  try {
    await Promise.race([p, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
  } catch {
    /* enrich 失败不阻塞 */
  }
}

/** 测试用: 清空 pending enrich (隔离) */
export function clearPendingEnrichs(): void {
  pendingEnrichs.clear();
}

/**
 * 测试用: 模拟一个 pending enrich (用于 waitForPendingEnrich 真测)
 * 镜像私有 trackEnrich: 注册一个 promise, 完成后清理
 * v1.3.18: 加此 helper 让 tests/pending-enrich.test.ts 能真测 "有 pending 时等待完成"
 */
export function __testSetPendingEnrich(key: string, fn: () => Promise<unknown>): void {
  const p = fn().finally(() => pendingEnrichs.delete(key));
  pendingEnrichs.set(key, p.then(() => undefined));
}

export interface WppInboundHandlerOpts {
  accountId: string;
  triggerConfig: WppTriggerConfig;
  triggerCtx: WppAccountTriggerCtx;
  /** 是否真发 (false = debug 模式, enrich 但不 dispatch) */
  enableDispatch?: boolean;
  /** 外部 dispatcher hook (接入 OpenClaw runtime) — 暂记日志 */
  onDispatch?: (msg: WppInboundMessage, batch: WppInboundMessage[]) => void | Promise<void>;
  /** v1.2.3 PAIRING: 账号是否启用 DM 配对 (accounts/<id>.json 显式 dmPairingEnabled: true) — 热切走 triggerCtx, 此为创建时快照兜底 */
  dmPairingEnabled?: boolean;
  /** v1.2.4 GROUP-CONTEXT: 是否缓冲非触发群消息进上下文 (默认 false, 显式 true 才开启) — 热切走 triggerCtx */
  groupContextEnabled?: boolean;
  /** v1.2.3 PAIRING: 配对拦截回调 — 由 index.ts wire. handler 只识别/解析/调用, 不做 fs/发送副作用 */
  onPairingAttempt?: (ctx: { msg: WppInboundMessage; code: string }) => void | Promise<void>;
  /** v1.3.39 FILEHELPER: filehelper 命令回调 (只处理命令, 非命令仍过滤) — 由 index.ts wire */
  onFileHelperCommand?: (ctx: { msg: WppInboundMessage; command: string }) => void | Promise<void>;
  /** 是否把 chat-history (type=53) 解析成接龙 items 注入 prompt */
  parseRelay?: boolean;
  /** vendor ctx (baseUrl/tokenKey/authcode) — 媒体下载/OSS 上传用 */
  vendorCtx?: WppAccountCtx;
  /** DM allowFrom 白名单 (caller 加载, handler 透传给 trigger) */
  allowFrom?: string[];
  /** v1.2.0 VENDOR-MCP: 是否启用 MCP 文件增强 (默认 true; false 则纯确定性回复兜底) */
  mcpEnabled?: boolean;
  /** v1.3.75 HEARTFLOW: 心流配置 (触发器 shouldTrigger 已用 gate; 这里做 async judge) */
  heartflow?: HeartflowConfig;
  /** v1.3.75 HEARTFLOW: 机器人昵称 (判断 prompt 用) */
  botNickname?: string;
  /** v1.3.76 JARGON: 黑话挖掘配置 (默认 {enabled:false}; 旁路采集 + 定时挖掘) */
  jargon?: JargonConfig;
}

/**
 * 创建主 inbound handler — 给 webhook/WS 推送使用.
 * - parse + 4-way triggers + enrichAndSave + (optional) dispatch
 */
export function createWppInboundHandler(
  opts: WppInboundHandlerOpts,
): { handle: (payload: WppWebhookPayload) => Promise<void>; flushAll: () => Promise<void> } {
  const debouncer = new WppInboundDebouncer({
    onFlush: async (batch) => {
      // 先 enrich (DB 也带 OSS URL) 再 save; enrich 失败不阻塞 (非致命)
      for (const m of batch) {
        // 图片: v0 schema (content 含 <img> XML) 走 CdnDownloadImage 完整大图; v1 schema (无 XML) 走 DownloadImg 64KB
        if (m.msgType === 3 && opts.vendorCtx) {
          const v0Path = m.content.includes("<img");
          if (v0Path) {
            try {
              const imgR = await enrichImageMessage(opts.vendorCtx, m.content);
              if (imgR.mediaUrl) {
                m.content = `${m.content}\n[图片] ${imgR.mediaUrl}`;
                log.info(`[WPP v1.3.74] image enrich ok: msgId=${m.msgId} url=${imgR.mediaUrl}`);
              }
            } catch (e) {
              log.warn(`[WPP v1.3.74] image enrich failed (non-fatal): ${formatErr(e)}`, { msgId: m.msgId });
            }
          } else {
            // v1 schema 图片: v1.2.5 新版推送带 cdn_download_contexts → CdnDownloadImage 完整大图 (优先)
            //   失败 → DownloadImg 64KB 兜底 (旧路径)
            const v1Info = isV1SchemaImage(m.raw);
            if (v1Info.isV1 && v1Info.localId && v1Info.toWxid) {
              let imgR: ImageEnrichResult | null = null;
              // 路径 1 (v1.2.5 首选): cdn_download_contexts → CdnDownloadImage 完整大图
              if (v1Info.cdnDownloadCtx) {
                try {
                  imgR = await trackEnrich(`${m.accountId}:${m.fromWxid}`, () =>
                    enrichImageMessageFromV1Cdn(opts.vendorCtx!, v1Info.cdnDownloadCtx!, v1Info.md5),
                  );
                  if (imgR.mediaUrl) {
                    m.content = `${m.content}\n[图片] ${imgR.mediaUrl}`;
                    log.info(`[WPP v1.2.5 IMAGE-CDN-DOWNLOAD] image enrich ok: msgId=${m.msgId} url=${imgR.mediaUrl} size=${imgR.mediaSize}`);
                  } else {
                    log.info(`[WPP v1.2.5 IMAGE-CDN-DOWNLOAD] miss (fallback DownloadImg): msgId=${m.msgId} err=${imgR.error}`);
                    imgR = null;
                  }
                } catch (e) {
                  log.warn(`[WPP v1.2.5 IMAGE-CDN-DOWNLOAD] exception (fallback): ${formatErr(e)}`, { msgId: m.msgId });
                  imgR = null;
                }
              }
              // 路径 2 (旧): DownloadImg 64KB 兜底
              if (!imgR) {
                try {
                  imgR = await enrichImageMessageFromV1(
                    opts.vendorCtx,
                    v1Info.localId,
                    v1Info.toWxid,
                    v1Info.md5,
                    v1Info.dataLen, // v1.3.70: 新 vendor DownloadImg 必填 data_len
                  );
                  if (imgR.mediaUrl) {
                    m.content = `${m.content}\n[图片] ${imgR.mediaUrl} (注: vendor v1 schema 推送, 仅下载首 64KB, 大图部分可能截断)`;
                    log.info(`[WPP v1.2.0 V1-SCHEMA-ENRICH] image enrich ok: msgId=${m.msgId} localId=${v1Info.localId} url=${imgR.mediaUrl} size=${imgR.mediaSize}`);
                  } else {
                    log.warn(`[WPP v1.3.74] v1 schema image enrich returned no url: msgId=${m.msgId} localId=${v1Info.localId} error=${imgR.error}`, { msgId: m.msgId });
                  }
                } catch (e) {
                  log.warn(`[WPP v1.3.74] v1 schema image enrich failed (non-fatal): ${formatErr(e)}`, { msgId: m.msgId });
                }
              }
            }
          }
        }

        // 视频: msgType=43 → 新版 video.download_context → DownloadVideo (优先); 旧 videomsg XML 兜底
        if (m.msgType === 43 && opts.vendorCtx) {
          let vR: MediaEnrichResult | null = null;
          const v1Video = isV1SchemaVideo(m.raw);
          if (v1Video.isV1 && v1Video.videoCtx) {
            try {
              vR = await trackEnrich(`${m.accountId}:${m.fromWxid}`, () =>
                enrichVideoMessageFromV1(opts.vendorCtx!, v1Video.videoCtx!),
              );
              if (!vR.mediaUrl) {
                log.info(`[WPP v1.3.8 VIDEO-DOWNLOAD] miss (fallback XML): msgId=${m.msgId} err=${vR.error}`);
                vR = null;
              }
            } catch (e) {
              log.warn(`[WPP v1.3.8 VIDEO-DOWNLOAD] exception (fallback): ${formatErr(e)}`, { msgId: m.msgId });
              vR = null;
            }
          }
          // 旧路径: <videomsg> XML
          if (!vR && (m.content.includes("<videomsg") || m.content.includes("videomsg"))) {
            try {
              vR = await enrichVideoMessage(opts.vendorCtx, m.content);
            } catch (e) {
              log.warn(`[WPP v1.3.74] video enrich exception: ${formatErr(e)}`, { msgId: m.msgId });
              vR = null;
            }
          }
          if (vR?.mediaUrl) {
            m.content = `${m.content}\n[视频] ${vR.mediaUrl}`;
            log.info(`[WPP v1.3.8] video enrich ok: msgId=${m.msgId} url=${vR.mediaUrl}`);
          } else if (vR?.error) {
            log.warn(`[WPP v1.3.8] video enrich failed (non-fatal): err=${vR.error}`, { msgId: m.msgId });
          }
        }

        // 名片: msgType=42 (contact_card) → 从 push_content 提取名片名 (如 "[名片]龙脉") 注入 content, AI 知道是谁的名片
        if (m.msgType === 42) {
          const pushContent = (m.raw as Record<string, unknown> | null)?.push_content as string | undefined;
          const cardMatch = pushContent?.match(/\[名片\]\s*([^\s:：]+)/);
          const cardName = cardMatch?.[1]?.trim();
          if (cardName) {
            m.content = `${m.content}\n[名片] ${cardName}`;
            log.info(`[WPP v1.3.12 CARD] contact card: msgId=${m.msgId} name=${cardName}`);
          } else {
            log.info(`[WPP v1.3.12 CARD] contact card (无名称): msgId=${m.msgId}`);
          }
        }

        // 语音: msgType=34 → 下载 + OSS + SiliconFlow STT 转写文字注入 content (AI 看到文本)
        if (m.msgType === 34 && opts.vendorCtx) {
          let vR: MediaEnrichResult | null = null;
          // 路径 1 (v1.2.6 首选): 新版 voice.download_context → DownloadVoiceBinary
          const v1Voice = isV1SchemaVoice(m.raw);
          if (v1Voice.isV1 && v1Voice.voiceCtx) {
            try {
              // v1.3.22 VENDOR-TRANSCRIPT: 透传 vendor 自带转写 (voice.transcript), 免插件 STT
              const rawVoice = (m.raw as Record<string, unknown> | undefined)?.voice as
                | Record<string, unknown>
                | undefined;
              const vendorTranscript =
                typeof rawVoice?.transcript === "string" && rawVoice.transcript.length > 0
                  ? (rawVoice.transcript as string)
                  : undefined;
              vR = await trackEnrich(`${m.accountId}:${m.fromWxid}`, () =>
                enrichVoiceMessageFromV1(opts.vendorCtx!, v1Voice.voiceCtx!, vendorTranscript),
              );
              if (!vR.mediaUrl) {
                log.info(`[WPP v1.2.6 VOICE-DOWNLOAD-BINARY] miss (fallback): msgId=${m.msgId} err=${vR.error}`);
                vR = null;
              }
            } catch (e) {
              log.warn(`[WPP v1.2.6 VOICE-DOWNLOAD-BINARY] exception (fallback): ${formatErr(e)}`, { msgId: m.msgId });
              vR = null;
            }
          }
          // 路径 2 (旧): <voicemsg> XML → DownloadVoice
          if (!vR && m.content.includes("<voicemsg")) {
            try {
              vR = await enrichVoiceMessage(opts.vendorCtx, m.content);
            } catch (e) {
              log.warn(`[WPP v1.3.74] voice enrich exception: ${formatErr(e)}`, { msgId: m.msgId });
              vR = null;
            }
          }
          // 处理结果
          if (vR?.mediaUrl) {
            const sttText = vR.filename ?? "";
            const sttSuffix = sttText ? `\n[转写] ${sttText}` : "";
            m.content = `${m.content}\n[语音] ${vR.mediaUrl}${sttSuffix}`;
            log.info(`[WPP v1.2.6] voice enrich ok: msgId=${m.msgId} url=${vR.mediaUrl} stt=${sttText ? "yes" : "no"}`);
          } else if (vR?.error) {
            log.warn(`[WPP v1.2.6] voice enrich failed (non-fatal): err=${vR.error}`, { msgId: m.msgId });
          }
        }

        // 文件: v0 schema (msgType 6 或 appmsg 含 <type>6/8</type>) 走 enrichFileMessage 完整下载;
        //       v1 schema 无下载参数 (见下方 fallback)
        const isV0FileContent =
          m.content.includes("<appmsg") &&
          (m.content.includes("<type>6</type>") || m.content.includes("<type>8</type>"));
        if (opts.vendorCtx && (m.msgType === 6 || (m.msgType === 49 && isV0FileContent))) {
          try {
            const fR = await enrichFileMessage(opts.vendorCtx, m.content);
            if (fR.mediaUrl) {
              m.content = `${m.content}\n[文件] ${fR.filename} (${fR.size ?? "?"} bytes) ${fR.mediaUrl}`;
              log.info(`[WPP v1.3.74] file enrich ok: msgId=${m.msgId} name=${fR.filename} url=${fR.mediaUrl} (msgType=${m.msgType})`);
            } else {
              m.content = `${m.content}\n[文件] ${fR.filename} (${fR.size ?? "?"} bytes, 下载失败: ${fR.error ?? "unknown"})`;
              log.warn(`[WPP v1.3.74] file enrich failed (non-fatal): name=${fR.filename} err=${fR.error}`, {
                msgId: m.msgId,
              });
            }
          } catch (e) {
            log.warn(`[WPP v1.3.74] file enrich exception: ${formatErr(e)}`, { msgId: m.msgId });
          }
        } else if (m.msgType === 49) {
          // v1 schema 文件 (kind=app, app.category=file)
          //   失败 → v1.2.0 MCP 兜底 → 最后确定性回复 (禁 AI 猜路径读文件)
          const v1File = isV1SchemaFile(m.raw);
          if (v1File.isV1) {
            const filename = v1File.filename ?? "(未知文件名)";
            const ext = v1File.ext ?? "";
            const localId = (m.raw as { local_id?: number })?.local_id;
            let gotUrl = false;

            // 路径 1 (v1.2.5 首选): DownloadFileBinary 完整下载 (新版推送自带 download_context)
            if (opts.vendorCtx && v1File.downloadCtx) {
              try {
                const fR = await trackEnrich(`${m.accountId}:${m.fromWxid}`, () =>
                  enrichFileMessageFromV1Binary(opts.vendorCtx!, v1File.downloadCtx!, filename, ext),
                );
                if (fR.mediaUrl) {
                  m.content = `${m.content}\n[文件] ${filename} (${ext ? ext.toUpperCase() : "未知格式"}, ${fR.size ?? "?"} bytes) ${fR.mediaUrl}`;
                  log.info(`[WPP v1.2.5 FILE-DOWNLOAD-BINARY] ok: msgId=${m.msgId} name=${filename} url=${fR.mediaUrl}`);
                  gotUrl = true;
                } else {
                  log.info(`[WPP v1.2.5 FILE-DOWNLOAD-BINARY] miss (fallback to MCP): msgId=${m.msgId} name=${filename} err=${fR.error}`);
                }
              } catch (e) {
                log.warn(`[WPP v1.2.5 FILE-DOWNLOAD-BINARY] exception (fallback): ${formatErr(e)}`, { msgId: m.msgId });
              }
            }

            // 路径 2: MCP 增强 (旧路径, 只调只读工具, 不碰写)
            if (!gotUrl && opts.vendorCtx && localId && opts.mcpEnabled !== false) {
              try {
                const fR = await enrichFileMessageViaMcp(localId, filename, m.accountId);
                if (fR.mediaUrl) {
                  m.content = `${m.content}\n[文件] ${filename} (${ext ? ext.toUpperCase() : "未知格式"}) ${fR.mediaUrl}`;
                  log.info(`[WPP v1.2.0 VENDOR-MCP] file via MCP ok: msgId=${m.msgId} localId=${localId} url=${fR.mediaUrl}`);
                  gotUrl = true;
                } else {
                  log.info(`[WPP v1.2.0 VENDOR-MCP] file via MCP miss (fallback): msgId=${m.msgId} localId=${localId} err=${fR.error}`);
                }
              } catch (e) {
                log.warn(`[WPP v1.2.0 VENDOR-MCP] file via MCP exception: ${formatErr(e)}`, { msgId: m.msgId });
              }
            }

            // 兜底: 都失败 → 确定性回复 (禁 AI 猜路径)
            if (!gotUrl) {
              m.content = `${m.content}\n[系统提示-文件限制] 此文件消息仅有文件名元数据, vendor 当前不提供文件内容下载 (MCP 增强未命中), 你无法读取文件内容。\n禁止: 用 find/ls 搜索 *.pdf 或任何文件、猜测/拼接文件路径、读取系统里任何现有文件 (可能是旧文件误导)。\n只需: 基于文件名回复用户 (例如"收到文件 ${filename}, 但当前平台无法读取文件内容, 需要内容请换图片或文本发送"), 或询问用户是否改用文本/图片发送。`;
              log.info(`[WPP v1.2.0 NO-PATH-GUESS] file msg (v1 schema) fallback: msgId=${m.msgId} name=${filename} ext=${ext}`);
            }
          }
        }

        // 捕获引用消息 svrid → 存映射表 (供未来引用定位)
        if (m.content.includes("<refermsg")) {
          try {
            await captureQuoteSvrid(m.content, m.accountId);
          } catch (e) {
            warn(`quote svrid capture err (non-fatal): ${formatErr(e)}`);
          }
        }

        // 引用消息: 查 DB 被引用消息, 把原媒体 OSS URL 注入 content → AI 看到原图/原资源
        if (m.msgType === 49) {
          let quotedMsgId = "";
          try {
            const appRef = extractReferencedFromApp(m.raw);
            if (appRef) {
              quotedMsgId = appRef.newMsgId ?? appRef.svrId ?? "";
            } else if (m.content.includes("<refermsg")) {
              const parsed = parseQuoteXml(m.content);
              quotedMsgId = parsed?.msgId ?? "";
            } else {
              // 旧 reply_context (msg_id 常对不上, 保留兜底)
              const rc = extractReferencedFromReplyContext(m.raw);
              if (rc?.svrId || rc?.newMsgId) {
                quotedMsgId = rc.svrId ?? rc.newMsgId ?? "";
              }
            }
            if (quotedMsgId) {
              // v1.3.57 P2-4 (2026-08-13 交付审阅): 引用解析查全方向 — bot 回复也入库 (outbound),
              //   用户引用 bot 的图/文件时默认 direction=inbound 查不到, 加 any (与 dispatcher.ts:216 对齐)
              const quoted = await getMessageByMsgIdOrNewId(quotedMsgId, undefined, m.accountId, { direction: "any" })
                ?? (await getMessageById(quotedMsgId, m.accountId));
              if (quoted?.content) {
                // 匹配 enrich 注入的 [图片]/[视频]/[语音]/[文件] URL, 取第一个注入
                const mediaMatch = quoted.content.match(/\[(图片|视频|语音|文件)\]\s+(?:[^\n]*?)\s*(https?:\/\/\S+)/);
                if (mediaMatch) {
                  const tag = mediaMatch[1] ?? "媒体";
                  const ossUrl = mediaMatch[2] ?? "";
                  info(`[WPP v1.3.74] QUOTE media inject: msgId=${m.msgId} quoted.msgId=${quotedMsgId} type=${tag} ossUrl=${ossUrl}`);
                  m.content = `${m.content}\n[引用${tag}] ${ossUrl}`;
                }
              }
            }
          } catch (e) {
            warn(`quote media inject err (non-fatal): ${formatErr(e)}`);
          }
        }
      }

      // Step 2: persist (DB 落 enrich 后的 content) — v1.2.4 老板拍板 "只入白名单":
      //   黑名单群/非 allowlist 群/DM 白名单外/自回环 (shouldTrigger via=blocked) 不入库 (隐私)
      //   白名单内消息 (含触发 + 白名单群非触发) 入库 → DB 按人查历史依赖
      const ctxForTriggerEarly = { ...opts.triggerCtx, allowFrom: opts.triggerCtx.allowFrom };
      const persistResults = new Map<WppInboundMessage, ReturnType<typeof shouldTrigger>>();
      for (const m of batch) {
        const t = shouldTrigger(m, opts.triggerConfig, ctxForTriggerEarly);
        persistResults.set(m, t);
      }
      const persistBatch = batch.filter((m) => persistResults.get(m)?.via !== "blocked");
      const r = await enrichBatch(persistBatch);
      if (r.failed > 0) {
        warn(`inbound batch persist: ${r.failed}/${persistBatch.length} failed (skipped ${batch.length - persistBatch.length} blocked)`);
      }

      // Step 3: relay 解析 (接龙): 给 prompt 注入 items
      // v1.3.54 RELAY-TRIGGER: 用 isRelayMessage 识别 (真实 vendor 接龙 type=49 app, 非 53)
      for (const m of batch) {
        if (opts.parseRelay !== false && isRelayMessage(m)) {
          try {
            const relay = parseRelayText(m.content);
            info(`relay detected: title="${relay.title.slice(0, 30)}", items=${relay.items.length} msgType=${m.msgType}`);
            m.content = `[接龙] ${relay.title}\n` +
              relay.items.map((it) => `${it.index}. ${it.text ?? ""}`).join("\n");
          } catch (e) {
            warn(`relay parse failed: ${formatErr(e)}`);
          }
        }
        // 注入 at 列表 (供 prompt / ctx 字段用)
        if (m.peerKind === "group") {
          const atList = extractAtUserList(m.content);
          if (atList.length > 0) {
            // 嵌入 raw 的 atUserList 字段 — Phase D 简易版, Phase F 正式注入 ctx
            (m.raw as Record<string, unknown>).atUserList = atList;
          }
        }

        // 红包消息: 处理后 continue, 不触发 AI 回复
        if (isRedPacketMessage(m)) {
          processRedPacket(m);  // log + 提取 url/key, 未来可接 auto-open
          continue;
        }
      }

      // v1.3.75 HEARTFLOW: 记录所有群消息 (含 bot 自己发的 via outbound) 进心流缓冲 —
      //   供判断小模型看上下文 (与 Heartflow _record_raw_message 一致)。
      //   仅记录未 blocked 的群消息 (隐私: 黑名单/非白名单不入缓冲)。
      if (opts.heartflow?.enabled) {
        for (const m of batch) {
          const tr = persistResults.get(m);
          if (tr?.via === "blocked") continue;
          if (m.peerKind !== "group") continue;
          if (m.msgType === 10000) continue; // 系统通知不记
          recordRawMessage(m.chatroomId ?? m.peerId, {
            senderName: m.fromNickname ?? m.fromWxid ?? "未知",
            senderId: m.fromWxid ?? "",
            content: m.content ?? "",
            timestamp: m.ts ?? Date.now() / 1000,
            isBot: !!opts.triggerCtx.botWxid && m.fromWxid === opts.triggerCtx.botWxid,
          });
        }
      }

      // v1.3.76 JARGON: 黑话旁路采集 (统计层 + 消息历史) —
      //   不参与触发判断 (纯旁路, 与心流互补: 心流=何时开口, 黑话=听懂群文化)。
      //   仅采集未 blocked 的群消息 (隐私对齐)。
      if (opts.jargon?.enabled) {
        for (const m of batch) {
          const tr = persistResults.get(m);
          if (tr?.via === "blocked") continue;
          if (m.peerKind !== "group") continue;
          if (m.msgType === 10000) continue; // 系统通知不采
          const groupId = m.chatroomId ?? m.peerId;
          const content = m.content ?? "";
          if (!content.trim()) continue;
          updateJargonFromMessage(content, groupId, m.fromWxid ?? "");
          recordJargonMessage(groupId, m.fromWxid ?? "", content);
        }
        // 挖掘触发: 每群独立判断 (间隔 + 新增消息数), 异步执行不阻塞消息流
        for (const m of batch) {
          const tr = persistResults.get(m);
          if (tr?.via === "blocked") continue;
          if (m.peerKind !== "group") continue;
          const groupId = m.chatroomId ?? m.peerId;
          const msgCount = getRecentMessages(groupId, 200).length;
          if (shouldTriggerMine(groupId, opts.jargon, Date.now(), msgCount)) {
            void mineJargonForGroup(groupId, opts.jargon, {
              apiKey: process.env.MINIMAX_API_KEY ?? "",
            }).catch((e) => warn(`[WPP JARGON] mine failed (non-fatal): ${formatErr(e)}`));
          }
        }
      }

      const triggerResults = persistResults; // Step 2 已算 (same ctxForTrigger + shouldTrigger)
      const dispatched: WppInboundMessage[] = [];
      for (const [m, t] of triggerResults) {
        // v1.3.72 红包消息不触发 AI (老板 2026-08-20): 收到红包静默入库, 不瞎回复 (415 行的 continue 只跳过 relay 循环, 这里必须再拦一次)
        if (isRedPacketMessage(m)) continue;
        // v1.3.72 系统通知 (msg_type=10000, 含红包领取/转账/安全提醒) 不触发 AI (老板 2026-08-20): 系统消息无需 AI 回复
        if (m.msgType === 10000) continue;
        // v1.3.39 FILEHELPER: filehelper 命令不 dispatch (只走命令回调, 不进 AI)
        if (m.peerId === "filehelper" && /^\s*\//.test(m.content)) continue;
        // v1.3.54 RELAY-TRIGGER (老板 8-12 拍板): 接龙消息强制触发 AI (即使没人 @)
        //   老板诉求"对华为群接龙进行鼓励" — 群内接龙活动要让 AI 介入给鼓励, 不能静默
        //   节流: 同群同接龙 5 分钟内只触发一次 (vendor 每次有人接龙都推完整接龙, 全回会刷屏)
        //   v1.3.57 P0-2 + P2-1 (2026-08-13 交付审阅): 强制触发前检查 via!=="blocked" (防黑名单群/
        //   自回环绕过); 节流 key 并入 accountId (防多账号同群互相节流)
        if (opts.enableDispatch !== false && isRelayMessage(m)) {
          const t = triggerResults.get(m);
          if (t?.via === "blocked") continue; // P0-2: 黑名单群/自回环/非白名单 → 不强制触发
          const titleKey = (m.content ?? "").split("\n")[0]?.slice(0, 30) ?? "";
          const throttleKey = `${m.accountId}:${m.peerId}:${titleKey}`; // P2-1: 并入 accountId
          const now = Date.now();
          // v1.3.63 P2: relayTriggerAt 写时清理过期 key (防无界增长; 照 SeenTracker 范式)
          if (relayTriggerAt.size > 1000) {
            for (const [k, ts] of relayTriggerAt) {
              if (now - ts > RELAY_THROTTLE_MS) relayTriggerAt.delete(k);
            }
          }
          const lastAt = relayTriggerAt.get(throttleKey) ?? 0;
          if (now - lastAt >= RELAY_THROTTLE_MS) {
            relayTriggerAt.set(throttleKey, now);
            m.trigger = "msgType";
            dispatched.push(m);
            info(`relay force-trigger dispatch: peer=${m.peerId} msgId=${m.msgId} via=msgType (throttle key=${throttleKey.slice(0, 40)})`);
          } else {
            debug(`relay throttled (last ${Math.round((now - lastAt) / 1000)}s ago, TTL ${RELAY_THROTTLE_MS / 1000}s): ${throttleKey.slice(0, 40)}`);
          }
          continue;
        }
        if (t.triggered && t.via !== "blocked") {
          m.trigger = t.via ?? "at";
          if (t.via === "at" || t.via === "keyword" || t.via === "msgType" ||
              t.via === "quoteBot" || t.via === "group-open") {
            dispatched.push(m);
          } else if (t.via === "heartflow" && opts.heartflow?.enabled) {
            // v1.3.75 HEARTFLOW: 异步小模型打分判断 — 通过才 dispatch (真触发), 不过记录被动状态
            //   静默失败 (无 key/超时/坏 JSON) → 不 dispatch (保守, 不打扰群聊)
            const chatId = m.chatroomId ?? m.peerId;
            const hfCfg = opts.heartflow;
            try {
              const nowMs = Date.now();
              const st = getChatState(chatId, hfCfg, nowMs);
              const judgeResult = await judgeHeartflow(
                {
                  chatId,
                  botNickname: opts.botNickname ?? "",
                  content: m.content ?? "",
                  senderName: m.fromNickname ?? m.fromWxid ?? "未知",
                  chatContext: buildChatContextSummary(chatId, hfCfg, nowMs),
                  recentMessages: formatRawMessages(getRawBuffer(chatId, hfCfg.contextMessagesCount ?? 5)),
                  lastBotReply: lastBotReply(chatId) ?? "",
                  secondsSinceLastReply: secondsSinceLastReply(chatId, nowMs),
                  energy: st.energy,
                },
                hfCfg,
                {
                  apiKey: process.env.MINIMAX_API_KEY ?? "",
                },
              );
              if (judgeResult?.shouldReply) {
                m.trigger = "heartflow";
                recordActiveReply(chatId, hfCfg, nowMs);
                dispatched.push(m);
                info(`[WPP HEARTFLOW] trigger: peer=${m.peerId} msgId=${m.msgId} score=${judgeResult.overallScore.toFixed(2)} reasoning=${judgeResult.reasoning.slice(0, 40) ?? ""}`);
              } else {
                recordPassiveMessage(chatId, hfCfg, nowMs);
                debug(`[WPP HEARTFLOW] skip (score=${judgeResult?.overallScore.toFixed(2) ?? "null"}): peer=${m.peerId}`);
              }
            } catch (e) {
              warn(`[WPP HEARTFLOW] judge error (skip): ${formatErr(e)}`);
            }
          }
        }
      }

      if (opts.enableDispatch !== false && opts.onPairingAttempt &&
          (opts.dmPairingEnabled || opts.triggerCtx.dmPairingEnabled)) {
        for (const m of batch) {
          if (m.peerKind !== "direct") continue; // 只拦私聊 (群聊配对无意义)
          const t = triggerResults.get(m);
          if (t?.via !== "blocked") continue; // 已在白名单 → 正常触发, 不拦
          if (opts.triggerCtx.botWxid && m.fromWxid === opts.triggerCtx.botWxid) continue; // 自回环 guard
          const code = extractPairCode(m.content);
          if (code) {
            try {
              await opts.onPairingAttempt({ msg: m, code });
              log.info(`[WPP v1.2.3 PAIRING] attempt handled: account=${opts.accountId} from=${m.fromWxid}`);
            } catch (e) {
              log.warn(`[WPP v1.2.3] pairing attempt failed (non-fatal): ${formatErr(e)}`, { accountId: opts.accountId, fromWxid: m.fromWxid });
            }
          }
        }
      }

      // v1.3.39 FILEHELPER: 只处理命令, 非命令不处理 (老板 2026-08-11)
      //   识别 filehelper 会话 (peer_id=filehelper) 的命令 → 回调, 不进 AI dispatch
      if (opts.enableDispatch !== false && opts.onFileHelperCommand) {
        for (const m of batch) {
          if (m.peerId !== "filehelper") continue;
          const cmd = m.content.trim();
          if (!/^\//.test(cmd)) continue; // 非命令跳过 (仍不处理)
          try {
            await opts.onFileHelperCommand({ msg: m, command: cmd });
            log.info(`[WPP v1.3.39 FILEHELPER] command handled: ${cmd.split(/\s+/)[0]}`);
          } catch (e) {
            log.warn(`[WPP v1.3.39 FILEHELPER] command failed: ${formatErr(e)}`);
          }
        }
      }

      // 无可触发 → 早退 (防空转)
      if (dispatched.length === 0) return;

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

  // SeenTracker 去重: 同一条消息从 webhook/business-callback/WS 3 条路径进入时只处理一次
  const seenTracker = new SeenTracker();

  return {
    handle: async (payload: WppWebhookPayload): Promise<void> => {
      // business callback 可能是 AddMsgs[] 多条, 逐条 parse
      const msgs = payloadToAllInboundMessages(opts.accountId, payload);

      // 私聊 peerId 修正: bot 自己发的私聊 (fromWxid===selfWxid) → 对方是 toWxid, 否则是自己 (sessionKey 串位)
      try {
        const acct = getDefaultAccountRegistry().get(opts.accountId);
        const selfWxid = acct?.selfWxid;
        if (selfWxid) {
          for (const m of msgs) {
            if (m.peerKind === "direct") {
              if (m.fromWxid === selfWxid && m.toWxid) {
                // 老板自己发的私聊 → 对方是 toWxid
                m.peerId = m.toWxid;
              }
              // 别人发的私聊: peerId 已经是 fromWxid (对方), 无需改
            }
          }
        }
      } catch (e) {
        warn(`peerId fixup skipped (non-fatal): ${formatErr(e)}`);
      }

      if (msgs.length === 0) {
        // payload 解析失败: warn 打印摘要供排查 (v1.3.63 P3: 去掉 payload 内容, 只记 keys + 计数 — 内容可能含聊天文本)
        const payloadData = (payload as Record<string, unknown>)?.Data as Record<string, unknown> | undefined;
        const payloadMsgs = payloadData?.messages;
        const msgCount = Array.isArray(payloadMsgs) ? (payloadMsgs as unknown[]).length : undefined;
        warn(`inbound parse dropped: account=${opts.accountId} payloadKeys=${Object.keys((payload ?? {}) as object).join(",")} dataKeys=${Object.keys(payloadData ?? {}).join(",")} messagesLen=${msgCount ?? "n/a"}`);
        return;
      }
      for (const m of msgs) {
        // 双重去重: SeenTracker 内存态 + DB 持久化 (vendor 重放消息 / gateway 重启后防重复 dispatch)
        const dk = buildDedupeKey(undefined, m.newMsgId, m.msgId, m.content);
        if (!seenTracker.check(dk)) {
          continue;
        }
        // DB 兜底: 内存去重通过但 DB 已有同消息 (重启后 SeenTracker 重置场景)
        if (m.msgId || m.newMsgId) {
          try {
            const existing = await getMessageByMsgIdOrNewId(m.msgId, m.newMsgId, m.accountId);
            if (existing) {
              log.debug(`inbound dedup (db): skip msgId=${m.msgId} newMsgId=${m.newMsgId} (already persisted)`);
              continue;
            }
          } catch (e) {
            log.warn(`inbound dedup (db) check failed: ${formatErr(e)}`, { msgId: m.msgId });
          }
        }
        debouncer.enqueue(m);
      }
    },
    flushAll: async (): Promise<void> => {
      await debouncer.flushAll();
    },
  };
}

/** Re-export for compat */
export type WppInboundCallbacks = DebouncerCallbacks;
