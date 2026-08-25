// src/inbound/enrich.ts - DB 单一入口 (仿 本项目/src/inbound/enrich.ts)
// 关键: webhook / handler 都通过本文件写 DB, 避免 webhook 自己 INSERT + handler 再 UPDATE 的重复修复模式

import { logObj as log, formatErr } from "../core/logger.js";
import { saveMessage } from "../db.js";
import type { WppInboundMessage } from "../types.js";
import {
  tryIndependentTrigger,
  defaultHeartflowConfig,
  type HeartflowConfig,
  type IndependentTriggerResult,
} from "./heartflow-trigger.js";

export interface EnrichResult {
  saved: boolean;
  error?: string;
  record?: Record<string, unknown>;
}

/**
 * Persist inbound message to wpp_messages. Idempotent — same msgId can call twice safely.
 * 关键: 不抛, 吞错返 saved:false (silent killer 永久救回靠 caller log)
 */
export async function enrichAndSaveMessage(
  msg: WppInboundMessage,
): Promise<EnrichResult> {
  try {
    await saveMessage({
      account_id: msg.accountId,
      msg_id: msg.msgId,
      new_msg_id: msg.newMsgId,
      // v1.3.21 REVOKE-FIX: 用 msg.direction (outgoing 图片 = outbound), 默认 inbound
      direction: msg.direction ?? "inbound",
      peer_kind: msg.peerKind,
      peer_id: msg.peerId,
      peer_name: msg.fromNickname,
      chat_id: msg.chatroomId,
      msg_type: String(msg.msgType),
      content: msg.content,
      raw_payload: msg.raw,
      from_wxid: msg.fromWxid,
      ts: msg.ts,
    });
    return { saved: true };
  } catch (e) {
    log.warn(`enrichAndSaveMessage failed: ${formatErr(e)}`, {
      msgId: msg.msgId,
    });
    return { saved: false, error: (e as Error).message };
  }
}

/**
 * v1.5.0 B-fix 20:06 老板拍板 B: enrichBatch 写库后, 异步触发心流独立 trigger
 *
 * 设计: 解耦 AI 主动观察 (heartflow) 与 AI 被动响应 (@bot)
 *   - 老路径: handler.js shouldTrigger via="heartflow" → judge (受 requireAtMention 限制, 群聊非 @ 永远到不了)
 *   - 新路径: enrichBatch 写库后, 调 tryIndependentTrigger 独立入口 (不受 requireAtMention 限制, 仅看 whitelistGroups + heartflow gate)
 *
 * 异步: fire-and-forget, 不阻塞 enrichBatch 返回 (enrichBatch 不等 judge 完成)
 * 安全: try/catch 全包, 失败仅 log warn 不抛
 *
 * @param msg  刚入库的消息
 * @param cfg  heartflow 配置 (来自 accounts cfg 链)
 */
async function tryHeartflowAfterEnrich(
  msg: WppInboundMessage,
  cfg: HeartflowConfig,
): Promise<void> {
  // 仅群消息触发
  if (msg.peerKind !== "group" || !msg.chatroomId) return;
  // 心流关闭或 independentTrigger 未开 → 跳过
  if (!cfg.enabled || !cfg.independentTrigger) return;
  // 不触发 bot 自己发的消息 (避免自我循环)
  // 注: msg.direction 已是 inbound (outbound 由 send 路径产出, 不走 enrichAndSaveMessage)
  // 提取 API key
  const apiKey = process.env.MINIMAX_API_KEY ?? "";
  if (!apiKey) {
    log.warn("[WPP HEARTFLOW] enrich trigger skipped: missing MINIMAX_API_KEY");
    return;
  }
  try {
    const result: IndependentTriggerResult = await tryIndependentTrigger(
      {
        chatId: msg.chatroomId,
        content: msg.content ?? "",
        senderName: msg.fromNickname ?? msg.fromWxid ?? "未知",
        senderWxid: msg.fromWxid ?? "",
        botWxid: undefined,
        apiKey,
        baseUrl: "https://api.minimaxi.com/anthropic",
      },
      cfg,
    );
    log.info(
      `[WPP HEARTFLOW] independent trigger result: triggered=${result.triggered} reason="${result.reason}" chatId=${msg.chatroomId}`,
    );
  } catch (err) {
    log.warn(`[WPP HEARTFLOW] independent trigger threw: ${formatErr(err)}`, {
      msgId: msg.msgId,
      chatId: msg.chatroomId,
    });
  }
}

/** 多个消息批量保存 */
export async function enrichBatch(batch: WppInboundMessage[]): Promise<{
  saved: number;
  failed: number;
}> {
  // P3-2 (2026-08-13 外部审计): 历史跟踪入库 — 每条消息独立落库 (不同 msg_id, INSERT...ON DUPLICATE 幂等),
  //   相互独立无数据依赖 → 顺序 await 改 Promise.all 并发 (enrichAndSaveMessage 内部吞错永不 reject,
  //   一条失败不阻塞其余 + 计数语义与原串行一致)
  const results = await Promise.all(batch.map((msg) => enrichAndSaveMessage(msg)));
  let saved = 0;
  let failed = 0;
  for (const r of results) {
    if (r.saved) saved++;
    else failed++;
  }
  log.info(`enrichBatch: ${saved} saved, ${failed} failed (size=${batch.length})`);

  // v1.5.0 B-fix 20:06: enrichBatch 写库后, fire-and-forget 异步触发心流独立 trigger
  //   - 不阻塞 enrichBatch 返回
  //   - 失败仅 log warn, 不影响主入库流程
  //   - 心流配置从 process.env.WPP_HEARTFLOW_CONFIG 读 (运行时注入, 默认用 defaultHeartflowConfig + 模型 fallback)
  void (async () => {
    const cfg: HeartflowConfig = {
      ...defaultHeartflowConfig(),
      // 从 env 读取心流 cfg (P1-follow: 后续会迁移到 accounts cfg 链; 当前 v1.5.0 B-fix 用 env 注入保持向后兼容)
      ...(process.env.WPP_HEARTFLOW_CONFIG ? JSON.parse(process.env.WPP_HEARTFLOW_CONFIG) : {}),
    };
    for (const msg of batch) {
      if (msg.peerKind !== "group") continue;
      void tryHeartflowAfterEnrich(msg, cfg);
    }
  })();

  return { saved, failed };
}
