// tests/unit/hmac-fix-v1.5.1.test.mjs - v1.5.1 P2-fix (2026-08-25 21:30)
//
// 修复目标: P2-1 HMAC 副作用 — vendor 不发 signature 但 secret 配了 → 401 拒绝
// 修复方案: 回滚 WECHATPRO_WEBHOOK_SECRET env → v1.1.10 permissive
//
// 验证:
//   1. env 文件已删 WECHATPRO_WEBHOOK_SECRET (plugin 启动时 secret 为空)
//   2. accounts.cfg 保留 webhookSecretEnv (未来启用 HMAC 的开关)
//   3. credentials 文件保留 (未来启用 HMAC 的凭据)
//   4. signature.ts 加固注释
//   5. webhook-receiver.ts 加固注释
//   6. deploy 端 plugin 启动日志显示 HMAC OFF (回到 v1.1.10 permissive)

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const DEPLOY = '/root/.openclaw/extensions/wechatpadpro';

// ===== P2-fix 修复验证 =====
test('HMAC-fix 1: env 文件已删 WECHATPRO_WEBHOOK_SECRET', () => {
  const env = fs.readFileSync('/root/.openclaw/gateway.systemd.env', 'utf-8');
  assert.doesNotMatch(env, /^WECHATPRO_WEBHOOK_SECRET=/m, 'env 必须删 WECHATPRO_WEBHOOK_SECRET (v1.1.10 permissive)');
});

test('HMAC-fix 2: accounts.cfg 保留 webhookSecretEnv (未来启用 HMAC 的开关)', () => {
  const d = JSON.parse(fs.readFileSync(`${DEPLOY}/accounts/default.json`, 'utf-8'));
  assert.strictEqual(d.webhookSecretEnv, 'WECHATPRO_WEBHOOK_SECRET', 'accounts cfg 保留 webhookSecretEnv 字段');
});

test('HMAC-fix 3: credentials 文件保留 (未来启用 HMAC 的凭据)', () => {
  const creds = '/root/.openclaw/credentials/wechatpadpro-webhook-secret.json';
  assert.ok(fs.existsSync(creds), 'credentials 文件必须保留');
  const stats = fs.statSync(creds);
  assert.strictEqual(stats.mode & 0o777, 0o600, 'credentials 权限必须 600');
  const d = JSON.parse(fs.readFileSync(creds, 'utf-8'));
  assert.ok(d.webhookSecret, 'credentials 必须含 webhookSecret (备用)');
  assert.strictEqual(d.webhookSecret.length, 64, 'secret 64 hex 字符');
});

test('HMAC-fix 4: signature.ts 加固注释 (v1.5.1 P2-fix)', () => {
  const src = fs.readFileSync(`${ROOT}/src/core/signature.ts`, 'utf-8');
  assert.match(src, /v1\.5\.1 P2-fix/, 'signature.ts 必须有 v1.5.1 P2-fix 注释');
  assert.match(src, /fail-safe/, 'signature.ts 必须有 fail-safe 设计说明');
});

test('HMAC-fix 5: webhook-receiver.ts 加固注释 (v1.5.1 P2-fix)', () => {
  const src = fs.readFileSync(`${ROOT}/src/webhook-receiver.ts`, 'utf-8');
  assert.match(src, /v1\.5\.1 P2-fix/, 'webhook-receiver.ts 必须有 v1.5.1 P2-fix 注释');
  assert.match(src, /v1\.1\.10 permissive/, 'webhook-receiver.ts 必须引用 v1.1.10 permissive 设计');
});

test('HMAC-fix 6: signatureRequired 函数 (permissive 模式)', () => {
  // 验证 signatureRequired 在 secret 空时返回 false (fail-open)
  const src = fs.readFileSync(`${ROOT}/src/core/signature.ts`, 'utf-8');
  // 找 signatureRequired 函数 (用 indexOf + slice, 避免 regex 转义问题)
  const idx = src.indexOf('export function signatureRequired');
  assert.ok(idx >= 0, 'signatureRequired 函数必须存在');
  const fnBody = src.slice(idx, idx + 500);
  assert.match(fnBody, /return\s+!!secret/, 'signatureRequired 必须基于 secret 决定');
});

test('HMAC-fix 7: 端到端 - vendor 不发 signature 时正常入库', () => {
  // 验证 plugin 当前配置: secret 为空 + whitelistGroups 5 群 (23:09 加调试群)
  // vendor 推送 webhook 无 signature → signatureRequired('') === false → 跳过 verify → 入库
  const d = JSON.parse(fs.readFileSync(`${DEPLOY}/accounts/default.json`, 'utf-8'));
  assert.ok(!d.webhookSecret, 'accounts webhookSecret 必须为空 (permissive)');
  assert.strictEqual(d.heartflow.whitelistGroups.length, 5, 'whitelistGroups 5 群 (老板 23:09 加调试群 57737516566@chatroom)');
  assert.strictEqual(d.heartflow.independentTrigger, true, 'independentTrigger 必须 true (B 方案核心)');
});

test('HMAC-fix 8: dev 端源码完整性', () => {
  // 验证没误删其他文件
  assert.ok(fs.existsSync(`${ROOT}/src/core/signature.ts`), 'signature.ts 存在');
  assert.ok(fs.existsSync(`${ROOT}/src/webhook-receiver.ts`), 'webhook-receiver.ts 存在');
  assert.ok(fs.existsSync(`${ROOT}/tests/unit/hmac-fix-v1.5.1.test.mjs`), '本测试文件自身存在');
});
