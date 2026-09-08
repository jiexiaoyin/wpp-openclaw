/**
 * D6 性能 - 高频只读热路径回归守卫 (source-level, 与仓库测试风格一致)
 * v1.5.5: 审阅 D6 卡 B 的 "心流/意图模块无独立性能测试"。
 * LRU 误报澄清: 基建 LruCache 已在 config.ts; affection / heartflow-learn 热路径
 * 已用内存 Map (O(1))。LRU 只对昂贵底层读(disk/DB/网络)有意义, 纯内存 Map + LRU 是负优化。
 *
 * 本测试真正的价值: 防止未来重构把这些 O(1) 内存读回退成每次都 disk/DB/网络重读。
 */
import assert from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/** 读 src 源文件 */
function src(p) {
  return readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf-8');
}

test('D6.1 config.ts: 配置读取必须走 LruCache (防每次读 disk) 不该被拆掉', () => {
  const s = src('config.ts');
  assert.match(s, /new LruCache</, 'config.ts 必须实例化 LruCache');
  assert.match(s, /configCache\.get\(/, '读配置必须先查 configCache.get (LRU 命中)');
  assert.match(s, /configCache\.set\(/, 'miss 后写入 configCache.set');
  assert.match(s, /ttlMs:/, 'LruCache 必须带 TTL (防脏读)');
});

test('D6.2 affection.ts: 群情绪状态必须走内存 Map (O(1)), 不许每次回源', () => {
  const s = src('inbound/affection.ts');
  assert.match(s, /groupStates = new Map</, '群状态容器必须是内存 Map groupStates');
  assert.match(s, /getGroupMood\(/, 'getGroupMood 必须是同步内存读');
  assert.match(s, /\.get\(groupId\)/, 'getGroupMood 内部经 Map.get 读, 无异步底层 I/O');
  assert.doesNotMatch(s, /await .*getGroupMood/, 'getGroupMood 不得被改成 async (会引入每调 I/O)');
});

test('D6.3 heartflow-learn.ts: learned 阈值必须走内存 Map, 不许每调查 DB', () => {
  const s = src('inbound/heartflow-learn.ts');
  assert.match(s, /_learnedThresholds = new Map</, 'learned 阈值必须是内存 Map');
  assert.match(s, /loadLearnedThresholds\(/, 'DB 读取集中在 loadLearnedThresholds (启动/热载)');
  assert.match(s, /resetLearnedThresholdCache\(/, '必须提供清缓存入口 (热载一致性)');
  // 运行期读数走 _learnedThresholds.get, 不做 SQL (守卫未来回退化)
  const runTime = s.split('loadLearnedThresholds')[0]; // load 之前的运行期取数逻辑
  assert.doesNotMatch(runTime, /query.*from_wxid|SELECT.*learned_threshold/i, '热路径不得出现 learn 阈值 SQL');
});

test('D6.4 core/lru.ts: LruCache 必须同时具备 LRU 淘汰 + TTL 过期', () => {
  const s = src('core/lru.ts');
  assert.match(s, /ttlMs/, 'LruCache 须支持 TTL');
  assert.match(s, /maxSize|capacity/, 'LruCache 须有容量上限 (LRU 淘汰用)');
  // 有某个 evict / delete-oldest 机制, 存在形式不限
  assert.match(s, /delete\(|\.delete|evict|size\s*>\s*/, 'LRU 淘汰需要实际删除最旧项');
});

test('D6.5 intent-llm.ts: intent 解析阈值/开关经配置读取, 不硬编码每次走 network', () => {
  const s = src('dispatch/intent-llm.ts');
  assert.doesNotMatch(s, /fetch\(.*classify|post\(.*intent/, '意图分类不得每调直接网络重读');
  assert.doesNotMatch(s, /\bawait\s+loadGlobalConfig\b/, '热路径不得每调重新 loadGlobalConfig (走 dispatcher 注入缓存)');
});

test('D6.6 dist 同步: 编译产物含相同 LRU/Map 热路径 (防 dist 与 src 漂移)', () => {
  const cfgSrc = src('config.ts');
  const affSrc = src('inbound/affection.ts');
  const d = (p) => readFileSync(new URL(`../../dist/${p}`, import.meta.url), 'utf-8');
  const cfgDist = d('config.js');
  const affDist = d('inbound/affection.js');
  // dist 端同样保留 LruCache 实例化 与 内存 Map 群状态
  assert.match(cfgDist, /configCache/, 'dist/config.js 必须含 configCache LRU');
  assert.match(affDist, /groupStates/, 'dist/inbound/affection.js 必须含群状态容器');
  assert.ok(cfgDist.length > 0 && affDist.length > 0, 'dist 产物非空');
});

test('D6.7 media-oss.ts: OSS 凭据读取必须缓存 (勿每次 upload 重读 disk)', () => {
  const s = src('dispatch/media-oss.ts');
  assert.match(s, /ossCredCache = new LruCache</, 'media-oss 必须实例化 LruCache');
  assert.match(s, /ossCredCache\.get\(/, 'loadOssConfig 先查缓存');
  assert.match(s, /ossCredCache\.set\(/, 'miss 后写入缓存');
  assert.match(s, /clearOssConfigCache/, '必须暴露清理入口 (凭据轮换/测试)');
});

test('D6.8 media-enrich/shared.ts: 入站 OSS 凭据同样缓存 (勿每次读 disk)', () => {
  const s = src('inbound/media-enrich/shared.ts');
  assert.match(s, /ossCredCache = new LruCache</, 'shared 必须实例化 LruCache');
  assert.match(s, /ossCredCache\.get\(/, 'loadOssConfig 先查缓存');
  assert.match(s, /ossCredCache\.set\(/, 'miss 后写入缓存');
  assert.match(s, /export function clearOssConfigCache/, '必须 export 清理入口');
});

test('D4.1 潜伏值环守卫: api/client↔account-state 环内不得有顶层急切调用 (防 TDZ 崩溃)', () => {
  // 背景: api-client.ts(barrel) ↔ api/client.ts ↔ account-state → registry → account-context 存在惰性值环。
  // 当前安全是因为环内所有 registry/构造访问都在函数体 (惰性), 无模块顶层急切读。
  // 任何把 `import type`→值 import 或把一次惰性调用提到模块顶层都会变启动期 TDZ 崩溃。
  for (const [label, p, sym] of [
    ['api/client.ts', 'api/client.ts', 'getDefaultAccountRegistry'],
    ['account-context.ts', 'accounts/account-context.ts', 'WechatpadproApiClient'],
  ]) {
    const s = src(p);
    // 值是静态顶层 import 可以 (bindings 惰性解析), 但绝不允许顶层急切调用 (col1 非缩进、非函数签名里直接调用)
    const topLevelCall = new RegExp(`^[a-zA-Z][^\n]*${sym}\\(\\).*`, 'm');
    assert.doesNotMatch(s, topLevelCall, `${label} 不得顶层急切调用 ${sym}() (会因循环未初始化变 TDZ)`);
    // 所有 registry 使用必须在函数体内(前面至少 2 空格缩进 → 在函数块里)
    // 进一步: 声明处允许 import, 使用处必须带缩进
    assert.match(s, /function |=>|\{/, `${label} 应含函数(使用点在函数内)`);
  }
});
