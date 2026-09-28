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
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const DEPLOY = '/root/.openclaw/extensions/wechatpadpro';

// ===== P2-fix 修复验证 =====
test('HMAC-fix 1: env 文件已删 WECHATPRO_WEBHOOK_SECRET', () => {
  // v1.5.2 路径修正: gateway.systemd.env 已合并到 /root/.openclaw/.env
  const env = fs.readFileSync('/root/.openclaw/.env', 'utf-8');
  assert.doesNotMatch(env, /^WECHATPRO_WEBHOOK_SECRET=/m, 'env 必须删 WECHATPRO_WEBHOOK_SECRET (v1.1.10 permissive)');
});

test('HMAC-fix 2: accounts.cfg 保留 webhookSecretEnv (未来启用 HMAC 的开关)', () => {
  const d = JSON.parse(fs.readFileSync(`${DEPLOY}/accounts/default.json`, 'utf-8'));
  assert.strictEqual(d.webhookSecretEnv, 'WECHATPRO_WEBHOOK_SECRET', 'accounts cfg 保留 webhookSecretEnv 字段');
});

// v1.5.2 文档化: v1.5.1 回滚到 v1.1.10 permissive 后, secret 文件不存在是预期状态
// 保留旧测试作为未来启用 HMAC 的检查清单（当前 skip）
test('HMAC-fix 3 (v1.5.1 skip): credentials 文件保留 (未来启用 HMAC 的凭据)', { skip: true }, () => {
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
  // v1.5.2 升级: 老板后续加联通业务对接群 + 联通调试群, 共 7 群
  assert.strictEqual(d.heartflow.whitelistGroups.length, 5, 'whitelistGroups 5 群');
  // 2026-09-13: heartflow.independentTrigger 已删除 (该路径只 log 决策不发送不落台账, 且每条群消息
  //   双烧 2 次 LLM judge) — 断言改为「不得复活」, 防旧配置键回流误导运维
  assert.strictEqual(d.heartflow.independentTrigger, undefined, 'independentTrigger 必须已从 accounts 移除 (功能已删, 留着=看着生效实则无效)');
});

test('HMAC-fix 8: dev 端源码完整性', () => {
  // 验证没误删其他文件
  assert.ok(fs.existsSync(`${ROOT}/src/core/signature.ts`), 'signature.ts 存在');
  assert.ok(fs.existsSync(`${ROOT}/src/webhook-receiver.ts`), 'webhook-receiver.ts 存在');
  assert.ok(fs.existsSync(`${ROOT}/tests/unit/hmac-fix-v1.5.1.test.mjs`), '本测试文件自身存在');
});

// ===== 2026-09-28 M5: webhookSecret 改 env-wins (与 tokenKey/authcode 对齐) =====
// 行为级验证 (非源码文本断言): 真调 dist/config.js 的 loadAccountConfig, 走 accounts/<id>.json 读盘路径。
// 用临时账号文件 (测试结束 finally 删除), 不碰真实 default 账号。
const CFG = await import(pathToFileURL(join(ROOT, 'dist/config.js')).href);
const TMP_ACCOUNT_ID = `whtest${process.pid}`; // 满足 /^[a-zA-Z0-9_-]{1,64}$/
const TMP_ACCOUNT_FILE = join(ROOT, 'accounts', `${TMP_ACCOUNT_ID}.json`);
const TMP_ENV_NAME = `WPP_TEST_WEBHOOK_SECRET_${process.pid}`;

/** 写临时账号文件 + 清缓存; 返回清理函数。nickname 必须存在, 否则 loadAccountConfig 的
 *  cache 分支判据 `"nickname" in cached` 不成立 → 会重走读盘路径 (测不到 cache 层)。 */
function withTmpAccount(overrides) {
  fs.writeFileSync(
    TMP_ACCOUNT_FILE,
    JSON.stringify({
      apiBaseUrl: 'http://127.0.0.1:1',
      wsUrl: 'ws://127.0.0.1:1',
      nickname: 'whtest',
      webhookSecretEnv: TMP_ENV_NAME,
      ...overrides,
    }),
  );
  CFG.invalidateConfigCache(TMP_ACCOUNT_ID);
  return () => {
    try {
      fs.rmSync(TMP_ACCOUNT_FILE, { force: true });
    } catch {
      /* ignore */
    }
    delete process.env[TMP_ENV_NAME];
    CFG.invalidateConfigCache(TMP_ACCOUNT_ID);
  };
}

test('webhookSecret env-wins 1: env 与 raw 同时存在时 env 胜出', async () => {
  const cleanup = withTmpAccount({ webhookSecret: 'raw-secret' });
  try {
    process.env[TMP_ENV_NAME] = 'env-secret';
    const cfg = await CFG.loadAccountConfig(TMP_ACCOUNT_ID);
    assert.strictEqual(cfg.webhookSecret, 'env-secret', '同时存在时 env 必须胜出 (M5 env-wins)');
  } finally {
    cleanup();
  }
});

test('webhookSecret env-wins 2: 只有 raw 时取 raw', async () => {
  const cleanup = withTmpAccount({ webhookSecret: 'raw-only' });
  try {
    delete process.env[TMP_ENV_NAME]; // env 不存在
    const cfg = await CFG.loadAccountConfig(TMP_ACCOUNT_ID);
    assert.strictEqual(cfg.webhookSecret, 'raw-only', 'env 缺失时必须取 raw');
  } finally {
    cleanup();
  }
});

test('webhookSecret env-wins 3: cache 层同样 env-wins (与读取层不分叉)', async () => {
  const cleanup = withTmpAccount({ webhookSecret: 'raw-secret' });
  try {
    delete process.env[TMP_ENV_NAME];
    const first = await CFG.loadAccountConfig(TMP_ACCOUNT_ID); // 首次读盘 → 填 cache, raw 生效
    assert.strictEqual(first.webhookSecret, 'raw-secret', '首次 (读盘路径) 应为 raw');
    process.env[TMP_ENV_NAME] = 'env-secret';
    const second = await CFG.loadAccountConfig(TMP_ACCOUNT_ID); // 命中 cache 分支
    assert.strictEqual(second.webhookSecret, 'env-secret', 'cache 层必须同样 env-wins (config.ts:134)');
  } finally {
    cleanup();
  }
});
