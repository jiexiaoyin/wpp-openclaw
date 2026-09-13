// schema-sql-split.test.mjs — applySchemaSql 的语句切分 (v1.6.3 修的真 bug)
//
// 背景 (2026-09-13 老板拍板把 db/schema.sql 补进线上扩展时顺带发现):
//   线上扩展缺 db/schema.sql 只是告警; 补上之后才看到更深一层 —— 启动日志恒为
//   `applySchemaSql: 0 statements applied`, 而文件里明明是 11 条 CREATE TABLE IF NOT EXISTS。
//   根因: 旧切分 = `split(/;\s*\n/)` 后 `.filter((s) => !s.startsWith("--"))`, 而本仓 schema.sql
//   **每个语句上方都有一行 `--` 注释** ⇒ 每个 chunk 都以注释开头 ⇒ 全部被当成注释丢掉。
//   危害等级: 静默 —— 今天无害 (表早就在), 将来 schema 加列/加表会**不生效且不报错**。
//
// ⚠️ 本文件第一条断言刻意复刻旧实现并断言它切出 **0** 条: 它把"这个 bug 曾经真实存在"钉在测试里
//   (否则以后有人把实现改回去, 光看"切出 11 条"是看不出来差异的)。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const schema = fs.readFileSync(`${ROOT}/db/schema.sql`, 'utf-8');
const { splitSchemaStatements } = await import(
  new URL('file:///root/dev/wechatpadpro-openclaw/dist/storage/db/mysql.js').href
);

test('1. 真 schema.sql: 每条 CREATE TABLE 都要切出来 (旧实现切出 0 条 = bug 本体)', () => {
  // 旧实现 (v1.6.2 及以前) 的逐字复刻 —— 它必须切出 0 条, 否则说明这段"历史"记错了
  const legacy = schema
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('--'));
  assert.equal(legacy.length, 0, '旧实现切出 0 条 —— 这正是 09-13 线上日志恒报 0 statements 的原因');

  const stmts = splitSchemaStatements(schema);
  const creates = (schema.match(/CREATE TABLE/g) ?? []).length;
  assert.ok(creates >= 11, `schema.sql 里 CREATE TABLE 数量异常: ${creates}`);
  assert.equal(stmts.length, creates, `每条 CREATE TABLE 都应成为一条可执行语句 (实得 ${stmts.length}/${creates})`);
  assert.equal(
    stmts.filter((s) => /^CREATE TABLE IF NOT EXISTS/i.test(s)).length,
    creates,
    '切出来的每条都必须是 CREATE TABLE (不得把注释行/空块混进来)',
  );
  for (const s of stmts) {
    assert.ok(!s.includes('--'), `语句里不得残留注释: ${s.slice(0, 40)}`);
    assert.ok(s.startsWith('CREATE'), `语句必须以 CREATE 开头 (否则是把注释当语句发了): ${s.slice(0, 40)}`);
  }
  // 表名抽查: 切分不能把语句截断/粘连
  for (const t of ['wpp_accounts', 'wpp_messages']) {
    assert.ok(stmts.some((s) => s.includes(`CREATE TABLE IF NOT EXISTS ${t} (`)), `缺 ${t} 的建表语句`);
  }
});

test('2. 边界: 行注释/行尾注释/空块/一行多句/纯注释文件', () => {
  // 行注释 (行尾贴注释) 必须被剥掉, 但语句本体保留
  assert.deepEqual(splitSchemaStatements('-- 说明\nCREATE TABLE t (a INT); -- 行尾注释\n'), [
    'CREATE TABLE t (a INT)',
  ]);
  // 一行多句
  assert.deepEqual(splitSchemaStatements('SELECT 1; SELECT 2;'), ['SELECT 1', 'SELECT 2']);
  // 空块/空行/只有分号 ⇒ 不产出空语句 (空语句发给 MySQL 会报错)
  assert.deepEqual(splitSchemaStatements('\n\n;\n\n-- 只有注释\n\n'), []);
  assert.deepEqual(splitSchemaStatements(''), []);
  // 注释中间的分号不得切出新语句 (先按行去注释, 再按 ; 切)
  assert.deepEqual(splitSchemaStatements('-- a;b;c\nCREATE TABLE t (a INT);'), ['CREATE TABLE t (a INT)']);
  // 大小写与多行语句: 多行 CREATE 必须整体保留 (不能被换行切开)
  const multi = splitSchemaStatements('-- c\nCREATE TABLE t (\n  a INT,\n  b INT\n) ENGINE=InnoDB;');
  assert.equal(multi.length, 1);
  assert.ok(multi[0].includes('b INT') && multi[0].includes('ENGINE=InnoDB'));
});

test('3. 与文件真实内容一致: 22 行注释全被剥掉, 无残留', () => {
  assert.equal((schema.match(/^\s*--/gm) ?? []).length, 22, 'schema.sql 里 22 行注释');
  const stmts = splitSchemaStatements(schema);
  assert.equal(stmts.join('\n').includes('--'), false);
  assert.equal(stmts.join('\n').includes('IF NOT EXISTS'), true);
  // 幂等: 幂等靠 IF NOT EXISTS 保证, 所以断言切出来的语句里确实带着它
  assert.equal(stmts.filter((s) => s.includes('IF NOT EXISTS')).length, stmts.length);
});
