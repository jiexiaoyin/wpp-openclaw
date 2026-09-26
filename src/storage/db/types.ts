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
  /**
   * v1.6.1 可观测: 近 sinceSec 秒台账按 status (+ suppressed_reason) 计数 (只读, 供 /heartflow status 显示).
   * 返回 { total, byStatus, bySuppressedReason } —— 让「judge 跑了但没回」在运维面可见.
   */
  countHfLedgerByStatus(
    accountId: string,
    sinceSec: number,
  ): Promise<{ total: number; byStatus: Record<string, number>; bySuppressedReason: Record<string, number> }>;
  /**
   * v1.6.8 可观测: 近 sinceSec 秒**已收敛**的样本按命中信号计数
   * (quote/mention/negative/short-window/silence; NULL 旧行归 'legacy'). 供 /heartflow status
   * 显示"新标签是否在工作" —— 老板要看的就是这个分布, 而不是又一个被自学的标量.
   */
  countHfEngageSignals(accountId: string, sinceSec: number): Promise<Record<string, number>>;
  /** judged → sent (guard: 仅 judged 可推进, 防 deliver 双调重置窗) */
  setHfLedgerSent(
    accountId: string,
    inboundMsgId: string,
    sentAtSec: number,
    windowExpiresAtSec: number,
    /** v1.6.8: vendor 返回的 bot 发出那条的 msgId (用于"有人引用了我那条"判定; 不回 id 时 NULL) */
    botMsgId?: string | null,
  ): Promise<void>;
  /** judged → suppressed (guard: 仅 judged) */
  setHfLedgerSuppressed(
    accountId: string,
    inboundMsgId: string,
    reason: string,
    atSec: number,
  ): Promise<void>;
  /**
   * 按信号收敛该群开窗中的账本行.
   * v1.6.8 起语义变更 (旧码 = 任意人类消息即 engaged=1+关窗, 是标签跑飞的根因, 见 heartflow-label.ts):
   *   close=false → 只落弱信号 (short-window) 并**保持开窗**, 等更强的信号 (引用/@/负词) 来升级;
   *   close=true  → 落结论并关窗; WHERE 允许覆盖 'short-window' (弱→强升级), 不覆盖已有强信号.
   */
  markHfEngaged(
    accountId: string,
    groupId: string,
    atSec: number,
    engaged: 0 | 1,
    signal: string,
    close: boolean,
  ): Promise<void>;
  /**
   * v1.6.8 反事实基线素材: 近 sinceSec 秒内, **每群 × 每小时段**的入站人类消息数
   * (hour = 按 localOffsetSec 偏移后的本地小时 0-23). 用于算"该群那时段本来就有多热闹".
   */
  listHfGroupMsgHourBuckets(
    accountId: string,
    sinceSec: number,
    localOffsetSec: number,
  ): Promise<HfGroupHourBucket[]>;
  /**
   * v1.6.9 发言预算回填: 每群在 `[hourSinceSec, now]` / `[daySinceSec, now]` 内的**已发出**条数 + 最近发出时刻。
   * 一条条件聚合搞定 (judge 热路径零 DB 读, 只在账号启动时跑一次)。
   */
  listHfSentCountsRecent(
    accountId: string,
    hourSinceSec: number,
    daySinceSec: number,
  ): Promise<HfSentCountRow[]>;
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

  /**
   * v1.7.0 可观测: 该群**最近一条**台账行 (任意 status) —— `/heartflow why <群ID>` 的依据.
   * 只读单行 (ORDER BY judged_at DESC LIMIT 1), 不参与任何判定.
   */
  getHfLedgerLast(accountId: string, groupId: string): Promise<HfLedgerTrace | null>;

  // ====== v1.7.0 HEARTFLOW-PROFILE (群画像) ======
  /** 覆盖写单群画像 (PK = account_id+group_id; 生成失败时调用方**不写**, 保留上一版) */
  upsertHfGroupProfile(record: HfGroupProfileRecord): Promise<void>;
  /** 读单群画像 (无则 null) */
  getHfGroupProfile(accountId: string, groupId: string): Promise<HfGroupProfileRecord | null>;
  /**
   * 列账号全部画像 (sweep 每轮预热内存缓存 ⇒ judge 热路径零 DB 读, 遵守 perf-heat-path D6).
   * 一次查询覆盖所有群, 不按群逐个查。
   */
  listHfGroupProfiles(accountId: string): Promise<HfGroupProfileRecord[]>;
  /**
   * v1.7.0 画像素材: 该群近 sinceSec 秒的**入站人类消息**统计
   * (总数/活跃天数/小时直方图/发言 TOP 成员/类型分布/平均字数)。
   * **单表只读** (wpp_messages) —— 不 JOIN wpp_hf_* (collation 不同, 见 mysql.ts 注释)。
   */
  getHfGroupMessageStats(
    accountId: string,
    groupId: string,
    sinceSec: number,
  ): Promise<HfGroupMsgStats>;
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
  /** v1.6.8: 命中信号 (quote/mention/negative/short-window/silence) —— 决定该样本是否可采信 */
  engage_signal?: string | null;
}

/** v1.6.8: 反事实基线素材行 (每群 × 每小时段的入站人类消息数) */
export interface HfGroupHourBucket {
  group_id: string;
  /** 本地小时 0-23 */
  hour: number;
  n: number;
}

/** v1.6.9: 发言预算回填行 (每群已发出的条数 + 最近发出时刻) */
export interface HfSentCountRow {
  group_id: string;
  /** 近 1 小时 (本地小时桶) 内已发出条数 */
  hour_count: number;
  /** 近 24 小时内已发出条数 */
  day_count: number;
  /** 最近一次发出的时刻 (unix 秒; 无则 null) */
  last_sent_at: number | null;
}

/**
 * v1.7.0: 台账单行追溯 (`/heartflow why`). 在 HfLedgerRecord (写入字段) 基础上补**决策结果**字段.
 */
export interface HfLedgerTrace extends HfLedgerRecord {
  /** judged | sent | suppressed | closed */
  status: string;
  suppressed_reason?: string | null;
  /** NULL=不在样本内 (suppressed); 1=被接话; 0=没人理 */
  engaged?: number | null;
  /** v1.6.8 命中信号 (quote/mention/negative/short-window/silence) */
  engage_signal?: string | null;
  sent_at?: number | null;
  bot_msg_id?: string | null;
}

/** v1.7.0: 群画像行 (wpp_hf_group_profile) */
export interface HfGroupProfileRecord {
  account_id: string;
  group_id: string;
  /** 结构化画像 JSON 串 (解析失败即视为无画像, 上层降级为不注入) */
  profile_json: string;
  /** 生成时的统计快照 JSON (审计用; 可为 null) */
  stats_json?: string | null;
  /** 参与生成的样本消息数 */
  sample_msgs?: number;
  /** 产出该画像的模型名 */
  model?: string | null;
  /** 版本号 (每次重生成 +1) */
  version?: number;
  /** 生成时刻 (unix 秒) */
  generated_at?: number | null;
}

/**
 * v1.7.0: 群消息统计 (由 getHfGroupMessageStats 一次聚合产出; 只读本地 DB, 不出机器).
 * 注意: 统计本身**不进公开仓** —— 这是运行期数据, 不是代码.
 */
export interface HfGroupMsgStats {
  /** 窗口内入站人类消息总数 */
  total: number;
  /** 有消息的天数 (按本地日) */
  activeDays: number;
  /** 本地小时直方图 (长度 24; 索引 = 小时) */
  hourHist: number[];
  /** 发言 TOP 成员 (按条数降序, 最多 5) */
  topSenders: Array<{ wxid: string; n: number }>;
  /** msg_type → 条数 */
  typeHist: Record<string, number>;
  /** 平均字数 (content 字符数) */
  avgLen: number;
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
