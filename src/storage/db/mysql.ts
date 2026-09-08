// src/storage/db/mysql.ts - MySQL/MariaDB adapter 实现
// 范式仿 本项目/src/storage/db/mysql.ts
// 关键:
//  - queryWithTimeout 包 SET SESSION max_statement_time (防 30s 卡死)
//  - saveMessage 用 INSERT ... ON DUPLICATE KEY UPDATE (idempotent)
//  - ensureColumns/Index 在 init() 末尾跑, vendor schema 漂移时自动迁移

import mysql from "mysql2/promise";
import type { RowDataPacket, Pool, ResultSetHeader } from "mysql2/promise";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { info, warn, error, formatErr } from "../../core/logger.js";
import { findPluginRoot } from "../../core/paths.js";
import type {
  AccountRecord,
  ApiCallRecord,
  ChatroomRecord,
  ContactRecord,
  DbAdapter,
  HfClosedSample,
  HfGroupStateRecord,
  HfLedgerRecord,
  HfThresholdAuditRecord,
  JargonTermRecord,
  MessageRecord,
  ResolvedDbConfig,
  SessionStateRecord,
  SvridMappingRecord,
} from "./types.js";

/** ER_STATEMENT_TIMEOUT (1969): caught → throw QueryTimeoutError (silent killer 防护) */
const ER_STATEMENT_TIMEOUT = 1969;
/** max_statement_time (s) per query (vendor 文档明示不超过 10s) */
const STMT_TIMEOUT_SECONDS = 10;

/**
 * 查询超时异常 (不静默返 [] — 曾把单行查询误判"不存在" silent killer)
 * 用法: catch (e) { if (e instanceof QueryTimeoutError) ... }
 */
export class QueryTimeoutError extends Error {
  readonly code = "QUERY_TIMEOUT";
  readonly errno = ER_STATEMENT_TIMEOUT;
  readonly sql: string;
  constructor(sql: string, public readonly originalError?: unknown) {
    super(`queryWithTimeout: 1969 timeout (sql=${sql.slice(0, 80)})`);
    this.name = "QueryTimeoutError";
    this.sql = sql;
  }
}

/**
 * Run a query with optional max_statement_time timeout.
 * Throws QueryTimeoutError on ER_STATEMENT_TIMEOUT (caller can catch by instanceof).
 */
export async function queryWithTimeout<T extends RowDataPacket[] | ResultSetHeader>(
  pool: Pool,
  sql: string,
  params: unknown[] = [],
  opts?: { onTimeout?: "throw" | "warn-and-return" },
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    if (/^\s*SELECT/i.test(sql)) {
      await conn.query(`SET SESSION max_statement_time = ${STMT_TIMEOUT_SECONDS}`);
    }
    const [r] = await conn.query<T>(sql, params);
    return r;
  } catch (e) {
    const code = (e as { errno?: number }).errno;
    if (code === ER_STATEMENT_TIMEOUT) {
      if (opts?.onTimeout === "warn-and-return") {
        warn(`queryWithTimeout: 1969 timeout (sql=${sql.slice(0, 80)}) — falling back to empty result`);
        return [] as unknown as T;
      }
      throw new QueryTimeoutError(sql, e);
    }
    throw e;
  } finally {
    conn.release();
  }
}

/** 加列 (IF NOT EXISTS 幂等; MariaDB 不支持 ADD COLUMN IF NOT EXISTS 直接, 用 SHOW COLUMNS 兜底) */
async function ensureColumn(
  pool: Pool,
  table: string,
  column: string,
  type: string,
  after?: string,
): Promise<void> {
  const cols = await queryWithTimeout<RowDataPacket[]>(
    pool,
    `SHOW COLUMNS FROM ${table} LIKE ?`,
    [column],
  );
  if (cols.length === 0) {
    const sql = after
      ? `ALTER TABLE ${table} ADD COLUMN ${column} ${type} AFTER \`${after}\``
      : `ALTER TABLE ${table} ADD COLUMN ${column} ${type}`;
    await pool.query(sql);
    info(`ensureColumn: ${table}.${column} ADD (${type})`);
  }
}

/** 加索引 (用 SHOW INDEX 判重) */
async function ensureIndex(
  pool: Pool,
  table: string,
  indexName: string,
  cols: string[],
): Promise<void> {
  const idx = await queryWithTimeout<RowDataPacket[]>(
    pool,
    `SHOW INDEX FROM ${table} WHERE Key_name = ?`,
    [indexName],
  );
  if (idx.length === 0) {
    const sql = `ALTER TABLE ${table} ADD INDEX ${indexName} (${cols.join(", ")})`;
    await pool.query(sql);
    info(`ensureIndex: ${table}.${indexName} (${cols.join(", ")})`);
  }
}

/** 取数组第一个 row (noUncheckedIndexedAccess 友好) */
function firstRow<T>(rows: readonly T[]): T | null {
  return rows.length > 0 && rows[0] !== undefined ? rows[0] : null;
}

/**
 * Read schema.sql from plugin root db/schema.sql, split by `;` and execute each.
 * 已 IF NOT EXISTS, idempotent.
 */
async function applySchemaSql(pool: Pool): Promise<void> {
  const schemaPath = join(await findPluginRoot(), "db", "schema.sql");
  try {
    await access(schemaPath);
  } catch {
    warn(`applySchemaSql: schema.sql not found at ${schemaPath}, skipping`);
    return;
  }
  const sql = await readFile(schemaPath, "utf8");
  const stmts = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("--"));
  for (const stmt of stmts) {
    await pool.query(stmt);
  }
  info(`applySchemaSql: ${stmts.length} statements applied from ${schemaPath}`);
}

/** Always include these migrations for vendor schema drift safety */
async function applyMigrations(pool: Pool): Promise<void> {
  // 撤回时间戳应来自原始消息入库时间: wpp_messages 加 create_time BIGINT 列 (ensureColumn 幂等 ADD)
  await ensureColumn(pool, "wpp_messages", "create_time", "BIGINT NULL");
  await ensureColumn(pool, "wpp_messages", "from_wxid", "VARCHAR(128) NULL");
  // 旧行回填: 从 raw_payload.sender_id 提取 (已有行无 from_wxid)
  try {
    await pool.query(
      `UPDATE wpp_messages SET from_wxid = JSON_UNQUOTE(JSON_EXTRACT(raw_payload, '$.sender_id'))
       WHERE from_wxid IS NULL AND raw_payload IS NOT NULL AND raw_payload <> ''
         AND JSON_UNQUOTE(JSON_EXTRACT(raw_payload, '$.sender_id')) IS NOT NULL`,
    );
  } catch (e) {
    warn(`applyMigrations: backfill from_wxid failed (non-fatal): ${formatErr(e)}`);
  }

  // 基础 (account_id, chat_id, ts) 复合, 覆盖 history query
  await ensureIndex(pool, "wpp_messages", "idx_account_chat_ts", [
    "account_id",
    "chat_id",
    "ts",
  ]);
  // (peer_kind, peer_id) 复合, 覆盖跨账号 peer 查询
  await ensureIndex(pool, "wpp_messages", "idx_peer_kind_peer_id", [
    "peer_kind",
    "peer_id",
  ]);
  await ensureIndex(pool, "wpp_messages", "idx_sender", [
    "peer_kind",
    "peer_id",
    "from_wxid",
  ]);
  // (account_id, peer_id, ts) 复合, 加速 get-history-from-peer (复合后走 index range scan)
  await ensureIndex(pool, "wpp_messages", "idx_account_peer_ts", [
    "account_id",
    "peer_id",
    "ts",
  ]);
  // (account_id, msg_type, ts) 复合, 加速按消息类型查
  await ensureIndex(pool, "wpp_messages", "idx_account_msgtype_ts", [
    "account_id",
    "msg_type",
    "ts",
  ]);

  // 引用消息 svrid 映射表: 微信 svrid 无法主动获取, 只能从"别人引用该消息"的 refermsg.svrid 被动捕获
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wpp_svrid_mapping (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      account_id VARCHAR(64) NOT NULL,
      svrid VARCHAR(32) NOT NULL,
      msg_md5 VARCHAR(32) NULL,
      quoted_content_hash VARCHAR(64) NULL,
      captured_at INT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uk_svrid_acct (account_id, svrid),
      KEY idx_md5 (msg_md5)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Synckey 增量游标持久化: 保存 Sync 返回的 KeyBuf.buffer, 重启后用增量游标只拉新消息 (防全量重放风暴)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wpp_sync_state (
      account_id VARCHAR(64) NOT NULL,
      synckey VARCHAR(1024) NOT NULL,
      updated_at INT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (account_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ====== v1.6.x HEARTFLOW-FEEDBACK (心流反馈闭环) ======
  // 生产建表唯一途径 = applyMigrations (deploy-swap.sh 不拷 db/, schema.sql 只在 dev 生效)
  // 纯增量 CREATE IF NOT EXISTS, 幂等, 每 boot 3 条空执行. 表无 FK, 不 ALTER 旧表.
  // 心流「应触发发送」决策 + 发送结果 + 接话观察窗 (per-群自适应调阈样本库)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wpp_hf_ledger (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      account_id VARCHAR(64) NOT NULL,
      inbound_msg_id VARCHAR(128) NOT NULL,
      new_msg_id VARCHAR(128) NULL,
      group_id VARCHAR(128) NOT NULL,
      from_wxid VARCHAR(128) NULL,
      msg_type VARCHAR(32) NULL,
      content_head VARCHAR(512) NULL,
      judge_overall DECIMAL(6,4) NULL,
      dim_r DECIMAL(5,2) NULL,
      dim_w DECIMAL(5,2) NULL,
      dim_s DECIMAL(5,2) NULL,
      dim_t DECIMAL(5,2) NULL,
      dim_c DECIMAL(5,2) NULL,
      effective_threshold DECIMAL(6,4) NULL,
      energy DECIMAL(5,3) NULL,
      status ENUM('judged','sent','suppressed','closed') NOT NULL DEFAULT 'judged',
      suppressed_reason VARCHAR(96) NULL,
      engaged TINYINT(1) NULL,
      judged_at INT UNSIGNED NOT NULL,
      sent_at INT UNSIGNED NULL,
      window_expires_at INT UNSIGNED NULL,
      closed_at INT UNSIGNED NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_hf_acct_msg (account_id, inbound_msg_id),
      KEY idx_hf_group_status (account_id, group_id, status),
      KEY idx_hf_open (account_id, status, window_expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // 每群 learned 阈值状态 (learned 落 DB, 不回写 accounts JSON 防 fs.watch 抖动)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wpp_hf_group_state (
      account_id VARCHAR(64) NOT NULL,
      group_id VARCHAR(128) NOT NULL,
      learned_threshold DECIMAL(6,4) NULL,
      last_change_at INT UNSIGNED NULL,
      last_change_old DECIMAL(6,4) NULL,
      last_change_new DECIMAL(6,4) NULL,
      last_change_reason VARCHAR(128) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (account_id, group_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // 阈值变更审计 (每次变更插一行, 满足「变更留痕」护栏)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wpp_hf_threshold_audit (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      account_id VARCHAR(64) NOT NULL,
      group_id VARCHAR(128) NOT NULL,
      old_threshold DECIMAL(6,4) NULL,
      new_threshold DECIMAL(6,4) NOT NULL,
      sample_total INT UNSIGNED NOT NULL,
      sample_engaged INT UNSIGNED NOT NULL,
      reason VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_hf_audit (account_id, group_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

/**
 * Factory: createMysqlAdapter(cfg) returns DbAdapter.
 * 隐藏 mysql2 pool 细节, caller 只用 interface methods.
 */
export function createMysqlAdapter(cfg: ResolvedDbConfig): DbAdapter {
  let pool: Pool | null = null;

  const getPool = (): Pool => {
    if (!pool) {
      pool = mysql.createPool({
        host: cfg.mysql.host,
        port: cfg.mysql.port,
        user: cfg.mysql.user,
        password: cfg.mysql.password,
        database: cfg.mysql.database,
        connectionLimit: cfg.mysql.connectionLimit,
        waitForConnections: true,
        enableKeepAlive: true,
        charset: "utf8mb4",
        // v1.3.63 P2: queueLimit 防池耗尽时 getConnection 无限排队
        //   (mysql2 PoolOptions 无 acquireTimeout; 池级排队上限由 queueLimit 兜底)
        queueLimit: cfg.mysql.queueLimit ?? 50,
      });
      info(
        `mysqlAdapter pool init: ${cfg.mysql.host}:${cfg.mysql.port}/${cfg.mysql.database} (user=${cfg.mysql.user}, limit=${cfg.mysql.connectionLimit})`,
      );
    }
    return pool;
  };

  return {
    backendName: "mariadb",

    async init(): Promise<void> {
      const p = getPool();
      await applySchemaSql(p);
      await applyMigrations(p);
    },

    async close(): Promise<void> {
      if (pool) {
        await pool.end();
        pool = null;
        info("mysqlAdapter closed");
      }
    },

    async ping(): Promise<void> {
      const p = getPool();
      await p.query("SELECT 1 AS ok");
    },

    // ===== Messages =====
    async saveMessage(record: MessageRecord): Promise<void> {
      const p = getPool();
      // UNIQUE (account_id, msg_id, new_msg_id) + ON DUPLICATE KEY UPDATE — 三通道重复推送时幂等
      await p.query(
        `INSERT INTO wpp_messages
         (account_id, msg_id, new_msg_id, direction, peer_kind, peer_id, peer_name,
          chat_id, msg_type, content, raw_payload, from_wxid, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(FROM_UNIXTIME(?), CURRENT_TIMESTAMP))
         ON DUPLICATE KEY UPDATE
           direction = VALUES(direction),
           peer_kind = VALUES(peer_kind),
           peer_id = VALUES(peer_id),
           msg_type = VALUES(msg_type),
           content = VALUES(content),
           raw_payload = VALUES(raw_payload),
           from_wxid = VALUES(from_wxid)`,
        [
          record.account_id,
          record.msg_id ?? null,
          record.new_msg_id ?? null,
          record.direction,
          record.peer_kind,
          record.peer_id,
          record.peer_name ?? null,
          record.chat_id ?? null,
          record.msg_type ?? null,
          record.content ?? null,
          record.raw_payload !== undefined ? JSON.stringify(record.raw_payload) : null,
          record.from_wxid ?? null,
          record.ts ?? null,
        ],
      );
    },

    async getMessages(opts): Promise<MessageRecord[]> {
      const p = getPool();
      const where: string[] = [];
      const params: unknown[] = [];
      if (opts.accountId) {
        where.push("account_id = ?");
        params.push(opts.accountId);
      }
      if (opts.peerKind) {
        where.push("peer_kind = ?");
        params.push(opts.peerKind);
      }
      if (opts.peerId) {
        where.push("peer_id = ?");
        params.push(opts.peerId);
      }
      if (opts.beforeTs) {
        where.push("ts < FROM_UNIXTIME(?)");
        params.push(opts.beforeTs);
      }
      if (opts.fromWxid) {
        where.push("from_wxid = ?");
        params.push(opts.fromWxid);
      }
      // clamp limit 防 DoS (单次最多 1000 行, 防 caller 传 1M 内存爆)
      const safeLimit = Math.min(Math.max(opts.limit ?? 100, 1), 1000);
      const sql =
        `SELECT * FROM wpp_messages` +
        (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
        ` ORDER BY ts DESC LIMIT ${safeLimit}`;
      const rows = await queryWithTimeout<RowDataPacket[]>(p, sql, params);
      return rows.map(rowToMessage);
    },

    async getMessageById(msgId, accountId): Promise<MessageRecord | null> {
      const p = getPool();
      const rows = await queryWithTimeout<RowDataPacket[]>(
        p,
        `SELECT * FROM wpp_messages WHERE msg_id = ? AND account_id = ? LIMIT 1`,
        [msgId, accountId],
      );
      return firstRow(rows) ? rowToMessage(firstRow(rows)!) : null;
    },

    // 持久化去重查询: 按 msg_id 或 new_msg_id 任一命中即视为已存在 (vendor 重放时 msg_id 相同)
    async getMessageByMsgIdOrNewId(
      msgId: string | undefined,
      newMsgId: string | undefined,
      accountId: string,
      // v1.3.18 P1-核心2 fix: 加 direction 选项, 默认 inbound (保持向后兼容, dedup 用)
      opts?: { direction?: "inbound" | "outbound" | "any" },
    ): Promise<MessageRecord | null> {
      if (!msgId && !newMsgId) return null;
      const p = getPool();
      const direction = opts?.direction ?? "inbound";
      // SQL 运算符优先级陷阱: 必须 `account_id AND (msg_id OR new_msg_id) AND direction`
      //  (曾写成 OR 连 chain, AND 优先 → account_id 恒真 → 全部误杀, 消息丢失根因)
      const idClauses: string[] = [];
      const params: unknown[] = [accountId];
      if (msgId) {
        idClauses.push("msg_id = ?");
        params.push(msgId);
      }
      if (newMsgId) {
        idClauses.push("new_msg_id = ?");
        params.push(newMsgId);
      }
      const dirClause = direction === "any" ? "" : `AND direction = '${direction}'`;
      const rows = await queryWithTimeout<RowDataPacket[]>(
        p,
        `SELECT * FROM wpp_messages WHERE account_id = ? AND (${idClauses.join(" OR ")}) ${dirClause} LIMIT 1`,
        params,
      );
      return firstRow(rows) ? rowToMessage(firstRow(rows)!) : null;
    },

    async findMessageByMd5(md5, accountId): Promise<MessageRecord | null> {
      const p = getPool();
      const rows = await queryWithTimeout<RowDataPacket[]>(
        p,
        `SELECT * FROM wpp_messages WHERE account_id = ? AND raw_payload LIKE ? LIMIT 1`,
        [accountId, `%"md5":"${md5}"%`],
      );
      return firstRow(rows) ? rowToMessage(firstRow(rows)!) : null;
    },

    // ===== Quote svrid 映射 =====
    async saveSvridMapping(record: SvridMappingRecord): Promise<void> {
      const p = getPool();
      await p.query(
        `INSERT INTO wpp_svrid_mapping (account_id, svrid, msg_md5, quoted_content_hash, captured_at)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           msg_md5 = VALUES(msg_md5),
           quoted_content_hash = VALUES(quoted_content_hash),
           captured_at = VALUES(captured_at)`,
        [
          record.account_id,
          record.svrid,
          record.msg_md5 ?? null,
          record.quoted_content_hash ?? null,
          record.captured_at ?? Math.floor(Date.now() / 1000),
        ],
      );
    },

    async getSvridByMd5(md5, accountId): Promise<string | null> {
      const p = getPool();
      const rows = await queryWithTimeout<RowDataPacket[]>(
        p,
        `SELECT svrid FROM wpp_svrid_mapping WHERE account_id = ? AND msg_md5 = ? ORDER BY captured_at DESC LIMIT 1`,
        [accountId, md5],
      );
      return rows.length > 0 ? String(rows[0]!.svrid) : null;
    },

    // ===== Sync state (Synckey 持久化) =====
    async saveSynckey(accountId, synckey): Promise<void> {
      const p = getPool();
      await p.query(
        `INSERT INTO wpp_sync_state (account_id, synckey, updated_at)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE synckey = VALUES(synckey), updated_at = VALUES(updated_at)`,
        [accountId, synckey, Math.floor(Date.now() / 1000)],
      );
    },

    async getSynckey(accountId): Promise<string | null> {
      const p = getPool();
      const rows = await queryWithTimeout<RowDataPacket[]>(
        p,
        `SELECT synckey FROM wpp_sync_state WHERE account_id = ? LIMIT 1`,
        [accountId],
      );
      return rows.length > 0 ? String(rows[0]!.synckey) : null;
    },

    // ===== Contacts =====
    async saveContact(record: ContactRecord): Promise<void> {
      const p = getPool();
      await p.query(
        `INSERT INTO wpp_contacts
         (account_id, wxid, nickname, remark, avatar_url, gender, signature, last_synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE
           nickname = VALUES(nickname),
           remark = VALUES(remark),
           avatar_url = VALUES(avatar_url),
           gender = VALUES(gender),
           signature = VALUES(signature),
           last_synced_at = CURRENT_TIMESTAMP`,
        [
          record.account_id,
          record.wxid,
          record.nickname ?? null,
          record.remark ?? null,
          record.avatar_url ?? null,
          record.gender ?? null,
          record.signature ?? null,
        ],
      );
    },

    async getContacts(accountId, limit = 500): Promise<ContactRecord[]> {
      const p = getPool();
      // v1.3.63 P2: LIMIT clamp (与 getMessages 一致 1-1000, 防超长参数注 SQL 拼接)
      const safeLimit = Math.max(1, Math.min(Math.trunc(limit) || 500, 1000));
      const rows = await queryWithTimeout<RowDataPacket[]>(
        p,
        `SELECT * FROM wpp_contacts WHERE account_id = ? LIMIT ${safeLimit}`,
        [accountId],
      );
      return rows.map((r: RowDataPacket) => ({
        account_id: String(r.account_id),
        wxid: String(r.wxid),
        nickname: r.nickname == null ? null : String(r.nickname),
        remark: r.remark == null ? null : String(r.remark),
        avatar_url: r.avatar_url == null ? null : String(r.avatar_url),
        gender: r.gender == null ? null : Number(r.gender),
        signature: r.signature == null ? null : String(r.signature),
      }));
    },

    // ===== Chatrooms =====
    async saveChatroom(record: ChatroomRecord): Promise<void> {
      const p = getPool();
      await p.query(
        `INSERT INTO wpp_chatrooms
         (account_id, chatroom_id, nickname, remark, owner_wxid, member_count, last_synced_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE
           nickname = VALUES(nickname),
           remark = VALUES(remark),
           owner_wxid = VALUES(owner_wxid),
           member_count = VALUES(member_count),
           last_synced_at = CURRENT_TIMESTAMP`,
        [
          record.account_id,
          record.chatroom_id,
          record.nickname ?? null,
          record.remark ?? null,
          record.owner_wxid ?? null,
          record.member_count ?? null,
        ],
      );
    },

    async getChatrooms(accountId, limit = 500): Promise<ChatroomRecord[]> {
      const p = getPool();
      const safeLimit = Math.max(1, Math.min(Math.trunc(limit) || 500, 1000)); // v1.3.63 P2 clamp
      const rows = await queryWithTimeout<RowDataPacket[]>(
        p,
        `SELECT * FROM wpp_chatrooms WHERE account_id = ? LIMIT ${safeLimit}`,
        [accountId],
      );
      return rows.map((r: RowDataPacket) => ({
        account_id: String(r.account_id),
        chatroom_id: String(r.chatroom_id),
        nickname: r.nickname == null ? null : String(r.nickname),
        remark: r.remark == null ? null : String(r.remark),
        owner_wxid: r.owner_wxid == null ? null : String(r.owner_wxid),
        member_count: r.member_count == null ? null : Number(r.member_count),
      }));
    },

    // ===== Session state =====
    async getSessionState(opts): Promise<SessionStateRecord | null> {
      const p = getPool();
      const rows = await queryWithTimeout<RowDataPacket[]>(
        p,
        `SELECT * FROM wpp_session_state WHERE account_id = ? AND peer_kind = ? AND peer_id = ? LIMIT 1`,
        [opts.accountId, opts.peerKind, opts.peerId],
      );
      const first = firstRow(rows);
      if (!first) return null;
      return {
        account_id: String(first.account_id),
        peer_kind: first.peer_kind as SessionStateRecord["peer_kind"],
        peer_id: String(first.peer_id),
        last_msg_id: first.last_msg_id == null ? null : String(first.last_msg_id),
        last_msg_ts:
          first.last_msg_ts instanceof Date
            ? Math.floor(first.last_msg_ts.getTime() / 1000)
            : first.last_msg_ts == null
              ? null
              : Number(first.last_msg_ts),
        pending_count: first.pending_count == null ? 0 : Number(first.pending_count),
      };
    },

    async upsertSessionState(record: SessionStateRecord): Promise<void> {
      const p = getPool();
      await p.query(
        `INSERT INTO wpp_session_state
         (account_id, peer_kind, peer_id, last_msg_id, last_msg_ts, pending_count)
         VALUES (?, ?, ?, ?, FROM_UNIXTIME(?), ?)
         ON DUPLICATE KEY UPDATE
           last_msg_id = VALUES(last_msg_id),
           last_msg_ts = VALUES(last_msg_ts),
           pending_count = VALUES(pending_count)`,
        [
          record.account_id,
          record.peer_kind,
          record.peer_id,
          record.last_msg_id ?? null,
          record.last_msg_ts ?? null,
          record.pending_count ?? 0,
        ],
      );
    },

    // ===== API call audit =====
    async logApiCall(record: ApiCallRecord): Promise<void> {
      const p = getPool();
      await p.query(
        `INSERT INTO wpp_api_calls
         (account_id, endpoint, method, status_code, vendor_code, latency_ms, request_body, response_body)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.account_id,
          record.endpoint,
          record.method ?? "POST",
          record.status_code ?? null,
          record.vendor_code ?? null,
          record.latency_ms ?? null,
          record.request_body !== undefined ? JSON.stringify(record.request_body) : null,
          record.response_body !== undefined ? JSON.stringify(record.response_body) : null,
        ],
      );
    },

    async getApiCalls(opts): Promise<ApiCallRecord[]> {
      const p = getPool();
      const where: string[] = [];
      const params: unknown[] = [];
      if (opts.accountId) {
        where.push("account_id = ?");
        params.push(opts.accountId);
      }
      if (opts.endpoint) {
        where.push("endpoint = ?");
        params.push(opts.endpoint);
      }
      // clamp limit 防 DoS
      const safeLimit = Math.min(Math.max(opts.limit ?? 100, 1), 1000);
      const sql =
        `SELECT * FROM wpp_api_calls` +
        (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
        ` ORDER BY ts DESC LIMIT ${safeLimit}`;
      const rows = await queryWithTimeout<RowDataPacket[]>(p, sql, params);
      return rows.map((r: RowDataPacket) => ({
        account_id: String(r.account_id),
        endpoint: String(r.endpoint),
        method: r.method == null ? "POST" : String(r.method),
        status_code: r.status_code == null ? null : Number(r.status_code),
        vendor_code: r.vendor_code == null ? null : Number(r.vendor_code),
        latency_ms: r.latency_ms == null ? null : Number(r.latency_ms),
      }));
    },

    // ===== Account registry state (G2-3 持久化) =====
    async upsertAccount(record: AccountRecord): Promise<void> {
      const p = getPool();
      // config_json 已 JSON.stringify 过; 若未 stringify 则直接传 (mysql2 会自动)
      const cfgJson =
        record.config_json === undefined || record.config_json === null
          ? null
          : typeof record.config_json === "string"
            ? record.config_json
            : JSON.stringify(record.config_json);
      await p.query(
        `INSERT INTO wpp_accounts
         (account_id, display_name, self_wxid, nickname, enabled, config_json)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           display_name = VALUES(display_name),
           self_wxid = VALUES(self_wxid),
           nickname = VALUES(nickname),
           enabled = VALUES(enabled),
           config_json = VALUES(config_json)`,
        [
          record.account_id,
          record.display_name ?? null,
          record.self_wxid ?? null,
          record.nickname ?? null,
          record.enabled ? 1 : 0,
          cfgJson,
        ],
      );
    },

    async getAccounts(): Promise<AccountRecord[]> {
      const p = getPool();
      const rows = await queryWithTimeout<RowDataPacket[]>(
        p,
        `SELECT account_id, display_name, self_wxid, nickname, enabled, config_json
         FROM wpp_accounts ORDER BY account_id`,
        [],
      );
      return rows.map(rowToAccount);
    },

    async getAccount(accountId): Promise<AccountRecord | null> {
      const p = getPool();
      const rows = await queryWithTimeout<RowDataPacket[]>(
        p,
        `SELECT account_id, display_name, self_wxid, nickname, enabled, config_json
         FROM wpp_accounts WHERE account_id = ? LIMIT 1`,
        [accountId],
      );
      const first = firstRow(rows);
      return first ? rowToAccount(first) : null;
    },

    // ====== v1.3.76 Jargon (黑话) ======
    async saveJargonTerm(record: JargonTermRecord): Promise<void> {
      const p = getPool();
      await queryWithTimeout(
        p,
        `INSERT INTO wpp_jargon_terms
         (account_id, group_id, term, raw_content, meaning, is_jargon, frequency)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           raw_content = VALUES(raw_content),
           meaning = VALUES(meaning),
           is_jargon = VALUES(is_jargon),
           frequency = VALUES(frequency)`,
        [
          record.account_id,
          record.group_id,
          record.term,
          record.raw_content ?? null,
          record.meaning ?? null,
          record.is_jargon ?? 1,
          record.frequency ?? 1,
        ],
      );
    },
    async getJargonTerms(accountId, groupId, limit = 50): Promise<JargonTermRecord[]> {
      const p = getPool();
      const rows = await queryWithTimeout<RowDataPacket[]>(
        p,
        `SELECT account_id, group_id, term, raw_content, meaning, is_jargon, frequency
         FROM wpp_jargon_terms
         WHERE account_id = ? AND group_id = ?
         ORDER BY frequency DESC
         LIMIT ?`,
        [accountId, groupId, Math.min(Math.max(limit, 1), 200)],
      );
      return rows.map((r) => ({
        account_id: String(r.account_id),
        group_id: String(r.group_id),
        term: String(r.term),
        raw_content: r.raw_content == null ? null : String(r.raw_content),
        meaning: r.meaning == null ? null : String(r.meaning),
        is_jargon: r.is_jargon == null ? 1 : Number(r.is_jargon),
        frequency: r.frequency == null ? 1 : Number(r.frequency),
      }));
    },
    async hasJargonTerm(accountId, groupId, term): Promise<boolean> {
      const p = getPool();
      const rows = await queryWithTimeout<RowDataPacket[]>(
        p,
        `SELECT 1 FROM wpp_jargon_terms WHERE account_id = ? AND group_id = ? AND term = ? LIMIT 1`,
        [accountId, groupId, term],
      );
      return rows.length > 0;
    },

    // ====== v1.6.x HEARTFLOW-FEEDBACK (心流反馈闭环) ======
    // 全部幂等/带 status guard (仅 judged 可推进, 防 deliver 双调/竞态). adapter 不 catch, 错误由上层 catch 吞.
    async recordHfJudged(record: HfLedgerRecord): Promise<void> {
      const p = getPool();
      await queryWithTimeout(
        p,
        `INSERT IGNORE INTO wpp_hf_ledger
         (account_id, inbound_msg_id, new_msg_id, group_id, from_wxid, msg_type, content_head,
          judge_overall, dim_r, dim_w, dim_s, dim_t, dim_c, effective_threshold, energy,
          status, judged_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'judged', ?, CURRENT_TIMESTAMP)`,
        [
          record.account_id,
          record.inbound_msg_id,
          record.new_msg_id ?? null,
          record.group_id,
          record.from_wxid ?? null,
          record.msg_type ?? null,
          record.content_head ?? null,
          record.judge_overall ?? null,
          record.dim_r ?? null,
          record.dim_w ?? null,
          record.dim_s ?? null,
          record.dim_t ?? null,
          record.dim_c ?? null,
          record.effective_threshold ?? null,
          record.energy ?? null,
          record.judged_at,
        ],
      );
    },
    async setHfLedgerSent(
      accountId,
      inboundMsgId,
      sentAtSec,
      windowExpiresAtSec,
    ): Promise<void> {
      const p = getPool();
      await queryWithTimeout(
        p,
        `UPDATE wpp_hf_ledger SET status = 'sent', sent_at = ?, window_expires_at = ?
         WHERE account_id = ? AND inbound_msg_id = ? AND status = 'judged'`,
        [sentAtSec, windowExpiresAtSec, accountId, inboundMsgId],
      );
    },
    async setHfLedgerSuppressed(accountId, inboundMsgId, reason, atSec): Promise<void> {
      const p = getPool();
      await queryWithTimeout(
        p,
        `UPDATE wpp_hf_ledger SET status = 'suppressed', suppressed_reason = ?, closed_at = ?
         WHERE account_id = ? AND inbound_msg_id = ? AND status = 'judged'`,
        [reason, atSec, accountId, inboundMsgId],
      );
    },
    async markHfEngaged(accountId, groupId, atSec): Promise<void> {
      const p = getPool();
      await queryWithTimeout(
        p,
        `UPDATE wpp_hf_ledger SET engaged = 1, status = 'closed', closed_at = ?
         WHERE account_id = ? AND group_id = ? AND status = 'sent'
           AND engaged IS NULL AND window_expires_at IS NOT NULL AND window_expires_at > ?`,
        [atSec, accountId, groupId, atSec],
      );
    },
    async closeHfExpiredWindows(accountId, atSec): Promise<void> {
      const p = getPool();
      await queryWithTimeout(
        p,
        `UPDATE wpp_hf_ledger SET status = 'closed', engaged = 0, closed_at = ?
         WHERE account_id = ? AND status = 'sent' AND engaged IS NULL
           AND window_expires_at IS NOT NULL AND window_expires_at <= ?`,
        [atSec, accountId, atSec],
      );
    },
    async expireHfStaleJudged(accountId, atSec, judgedBeforeSec): Promise<void> {
      const p = getPool();
      await queryWithTimeout(
        p,
        `UPDATE wpp_hf_ledger SET status = 'suppressed', suppressed_reason = 'no-deliver-outcome', closed_at = ?
         WHERE account_id = ? AND status = 'judged' AND judged_at <= ?`,
        [atSec, accountId, judgedBeforeSec],
      );
    },
    async getHfClosedRecent(accountId, groupId, limit): Promise<HfClosedSample[]> {
      const p = getPool();
      const rows = await queryWithTimeout<RowDataPacket[]>(
        p,
        `SELECT engaged, closed_at FROM wpp_hf_ledger
         WHERE account_id = ? AND group_id = ? AND status = 'closed' AND engaged IS NOT NULL
         ORDER BY closed_at DESC LIMIT ?`,
        [accountId, groupId, Math.min(Math.max(limit, 1), 500)],
      );
      return rows.map((r) => ({
        engaged: Number(r.engaged),
        closed_at: r.closed_at == null ? null : Number(r.closed_at),
      }));
    },
    async upsertHfGroupState(record: HfGroupStateRecord): Promise<void> {
      const p = getPool();
      await queryWithTimeout(
        p,
        `INSERT INTO wpp_hf_group_state
         (account_id, group_id, learned_threshold, last_change_at, last_change_old, last_change_new, last_change_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           learned_threshold = VALUES(learned_threshold),
           last_change_at = VALUES(last_change_at),
           last_change_old = VALUES(last_change_old),
           last_change_new = VALUES(last_change_new),
           last_change_reason = VALUES(last_change_reason)`,
        [
          record.account_id,
          record.group_id,
          record.learned_threshold ?? null,
          record.last_change_at ?? null,
          record.last_change_old ?? null,
          record.last_change_new ?? null,
          record.last_change_reason ?? null,
        ],
      );
    },
    async getHfGroupState(accountId, groupId): Promise<HfGroupStateRecord | null> {
      const p = getPool();
      const rows = await queryWithTimeout<RowDataPacket[]>(
        p,
        `SELECT account_id, group_id, learned_threshold, last_change_at, last_change_old, last_change_new, last_change_reason
         FROM wpp_hf_group_state WHERE account_id = ? AND group_id = ? LIMIT 1`,
        [accountId, groupId],
      );
      const first = firstRow(rows);
      return first ? rowToHfGroupState(first) : null;
    },
    async listHfGroupStates(accountId): Promise<HfGroupStateRecord[]> {
      const p = getPool();
      const rows = await queryWithTimeout<RowDataPacket[]>(
        p,
        `SELECT account_id, group_id, learned_threshold, last_change_at, last_change_old, last_change_new, last_change_reason
         FROM wpp_hf_group_state WHERE account_id = ? ORDER BY group_id`,
        [accountId],
      );
      return rows.map(rowToHfGroupState);
    },
    async logHfThresholdChange(record: HfThresholdAuditRecord): Promise<void> {
      const p = getPool();
      await queryWithTimeout(
        p,
        `INSERT INTO wpp_hf_threshold_audit
         (account_id, group_id, old_threshold, new_threshold, sample_total, sample_engaged, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          record.account_id,
          record.group_id,
          record.old_threshold ?? null,
          record.new_threshold,
          record.sample_total,
          record.sample_engaged,
          record.reason ?? null,
        ],
      );
    },
    async getHfLedgerDistinctClosedGroups(accountId, sinceSec): Promise<string[]> {
      const p = getPool();
      const rows = await queryWithTimeout<RowDataPacket[]>(
        p,
        `SELECT DISTINCT group_id FROM wpp_hf_ledger
         WHERE account_id = ? AND status = 'closed' AND engaged IS NOT NULL AND closed_at >= ?`,
        [accountId, sinceSec],
      );
      return rows.map((r) => String(r.group_id));
    },
  };
}

/** wpp_hf_group_state row → HfGroupStateRecord */
function rowToHfGroupState(r: RowDataPacket): HfGroupStateRecord {
  return {
    account_id: String(r.account_id),
    group_id: String(r.group_id),
    learned_threshold: r.learned_threshold == null ? null : Number(r.learned_threshold),
    last_change_at: r.last_change_at == null ? null : Number(r.last_change_at),
    last_change_old: r.last_change_old == null ? null : Number(r.last_change_old),
    last_change_new: r.last_change_new == null ? null : Number(r.last_change_new),
    last_change_reason: r.last_change_reason == null ? null : String(r.last_change_reason),
  };
}

/** wpp_accounts row → AccountRecord (脱敏不在这层做, 上层只存非敏感字段) */
function rowToAccount(r: RowDataPacket): AccountRecord {
  return {
    account_id: String(r.account_id),
    display_name: r.display_name == null ? null : String(r.display_name),
    self_wxid: r.self_wxid == null ? null : String(r.self_wxid),
    nickname: r.nickname == null ? null : String(r.nickname),
    enabled: r.enabled == null ? false : Number(r.enabled) !== 0,
    config_json: r.config_json == null ? null : String(r.config_json),
  };
}

function rowToMessage(r: RowDataPacket): MessageRecord {
  const rawStr = r.raw_payload;
  let raw: unknown = rawStr;
  if (typeof rawStr === "string") {
    try {
      raw = JSON.parse(rawStr);
    } catch {
      raw = rawStr;
    }
  }
  return {
    account_id: String(r.account_id),
    msg_id: r.msg_id == null ? null : String(r.msg_id),
    new_msg_id: r.new_msg_id == null ? null : String(r.new_msg_id),
    direction: r.direction as MessageRecord["direction"],
    peer_kind: r.peer_kind as MessageRecord["peer_kind"],
    peer_id: String(r.peer_id),
    peer_name: r.peer_name == null ? null : String(r.peer_name),
    chat_id: r.chat_id == null ? null : String(r.chat_id),
    msg_type: r.msg_type == null ? null : String(r.msg_type),
    content: r.content == null ? null : String(r.content),
    raw_payload: raw,
    from_wxid: r.from_wxid == null ? null : String(r.from_wxid),
    ts: r.ts instanceof Date ? Math.floor(r.ts.getTime() / 1000) : Number(r.ts ?? 0),
  };
}

/** 测试用 — 暴露内部 ensureColumn/ensureIndex/row 映射 helpers (供无 MySQL 环境单测纯函数) */
export const _internal = {
  ensureColumn,
  ensureIndex,
  applySchemaSql,
  applyMigrations,
  rowToMessage,
  rowToAccount,
};

/** 关 pool (test cleanup) */
export async function closeMysqlForTest(adapter: DbAdapter): Promise<void> {
  try {
    await adapter.close();
  } catch (e) {
    error("closeMysqlForTest failed", e);
  }
}
