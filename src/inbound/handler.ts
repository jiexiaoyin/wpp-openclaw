// src/inbound/handler.ts - 主入口 (debouncer + 4-way triggers + enrich)
// 仿 本项目/src/inbound/handler.ts createWppInboundHandler

import { info, warn, logObj as log, formatErr } from "../core/logger.js";
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
import { parseQuoteXml } from "./parser/quote.js";
import { captureQuoteSvrid } from "./quote-svrid.js";
import { getMessageById } from "../storage/db/messages.js";
import { getMessageByMsgIdOrNewId } from "../db.js";
import { parseRelayText } from "./relay.js";
import { isRedPacketMessage, processRedPacket } from "./hongbao.js";
import { extractAtUserList } from "./parser/mention.js";
import { payloadToAllInboundMessages } from "./parser.js";
import { SeenTracker, buildDedupeKey } from "../webhook-receiver.js";
import { enrichImageMessage } from "./media-enrich.js";
import type { WppInboundMessage, WppWebhookPayload } from "../types.js";
import type { WppAccountCtx } from "../send/factory.js";

export interface WppInboundHandlerOpts {
  accountId: string;
  triggerConfig: WppTriggerConfig;
  triggerCtx: WppAccountTriggerCtx;
  /** 是否真发 (false = debug 模式, enrich 但不 dispatch) */
  enableDispatch?: boolean;
  /** 外部 dispatcher hook (Phase F 接入 OpenClaw runtime) — 暂记日志 */
  onDispatch?: (msg: WppInboundMessage, batch: WppInboundMessage[]) => void | Promise<void>;
  /** 是否把 chat-history (type=53) 解析成接龙 items 注入 prompt */
  parseRelay?: boolean;
  /**
   * v1.1.20 IMAGE-ENRICH (2026-08-08 接总立): 图片消息自动下载+OSS 上传的 vendor ctx
   * (baseUrl/tokenKey/authcode — 调 /Tools/CdnDownloadImage 用)
   */
  vendorCtx?: WppAccountCtx;
  /**
   * v1.1.16 P0-FIX (2026-08-08): DM allowFrom 白名单 (从 accounts/<id>.json 读, 透传给 trigger)
   * handler 读这个字段而不是自己再 get config, 让 caller (index.ts startAllAccounts) 负责加载
   */
  allowFrom?: string[];
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
      // v1.1.29 ENRICH-ORDER-FIX (2026-08-08 21:10 接总立: DB 不存 OSS URL):
      //   之前顺序: enrichBatch (DB save 原始 m.content) → enrich (内存修改 m.content)
      //   问题: DB 存的是原始 XML, AI 看的是 enrich 后的 m.content (内存引用同步, OK)
      //   但 21:00:15 enrich 失败那次 AI 看不到 URL 且 DB 也无 URL
      //   fix: 先 enrich (失败也跳, 不阻塞 DB save) → enrichBatch (DB 落 enrich 后的 content)
      // Step 1: image enrich (先 enrich 再 save, 让 DB 也带 OSS URL)
      for (const m of batch) {
        // v1.1.20 IMAGE-ENRICH (2026-08-08 接总立): 图片消息 (msg_type=3) 自动下载 + OSS 上传
        // 仿 gewe enrich.js: vendor CdnDownloadImage → ossutil → 公网 URL → 注入 content
        //   AI 视觉模型看到 URL 即识别内容 (老板 18:42 拍板, 18:46 参考 gewe 模式)
        if (m.msgType === 3 && opts.vendorCtx && m.content.includes("<img")) {
          try {
            const imgR = await enrichImageMessage(opts.vendorCtx, m.content);
            if (imgR.mediaUrl) {
              // 注入 content 尾部 — DB 落库 + dispatch Body 都带 URL
              m.content = `${m.content}\n[图片] ${imgR.mediaUrl}`;
              log.info(`[WPP v1.1.20] image enrich ok: msgId=${m.msgId} url=${imgR.mediaUrl}`);
            }
          } catch (e) {
            log.warn(`[WPP v1.1.20] image enrich failed (non-fatal, continue to save): ${formatErr(e)}`, {
              msgId: m.msgId,
            });
          }
        }

        // v1.1.24 QUOTE-SVRID (2026-08-08 接总立): 捕获引用消息 svrid → 存映射表
        if (m.content.includes("<refermsg")) {
          try {
            await captureQuoteSvrid(m.content, m.accountId);
          } catch (e) {
            warn(`quote svrid capture err (non-fatal): ${formatErr(e)}`);
          }
        }

        // v1.1.30 GEWE-PARITY (2026-08-08 21:20 接总立: 分析 gewe 后补齐的关键路径):
        //   gewe handler.ts:170-194: inbound 是 QUOTE 消息 (msgType=49) → parse refermsg → imgMd5/msgId
        //   → 查 DB 拿原图 media_url (OSS URL) → push 到 mediaList + quoteDetails.mediaUrl
        //   → AI 多模态看到原图 → 生成准确回复 → 走 pendingQuoteDetails 引用回复
        //   fix: WPP 同样在 inbound 拼上原图 OSS URL 给 AI 看 (关键 — 之前 AI 看图靠运气)
        //   实现: 不用新加 media_url 字段 (DB schema 改动大), 直接从 quoted.content 末尾用正则提取
        //         v1.1.20 enrich 已把 OSS URL 写到 inbound content 末尾 (`[图片] URL`), 查 DB 拿到 content 即可
        if (m.msgType === 49 && m.content.includes("<refermsg")) {
          try {
            const parsed = parseQuoteXml(m.content);
            if (parsed?.msgId) {
              const quoted = await getMessageById(parsed.msgId, m.accountId);
              if (quoted?.content) {
                // 提取被引用消息的 OSS URL (v1.1.20 enrich 写入的格式: [图片] URL)
                const imgUrlMatch = quoted.content.match(/\[图片\]\s+(https?:\/\/\S+)/);
                if (imgUrlMatch) {
                  const ossUrl = imgUrlMatch[1] ?? "";
                  info(`[WPP v1.1.30] QUOTE media inject: msgId=${m.msgId} quoted.msgId=${parsed.msgId} ossUrl=${ossUrl}`);
                  m.content = `${m.content}\n[引用图片] ${ossUrl}`;
                }
              }
            }
          } catch (e) {
            warn(`quote media inject err (non-fatal): ${formatErr(e)}`);
          }
        }
      }

      // Step 2: persist (DB 落 enrich 后的 content)
      const r = await enrichBatch(batch);
      if (r.failed > 0) {
        warn(`inbound batch persist: ${r.failed}/${batch.length} failed`);
      }

      // Step 3: relay 解析 (chat-history 53): 给 prompt 注入 items
      for (const m of batch) {
        if (m.msgType === 53 && opts.parseRelay) {
          try {
            const relay = parseRelayText(m.content);
            info(`relay detected: title="${relay.title.slice(0, 30)}", items=${relay.items.length}`);
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

        // v1.1.7: 红包消息检测 + 提取 (业务逻辑, 默认仅 log)
        // v1.1.17 FULL-FIX: 红包消息处理后 continue, 不继续 dispatch (防红包触发 AI 回复)
        if (isRedPacketMessage(m)) {
          processRedPacket(m);  // log + 提取 url/key, 未来可接 auto-open
          continue;
        }
      }

      // 3. dispatch (per message 走 trigger)
      const dispatched: WppInboundMessage[] = [];
      // v1.1.16 P0-FIX: triggerCtx.allowFrom 合并 (优先 opts.allowFrom, fallback triggerCtx.allowFrom)
      const ctxForTrigger = { ...opts.triggerCtx, allowFrom: opts.allowFrom ?? opts.triggerCtx.allowFrom };
      for (const m of batch) {
        const t = shouldTrigger(m, opts.triggerConfig, ctxForTrigger);
        if (t.triggered && t.via !== "blocked") {
          m.trigger = t.via ?? "at";
          if (t.via === "at" || t.via === "keyword" || t.via === "msgType" ||
              t.via === "quoteBot" || t.via === "group-open") {
            dispatched.push(m);
          }
        }
      }
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

  // v1.1.17 FULL-FIX (P0-G): SeenTracker 去重 — 同一条消息从 webhook/business-callback/WS 3 条路径进入时只处理一次
  // 之前去重代码写了但零调用 (src/webhook-receiver.ts:209 定义, handler 入口无引用) → 三通道重复回复
  const seenTracker = new SeenTracker();

  return {
    handle: async (payload: WppWebhookPayload): Promise<void> => {
      // v1.1.15 BUSINESS-CB: business callback 可能是 AddMsgs[] 多条, 逐条 parse
      const msgs = payloadToAllInboundMessages(opts.accountId, payload);
      if (msgs.length === 0) {
        // v1.1.15 DEBUG-WH (2026-08-08): payload 解析失败静默丢弃 → 改为 warn 打印摘要
        // 根因: vendor webhook payload 结构与 parser 期望不匹配 (13:49 后 0 条入库)
        // v1.1.15 DEBUG-WH (2026-08-08 临时扩, 3 修复后改回 300): 取 2000 字装下 XML 消息
        const jsonStr = JSON.stringify(payload);
        const msgCount = Array.isArray((payload as any)?.Data?.messages) ? (payload as any).Data.messages.length : undefined;
        warn(`inbound parse dropped: account=${opts.accountId} payloadKeys=${Object.keys((payload ?? {}) as object).join(",")} dataKeys=${Object.keys(((payload as any)?.Data ?? {}) as object).join(",")} messagesLen=${msgCount ?? "n/a"} payload=${jsonStr?.slice(0, 2000)}`);
        return;
      }
      for (const m of msgs) {
        // v1.1.17 FULL-FIX (P0-G): 去重 — 同 msgId/newMsgId 已处理过则跳过
        // v1.1.19 DB-DEDUP (2026-08-08 接总立方案 A): SeenTracker 内存态, gateway 重启即清空;
        //   vendor 重放消息 (Synckey="" 全量拉) 重启后重新触发 dispatch → 重复 AI 回复。
        //   加 DB 持久化去重: msg_id/new_msg_id 已存在 inbound → 跳过 (wpp_messages UNIQUE 索引保证物理唯一)
        const dk = buildDedupeKey(undefined, m.newMsgId, m.msgId);
        if (!seenTracker.check(dk)) {
          continue;
        }
        // DB 兜底: 内存去重通过但 DB 已有同消息 (重启后 SeenTracker 重置场景)
        if (m.msgId || m.newMsgId) {
          try {
            const existing = await getMessageByMsgIdOrNewId(m.msgId, m.newMsgId, m.accountId);
            if (existing) {
              // v1.1.25 PERF: info→debug 降日志 IO (重启风暴一次几百条 skip, info 刷屏 + 阻塞)
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
