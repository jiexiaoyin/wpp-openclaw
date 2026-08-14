import mysql from "mysql2/promise";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { info, warn, error, formatErr } from "../../core/logger.js";
import { findPluginRoot } from "../../core/paths.js";
const ER_STATEMENT_TIMEOUT = 1969;
const STMT_TIMEOUT_SECONDS = 10;
export class QueryTimeoutError extends Error {
    originalError;
    code = "QUERY_TIMEOUT";
    errno = ER_STATEMENT_TIMEOUT;
    sql;
    constructor(sql, originalError) {
        super(`queryWithTimeout: 1969 timeout (sql=${sql.slice(0, 80)})`);
        this.originalError = originalError;
        this.name = "QueryTimeoutError";
        this.sql = sql;
    }
}
export async function queryWithTimeout(pool, sql, params = [], opts) {
    const conn = await pool.getConnection();
    try {
        if (/^\s*SELECT/i.test(sql)) {
            await conn.query(`SET SESSION max_statement_time = ${STMT_TIMEOUT_SECONDS}`);
        }
        const [r] = await conn.query(sql, params);
        return r;
    }
    catch (e) {
        const code = e.errno;
        if (code === ER_STATEMENT_TIMEOUT) {
            if (opts?.onTimeout === "warn-and-return") {
                warn(`queryWithTimeout: 1969 timeout (sql=${sql.slice(0, 80)}) — falling back to empty result`);
                return [];
            }
            throw new QueryTimeoutError(sql, e);
        }
        throw e;
    }
    finally {
        conn.release();
    }
}
async function ensureColumn(pool, table, column, type, after) {
    const cols = await queryWithTimeout(pool, `SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
    if (cols.length === 0) {
        const sql = after
            ? `ALTER TABLE ${table} ADD COLUMN ${column} ${type} AFTER \`${after}\``
            : `ALTER TABLE ${table} ADD COLUMN ${column} ${type}`;
        await pool.query(sql);
        info(`ensureColumn: ${table}.${column} ADD (${type})`);
    }
}
async function ensureIndex(pool, table, indexName, cols) {
    const idx = await queryWithTimeout(pool, `SHOW INDEX FROM ${table} WHERE Key_name = ?`, [indexName]);
    if (idx.length === 0) {
        const sql = `ALTER TABLE ${table} ADD INDEX ${indexName} (${cols.join(", ")})`;
        await pool.query(sql);
        info(`ensureIndex: ${table}.${indexName} (${cols.join(", ")})`);
    }
}
function firstRow(rows) {
    return rows.length > 0 && rows[0] !== undefined ? rows[0] : null;
}
async function applySchemaSql(pool) {
    const schemaPath = join(await findPluginRoot(), "db", "schema.sql");
    try {
        await access(schemaPath);
    }
    catch {
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
async function applyMigrations(pool) {
    await ensureColumn(pool, "wpp_messages", "create_time", "BIGINT NULL");
    await ensureColumn(pool, "wpp_messages", "from_wxid", "VARCHAR(128) NULL");
    try {
        await pool.query(`UPDATE wpp_messages SET from_wxid = JSON_UNQUOTE(JSON_EXTRACT(raw_payload, '$.sender_id'))
       WHERE from_wxid IS NULL AND raw_payload IS NOT NULL AND raw_payload <> ''
         AND JSON_UNQUOTE(JSON_EXTRACT(raw_payload, '$.sender_id')) IS NOT NULL`);
    }
    catch (e) {
        warn(`applyMigrations: backfill from_wxid failed (non-fatal): ${formatErr(e)}`);
    }
    await ensureIndex(pool, "wpp_messages", "idx_account_chat_ts", [
        "account_id",
        "chat_id",
        "ts",
    ]);
    await ensureIndex(pool, "wpp_messages", "idx_peer_kind_peer_id", [
        "peer_kind",
        "peer_id",
    ]);
    await ensureIndex(pool, "wpp_messages", "idx_sender", [
        "peer_kind",
        "peer_id",
        "from_wxid",
    ]);
    await ensureIndex(pool, "wpp_messages", "idx_account_peer_ts", [
        "account_id",
        "peer_id",
        "ts",
    ]);
    await ensureIndex(pool, "wpp_messages", "idx_account_msgtype_ts", [
        "account_id",
        "msg_type",
        "ts",
    ]);
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
    await pool.query(`
    CREATE TABLE IF NOT EXISTS wpp_sync_state (
      account_id VARCHAR(64) NOT NULL,
      synckey VARCHAR(1024) NOT NULL,
      updated_at INT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (account_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
export function createMysqlAdapter(cfg) {
    let pool = null;
    const getPool = () => {
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
                queueLimit: cfg.mysql.queueLimit ?? 50,
            });
            info(`mysqlAdapter pool init: ${cfg.mysql.host}:${cfg.mysql.port}/${cfg.mysql.database} (user=${cfg.mysql.user}, limit=${cfg.mysql.connectionLimit})`);
        }
        return pool;
    };
    return {
        backendName: "mariadb",
        async init() {
            const p = getPool();
            await applySchemaSql(p);
            await applyMigrations(p);
        },
        async close() {
            if (pool) {
                await pool.end();
                pool = null;
                info("mysqlAdapter closed");
            }
        },
        async ping() {
            const p = getPool();
            await p.query("SELECT 1 AS ok");
        },
        async saveMessage(record) {
            const p = getPool();
            await p.query(`INSERT INTO wpp_messages
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
           from_wxid = VALUES(from_wxid)`, [
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
            ]);
        },
        async getMessages(opts) {
            const p = getPool();
            const where = [];
            const params = [];
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
            const safeLimit = Math.min(Math.max(opts.limit ?? 100, 1), 1000);
            const sql = `SELECT * FROM wpp_messages` +
                (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
                ` ORDER BY ts DESC LIMIT ${safeLimit}`;
            const rows = await queryWithTimeout(p, sql, params);
            return rows.map(rowToMessage);
        },
        async getMessageById(msgId, accountId) {
            const p = getPool();
            const rows = await queryWithTimeout(p, `SELECT * FROM wpp_messages WHERE msg_id = ? AND account_id = ? LIMIT 1`, [msgId, accountId]);
            return firstRow(rows) ? rowToMessage(firstRow(rows)) : null;
        },
        async getMessageByMsgIdOrNewId(msgId, newMsgId, accountId, opts) {
            if (!msgId && !newMsgId)
                return null;
            const p = getPool();
            const direction = opts?.direction ?? "inbound";
            const idClauses = [];
            const params = [accountId];
            if (msgId) {
                idClauses.push("msg_id = ?");
                params.push(msgId);
            }
            if (newMsgId) {
                idClauses.push("new_msg_id = ?");
                params.push(newMsgId);
            }
            const dirClause = direction === "any" ? "" : `AND direction = '${direction}'`;
            const rows = await queryWithTimeout(p, `SELECT * FROM wpp_messages WHERE account_id = ? AND (${idClauses.join(" OR ")}) ${dirClause} LIMIT 1`, params);
            return firstRow(rows) ? rowToMessage(firstRow(rows)) : null;
        },
        async findMessageByMd5(md5, accountId) {
            const p = getPool();
            const rows = await queryWithTimeout(p, `SELECT * FROM wpp_messages WHERE account_id = ? AND raw_payload LIKE ? LIMIT 1`, [accountId, `%"md5":"${md5}"%`]);
            return firstRow(rows) ? rowToMessage(firstRow(rows)) : null;
        },
        async saveSvridMapping(record) {
            const p = getPool();
            await p.query(`INSERT INTO wpp_svrid_mapping (account_id, svrid, msg_md5, quoted_content_hash, captured_at)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           msg_md5 = VALUES(msg_md5),
           quoted_content_hash = VALUES(quoted_content_hash),
           captured_at = VALUES(captured_at)`, [
                record.account_id,
                record.svrid,
                record.msg_md5 ?? null,
                record.quoted_content_hash ?? null,
                record.captured_at ?? Math.floor(Date.now() / 1000),
            ]);
        },
        async getSvridByMd5(md5, accountId) {
            const p = getPool();
            const rows = await queryWithTimeout(p, `SELECT svrid FROM wpp_svrid_mapping WHERE account_id = ? AND msg_md5 = ? ORDER BY captured_at DESC LIMIT 1`, [accountId, md5]);
            return rows.length > 0 ? String(rows[0].svrid) : null;
        },
        async saveSynckey(accountId, synckey) {
            const p = getPool();
            await p.query(`INSERT INTO wpp_sync_state (account_id, synckey, updated_at)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE synckey = VALUES(synckey), updated_at = VALUES(updated_at)`, [accountId, synckey, Math.floor(Date.now() / 1000)]);
        },
        async getSynckey(accountId) {
            const p = getPool();
            const rows = await queryWithTimeout(p, `SELECT synckey FROM wpp_sync_state WHERE account_id = ? LIMIT 1`, [accountId]);
            return rows.length > 0 ? String(rows[0].synckey) : null;
        },
        async saveContact(record) {
            const p = getPool();
            await p.query(`INSERT INTO wpp_contacts
         (account_id, wxid, nickname, remark, avatar_url, gender, signature, last_synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE
           nickname = VALUES(nickname),
           remark = VALUES(remark),
           avatar_url = VALUES(avatar_url),
           gender = VALUES(gender),
           signature = VALUES(signature),
           last_synced_at = CURRENT_TIMESTAMP`, [
                record.account_id,
                record.wxid,
                record.nickname ?? null,
                record.remark ?? null,
                record.avatar_url ?? null,
                record.gender ?? null,
                record.signature ?? null,
            ]);
        },
        async getContacts(accountId, limit = 500) {
            const p = getPool();
            const safeLimit = Math.max(1, Math.min(Math.trunc(limit) || 500, 1000));
            const rows = await queryWithTimeout(p, `SELECT * FROM wpp_contacts WHERE account_id = ? LIMIT ${safeLimit}`, [accountId]);
            return rows.map((r) => ({
                account_id: String(r.account_id),
                wxid: String(r.wxid),
                nickname: r.nickname == null ? null : String(r.nickname),
                remark: r.remark == null ? null : String(r.remark),
                avatar_url: r.avatar_url == null ? null : String(r.avatar_url),
                gender: r.gender == null ? null : Number(r.gender),
                signature: r.signature == null ? null : String(r.signature),
            }));
        },
        async saveChatroom(record) {
            const p = getPool();
            await p.query(`INSERT INTO wpp_chatrooms
         (account_id, chatroom_id, nickname, remark, owner_wxid, member_count, last_synced_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE
           nickname = VALUES(nickname),
           remark = VALUES(remark),
           owner_wxid = VALUES(owner_wxid),
           member_count = VALUES(member_count),
           last_synced_at = CURRENT_TIMESTAMP`, [
                record.account_id,
                record.chatroom_id,
                record.nickname ?? null,
                record.remark ?? null,
                record.owner_wxid ?? null,
                record.member_count ?? null,
            ]);
        },
        async getChatrooms(accountId, limit = 500) {
            const p = getPool();
            const safeLimit = Math.max(1, Math.min(Math.trunc(limit) || 500, 1000));
            const rows = await queryWithTimeout(p, `SELECT * FROM wpp_chatrooms WHERE account_id = ? LIMIT ${safeLimit}`, [accountId]);
            return rows.map((r) => ({
                account_id: String(r.account_id),
                chatroom_id: String(r.chatroom_id),
                nickname: r.nickname == null ? null : String(r.nickname),
                remark: r.remark == null ? null : String(r.remark),
                owner_wxid: r.owner_wxid == null ? null : String(r.owner_wxid),
                member_count: r.member_count == null ? null : Number(r.member_count),
            }));
        },
        async getSessionState(opts) {
            const p = getPool();
            const rows = await queryWithTimeout(p, `SELECT * FROM wpp_session_state WHERE account_id = ? AND peer_kind = ? AND peer_id = ? LIMIT 1`, [opts.accountId, opts.peerKind, opts.peerId]);
            const first = firstRow(rows);
            if (!first)
                return null;
            return {
                account_id: String(first.account_id),
                peer_kind: first.peer_kind,
                peer_id: String(first.peer_id),
                last_msg_id: first.last_msg_id == null ? null : String(first.last_msg_id),
                last_msg_ts: first.last_msg_ts instanceof Date
                    ? Math.floor(first.last_msg_ts.getTime() / 1000)
                    : first.last_msg_ts == null
                        ? null
                        : Number(first.last_msg_ts),
                pending_count: first.pending_count == null ? 0 : Number(first.pending_count),
            };
        },
        async upsertSessionState(record) {
            const p = getPool();
            await p.query(`INSERT INTO wpp_session_state
         (account_id, peer_kind, peer_id, last_msg_id, last_msg_ts, pending_count)
         VALUES (?, ?, ?, ?, FROM_UNIXTIME(?), ?)
         ON DUPLICATE KEY UPDATE
           last_msg_id = VALUES(last_msg_id),
           last_msg_ts = VALUES(last_msg_ts),
           pending_count = VALUES(pending_count)`, [
                record.account_id,
                record.peer_kind,
                record.peer_id,
                record.last_msg_id ?? null,
                record.last_msg_ts ?? null,
                record.pending_count ?? 0,
            ]);
        },
        async logApiCall(record) {
            const p = getPool();
            await p.query(`INSERT INTO wpp_api_calls
         (account_id, endpoint, method, status_code, vendor_code, latency_ms, request_body, response_body)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                record.account_id,
                record.endpoint,
                record.method ?? "POST",
                record.status_code ?? null,
                record.vendor_code ?? null,
                record.latency_ms ?? null,
                record.request_body !== undefined ? JSON.stringify(record.request_body) : null,
                record.response_body !== undefined ? JSON.stringify(record.response_body) : null,
            ]);
        },
        async getApiCalls(opts) {
            const p = getPool();
            const where = [];
            const params = [];
            if (opts.accountId) {
                where.push("account_id = ?");
                params.push(opts.accountId);
            }
            if (opts.endpoint) {
                where.push("endpoint = ?");
                params.push(opts.endpoint);
            }
            const safeLimit = Math.min(Math.max(opts.limit ?? 100, 1), 1000);
            const sql = `SELECT * FROM wpp_api_calls` +
                (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
                ` ORDER BY ts DESC LIMIT ${safeLimit}`;
            const rows = await queryWithTimeout(p, sql, params);
            return rows.map((r) => ({
                account_id: String(r.account_id),
                endpoint: String(r.endpoint),
                method: r.method == null ? "POST" : String(r.method),
                status_code: r.status_code == null ? null : Number(r.status_code),
                vendor_code: r.vendor_code == null ? null : Number(r.vendor_code),
                latency_ms: r.latency_ms == null ? null : Number(r.latency_ms),
            }));
        },
        async upsertAccount(record) {
            const p = getPool();
            const cfgJson = record.config_json === undefined || record.config_json === null
                ? null
                : typeof record.config_json === "string"
                    ? record.config_json
                    : JSON.stringify(record.config_json);
            await p.query(`INSERT INTO wpp_accounts
         (account_id, display_name, self_wxid, nickname, enabled, config_json)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           display_name = VALUES(display_name),
           self_wxid = VALUES(self_wxid),
           nickname = VALUES(nickname),
           enabled = VALUES(enabled),
           config_json = VALUES(config_json)`, [
                record.account_id,
                record.display_name ?? null,
                record.self_wxid ?? null,
                record.nickname ?? null,
                record.enabled ? 1 : 0,
                cfgJson,
            ]);
        },
        async getAccounts() {
            const p = getPool();
            const rows = await queryWithTimeout(p, `SELECT account_id, display_name, self_wxid, nickname, enabled, config_json
         FROM wpp_accounts ORDER BY account_id`, []);
            return rows.map(rowToAccount);
        },
        async getAccount(accountId) {
            const p = getPool();
            const rows = await queryWithTimeout(p, `SELECT account_id, display_name, self_wxid, nickname, enabled, config_json
         FROM wpp_accounts WHERE account_id = ? LIMIT 1`, [accountId]);
            const first = firstRow(rows);
            return first ? rowToAccount(first) : null;
        },
    };
}
function rowToAccount(r) {
    return {
        account_id: String(r.account_id),
        display_name: r.display_name == null ? null : String(r.display_name),
        self_wxid: r.self_wxid == null ? null : String(r.self_wxid),
        nickname: r.nickname == null ? null : String(r.nickname),
        enabled: r.enabled == null ? false : Number(r.enabled) !== 0,
        config_json: r.config_json == null ? null : String(r.config_json),
    };
}
function rowToMessage(r) {
    const rawStr = r.raw_payload;
    let raw = rawStr;
    if (typeof rawStr === "string") {
        try {
            raw = JSON.parse(rawStr);
        }
        catch {
            raw = rawStr;
        }
    }
    return {
        account_id: String(r.account_id),
        msg_id: r.msg_id == null ? null : String(r.msg_id),
        new_msg_id: r.new_msg_id == null ? null : String(r.new_msg_id),
        direction: r.direction,
        peer_kind: r.peer_kind,
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
export const _internal = {
    ensureColumn,
    ensureIndex,
    applySchemaSql,
    applyMigrations,
    rowToMessage,
    rowToAccount,
};
export async function closeMysqlForTest(adapter) {
    try {
        await adapter.close();
    }
    catch (e) {
        error("closeMysqlForTest failed", e);
    }
}
