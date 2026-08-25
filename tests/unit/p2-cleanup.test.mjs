// tests/unit/p2-cleanup.test.mjs - v1.5.0 P2-fix 20:41 老板拍 A: 4 项 P2 全收口
//
// 验证 4 项 P2 修复:
//   P2-1: HMAC 验签 env 注入
//   P2-2: 3 处 intent-llm/dispatcher hardcode 消除
//   P2-3: enrich.js 拆分 (1.3MB → 2.8KB)
//   P2-4: plugin.json version 对齐 v1.5.0

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const DEPLOY = '/root/.openclaw/extensions/wechatpadpro';

// ===== P2-1: HMAC 验签 =====
test('P2-1.1: HMAC secret 已生成 + 持久化到 credentials', () => {
  const secretFile = '/root/.openclaw/credentials/wechatpadpro-webhook-secret.json';
  assert.ok(fs.existsSync(secretFile), 'secret 文件必须存在');
  const d = JSON.parse(fs.readFileSync(secretFile, 'utf-8'));
  assert.ok(d.webhookSecret, 'webhookSecret 必须存在');
  assert.strictEqual(d.webhookSecret.length, 64, '32 字节 hex = 64 字符');
  // 验证文件权限 600
  const stats = fs.statSync(secretFile);
  assert.strictEqual(stats.mode & 0o777, 0o600, '文件权限必须 600');
});

test('P2-1.2 (v1.5.1): env 不写 WECHATPRO_WEBHOOK_SECRET (vendor 不发 signature, v1.1.10 permissive)', () => {
  const envFile = '/root/.openclaw/gateway.systemd.env';
  const content = fs.readFileSync(envFile, 'utf-8');
  assert.doesNotMatch(content, /^WECHATPRO_WEBHOOK_SECRET=\w+/m, 'env 不应有 WECHATPRO_WEBHOOK_SECRET (vendor 不发 signature, 按 v1.1.10 permissive)');
  // 未来 vendor 公开签名时, 配 WECHATPRO_WEBHOOK_SECRET=64hex 即可启用 HMAC
});

// ===== P2-2: 3 处 hardcode 消除 =====
test('P2-2.1: intent-llm.ts hardcode 消除', () => {
  const src = fs.readFileSync(`${ROOT}/src/dispatch/intent-llm.ts`, 'utf-8');
  assert.doesNotMatch(src, /"MiniMax-M2\.7-highspeed"/, 'intent-llm.ts 必须无 hardcode');
  assert.match(src, /WPP v1\.5\.0 P2-fix/, 'intent-llm.ts 必须有 P2-fix 注释');
});

test('P2-2.2: dispatcher.ts hardcode 消除 (resolveLlmModel)', () => {
  const src = fs.readFileSync(`${ROOT}/src/dispatch/dispatcher.ts`, 'utf-8');
  // 提取 resolveLlmModel 函数体
  const fnMatch = src.match(/function resolveLlmModel[\s\S]*?^}/m);
  assert.ok(fnMatch, 'resolveLlmModel 函数必须存在');
  assert.doesNotMatch(fnMatch[0], /"MiniMax-M2\.7-highspeed"/, 'resolveLlmModel 函数体必须无 hardcode');
  assert.match(fnMatch[0], /WPP v1\.5\.0 P2-fix/, 'resolveLlmModel 必须有 P2-fix 注释');
});

test('P2-2.3: 全局 src/ 代码行 (非注释) 无 hardcode "MiniMax-M2.7-highspeed"', () => {
  // 用 node 逐文件 read + 用 regex 找 hardcode (避免注释)
  // 注释检测规则: //单行注释、/* */块注释
  function stripComments(s) {
    // 去 /* ... */ 块注释 (跨行)
    s = s.replace(/\/\*[\s\S]*?\*\//g, '');
    // 去 // 单行注释 (到行尾)
    s = s.split('\n').map(line => {
      const idx = line.indexOf('//');
      // 注意字符串字面量内的 // 可能误伤, 但 hardcode 检查用粗扫不需精确
      if (idx >= 0) return line.slice(0, idx);
      return line;
    }).join('\n');
    return s;
  }
  const files = execSync(`grep -rl "MiniMax-M2.7-highspeed" ${ROOT}/src/ 2>/dev/null || true`, { encoding: 'utf-8' })
    .split('\n').filter(f => f.trim());
  const hits = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf-8');
    const cleaned = stripComments(src);
    if (/["']MiniMax-M2\.7-highspeed["']/.test(cleaned)) {
      hits.push(f);
    }
  }
  assert.deepStrictEqual(hits, [], 'src/ 代码行还有 hardcode 残留:\n' + hits.join('\n'));
});

test('P2-2.4: schema.llmIntentModel default = deepseek-v4-flash', () => {
  const d = JSON.parse(fs.readFileSync(`${DEPLOY}/openclaw.plugin.json`, 'utf-8'));
  const f = d.channelConfigs.wechatpadpro.schema.properties.llmIntentModel;
  assert.strictEqual(f.default, 'deepseek-v4-flash', 'schema default 必须切到 deepseek-v4-flash');
  assert.ok(f.enum.includes('deepseek-v4-flash'), 'enum 必须包含 deepseek-v4-flash');
});

test('P2-2.5: accounts cfg llmIntentModel = deepseek-v4-flash', () => {
  const d = JSON.parse(fs.readFileSync(`${DEPLOY}/accounts/default.json`, 'utf-8'));
  assert.strictEqual(d.llmIntentModel, 'deepseek-v4-flash', 'accounts cfg llmIntentModel 必须 deepseek-v4-flash');
  assert.strictEqual(d.llmIntentEnabled, true);
  assert.strictEqual(d.llmIntentTimeoutMs, 5000);
});

// ===== P2-3: enrich.js 拆分 =====
test('P2-3.1: enrich.js 大小 < 50KB (拆分前 1.3MB)', () => {
  const stats = fs.statSync(`${DEPLOY}/dist/inbound/enrich.js`);
  assert.ok(stats.size < 50_000, `enrich.js 必须 < 50KB, 实际 ${stats.size} bytes`);
});

test('P2-3.2: enrich.js 保留 import 语句 (--bundle=false)', () => {
  const src = fs.readFileSync(`${DEPLOY}/dist/inbound/enrich.js`, 'utf-8');
  assert.match(src, /^import \{[\s\S]*?\} from "\.\/heartflow-trigger\.js"/m, 'enrich.js 必须 import heartflow-trigger');
});

test('P2-3.3: heartflow-trigger.ts 桥接文件存在', () => {
  assert.ok(fs.existsSync(`${ROOT}/src/inbound/heartflow-trigger.ts`), 'heartflow-trigger.ts 必须存在');
});

test('P2-3.4: enrich.ts import 改用 heartflow-trigger', () => {
  const src = fs.readFileSync(`${ROOT}/src/inbound/enrich.ts`, 'utf-8');
  assert.match(src, /from "\.\/heartflow-trigger\.js"/, 'enrich.ts 必须 import heartflow-trigger');
  assert.doesNotMatch(src, /from "\.\/heartflow\.js"/, 'enrich.ts 不能直接 import heartflow');
});

// ===== P2-4: plugin.json version 对齐 =====
test('P2-4.1: dev openclaw.plugin.json version = 1.5.2', () => {
  const d = JSON.parse(fs.readFileSync(`${ROOT}/openclaw.plugin.json`, 'utf-8'));
  assert.strictEqual(d.version, '1.5.2', 'dev openclaw.plugin.json.version 必须 1.5.2');
});

test('P2-4.2: deploy openclaw.plugin.json version = 1.5.2', () => {
  const d = JSON.parse(fs.readFileSync(`${DEPLOY}/openclaw.plugin.json`, 'utf-8'));
  assert.strictEqual(d.version, '1.5.2', 'deploy openclaw.plugin.json.version 必须 1.5.2');
});

test('P2-4.3: package.json version = 1.5.2', () => {
  const d = JSON.parse(fs.readFileSync(`${ROOT}/package.json`, 'utf-8'));
  assert.strictEqual(d.version, '1.5.2');
});

test('P2-4.4: PLUGIN_VERSION 常量 = 1.5.2', () => {
  const src = fs.readFileSync(`${DEPLOY}/dist/core/constants.js`, 'utf-8');
  assert.match(src, /PLUGIN_VERSION = "1\.5\.2"/, 'PLUGIN_VERSION 常量必须 1.5.2');
});
