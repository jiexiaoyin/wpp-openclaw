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
import { info, warn, error } from "../../core/logger.js";
import { findPluginRoot } from "../../core/paths.js";
import type {
  AccountRecord,
  ApiCallRecord,
  ChatroomRecord,
  ContactRecord,
  DbAdapter,
  MessageRecord,
  ResolvedDbConfig,
  SessionStateRecord,
  SvridMappingRecord,
} from "./types.js";

/** ER_STATEMENT_TIMEOUT (1969): caught → return [] */
const ER_STATEMENT_TIMEOUT = 1969;
/** max_statement_time (s) per query (vendor 文档明示不超过 10s) */
const STMT_TIMEOUT_SECONDS = 10;

/**
 * Run a query with optional max_statement_time timeout.
 * Catches ER_STATEMENT_TIMEOUT and returns empty rows.
 */
export async function queryWithTimeout<T extends RowDataPacket[] | ResultSetHeader>(
  pool: Pool,
  sql: string,
  params: unknown[] = [],
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
      warn(`queryWithTimeout: 1969 timeout (sql=${sql.slice(0, 80)})`);
      return [] as unknown as T;
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
  // v1.0.1: 基础 (account_id, ts) 复合, 覆盖 history query
  await ensureIndex(pool, "wpp_messages", "idx_account_chat_ts", [
    "account_id",
    "chat_id",
    "ts",
  ]);
  // v1.0.1: (peer_kind, peer_id) 复合, 覆盖跨账号 peer 查询
  await ensureIndex(pool, "wpp_messages", "idx_peer_kind_peer_id", [
    "peer_kind",
    "peer_id",
  ]);
  // v1.1.1: (account_id, peer_id, ts) 复合, 加速 "get history from this peer" 常见 case
  //   之前 idx_account_ts + filter peer_id 走 filter 慢, 复合后走 index range scan
  await ensureIndex(pool, "wpp_messages", "idx_account_peer_ts", [
    "account_id",
    "peer_id",
    "ts",
  ]);
  // v1.1.1: (account_id, msg_type, ts) 复合, 加速按消息类型查 (Phase D 4-way trigger)
  await ensureIndex(pool, "wpp_messages", "idx_account_msgtype_ts", [
    "account_id",
    "msg_type",
    "ts",
  ]);

  // v1.1.24 QUOTE-SVRID (2026-08-08 接总立): 引用消息 svrid 映射表
  //   微信 svrid 无法主动获取, 只能从"别人引用该消息"的 refermsg.svrid 捕获
  //   表: wpp_svrid_mapping (md5 → svrid), AI 引用时优先查真实 svrid
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

  // v1.1.25 SYNC-STATE (2026-08-08 接总立): Synckey 增量游标持久化
  //   根因: Synckey:"" 每次重启全量拉取 → 重放风暴 → dedup DB 查询阻塞事件循环 → 网关卡顿
  //   修复: 保存每次 Sync 返回的 KeyBuf.buffer, 重启后用增量游标只拉新消息
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wpp_sync_state (
      account_id VARCHAR(64) NOT NULL,
      synckey VARCHAR(1024) NOT NULL,
      updated_at INT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (account_id)
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
      // v1.1.17 FULL-FIX (P0-G): schema.sql 已加 UNIQUE (account_id, msg_id, new_msg_id)
      // INSERT 改 ON DUPLICATE KEY UPDATE — 三通道 (webhook/business-callback/WS) 重复推送时幂等
      await p.query(
        `INSERT INTO wpp_messages
         (account_id, msg_id, new_msg_id, direction, peer_kind, peer_id, peer_name,
          chat_id, msg_type, content, raw_payload, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(FROM_UNIXTIME(?), CURRENT_TIMESTAMP))
         ON DUPLICATE KEY UPDATE
           direction = VALUES(direction),
           peer_kind = VALUES(peer_kind),
           peer_id = VALUES(peer_id),
           msg_type = VALUES(msg_type),
           content = VALUES(content),
           raw_payload = VALUES(raw_payload)`,
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
      // v1.0.3 FIX-A1: clamp limit 防御 DoS (单次最多 1000 行, 防 caller 传 1M 内存爆)
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

    // v1.1.19 DB-DEDUP (2026-08-08 18:33 接总立方案 A): 持久化去重查询
    // 按 msg_id 或 new_msg_id 任一命中即视为已存在 (vendor 重放时 msg_id 相同)
    async getMessageByMsgIdOrNewId(
      msgId: string | undefined,
      newMsgId: string | undefined,
      accountId: string,
    ): Promise<MessageRecord | null> {
      if (!msgId && !newMsgId) return null;
      const p = getPool();
      // v1.1.19 FIX (2026-08-08 18:38): SQL 运算符优先级 bug —
      //   之前 `WHERE account_id = ? OR msg_id = ? OR new_msg_id = ? AND direction='inbound'`
      //   AND 优先于 OR → 变成 account_id = ? OR msg_id = ? OR (new_msg_id = ? AND direction)
      //   → account_id 恒真 → 所有消息都命中 → 全部误杀 skip (老板图片消息丢失根因)
      //   正确: account_id AND (msg_id OR new_msg_id) AND direction
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
      const rows = await queryWithTimeout<RowDataPacket[]>(
        p,
        `SELECT * FROM wpp_messages WHERE account_id = ? AND (${idClauses.join(" OR ")}) AND direction = 'inbound' LIMIT 1`,
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

    // ===== v1.1.24 Quote svrid 映射 =====
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

    // ===== v1.1.25 Sync state (Synckey 持久化) =====
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
      const rows = await queryWithTimeout<RowDataPacket[]>(
        p,
        `SELECT * FROM wpp_contacts WHERE account_id = ? LIMIT ${limit}`,
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
      const rows = await queryWithTimeout<RowDataPacket[]>(
        p,
        `SELECT * FROM wpp_chatrooms WHERE account_id = ? LIMIT ${limit}`,
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
      // v1.0.3 FIX-A1: clamp limit 防御 DoS
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
    ts: r.ts instanceof Date ? Math.floor(r.ts.getTime() / 1000) : Number(r.ts ?? 0),
  };
}

/** 测试用 — 暴露内部 ensureColumn/ensureIndex helpers */
export const _internal = { ensureColumn, ensureIndex, applySchemaSql, applyMigrations };

/** 关 pool (test cleanup) */
export async function closeMysqlForTest(adapter: DbAdapter): Promise<void> {
  try {
    await adapter.close();
  } catch (e) {
    error("closeMysqlForTest failed", e);
  }
}
