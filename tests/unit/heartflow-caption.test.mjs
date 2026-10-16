// tests/unit/heartflow-caption.test.mjs - v1.16.0 图片配文 (caption): 画像样本"看得见图"
//
// 老板 2026-10-16: "喂给 LLM 的样本能否加入图片识别后的数据?" —— 全员群 14 天 44/78 条是图片,
//   画像样本里只有 `收到一张图片 [图片] URL` 占位 ⇒ 归纳模型看不见晒单图 ⇒ 画像 engage 缺晒单口径
//   ⇒ judge 给晒单图 0.635 (对照已含晒单口径的群同形态 0.775)。caption 就是补这只"眼"。
//
// 本文件锁三类:
//   1) 纯函数: 缺省/钳制 / hash 确定性 / 任务挑选 (去重·止损·配额) / 配文清洗 / 样本行装配
//   2) 安全边界: anthropic 端点 (images 会被丢弃, 模型对空图胡说) 与 disabled 必须**零 DB 触达**
//      —— 用"未初始化 adapter 也不抛"自证; 增强件永不变成依赖件
//   3) 源级接线: profile 生成链 (caption pass → sample 换字) / DB 三层 (DDL·adapter·barrel) /
//      schema.sql 双写同步 (mysql.ts 行内 DDL 与 db/schema.sql 逐字段一致)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const read = (p) => fs.readFileSync(p, 'utf-8');
const src = (rel) => read(`${ROOT}/${rel}`);

let C = null;
try {
  C = await import(new URL('../../dist/inbound/heartflow-caption.js', import.meta.url));
} catch (e) {
  console.error('import dist/inbound/heartflow-caption.js failed:', e?.message);
}

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

// ===== 1. 配置缺省与钳制 =====
test('1. resolveHfCaptionCfg: 缺省 = 开 + 6张/群·2次止损·扫150行·8s', () => {
  const r = C.resolveHfCaptionCfg();
  assert.deepEqual(r, {
    enabled: true, perGroupMax: 6, maxFails: 2, scanLimit: 150, timeoutMs: 8000,
  });
});

test('1b. resolveHfCaptionCfg: 非法值钳回可用域 (不许负数/0超时/扫库爆)', () => {
  assert.equal(C.resolveHfCaptionCfg({ perGroupMax: -5 }).perGroupMax, 0, '负数 → 0 (等效关)');
  assert.equal(C.resolveHfCaptionCfg({ perGroupMax: 6.9 }).perGroupMax, 6, '小数 floor');
  assert.equal(C.resolveHfCaptionCfg({ maxFails: 0 }).maxFails, 1, '止损至少 1 次');
  assert.equal(C.resolveHfCaptionCfg({ scanLimit: 99999 }).scanLimit, 500, '扫描上限 500 行 (防扫爆 wpp_messages)');
  assert.equal(C.resolveHfCaptionCfg({ timeoutMs: 10 }).timeoutMs, 1000, '超时至少 1s');
  assert.equal(C.resolveHfCaptionCfg({ enabled: false }).enabled, false, '显式关必须认');
});

// ===== 2. hash 确定性 =====
test('2. hfCaptionHash: 同 URL 同键 / 异 URL 异键 / 64bit 十六进制 40 位', () => {
  const u = 'https://openclaw-a.oss-cn-hangzhou.aliyuncs.com/wpp/default/images/2026-10-16/abc.jpg';
  assert.equal(C.hfCaptionHash(u), sha1(u));
  assert.equal(C.hfCaptionHash(u), C.hfCaptionHash(u));
  assert.notEqual(C.hfCaptionHash(u + '?x=1'), C.hfCaptionHash(u));
  assert.match(C.hfCaptionHash(u), /^[0-9a-f]{40}$/, 'CHAR(40) 列宽契约');
});

// ===== 3. 任务挑选 (纯函数核心: 去重·跳过已配·止损·配额) =====
const U1 = 'https://oss.example.com/a1.jpg';
const U2 = 'https://oss.example.com/a2.jpg';
const U3 = 'https://oss.example.com/a3.jpg';
const U4 = 'https://oss.example.com/a4.jpg';

test('3. selectHfCaptionTasks: 已配/试死跳过, null+未试死=重试, URL 跨消息去重, 按序截配额', () => {
  const msgs = [
    { id: 4, group_id: 'g', content: `收到一张图片\n[图片] ${U1}` },
    { id: 3, group_id: 'g', content: `收到一张图片\n[图片] ${U1}` }, // 同 URL → 去重
    { id: 2, group_id: 'g', content: `收到一张图片\n[图片] ${U2}` },
    { id: 1, group_id: 'g', content: '收到一张图片\n[图片] file:///etc/passwd' }, // 非 http(s) → 不入队
  ];
  const existing = [
    { url_hash: sha1(U1), caption: '荣耀平板成交2台', fail_count: 0 }, // 已配 → 跳
    { url_hash: sha1(U2), caption: null, fail_count: 1 },             // 试过 1 次 <2 → 重试
  ];
  const tasks = C.selectHfCaptionTasks(msgs, existing, { maxTasks: 5, maxFails: 2 });
  assert.deepEqual(tasks.map((t) => t.url), [U2], '只有 U2 入队 (U1 已配/重复, U3 不在 msgs, file:// 不认)');
  assert.equal(tasks[0].url_hash, sha1(U2));
  assert.equal(tasks[0].group_id, 'g');

  // 全新 URL (无行) 入队; fail_count 到上限止损; 配额截断
  const msgs2 = [
    { id: 9, group_id: 'g', content: `[图片] ${U4}` },
    { id: 8, group_id: 'g', content: `[图片] ${U3}` },
    { id: 7, group_id: 'g', content: `[图片] ${U2}` },
  ];
  const existing2 = [{ url_hash: sha1(U2), caption: null, fail_count: 2 }]; // 试死 → 不再碰
  const t2 = C.selectHfCaptionTasks(msgs2, existing2, { maxTasks: 1, maxFails: 2 });
  assert.deepEqual(t2.map((t) => t.url), [U4], '按消息序取满配额即停 (U3 排队下轮, U2 已止损)');
});

// ===== 4. 配文清洗 =====
test('4. cleanHfCaption: 压空白 + 60 字限 (样本行 80 字预算, 配文不许多吃)', () => {
  assert.equal(C.cleanHfCaption('  荣耀平板\n成交  2台\t¥2499  '), '荣耀平板 成交 2台 ¥2499');
  assert.equal(C.cleanHfCaption('a'.repeat(100)).length, 60);
  assert.equal(C.cleanHfCaption(null), '');
});

// ===== 5. 样本行装配 (画像生成 LLM 最终看到什么) =====
test('5. hfCaptionSampleLine: 有配文→[图]文字 / 无配文→退回占位 / 非图行原样', () => {
  const body = `收到一张图片 [图片] ${U1}`; // loadSampleLines 已把 \n 压成空格
  const map = new Map([[C.hfCaptionHash(U1), '直播战报: 今日售出荣耀X70共6台']]);
  assert.equal(C.hfCaptionSampleLine(body, map), '[图] 直播战报: 今日售出荣耀X70共6台');
  assert.equal(C.hfCaptionSampleLine(body, new Map()), '收到一张图片', '无配文 = 旧信息量, 但 URL 噪声必须清掉');
  assert.equal(C.hfCaptionSampleLine('今天谁值班?', map), '今天谁值班?', '非图片体一个字不许动');
});

// ===== 6. 安全边界: 不烧调用、零 DB 触达 =====
// 测试进程里 adapter 从未 init —— 若这些分支碰了 DB 会当场抛错; 不抛 = 自证零触达。
test('6a. anthropic creds 直接返回 (images 会被该格式丢弃, 对着空图胡说比不配更坏)', async () => {
  const cfg = C.resolveHfCaptionCfg();
  const r = await C.captionPendingHfImages('default', 'g', 0, cfg, 'claude-x', {
    apiKey: '***', baseUrl: 'https://api.anthropic.com', format: 'anthropic',
  });
  assert.deepEqual(r, { tasks: 0, ok: 0, fail: 0 });
});

test('6b. enabled=false / perGroupMax=0 直接返回 (关掉=旧形态, 也不碰 DB)', async () => {
  const off = C.resolveHfCaptionCfg({ enabled: false });
  const r1 = await C.captionPendingHfImages('default', 'g', 0, off, 'qwen', {
    apiKey: '***', baseUrl: 'https://x', format: 'openai',
  });
  assert.deepEqual(r1, { tasks: 0, ok: 0, fail: 0 });
  const zero = C.resolveHfCaptionCfg({ perGroupMax: 0 });
  const r2 = await C.captionPendingHfImages('default', 'g', 0, zero, 'qwen', {
    apiKey: '***', baseUrl: 'https://x', format: 'openai',
  });
  assert.deepEqual(r2, { tasks: 0, ok: 0, fail: 0 });
});

// ===== 7. 源级接线 (防"写了没接上"的静默无效) =====
test('7a. heartflow-profile.ts: caption pass 接进 maybeGenerate + loadSampleLines 换字', () => {
  const s = src('src/inbound/heartflow-profile.ts');
  assert.match(s, /from "\.\/heartflow-caption\.js"/, '必须 import caption 模块');
  assert.match(s, /await captionPendingHfImages\(/, '生成循环前真调用补配 pass');
  assert.match(s, /if \(capDone >= Math\.max\(1, P\.maxPerRun\)\) break;/, '只为本轮真会生成的群配文 (配额镜像)');
  assert.match(s, /hfCaptionSampleLine\(rawBody, caps\)/, '样本装配走纯函数');
  assert.match(s, /caption\?:/, 'HfProfileConfig 挂了 caption 旋钮');
});

test('7b. DB 三层齐全: types 声明 + mysql 实现 + 薄封装 + barrel', () => {
  const t = src('src/storage/db/types.ts');
  for (const m of ['upsertHfImageCaption(', 'getHfCaptionsByHashes(', 'listHfImageMsgs(']) {
    assert.ok(t.includes(m), `DbAdapter 必须声明 ${m}`);
  }
  assert.match(t, /export interface HfImageCaptionRecord/);
  const my = src('src/storage/db/mysql.ts');
  for (const m of ['async upsertHfImageCaption(', 'async getHfCaptionsByHashes(', 'async listHfImageMsgs(']) {
    assert.ok(my.includes(m), `mysql adapter 必须实现 ${m}`);
  }
  const dbh = src('src/storage/db/heartflow.ts');
  assert.match(dbh, /export async function upsertHfImageCaption/);
  assert.match(dbh, /export async function getHfCaptionsByHashes/);
  assert.match(dbh, /export async function listHfImageMsgs/);
  const idx = src('src/storage/db/index.ts');
  assert.match(idx, /upsertHfImageCaption,[\s\S]*getHfCaptionsByHashes,[\s\S]*listHfImageMsgs,/, 'barrel 三导出');
});

test('7c. 建表双写同步: applyMigrations 体内 DDL (生产唯一途径) 与 schema.sql 关键列一致', () => {
  const m = src('src/storage/db/mysql.ts');
  const fnStart = m.indexOf('async function applyMigrations');
  const fnEnd = m.indexOf('\n}\n', fnStart);
  const body = m.slice(fnStart, fnEnd);
  assert.ok(body.includes('CREATE TABLE IF NOT EXISTS wpp_hf_image_caption'),
    'DDL 必须在 applyMigrations 函数体内 (生产建表不靠 schema.sql)');
  const s = read(`${ROOT}/db/schema.sql`);
  assert.match(s, /CREATE TABLE IF NOT EXISTS wpp_hf_image_caption/, 'schema.sql 双写');
  for (const col of ['url_hash CHAR(40) NOT NULL', 'caption TEXT NULL', 'fail_count INT UNSIGNED NOT NULL DEFAULT 0']) {
    assert.ok(body.includes(col), `mysql.ts 含列定义: ${col}`);
    assert.ok(s.includes(col), `schema.sql 同列: ${col}`);
  }
});

test('7d. caption 查询口径: msg_type 字符串形态 + COALESCE 归群 (照 v1.9.0 先例)', () => {
  const m = src('src/storage/db/mysql.ts');
  assert.match(m, /msg_type IN \('3','image'\)/, "wpp_messages.msg_type 库裡是字符串 ('3'/'image'), 数字等值会静默 0 行");
  assert.match(m, /COALESCE\(NULLIF\(chat_id, ''\), peer_id\) IN/, '群过滤与出站 NULL chat_id 的既有归群口径一致');
});

test('7e. accounts/default.json 双树同步 (dev 与 deploy 的 heartflow 块一字不差)', () => {
  const pick = (p) => {
    const j = JSON.parse(read(p));
    return JSON.stringify(j?.heartflow ?? null);
  };
  const dev = pick(`${ROOT}/accounts/default.json`);
  const dep = pick('/root/.openclaw/extensions/wechatpadpro/accounts/default.json');
  // deploy-swap 会 cp -a accounts ⇒ 两边必须本就一致, 部署不许"顺带改配置"
  assert.equal(dev, dep, 'accounts heartflow 块 dev==deploy (businessContext/caption 同批写入两侧)');
});
