// src/storage/db/types.ts - DB adapter interface + 共享类型
// 仿 本项目/src/storage/db/types.ts 范式
// 关键: DbAdapter interface 是核心契约, 便于 v1.1.0+ 加 sqlite/postgres backend

import type { Pool } from "mysql2/promise";

/** MariaDB / MySQL / SQLite 后端 */
export type DbBackendName = "mysql" | "mariadb" | "sqlite";

/** 数据库配置 (合并默认值后) */
export interface ResolvedDbConfig {
  backend: DbBackendName;
  mysql: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    connectionLimit: number;
    /** v1.3.63 P2: 池排队上限 (防耗尽时无限等待) */
    queueLimit?: number;
  };
}

/**
 * DbAdapter interface — 所有 backend 必须实现
 * saveMessage 是 UPSERT (idempotent), getXxx 都接受可选 accountId 范围
 */
export interface DbAdapter {
  /** 后端名 (mysql/sqlite/...) */
  readonly backendName: DbBackendName;

  /** 初始化 (建表 + 迁移), idempotent */
  init(): Promise<void>;

  /** 关连接池 (测试或多 backend 切换) */
  close(): Promise<void>;

  /** 健康检查 */
  ping(): Promise<void>;

  // ====== Messages ======
  saveMessage(record: MessageRecord): Promise<void>;
  getMessages(opts: {
    accountId?: string;
    peerKind?: string;
    peerId?: string;
    /** v1.2.4: 按发送者过滤 (群聊查触发人历史) */
    fromWxid?: string;
    limit?: number;
    beforeTs?: number;
  }): Promise<MessageRecord[]>;
  getMessageById(msgId: string, accountId: string): Promise<MessageRecord | null>;
  findMessageByMd5(md5: string, accountId: string): Promise<MessageRecord | null>;
  /** v1.1.19 DB-DEDUP: 按 msg_id 或 new_msg_id 查已存在消息 (持久化去重) */
  getMessageByMsgIdOrNewId(
    msgId: string | undefined,
    newMsgId: string | undefined,
    accountId: string,
    /** v1.3.18 P1-核心2 fix: 默认 inbound (保持向后兼容, dedup 用), 引用解析路径传 any (查全部方向) */
    opts?: { direction?: "inbound" | "outbound" | "any" },
  ): Promise<MessageRecord | null>;

  // ====== v1.1.24 Quote svrid 映射 ======
  /** 存 svrid 映射 (md5 → svrid, 从引用消息捕获) */
  saveSvridMapping(record: SvridMappingRecord): Promise<void>;
  /** 按 md5 查真实 svrid */
  getSvridByMd5(md5: string, accountId: string): Promise<string | null>;

  // ====== v1.1.25 Sync state (Synckey 持久化, 防重启全量拉取) ======
  /** 保存账号 Synckey (增量游标) */
  saveSynckey(accountId: string, synckey: string): Promise<void>;
  /** 读账号 Synckey (无则返回 null → 首次全量) */
  getSynckey(accountId: string): Promise<string | null>;

  // ====== Contacts ======
  saveContact(record: ContactRecord): Promise<void>;
  getContacts(accountId: string, limit?: number): Promise<ContactRecord[]>;

  // ====== Chatrooms ======
  saveChatroom(record: ChatroomRecord): Promise<void>;
  getChatrooms(accountId: string, limit?: number): Promise<ChatroomRecord[]>;

  // ====== Session state (debouncer 状态) ======
  getSessionState(opts: {
    accountId: string;
    peerKind: string;
    peerId: string;
  }): Promise<SessionStateRecord | null>;
  upsertSessionState(record: SessionStateRecord): Promise<void>;

  // ====== API call audit ======
  logApiCall(record: ApiCallRecord): Promise<void>;
  getApiCalls(opts: {
    accountId?: string;
    endpoint?: string;
    limit?: number;
  }): Promise<ApiCallRecord[]>;

  // ====== Account registry state (G2-3 持久化) ======
  /** UPSERT 单个账号状态 (idempotent, ON DUPLICATE KEY UPDATE) */
  upsertAccount(record: AccountRecord): Promise<void>;
  /** 列出所有已知账号状态 (供 plugin 重启时遍历) */
  getAccounts(): Promise<AccountRecord[]>;
  /** 单个账号状态 (按 accountId) */
  getAccount(accountId: string): Promise<AccountRecord | null>;

  // ====== v1.3.76 Jargon (黑话) ======
  /** 保存/更新黑话词条 (UPSERT, idempotent) */
  saveJargonTerm(record: JargonTermRecord): Promise<void>;
  /** 查群内黑话 (按 frequency 降序) */
  getJargonTerms(accountId: string, groupId: string, limit?: number): Promise<JargonTermRecord[]>;
  /** 查某词条是否存在 */
  hasJargonTerm(accountId: string, groupId: string, term: string): Promise<boolean>;

  // ====== v1.6.x HEARTFLOW-FEEDBACK (心流反馈闭环) ======
  /** judge 通过落行 (INSERT IGNORE, dup 保留首次决策) */
  recordHfJudged(record: HfLedgerRecord): Promise<void>;
  /** judged → sent (guard: 仅 judged 可推进, 防 deliver 双调重置窗) */
  setHfLedgerSent(
    accountId: string,
    inboundMsgId: string,
    sentAtSec: number,
    windowExpiresAtSec: number,
  ): Promise<void>;
  /** judged → suppressed (guard: 仅 judged) */
  setHfLedgerSuppressed(
    accountId: string,
    inboundMsgId: string,
    reason: string,
    atSec: number,
  ): Promise<void>;
  /** 人类接话: sent 开窗且未定 → engaged=1 + closed (立即收敛) */
  markHfEngaged(accountId: string, groupId: string, atSec: number): Promise<void>;
  /** sweep: sent 到期无人接话 → ignored (engaged=0) + closed */
  closeHfExpiredWindows(accountId: string, atSec: number): Promise<void>;
  /** sweep: judged 无发送结果超上限 → suppressed (呆账收敛) */
  expireHfStaleJudged(
    accountId: string,
    atSec: number,
    judgedBeforeSec: number,
  ): Promise<void>;
  /** 滚窗样本: 最近 limit 条已收敛 closed 的 engaged 值 (engaged 非空=排除 suppressed) */
  getHfClosedRecent(
    accountId: string,
    groupId: string,
    limit: number,
  ): Promise<HfClosedSample[]>;
  /** upsert 每群 learned 阈值状态 */
  upsertHfGroupState(record: HfGroupStateRecord): Promise<void>;
  /** 读单群状态 (无则 null) */
  getHfGroupState(accountId: string, groupId: string): Promise<HfGroupStateRecord | null>;
  /** 列账号所有群状态 (供 /heartflow status 只读摘要) */
  listHfGroupStates(accountId: string): Promise<HfGroupStateRecord[]>;
  /** 阈值变更审计落行 */
  logHfThresholdChange(record: HfThresholdAuditRecord): Promise<void>;
  /** sweep: 有已收敛样本的群清单 (since 之后) */
  getHfLedgerDistinctClosedGroups(accountId: string, sinceSec: number): Promise<string[]>;
}

/** v1.6.x: 心流 ledger 行类型 (wpp_hf_ledger, 落行字段; 列见 DDL) */
export interface HfLedgerRecord {
  account_id: string;
  inbound_msg_id: string;
  new_msg_id?: string | null;
  group_id: string;
  from_wxid?: string | null;
  msg_type?: string | null;
  content_head?: string | null;
  judge_overall?: number | null;
  dim_r?: number | null;
  dim_w?: number | null;
  dim_s?: number | null;
  dim_t?: number | null;
  dim_c?: number | null;
  effective_threshold?: number | null;
  energy?: number | null;
  judged_at: number; // epoch sec
}

/** v1.6.x: 每群 learned 阈值状态 (wpp_hf_group_state) */
export interface HfGroupStateRecord {
  account_id: string;
  group_id: string;
  learned_threshold?: number | null;
  last_change_at?: number | null;
  last_change_old?: number | null;
  last_change_new?: number | null;
  last_change_reason?: string | null;
}

/** v1.6.x: 阈值变更审计行 (wpp_hf_threshold_audit) */
export interface HfThresholdAuditRecord {
  account_id: string;
  group_id: string;
  old_threshold?: number | null;
  new_threshold: number;
  sample_total: number;
  sample_engaged: number;
  reason?: string | null;
}

/** v1.6.x: 已收敛 closed 样本 (滚窗统计用; engaged 0/1) */
export interface HfClosedSample {
  engaged: number; // 0 | 1
  closed_at?: number | null;
}

/** v1.3.76: 群黑话词条 row (wpp_jargon_terms) */
export interface JargonTermRecord {
  account_id: string;
  group_id: string;
  term: string;
  raw_content?: string | null;
  meaning?: string | null;
  is_jargon?: number;
  frequency?: number;
}

/** wpp_messages row */
export interface MessageRecord {
  account_id: string;
  msg_id?: string | null;
  new_msg_id?: string | null;
  direction: "inbound" | "outbound";
  peer_kind: "direct" | "group" | "room";
  peer_id: string;
  peer_name?: string | null;
  chat_id?: string | null;
  msg_type?: string | null;
  content?: string | null;
  raw_payload?: unknown;
  /** v1.2.4: inbound 发送者 wxid (群聊按人查历史) */
  from_wxid?: string | null;
  ts?: number; // unix seconds; default NOW()
}

export interface ContactRecord {
  account_id: string;
  wxid: string;
  nickname?: string | null;
  remark?: string | null;
  avatar_url?: string | null;
  gender?: number | null;
  signature?: string | null;
}

/** v1.1.24 Quote svrid 映射记录 (md5 → svrid, 从引用消息捕获) */
export interface SvridMappingRecord {
  account_id: string;
  svrid: string;
  msg_md5?: string | null;
  quoted_content_hash?: string | null;
  captured_at?: number;
}

export interface ChatroomRecord {
  account_id: string;
  chatroom_id: string;
  nickname?: string | null;
  remark?: string | null;
  owner_wxid?: string | null;
  member_count?: number | null;
}

export interface SessionStateRecord {
  account_id: string;
  peer_kind: "direct" | "group" | "room";
  peer_id: string;
  last_msg_id?: string | null;
  last_msg_ts?: number | null;
  pending_count?: number;
}

export interface ApiCallRecord {
  account_id: string;
  endpoint: string;
  method?: string;
  status_code?: number | null;
  vendor_code?: number | null;
  latency_ms?: number | null;
  request_body?: unknown;
  response_body?: unknown;
}

/**
 * wpp_accounts row — 账号元数据 + vendor 鉴权状态 (G2-3 持久化)
 * 关联 schema.sql CREATE TABLE IF NOT EXISTS wpp_accounts
 * 重要: 不存 tokenKey / authcode / webhookSecret (走 accounts/<id>.json + env vars)
 */
export interface AccountRecord {
  account_id: string;
  display_name?: string | null;
  self_wxid?: string | null;
  nickname?: string | null;
  enabled: boolean;
  /** 可选: 非敏感配置 (debounceMs, groupPolicy, requireAtMention 等), tokenKey/authcode 不进 */
  config_json?: string | null;
}

// Backward-compat shim (本项目 pattern: 旧代码 import Pool)
export type MysqlPool = Pool;
