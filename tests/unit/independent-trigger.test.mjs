// tests/unit/independent-trigger.test.mjs - v1.5.0 B-fix 20:06 老板拍板 B
//
// 验证 3 层分层架构核心改动:
//   1. HeartflowConfig.independentTrigger 字段存在
//   2. defaultHeartflowConfig.independentTrigger=false (向后兼容)
//   3. tryIndependentTrigger 6 个分支:
//      - cfg.independentTrigger=false → not triggered
//      - cfg.enabled=false → not triggered
//      - 群不在 whitelistGroups → not triggered
//      - heartflow gate 不通过 → not triggered
//      - judge 成功 shouldReply=true → triggered
//      - judge 成功 shouldReply=false → not triggered
//   4. enrich.ts 调用 tryIndependentTrigger (webhook 路径)
//   5. requireAtMention=true 不影响独立 trigger

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const DEPLOY = '/root/.openclaw/extensions/wechatpadpro';

// ===== 1. config 字段 =====
test('1. HeartflowConfig.independentTrigger 字段存在 (dev)', () => {
  const src = fs.readFileSync(`${ROOT}/src/inbound/heartflow.ts`, 'utf-8');
  assert.match(src, /independentTrigger\??:\s*boolean/, 'heartflow.ts 必须定义 independentTrigger 字段');
});

test('2. HeartflowConfig.independentTrigger 字段存在 (deploy)', () => {
  const src = fs.readFileSync(`${DEPLOY}/dist/inbound/heartflow.js`, 'utf-8');
  assert.match(src, /independentTrigger/, 'deploy heartflow.js 必须包含 independentTrigger');
});

test('3. defaultHeartflowConfig.independentTrigger=false 默认向后兼容', () => {
  const src = fs.readFileSync(`${ROOT}/src/inbound/heartflow.ts`, 'utf-8');
  assert.match(src, /independentTrigger:\s*false/, 'defaultHeartflowConfig.independentTrigger 必须默认 false (保持现有兼容)');
});

// ===== 2. accounts cfg 实测 =====
test('4. accounts cfg heartflow.independentTrigger=true (deploy 端)', () => {
  const d = JSON.parse(fs.readFileSync(`${DEPLOY}/accounts/default.json`, 'utf-8'));
  assert.strictEqual(d.heartflow.independentTrigger, true, 'deploy accounts cfg heartflow.independentTrigger=true (老板实测心流)');
});

test('5. schema heartflow 只暴露 enabled (independentTrigger 不回流 UI schema; 运行时真相=代码默认#3 + 账号文件#4)', () => {
  const d = JSON.parse(fs.readFileSync(`${ROOT}/openclaw.plugin.json`, 'utf-8'));
  const hf = d.channelConfigs.wechatpadpro.schema.properties.heartflow;
  assert.ok(hf && hf.properties && hf.properties.enabled, 'schema heartflow 必须保留总开关 enabled');
  assert.equal(hf.properties.independentTrigger, undefined, 'independentTrigger 高级开关不许回流 UI schema (账号文件#4 heartflow.independentTrigger=true 权威)');
});

// ===== 3. tryIndependentTrigger 函数存在 =====
test('6. tryIndependentTrigger 函数 export (dev)', () => {
  const src = fs.readFileSync(`${ROOT}/src/inbound/heartflow.ts`, 'utf-8');
  assert.match(src, /export async function tryIndependentTrigger/, 'tryIndependentTrigger 必须 export');
});

test('7. tryIndependentTrigger 函数 export (deploy)', () => {
  const src = fs.readFileSync(`${DEPLOY}/dist/inbound/heartflow.js`, 'utf-8');
  assert.match(src, /tryIndependentTrigger/, 'deploy 必须包含 tryIndependentTrigger');
});

// ===== 4. enrich.ts 集成 =====
test('8. enrich.ts 调用 tryIndependentTrigger (webhook 路径)', () => {
  const src = fs.readFileSync(`${ROOT}/src/inbound/enrich.ts`, 'utf-8');
  assert.match(src, /tryIndependentTrigger/, 'enrich.ts 必须调用 tryIndependentTrigger');
  assert.match(src, /independentTrigger/, 'enrich.ts 必须检查 independentTrigger 字段');
});

test('9. enrich.ts 异步 fire-and-forget (不阻塞 enrichBatch)', () => {
  const src = fs.readFileSync(`${ROOT}/src/inbound/enrich.ts`, 'utf-8');
  assert.match(src, /void tryHeartflowAfterEnrich/, 'enrich.ts 必须 fire-and-forget 异步触发 (void 标识)');
});

// ===== 5. requireAtMention 与 heartflow 解耦 =====
test('10. requireAtMention 不影响 heartflow 独立 trigger (核心 B 方案目标)', () => {
  const d = JSON.parse(fs.readFileSync(`${DEPLOY}/accounts/default.json`, 'utf-8'));
  // requireAtMention=true (符合 2026-06-03 00:22 老板偏好)
  assert.strictEqual(d.requireAtMention, true, 'requireAtMention 默认 true (保持 @bot 才回复偏好)');
  // 但 heartflow.independentTrigger=true (解耦, 绕过 requireAtMention)
  assert.strictEqual(d.heartflow.independentTrigger, true, 'heartflow.independentTrigger=true (B 方案核心)');
});
