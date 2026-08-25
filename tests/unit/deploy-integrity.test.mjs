/**
 * 部署完整性 + 编译产物安全测试
 * v1.4.0 P0-fix 19:30: deploy 端 0 .ts (排除 node_modules) + 无明文凭据
 */
import assert from 'node:assert';
import { test } from 'node:test';

test('deploy 端 0 个 .ts (排除 node_modules)', async () => {
  const { execSync } = await import('node:child_process');
  // deploy 端 = /root/.openclaw/extensions/wechatpadpro/
  const out = execSync(`find /root/.openclaw/extensions/wechatpadpro/ -name "*.ts" -not -path "*/node_modules/*" 2>/dev/null | wc -l`).toString().trim();
  assert.strictEqual(parseInt(out, 10), 0, `deploy 端应该 0 个 .ts (排除 node_modules), 实际: ${out}`);
});

test('deploy 端 plugin.json 个人邮箱/密码无硬编码', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../dist/index.js', import.meta.url), 'utf-8');
  // 不应包含明文邮箱 / 密码 / token 关键字
  assert.doesNotMatch(src, /jiexiaoyin@gmail\.com/, 'no hardcoded email');
  assert.doesNotMatch(src, /sk-[a-zA-Z0-9]{20,}/, 'no hardcoded openai-like key');
});

test('deploy 端 vendor host 是 wx.juhe.chat (env 可覆盖)', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../dist/util/safe-fetch.js', import.meta.url), 'utf-8');
  assert.match(src, /WPP_VENDOR_HOST/, 'must use WPP_VENDOR_HOST env var');
  assert.match(src, /api\.minimaxi\.com/, 'minimax API host must be in whitelist');
  assert.match(src, /WPP_VENDOR_HOST/, 'must read WPP_VENDOR_HOST env');
});

test('sync-github.sh: 凭证不入 git (本地 .git/config [user])', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../sync-github.sh', import.meta.url), 'utf-8');
  // 不应包含明文邮箱
  assert.doesNotMatch(src, /jiexiaoyin@gmail\.com/, 'no hardcoded email in sync-github.sh');
  // 应使用本地镜像 .git/config 自动读 (凭证不入脚本)
  assert.match(src, /MIRROR_DIR/, 'must use MIRROR_DIR local mirror');
  assert.match(src, /\.git\/config|本地镜像.*\.git\/config|凭证.*git 原生机制/, '凭证应从 git 原生机制读');
});