// tests/mysql-pure.test.ts - P3-1 (2026-08-13 外部审计): mysql.ts 高价值纯函数单测
// 背景: mysql.ts 行覆盖低 (DB 连接/迁移分支多, 需真 MySQL 才可测) — 审计已判"可接受"。
// 但 queryWithTimeout (超时静默杀手防护) + rowToMessage/rowToAccount (历史查询数据映射) 是
//   无 DB 也可测的高价值纯逻辑, 这里补齐少量高质量单测, 不凑覆盖率硬写。
// 约定: mock pool 走 queryWithTimeout 的 pool 参数 (不真连 DB); row 映射走 _internal 导出。

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Pool, RowDataPacket } from "mysql2/promise";
import {
  queryWithTimeout,
  QueryTimeoutError,
  _internal,
} from "../src/storage/db/mysql.js";

/** 构造 queryWithTimeout 可用的 mock pool/conn (记录 query sql + 可指定某 sql 抛 errno) */
function makeMockPool(opts: {
  /** 匹配到该 sql 前缀则抛 { errno } (undefined = 永不抛) */
  throwOnPrefix?: string;
  errno?: number;
}) {
  const queries: string[] = [];
  let released = 0;
  const pool = {
    async getConnection() {
      return {
        async query(sql: string) {
          queries.push(sql);
          if (opts.throwOnPrefix && sql.startsWith(opts.throwOnPrefix)) {
            throw Object.assign(new Error(`mock error: ${sql}`), { errno: opts.errno });
          }
          return [[{ ok: 1 }], undefined];
        },
        release() {
          released++;
        },
      };
    },
  };
  return { pool: pool as unknown as Pool, queries, getReleased: () => released };
}

// ============ queryWithTimeout: 超时防护 + 分支 ============

test("P3-1 — queryWithTimeout SELECT: 先 SET SESSION max_statement_time 再查, 返回 rows", async () => {
  const { pool, queries } = makeMockPool({});
  const r = await queryWithTimeout<RowDataPacket[]>(
    pool,
    "SELECT * FROM wpp_messages WHERE account_id = ?",
    ["a"],
  );
  assert.deepEqual(r, [{ ok: 1 }]);
  assert.equal(queries.length, 2, "SELECT 应先 SET SESSION 再跑实际查询");
  assert.equal(queries[0], "SET SESSION max_statement_time = 10");
  assert.equal(queries[1], "SELECT * FROM wpp_messages WHERE account_id = ?");
});

test("P3-1 — queryWithTimeout 非 SELECT: 不 SET SESSION, 只跑一次", async () => {
  const { pool, queries } = makeMockPool({});
  await queryWithTimeout(pool, "INSERT INTO wpp_messages (account_id) VALUES (?)", ["a"]);
  assert.equal(queries.length, 1, "非 SELECT 不应 SET SESSION");
  assert.equal(queries[0], "INSERT INTO wpp_messages (account_id) VALUES (?)");
});

test("P3-1 — queryWithTimeout errno=1969 → throw QueryTimeoutError (防静默空结果)", async () => {
  const { pool, queries, getReleased } = makeMockPool({
    throwOnPrefix: "SELECT * FROM wpp_messages",
    errno: 1969,
  });
  await assert.rejects(
    queryWithTimeout(pool, "SELECT * FROM wpp_messages WHERE account_id = ?", ["a"]),
    (e: unknown) => {
      assert.ok(e instanceof QueryTimeoutError, "应抛 QueryTimeoutError");
      assert.equal((e as QueryTimeoutError).errno, 1969);
      assert.ok(String((e as QueryTimeoutError).message).includes("SELECT * FROM wpp_messages"));
      return true;
    },
  );
  assert.equal(queries.length, 2, "SET SESSION 成功 + 实际查询抛 1969");
  assert.equal(getReleased(), 1, "finally 必须 release conn");
});

test("P3-1 — queryWithTimeout errno=1969 + onTimeout=warn-and-return → 返空数组", async () => {
  const { pool, getReleased } = makeMockPool({
    throwOnPrefix: "SELECT * FROM wpp_messages",
    errno: 1969,
  });
  const r = await queryWithTimeout<RowDataPacket[]>(
    pool,
    "SELECT * FROM wpp_messages WHERE account_id = ?",
    ["a"],
    { onTimeout: "warn-and-return" },
  );
  assert.deepEqual(r, [], "warn-and-return 应回退空结果");
  assert.equal(getReleased(), 1);
});

test("P3-1 — queryWithTimeout 非 1969 错误 → 原样 rethrow (不吞错)", async () => {
  const { pool, getReleased } = makeMockPool({
    throwOnPrefix: "SELECT * FROM wpp_messages",
    errno: 1045,
  });
  await assert.rejects(
    queryWithTimeout(pool, "SELECT * FROM wpp_messages", []),
    (e: unknown) => {
      assert.ok(!(e instanceof QueryTimeoutError), "非 1969 不应包装成 QueryTimeoutError");
      assert.equal((e as { errno?: number }).errno, 1045);
      return true;
    },
  );
  assert.equal(getReleased(), 1);
});

test("P3-1 — queryWithTimeout 成功路径也 release conn (finally 保证)", async () => {
  const { pool, getReleased } = makeMockPool({});
  await queryWithTimeout(pool, "SELECT 1 AS ok");
  assert.equal(getReleased(), 1);
});

// ============ rowToMessage: 历史查询数据映射 (JSON 解析兜底 + Date→秒) ============

test("P3-1 — rowToMessage: raw_payload JSON 字符串 → 解析对象 + ts Date → 秒", () => {
  const row = {
    account_id: "default",
    msg_id: "m1",
    new_msg_id: "n1",
    direction: "inbound",
    peer_kind: "direct",
    peer_id: "wxid_x",
    peer_name: "张三",
    chat_id: null,
    msg_type: "1",
    content: "hello",
    raw_payload: '{"md5":"abc","local_id":7}',
    from_wxid: "wxid_x",
    ts: new Date(1700000000000),
  } as unknown as RowDataPacket;
  const m = _internal.rowToMessage(row);
  assert.equal(m.account_id, "default");
  assert.equal(m.msg_id, "m1");
  assert.equal(m.ts, 1700000000, "Date 应转秒");
  assert.deepEqual(m.raw_payload, { md5: "abc", local_id: 7 }, "JSON 字符串应解析成对象");
});

test("P3-1 — rowToMessage: raw_payload 非 JSON 字符串 → 原样保留 (不抛)", () => {
  const row = {
    account_id: "default",
    msg_id: "m2",
    direction: "inbound",
    peer_kind: "group",
    peer_id: "g1",
    raw_payload: "<xml>not json</xml>",
    ts: 1700000000,
  } as unknown as RowDataPacket;
  const m = _internal.rowToMessage(row);
  assert.equal(m.raw_payload, "<xml>not json</xml>");
  assert.equal(m.ts, 1700000000, "数字 ts 原样保留");
  assert.equal(m.new_msg_id, null);
  assert.equal(m.peer_name, null);
});

test("P3-1 — rowToMessage: raw_payload 已是对象 → 保持 + ts 缺失 → 0", () => {
  const row = {
    account_id: "default",
    msg_id: "m3",
    direction: "outbound",
    peer_kind: "direct",
    peer_id: "wxid_y",
    raw_payload: { md5: "def" },
  } as unknown as RowDataPacket;
  const m = _internal.rowToMessage(row);
  assert.deepEqual(m.raw_payload, { md5: "def" });
  assert.equal(m.ts, 0, "ts 缺失应回退 0");
});

// ============ rowToAccount: 账号行映射 (enabled 0/1 → bool) ============

test("P3-1 — rowToAccount: 完整行映射 + enabled 1 → true", () => {
  const row = {
    account_id: "acc1",
    display_name: "益融小助理",
    self_wxid: "wxid_bot",
    nickname: "小助理",
    enabled: 1,
    config_json: '{"agent":"main"}',
  } as unknown as RowDataPacket;
  const a = _internal.rowToAccount(row);
  assert.equal(a.account_id, "acc1");
  assert.equal(a.display_name, "益融小助理");
  assert.equal(a.self_wxid, "wxid_bot");
  assert.equal(a.nickname, "小助理");
  assert.equal(a.enabled, true);
  assert.equal(a.config_json, '{"agent":"main"}');
});

test("P3-1 — rowToAccount: enabled 0 / null → false; 空字段 → null", () => {
  const row0 = { account_id: "a", enabled: 0 } as unknown as RowDataPacket;
  assert.equal(_internal.rowToAccount(row0).enabled, false);
  const rowNull = { account_id: "b", enabled: null, display_name: null, config_json: null } as unknown as RowDataPacket;
  const a = _internal.rowToAccount(rowNull);
  assert.equal(a.enabled, false);
  assert.equal(a.display_name, null);
  assert.equal(a.config_json, null);
});
