/**
 * v1.6.7 (2026-09-26) OpenClaw 2026.9.6+ plugin source capture 适配回归
 *
 * 真事故: 升级 2026.9.6 后, OpenClaw 每次 CLI 调用/gateway 加载都会把本地插件**实体复制**到
 *   <stateDir>/tmp/plugin-captures/<uuid>/captures/openclaw-plugin-build-XXXX/
 *     package-0/node_modules/wechatpadpro/
 * 该副本临时 (进程退出即 sweep)。插件的 8 层 walk 停在副本根 ⇒ accounts/ config.json
 * db/schema.sql 全落到副本。实测现场 (2026-09-26 10:41, openclaw status --all 期间):
 *   WARN [WPP v1.6.6] config hot-reload failed: default: account config not found:
 *   /root/.openclaw/tmp/plugin-captures/3a591cca-…/openclaw-plugin-build-KjW3dz/
 *   package-0/node_modules/wechatpadpro/accounts/default.json
 *
 * 本测试不碰生产: 在 /tmp 造假 stateDir + 假 capture 树, 把**真编译产物 dist/** 放进副本,
 * 断言 async/sync 两个解析器都映射回 <stateDir>/extensions/wechatpadpro, 且降级路径不抛异常。
 */
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const PLUGIN_NAME = 'wechatpadpro';

// 本文件每个 case 都建一棵假 stateDir (含 dist/ 副本, 体量大) ⇒ 必须登记后统一清理。
// 2026-10-04 事故: 本文件自 09-26 起只建不删, 三周在 /tmp 累积 3089 个 wpp-capture-* 目录 (~5.9G)。
const TEMP_DIRS = [];
function ws() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpp-capture-'));
  TEMP_DIRS.push(dir);
  return dir;
}
after(() => {
  for (const dir of TEMP_DIRS) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* 清理失败不得影响测试结论 */ }
  }
  TEMP_DIRS.length = 0;
});

/** 造一个「插件包」: package.json + openclaw.plugin.json (+ 可选 dist/accounts) */
function makePluginPkg(dir, { name = PLUGIN_NAME, id = PLUGIN_NAME, version = '1.6.7', dist = false, accounts = false } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version, type: 'module' }, null, 2));
  fs.writeFileSync(path.join(dir, 'openclaw.plugin.json'), JSON.stringify({ id, name, version }, null, 2));
  if (dist) fs.cpSync(path.join(REPO, 'dist'), path.join(dir, 'dist'), { recursive: true });
  if (accounts) {
    fs.mkdirSync(path.join(dir, 'accounts'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'accounts', 'default.json'), '{"tokenKeyEnv":"WPP_TOKEN"}');
  }
  return dir;
}

/** 造一个真形状的 capture 副本, 返回副本里的插件根 */
function makeCapture(stateDir, { buildId = 'TEST01', uuid = '00000000-0000-4000-8000-000000000001', dist = true, accounts = true } = {}) {
  const root = path.join(
    stateDir, 'tmp', 'plugin-captures', uuid, 'captures', `openclaw-plugin-build-${buildId}`,
    'package-0', 'node_modules', PLUGIN_NAME,
  );
  makePluginPkg(root, { dist, accounts });
  return root;
}

/** 以独立模块实例加载副本里的 paths.js (每个 case 独立 cache) */
async function loadPaths(captureRoot, caseId) {
  const url = pathToFileURL(path.join(captureRoot, 'dist', 'core', 'paths.js')).href + `?case=${caseId}`;
  return import(url);
}

test('capture 副本 → async findPluginRoot 映射回稳定安装根 extensions/<name>', async () => {
  const stateDir = ws();
  const stable = makePluginPkg(path.join(stateDir, 'extensions', PLUGIN_NAME), { accounts: true });
  const capture = makeCapture(stateDir);

  const mod = await loadPaths(capture, 'async1');
  const got = await mod.findPluginRoot();

  assert.strictEqual(got, stable, `应映射到稳定安装根, 实际: ${got}`);
  assert.ok(!got.includes('/tmp/plugin-captures/'), '绝不能停在临时副本路径');
  assert.ok(mod.isPluginCapturePath(capture), 'isPluginCapturePath 应识别副本');
  assert.ok(!mod.isPluginCapturePath(stable), '稳定根不应被误判为副本');
});

test('capture 副本 → sync findPluginRootSync 与 async 结果一致 (OpenClaw 有不 await 的调用点)', async () => {
  const stateDir = ws();
  const stable = makePluginPkg(path.join(stateDir, 'extensions', PLUGIN_NAME));
  const capture = makeCapture(stateDir);

  const mod = await loadPaths(capture, 'sync1');
  assert.strictEqual(mod.findPluginRootSync(), stable, 'sync 版必须同样映射回稳定根');
  assert.strictEqual(await mod.findPluginRoot(), stable, 'sync/async 必须同源同结果');
});

test('稳定根目录名 ≠ 包名时, 靠 package.json name 扫描命中', async () => {
  const stateDir = ws();
  const stable = makePluginPkg(path.join(stateDir, 'extensions', 'wpp-prod-dir')); // 目录名不同
  const capture = makeCapture(stateDir);

  const mod = await loadPaths(capture, 'scan1');
  assert.strictEqual(await mod.findPluginRoot(), stable, '扫描 extensions/* 比对 package.json name 应命中');
});

test('包名不同但 manifest id 相同时, 靠 manifest id 命中', async () => {
  const stateDir = ws();
  // 线上目录: package.json name 被改过 (release 个性化清洗), 但 manifest id 恒为 wechatpadpro
  const stable = makePluginPkg(path.join(stateDir, 'extensions', 'wechatpadpro'), { name: 'wpp-sanitized' });
  const capture = makeCapture(stateDir); // 副本里 name=wechatpadpro, id=wechatpadpro

  const mod = await loadPaths(capture, 'scan2');
  assert.strictEqual(await mod.findPluginRoot(), stable, '应靠 manifest id 兜底命中');
});

test('降级: 找不到稳定根时不抛异常, 保留副本路径 (插件必须还能起来)', async () => {
  const stateDir = ws(); // 故意不建 extensions/
  const capture = makeCapture(stateDir);
  const fakeHome = ws();
  const oldHome = process.env.HOME;
  const oldState = process.env.OPENCLAW_STATE_DIR;
  process.env.HOME = fakeHome;
  delete process.env.OPENCLAW_STATE_DIR;
  try {
    const mod = await loadPaths(capture, 'degrade1');
    assert.strictEqual(await mod.findPluginRoot(), capture, '降级应原样返回副本根, 不得抛错');
    assert.strictEqual(mod.findPluginRootSync(), capture);
  } finally {
    if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome;
    if (oldState !== undefined) process.env.OPENCLAW_STATE_DIR = oldState;
  }
});

test('回归: 非 capture 的正常安装目录解析结果 = 自身 (不引入新行为)', async () => {
  const stateDir = ws();
  const stable = makePluginPkg(path.join(stateDir, 'extensions', PLUGIN_NAME), { dist: true, accounts: true });

  const mod = await loadPaths(stable, 'normal1');
  assert.strictEqual(await mod.findPluginRoot(), stable);
  assert.strictEqual(mod.findPluginRootSync(), stable);
  assert.strictEqual(await mod.resolveFromPlugin('accounts', 'default.json'), path.join(stable, 'accounts', 'default.json'));
});

test('ENV 兜底: 副本路径无法反推 stateDir 时, 用 OPENCLAW_STATE_DIR', async () => {
  // 裸 build 目录名 (无 /tmp/plugin-captures/ 段) — 模拟 model-catalog 形态
  const bare = path.join(ws(), 'openclaw-plugin-build-BARE1', 'package-0', 'node_modules', PLUGIN_NAME);
  makePluginPkg(bare, { dist: true, accounts: true });
  const stateDir = ws();
  const stable = makePluginPkg(path.join(stateDir, 'extensions', PLUGIN_NAME));
  const old = process.env.OPENCLAW_STATE_DIR;
  process.env.OPENCLAW_STATE_DIR = stateDir;
  try {
    const mod = await loadPaths(bare, 'env1');
    assert.ok(mod.isPluginCapturePath(bare), '裸 build 目录名应被识别为副本');
    assert.strictEqual(await mod.findPluginRoot(), stable, '应通过 OPENCLAW_STATE_DIR 兜底命中');
  } finally {
    if (old === undefined) delete process.env.OPENCLAW_STATE_DIR; else process.env.OPENCLAW_STATE_DIR = old;
  }
});

test('deploy-swap.sh --dry-run 必须真只读 (旧版会真部署却打印"没真写任何文件")', async () => {
  const { execFileSync } = await import('node:child_process');
  const root = ws();
  const fakeRoot = path.join(root, 'fake-openclaw');
  const deployDir = path.join(fakeRoot, 'extensions', PLUGIN_NAME);
  const backupRoot = path.join(root, 'backups');
  // 假"线上"部署: 放一个哨兵文件 (真部署的 rm -rf + 拷贝会把它抹掉)
  makePluginPkg(deployDir, { version: '0.0.1-sentinel' });
  fs.writeFileSync(path.join(deployDir, 'SENTINEL-DO-NOT-DELETE'), 'unchanged');
  const jsonPath = path.join(fakeRoot, 'openclaw.json');
  fs.writeFileSync(jsonPath, JSON.stringify({ plugins: { allow: [], entries: {} } }));
  const before = execFileSync('bash', ['-c', `cd ${deployDir} && find . -type f -exec sha256sum {} + | sort`]).toString();
  const jsonBefore = fs.readFileSync(jsonPath, 'utf8');

  const out = execFileSync('bash', [path.join(REPO, 'deploy-swap.sh'), '--dry-run'], {
    env: { ...process.env, OPENCLAW_ROOT: fakeRoot, BACKUP_ROOT: backupRoot, GATEWAY_SERVICE: 'no-such-wpp-service', SKIP_BUILD: '1' },
    encoding: 'utf8',
  });

  const after = execFileSync('bash', ['-c', `cd ${deployDir} && find . -type f -exec sha256sum {} + | sort`]).toString();
  assert.strictEqual(after, before, 'dry-run 后假部署目录必须逐字节未变 (哨兵文件仍在)');
  fs.writeFileSync(path.join(deployDir, 'SENTINEL-DO-NOT-DELETE'), 'unchanged'); // 保底: 若被删则上面已 fail
  assert.strictEqual(fs.readFileSync(jsonPath, 'utf8'), jsonBefore, 'dry-run 不得改写 openclaw.json (老板铁律)');
  assert.ok(!fs.existsSync(backupRoot), 'dry-run 不得创建备份目录');
  assert.match(out, /\[dry-run\]/, '必须显式打印 [dry-run] 跳过项');
});

test('deploy-swap.sh 每个写步骤都由 DRY_RUN 把关 (防谎报 dry-run 复发)', () => {
  const s = fs.readFileSync(path.join(REPO, 'deploy-swap.sh'), 'utf8');
  const guards = (s.match(/\[ "\$DRY_RUN" = "1" \]/g) || []).length;
  assert.ok(guards >= 6, `写步骤应有 >=6 处 DRY_RUN 把门 (备份/openclaw.json/env/拷贝/jiti/重启/verify), 实际: ${guards}`);
  // 关键词必须出现在 file 里, 且 openclaw.json 注入 + rm -rf 部署目录都在 else 分支内
  for (const marker of ['rm -rf "$DEPLOY"', 'systemctl --user restart "$GATEWAY_SERVICE"', 'jq --arg id "wechatpadpro"']) {
    assert.ok(s.includes(marker), `deploy-swap.sh 应仍包含: ${marker}`);
  }
});

test('源码仓三处解析器已收口到 core/paths (防再次漂移)', () => {
  const paths = fs.readFileSync(path.join(REPO, 'src/core/paths.ts'), 'utf8');
  assert.match(paths, /export function findPluginRootSync/, 'core/paths 必须导出 sync 版');

  const helpers = fs.readFileSync(path.join(REPO, 'src/config-helpers.ts'), 'utf8');
  assert.match(helpers, /import \{ findPluginRootSync \} from "\.\/core\/paths\.js"/, 'config-helpers 必须用共享解析器');
  assert.doesNotMatch(helpers, /function findPluginRootSync/, 'config-helpers 不得再留第二份 walk');

  const bridge = fs.readFileSync(path.join(REPO, 'src/channel-ui-bridge.ts'), 'utf8');
  assert.match(bridge, /return findPluginRootSync\(\)/, 'channel-ui-bridge 必须用共享解析器');
  assert.doesNotMatch(bridge, /fileURLToPath\(import\.meta\.url\)/, 'channel-ui-bridge 不得再留第三份 walk');
});
