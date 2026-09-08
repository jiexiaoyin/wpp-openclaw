// src/inbound/enrich.ts - DB 单一入口 (仿 本项目/src/inbound/enrich.ts)
// 关键: webhook / handler 都通过本文件写 DB, 避免 webhook 自己 INSERT + handler 再 UPDATE 的重复修复模式

import { logObj as log, formatErr } from "../core/logger.js";
import { resolveJudgeCreds } from "../llm-judge.js";
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
 *
 * v1.5.2 B-fix (2026-08-25 22:28 老板拍 A):
 *   增加可选 cfg 参数, 末尾 fire-and-forget 调 tryHeartflowAfterEnrich
 *   (webhook 路径只调 enrichAndSaveMessage, 不调 enrichBatch, 所以单独触发)
 *   cfg 应来自 accounts.cfg (inbound/index.ts handleWebhookPayload 取 state.config.heartflow)
 *   不传 cfg → 跳过触发 (向后兼容, 默认 enrichBatch 已独立 fire-and-forget)
 */
export async function enrichAndSaveMessage(
  msg: WppInboundMessage,
  cfg?: HeartflowConfig,
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

    // v1.5.2 B-fix: enrichAndSaveMessage 末尾 fire-and-forget 调 tryHeartflowAfterEnrich
    //   (webhook 路径只调 enrichAndSaveMessage, 不调 enrichBatch, 所以单独触发)
    //   复用 tryHeartflowAfterEnrich 函数 (已含 cfg + apiKey + whitelist + gate 检查)
    if (cfg && msg.peerKind === "group" && msg.chatroomId) {
      void tryHeartflowAfterEnrich(msg, cfg);
    }

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
 * v1.5.2 B-fix (2026-08-25 22:28 老板拍 A):
 *   cfg 不再用 defaultHeartflowConfig + WPP_HEARTFLOW_CONFIG env (env 从来没设过 → cfg.independentTrigger=false → 0 次触发)
 *   改用 caller 传入的 cfg (来自 accounts.cfg 链), 不传则 fallback 到 defaultHeartflowConfig (向后兼容)
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
  // 提取 judge 凭证 (DEEPSEEK 优先, MiniMax 兜底)
  const creds = resolveJudgeCreds();
  if (!creds.apiKey) {
    log.warn("[WPP HEARTFLOW] enrich trigger skipped: missing judge API key (DEEPSEEK_API_KEY / MINIMAX_API_KEY)");
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
        apiKey: creds.apiKey,
        baseUrl: creds.baseUrl,
        format: creds.format,
      },
      cfg,
    );
    // 触发成功才 info; 未触发(false)是常态噪音 → debug
    (result.triggered ? log.info : log.debug)(
      `[WPP HEARTFLOW] independent trigger result: triggered=${result.triggered} reason="${result.reason}" chatId=${msg.chatroomId}`,
    );
  } catch (err) {
    log.warn(`[WPP HEARTFLOW] independent trigger threw: ${formatErr(err)}`, {
      msgId: msg.msgId,
      chatId: msg.chatroomId,
    });
  }
}

/** 多个消息批量保存
 *
 * v1.5.2 B-fix: 增加可选 cfg 参数, caller 传 accounts.cfg.heartflow → 不再依赖 WPP_HEARTFLOW_CONFIG env
 */
export async function enrichBatch(
  batch: WppInboundMessage[],
  cfg?: HeartflowConfig,
): Promise<{
  saved: number;
  failed: number;
}> {
  // P3-2 (2026-08-13 外部审计): 历史跟踪入库 — 每条消息独立落库 (不同 msg_id, INSERT...ON DUPLICATE 幂等),
  //   相互独立无数据依赖 → 顺序 await 改 Promise.all 并发 (enrichAndSaveMessage 内部吞错永不 reject,
  //   一条失败不阻塞其余 + 计数语义与原串行一致)
  const results = await Promise.all(batch.map((msg) => enrichAndSaveMessage(msg, cfg)));
  let saved = 0;
  let failed = 0;
  for (const r of results) {
    if (r.saved) saved++;
    else failed++;
  }
  // 每条入站消息都会落库 → 全部成功只 debug; 有失败才 warn 提级 (需排查)
  if (failed > 0) log.warn(`enrichBatch: ${saved} saved, ${failed} failed (size=${batch.length})`);
  else log.debug(`enrichBatch: ${saved} saved, ${failed} failed (size=${batch.length})`);

  // v1.5.0 B-fix 20:06: enrichBatch 写库后, fire-and-forget 异步触发心流独立 trigger
  // v1.5.2 B-fix: cfg 优先 caller 传入, fallback 到 defaultHeartflowConfig + WPP_HEARTFLOW_CONFIG env (向后兼容)
  const effectiveCfg: HeartflowConfig = cfg ?? {
    ...defaultHeartflowConfig(),
    ...(process.env.WPP_HEARTFLOW_CONFIG ? JSON.parse(process.env.WPP_HEARTFLOW_CONFIG) : {}),
  };
  for (const msg of batch) {
    if (msg.peerKind !== "group") continue;
    void tryHeartflowAfterEnrich(msg, effectiveCfg);
  }

  return { saved, failed };
}
