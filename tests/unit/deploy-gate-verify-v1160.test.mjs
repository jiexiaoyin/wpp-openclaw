/**
 * tests/unit/deploy-gate-verify-v1160.test.mjs — 2026-10-16 审阅修正: 部署门与 verify 的假报
 *
 * 这三条是同一类病: **看起来在把关, 其实在造假**。
 *   1) deploy-swap.sh 的 dry-run gate 是空操作 —— 文字声称"要求 5 分钟内 bash deploy.sh 跑过且 exit 0",
 *      实现只有 `[ FORCE != 1 ] && [ DRY_RUN != 1 ] && exit 1`: 不读任何证据, 也没有任何合法路径能过
 *      ⇒ 每次只能打 --force (防呆名存实亡), 且判据与文字不符 (谎报)。
 *   2) verify 的 `sleep 5` 短于插件真实注册耗时 (实测启动后约 6s 才注册, 账号启动再晚 4s)
 *      ⇒ **健康部署也印** "✗ plugin registered log 未找到", 把人引去乱查。
 *   3) verify 的 `grep -iE "error|fail"` 只认子串 ⇒ 把正文含 error/fail 的 WARN 计成 error
 *      (实例: accounts/ 拷贝窗口期的 "config hot-reload failed" WARN ⇒ 假报 3 error);
 *      且只看 journal 末尾 N 行 ⇒ 会把**上一次**启动的行也数进来。
 *
 * 锁法: 行为 (gate 三条路径, 真跑脚本) + 源级 (不得退回空操作/盲等/子串判据)。
 * 源级同时锁 `release/deploy-swap.sh` —— 与 deploy-integrity.test.mjs 同规: 发出去的是 release 副本,
 * 它由 build-release.sh 从 dev 重建; 加了这道断言, "改了 dev 忘了重建 release" 会被测试拦下。
 */
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const ROOT = new URL('../../', import.meta.url).pathname;
const SWAP = join(ROOT, 'deploy-swap.sh');
const COPIES = ['deploy-swap.sh', 'release/deploy-swap.sh'];

const tmp = (name) => join(os.tmpdir(), `${name}-${process.pid}`);

/**
 * 只取**活代码**, 剔掉整行注释。
 * 为什么必须剔: 本次修正的说明里引用了被删掉的老写法 (如 `grep -iE "error|fail"`) ——
 *   "说旧版错在哪"的注释不该被当成旧版本身。断言要钉的是代码, 不是散文。
 */
function codeOf(rel) {
  return fs
    .readFileSync(join(ROOT, rel), 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .join('\n');
}

/** 跑 deploy-swap.sh (env 可注入 DEPLOY_MARKER / OPENCLAW_ROOT 等), 绝不带 --force/--dry-run。 */
function runSwap(env) {
  const r = spawnSync('bash', [SWAP], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

// ===== 1. gate 行为: 拒绝路径 =====

test('v1.16.0 gate: marker 缺失 ⇒ 拒绝 (exit 1) 且指路 deploy.sh', () => {
  const marker = tmp('wpp-gate-absent');
  fs.rmSync(marker, { force: true });
  const { status, out } = runSwap({ DEPLOY_MARKER: marker });
  assert.strictEqual(status, 1, 'marker 缺失时必须拒绝 (旧版恒 exit 1, 这点不变, 变的是判据)');
  assert.match(out, /未找到 marker/, '必须说清是 marker 缺失, 而不是一句含糊的"要求 N 分钟内跑过"');
  assert.match(out, /bash deploy\.sh/, '必须给出可执行的下一步 (否则又只剩 --force 一条路)');
});

test('v1.16.0 gate: marker 过期 (>GATE_MAX_AGE) ⇒ 拒绝并报年龄', () => {
  const marker = tmp('wpp-gate-stale');
  fs.writeFileSync(marker, '1\n'); // epoch 1 = 早在 1970 年
  try {
    const { status, out } = runSwap({ DEPLOY_MARKER: marker });
    assert.strictEqual(status, 1, '过期 marker 必须拒绝 (否则"刚跑过"的约束形同虚设)');
    assert.match(out, /已过期/, '必须点明是"过期"而非"缺失" (两种成因, 处理动作不同)');
  } finally {
    fs.rmSync(marker, { force: true });
  }
});

// ===== 2. gate 行为: 放行路径 (用假根目录兜住后续步骤, 绝不碰真部署) =====

test('v1.16.0 gate: marker 新鲜 ⇒ 放行 (不再需要 --force)', () => {
  const marker = tmp('wpp-gate-fresh');
  const fakeOc = tmp('wpp-fake-oc');
  const fakeBk = tmp('wpp-fake-bk');
  fs.writeFileSync(marker, `${Math.floor(Date.now() / 1000)}\n`);
  try {
    const { out } = runSwap({
      DEPLOY_MARKER: marker,
      OPENCLAW_ROOT: fakeOc, // 假根目录: 后续步骤必然停在这里
      BACKUP_ROOT: fakeBk,
      SKIP_BUILD: '1', // 不重建 dist (只为验 gate)
    });
    assert.match(out, /dry-run gate[\s\S]{0,80}干净通过/, 'gate 必须放行新鲜 marker');
    assert.doesNotMatch(out, /未找到 marker|已过期/, '放行路径不得再报拒绝');
    assert.match(out, /\[1\/7\]/, 'gate 放行后必须真的继续走到步骤 1 (证明 gate 之后流程未被截断)');
    assert.doesNotMatch(out, /deploy-swap done/, '绝不能走到真实部署 (本用例全程用假根目录)');
  } finally {
    fs.rmSync(marker, { force: true });
    fs.rmSync(fakeOc, { recursive: true, force: true });
    fs.rmSync(fakeBk, { recursive: true, force: true });
  }
});

// ===== 3. 源级: gate 不得退回空操作 =====

test('v1.16.0 源级: gate 必须真读 marker (阈值 + 判据 + 指路)', () => {
  for (const rel of COPIES) {
    const src = codeOf(rel);
    assert.match(src, /GATE_MAX_AGE/, `${rel}: 缺超时阈值 (必须可配, 不是写死的文字承诺)`);
    assert.match(src, /MARKER_TS/, `${rel}: 必须读 marker 的时间戳 (旧版根本不读任何证据)`);
    assert.match(src, /未找到 marker/, `${rel}: 缺 marker 缺失判据`);
    assert.match(src, /已过期/, `${rel}: 缺 marker 过期判据`);
    assert.match(src, /wpp-deploy-swap\.dryrun-ok/, `${rel}: marker 默认路径必须与 deploy.sh 同源`);
  }
});

// ===== 4. 源级: verify 不得盲等 / 不得用子串判 error =====

test('v1.16.0 源级: verify 必须轮询注册行, 不得再盲等 sleep 后一次性读', () => {
  for (const rel of COPIES) {
    const src = codeOf(rel);
    assert.match(src, /VERIFY_WAIT/, `${rel}: 必须轮询到期限 (插件实测 ~6s 才注册, 固定 5s 对慢机器就是假阴性)`);
    assert.doesNotMatch(src, /sleep 5\n\s*PLUGIN_LOG=/, `${rel}: 不得退回"盲等 5s 再一次性读"`);
  }
});

test('v1.16.0 源级: verify 必须按日志级别判 ERROR, 不得再用 error|fail 子串', () => {
  for (const rel of COPIES) {
    const src = codeOf(rel);
    assert.doesNotMatch(src, /grep -iE "error\|fail"/, `${rel}: 子串判据会把正文含 error/fail 的 WARN 计成 ERROR (假报)`);
    assert.match(src, /\(ERROR\|FATAL\)/, `${rel}: 必须认日志的级别字段`);
    assert.match(src, /--since "\$SINCE_TS"/, `${rel}: 必须限定本次重启的时间窗 (否则会数进上次启动的行)`);
    assert.match(src, /SINCE_TS="\$\(date/, `${rel}: 缺 SINCE_TS 定义 (步骤 6 重启前记录)`);
  }
});

// ===== 5. deploy.sh 只在干净通过路径写 marker =====

test('v1.16.0: deploy.sh 写 marker 的位置必须在"0 警告 PASS"之后 (exit 1/2 到不了)', () => {
  const src = fs.readFileSync(join(ROOT, 'deploy.sh'), 'utf8');
  assert.match(src, /DEPLOY_MARKER/, 'deploy.sh 必须用同一个 DEPLOY_MARKER 变量 (两脚本同源)');
  assert.match(src, /wpp-deploy-swap\.dryrun-ok/, '默认路径必须与 deploy-swap.sh 逐字一致');
  const passIdx = src.indexOf('DRY-RUN PASS — 全部 step 通过, 0 警告');
  const writeIdx = src.search(/printf '%s\\n' "\$\(date \+%s\)" > "\$MARKER"/);
  assert.ok(passIdx > 0, '找不到"0 警告 PASS"这句 (判据锚点没了)');
  assert.ok(writeIdx > passIdx, `marker 写入必须在干净 PASS 之后 (passIdx=${passIdx}, writeIdx=${writeIdx})`);
  assert.ok(
    src.indexOf('exit 2') < passIdx,
    'exit 2 (PASS with warnings) 必须在 marker 写入之前 —— 有警告的 dry-run 不该放行真实部署',
  );
});

// ===== 6. HMAC-OFF 自述: 降级为 info, 但不许删 =====

test('v1.16.0: HMAC-OFF 那条从 WARN 降为 info (既定姿态非漏配), 且必须保留"为什么"', () => {
  const src = fs.readFileSync(join(ROOT, 'src/config.ts'), 'utf8');
  const i = src.indexOf('HMAC 验签 OFF');
  assert.ok(i > 0, '这条自述不许直接删掉 —— 部署者仍需知道"当前 webhook 不验签"这个风险姿态');
  // 取该语句本身: 它前面最近的 log.* 调用就是它自己的级别
  const lastLog = src.slice(0, i).lastIndexOf('log.');
  assert.ok(lastLog > 0, '找不到该语句的 log.* 调用');
  assert.match(
    src.slice(lastLog, i),
    /^log\.info\(/,
    '必须降为 info —— 每启动一次就 WARN = 长期狼来了, 真漏配会被这条噪声淹没',
  );
  assert.match(
    src.slice(i, i + 300),
    /vendor 不发签名|全量 401/,
    '必须带上"为什么不能开" (否则下一个人会以为这是个待修的漏配, 去把 env 配上 ⇒ 入站全量 401)',
  );
});
