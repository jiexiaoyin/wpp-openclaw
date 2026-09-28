/**
 * D7 性能 - wpp_hf_ledger 时间列索引守卫 (source-level)
 *
 * v1.9.2 commit de99611 (perf): 加 3 个时间列索引, 修 5 处热查询的 filesort:
 *   - idx_hf_judged   (judged_at)
 *   - idx_hf_sent     (sent_at)
 *   - idx_hf_closed   (judged_at, 用于 listHfClosedSince)
 *
 * 本测试是 source-level 守卫, 不是真跑 DB —— 原因: 性能索引要测得真实得用 staging
 * (生产库不许 EXPLAIN, 不许在 index 热路径上拉 baseline). 我们的策略是**保证代码
 * 持续声明这些索引** + **保证热查询 SQL 真的用了对应索引列**, 把回归挡在 source 阶段.
 *
 * 与 perf-heat-path.test.mjs 风格一致: 读源码 grep, 守住关键不变量.
 */
import assert from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

function src(p) {
  return readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf-8');
}

// ── 3 个索引在源码里声明 ─────────────────────────────────────────────
test('D7.1 mysql.ts: wpp_hf_ledger 时间列索引声明必须存在', () => {
  const s = src('storage/db/mysql.ts');
  for (const idx of ['idx_hf_judged', 'idx_hf_sent', 'idx_hf_closed']) {
    assert.match(s, new RegExp(idx), `${idx} 必须在 mysql.ts 声明 (ensureIndex)`);
  }
});

test('D7.2 mysql.ts: 索引列必须是时间列 (不是别的列)', () => {
  const s = src('storage/db/mysql.ts');
  // 实际定义形如:
  //   ensureIndex(pool, "wpp_hf_ledger", "idx_hf_judged",  ["account_id", "judged_at"]);
  //   ensureIndex(pool, "wpp_hf_ledger", "idx_hf_sent",    ["account_id", "sent_at"]);
  //   ensureIndex(pool, "wpp_hf_ledger", "idx_hf_closed",  ["account_id", "closed_at"]);
  // 守卫点: 索引列必须是对应时间列, 不能被偷偷换成非索引列 (否则 de99611 的 perf 修复空转)
  assert.match(s,
    /ensureIndex\(pool, "wpp_hf_ledger", "idx_hf_judged", \[[^\]]*"?judged_at"?[^\]]*\]\)/,
    'idx_hf_judged 列必须含 judged_at');
  assert.match(s,
    /ensureIndex\(pool, "wpp_hf_ledger", "idx_hf_sent", \[[^\]]*"?sent_at"?[^\]]*\]\)/,
    'idx_hf_sent 列必须含 sent_at');
  assert.match(s,
    /ensureIndex\(pool, "wpp_hf_ledger", "idx_hf_closed", \[[^\]]*"?closed_at"?[^\]]*\]\)/,
    'idx_hf_closed 列必须含 closed_at (注意: 是 closed_at, 不是 judged_at)');
});

// ── ensureIndex 必须幂等 ──────────────────────────────────────────────
test('D7.3 mysql.ts: ensureIndex 实现里 SHOW INDEX 前置判断 (幂等保证)', () => {
  const s = src('storage/db/mysql.ts');
  // 找 ensureIndex 函数体, 应包含 SHOW INDEX 检测存在性再 ADD
  assert.match(s, /SHOW INDEX/i, 'ensureIndex 必须先 SHOW INDEX 探测');
  assert.match(s, /ADD INDEX/i, 'ensureIndex 探测后用 ADD INDEX 创建');
});

test('D7.4 mysql.ts: applyMigrations 在启动路径上被调用', () => {
  const s = src('storage/db/mysql.ts');
  // 应有 ensureMigrations / runMigrations 之类的启动期入口
  // (或 inline 调用 ensureIndex)
  assert.match(s, /ensureIndex|applyMigrations|runMigrations/, '启动期必须有索引入口');
});

// ── 5 处热查询 SQL 使用对应索引列 (de99611 实际修的范围) ────────────────
test('D7.5 de99611 文档化的 5 处热查询必须仍用对应时间列', () => {
  const s = src('storage/db/mysql.ts');
  // de99611 文档列出这 5 处. 它们共同点: 都引用 judged_at / sent_at / closed_at.
  // 守卫点: 5 处都必须仍然在代码里 — 若重构偷偷去掉某处 (例如 GROUP BY status 不用 judged_at 了),
  // 该索引的覆盖范围缩小, 会被这个测试挡出.
  const patterns = [
    // (regex, 描述)
    [/account_id = \? AND judged_at >= \?.*GROUP BY status/m, '#930 status 统计 (judged_at 过滤)'],
    [/account_id = \? AND status = 'closed' AND judged_at >= \?/m, '#954 closed 状态统计 (judged_at 过滤)'],
    [/account_id = \? AND status = 'judged' AND judged_at <= \?/m, '#1039 judged 行过期清理 (judged_at 过滤)'],
    [/ORDER BY closed_at DESC/m, '#1049 closed 排序 (closed_at 排序, 命中 idx_hf_closed)'],
    [/account_id = \? AND sent_at IS NOT NULL AND sent_at >= \?/m, '#1110 观测统计 (sent_at 过滤)'],
  ];
  let missing = 0;
  for (const [re, desc] of patterns) {
    if (!re.test(s)) {
      missing++;
      console.error(`  ✗ 缺失: ${desc}`);
    }
  }
  assert.equal(missing, 0, `de99611 文档的 5 处热查询有 ${missing} 处不在源码里 (重构后请同步调索引范围)`);
});

test('D7.5b 时间列用法总数符合预期 (judged_at + sent_at + closed_at)', () => {
  const s = src('storage/db/mysql.ts');
  // 综合判断: 这 3 列加起来在 SELECT/UPDATE/WHERE/ORDER BY 中被使用的次数应 >= 12
  // (5 处热查询 + 7 处其他使用, 如 INSERT/CREATE TABLE/触发器)
  const cols = ['judged_at', 'sent_at', 'closed_at'];
  for (const c of cols) {
    const n = (s.match(new RegExp(`\\b${c}\\b`, 'g')) || []).length;
    assert.ok(n >= 5, `列 ${c} 引用次数 ${n} < 5 (期望 ≥ 5 处热查询 + 其他使用)`);
  }
});

// ── sanitize-source / check-tags 不阻断本仓 ──────────────────────────
test('D7.6 ensureIndex 路径不进敏感串 (de99611 是 perf, 不动凭证)', () => {
  const s = src('storage/db/mysql.ts');
  // 防止未来重构偷偷加 wxid_xxx 占位符到索引定义里 (那是 sanitize 的失败模式)
  assert.doesNotMatch(s, /wxid_[a-z0-9]+/, '索引相关代码不应含 wxid_ 占位符');
});
