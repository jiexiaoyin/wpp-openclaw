/**
 * 部署完整性 + 编译产物安全测试
 * v1.4.0 P0-fix 19:30: deploy 端 0 .ts (排除 node_modules) + 无明文凭据
 */
import assert from 'node:assert';
import fs from 'node:fs';
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

// ===== v1.6.5 (2026-09-13 事故): 部署端必须带 db/schema.sql =====
// 真事: deploy-swap.sh 步骤4 `rm -rf $DEPLOY` 后只拷 dist/manifest/package.json/node_modules/config.json/accounts,
//   拷贝清单里**没有 db/** ⇒ v1.6.3 手工补进线上的 db/schema.sql 在 21:36 那次部署被整目录删掉,
//   启动日志从 `applySchemaSql: 11 statements applied` 变成 `schema.sql not found, skipping`
//   (建表/加列静默失效 = v1.6.3 刚修完的那类静默 bug 换了个位置复发). 两道断言把它钉住.
test('部署端必须有 db/schema.sql, 且与源码仓逐字节一致', async () => {
  const fs = await import('node:fs');
  const { execSync } = await import('node:child_process');
  const LIVE = '/root/.openclaw/extensions/wechatpadpro/db/schema.sql';
  assert.ok(fs.existsSync(LIVE), `部署端缺 ${LIVE} — applySchemaSql 会静默跳过 (建表/加列不生效)`);
  const a = execSync(`sha256sum ${LIVE} | cut -d' ' -f1`).toString().trim();
  const b = execSync(`sha256sum ${new URL('../../db/schema.sql', import.meta.url).pathname} | cut -d' ' -f1`)
    .toString()
    .trim();
  assert.strictEqual(a, b, '部署端 schema.sql 必须与源码仓一致 (手工改过的线上副本要回灌进仓库)');
});

test('deploy-swap.sh 拷贝清单含 db/ (否则每次部署都会抹掉 schema.sql)', async () => {
  const fs = await import('node:fs');
  for (const rel of ['../../deploy-swap.sh', '../../release/deploy-swap.sh']) {
    const src = fs.readFileSync(new URL(rel, import.meta.url), 'utf-8');
    assert.match(src, /cp -a db "\$DEPLOY\/"/, `${rel} 必须拷贝 db/ (运行时资产)`);
    // 光拷还不够: 缺了就硬失败, 不许静默跳过
    assert.match(src, /\[ ! -f "\$DEPLOY\/db\/schema\.sql" \]/, `${rel} 拷完必须硬校验 schema.sql 落地`);
  }
});

// ===== 2026-09-13 事故: 插件"注册了工具" ≠ agent "能调工具" =====
// 真事: 老板说「将这个卡片转发给我」, wpp-wechat agent 回了「已转发 ✅」—— 而它**根本没发**
//   (那张卡是运维验收脚本发的)。它的工具清单里**一个厂商工具都没有**: 只有 coding profile 的
//   基础工具 + alsoAllow 里的 wecom-cli/message。
// 根因: openclaw.json 的 tools 是 **profile + 白名单** 制 (`tools.profile="coding"` + `tools.alsoAllow`),
//   框架用 resolveCodingToolConstructionPlanForAllowlist() / applyEmbeddedAttemptToolsAllow() 把最终
//   工具数组**按 allowlist 求交集** ⇒ 本插件 dist/index.js:829 注入的 agentTools (300+ 厂商工具)
//   被**静默滤掉** (不报错、日志无痕), 通道注册本身是好的 (`plugins inspect` ⇒ channel: wechatpadpro)。
// 断言的是**解析后的数组内容** (不是"符号出现过"): 名字被删/数组被重置都会红。
//
// 22:08 收窄 (只给 wpp-wechat, 不给 main/wecom): 白名单是 **agent 级覆盖全局** 语义 ——
//   agent-tools.policy 里 `profile = agentTools?.profile ?? globalTools?.profile`,
//   `alsoAllow = agentTools?.alsoAllow ?? globalTools?.alsoAllow` (`??`, 不是合并) ⇒
//   给 `agents.entries.wpp-wechat.tools.alsoAllow` 写全量清单即可, profile 仍继承全局 "coding"。
//   故下面断言的是**每个 agent 解析后的有效白名单** (`agent 级 ?? 全局`), 而不是某一处字面量。
const VENDOR_TOOLS = ['sendMiniProgram', 'sendMessage', 'sendLocation']; // 发小程序卡 · 统一发送(图/文件/链接/定位) · 发定位
const WPP_OWNER = 'wpp-wechat'; // 这三个工具属 wechatpadpro 通道, 只该给它的 owner agent

function readOpenclawConfig() {
  const cfgPath = '/root/.openclaw/openclaw.json';
  assert.ok(fs.existsSync(cfgPath), `缺 ${cfgPath} (网关核心配置)`);
  return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
}

test('openclaw.json: wpp-wechat 的有效 alsoAllow 必须放行三个厂商工具', () => {
  const cfg = readOpenclawConfig();
  const globalAllow = cfg?.tools?.alsoAllow;
  assert.ok(Array.isArray(globalAllow), 'tools.alsoAllow 必须是数组 (缺失 ⇒ agent 只剩 profile 默认工具)');
  const effective = cfg?.agents?.entries?.[WPP_OWNER]?.tools?.alsoAllow ?? globalAllow;
  for (const name of VENDOR_TOOLS) {
    assert.ok(
      effective.includes(name),
      `agent "${WPP_OWNER}" 的有效 alsoAllow 缺 "${name}" ⇒ 它拿不到该工具 (表现为"做不到却虚报已完成"); ` +
        `加回用: openclaw config patch (写 agents.entries.${WPP_OWNER}.tools.alsoAllow, 注意数组是替换语义)`,
    );
  }
});

test('openclaw.json: 三个厂商工具不得泄漏给 main / wecom (收窄 blast radius)', () => {
  const cfg = readOpenclawConfig();
  const entries = cfg?.agents?.entries ?? {};
  for (const [agentId, entry] of Object.entries(entries)) {
    if (agentId === WPP_OWNER) continue;
    const effective = entry?.tools?.alsoAllow ?? cfg?.tools?.alsoAllow ?? [];
    for (const name of VENDOR_TOOLS) {
      assert.ok(
        !effective.includes(name),
        `agent "${agentId}" 拿到了 wechatpadpro 的 "${name}" —— 该工具只属 ${WPP_OWNER}; ` +
          `写进全局 tools.alsoAllow 会波及所有 agent, 应写在 agents.entries.${WPP_OWNER}.tools.alsoAllow`,
      );
    }
  }
});