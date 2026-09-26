/**
 * 脱敏链回归测试 (2026-09-26 公开仓脱敏加固)
 *
 * 原则:
 * - 全部在 /tmp 用**临时规则文件**驱动 (真实规则 ~/.openclaw/wpp-sanitize.rules 是 dev-only 且含真实敏感串,
 *   测试绝不读它、更不把它写进本文件 ⇒ 本文件可安全发布)。
 * - 只测"机制"不测"某条具体规则": 替换 / 拦截 / 前后视断言不误伤 / 无自匹配死循环 / 规则缺失拒绝工作。
 * - 外加一条静态断言: 发布链脚本里不得再内联敏感串 (2026-09-26 泄漏的成因)。
 */
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const ROOT = path.resolve(new URL('../../', import.meta.url).pathname);
const SANITIZER = path.join(ROOT, 'tools', 'sanitize-source.sh');

// 假规则: 一条字面量 + 一条手机号(前后视) + 一条群ID + 一条只查不改
const RULE_LINES = [
  'FAKE_USER\tUSER_PLACEHOLDER',
  'FAKEVENDOR.example\tWPP_VENDOR_HOST.example.com',
  '(?<![0-9])1[3-9][0-9]{9}(?![0-9])\t1XXXXXXXXXX',
  '(?<![0-9])[0-9]{10,12}@chatroom\t123456789@chatroom',
  '@scan\tDEADBEEFSEKRIT\tREDACTED',
];

function fixture(ruleLines = RULE_LINES) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpp-sanitize-'));
  const rules = path.join(dir, 'rules.txt');
  fs.writeFileSync(rules, ruleLines.join('\n') + '\n');
  const tree = path.join(dir, 'tree');
  fs.mkdirSync(tree);
  return { dir, rules, tree, env: { ...process.env, WPP_SANITIZE_RULES: rules } };
}

/** 跑执行器, 返回 {code, out} (不抛; 执行器的进度/报错都走 stderr ⇒ 两股都要收) */
function run(args, env, extraEnv = {}) {
  const r = spawnSync('bash', [SANITIZER, ...args], {
    encoding: 'utf-8', env: { ...env, ...extraEnv },
  });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

test('apply: 按规则替换, check 随后 0 命中; 无关内容保持不变', () => {
  const { tree, env } = fixture();
  fs.writeFileSync(path.join(tree, 'a.json'), JSON.stringify({
    user: 'FAKE_USER', self: 'wxid_fake_1', host: 'https://FAKEVENDOR.example/api',
    note: 'keep me', n: 42,
  }, null, 2));
  assert.strictEqual(run(['--check', tree], env).code, 1, '脏树必须先被门拦下');
  const ap = run(['--apply', tree], env);
  assert.strictEqual(ap.code, 0);
  assert.match(ap.out, /1 文件被改写/);
  const body = fs.readFileSync(path.join(tree, 'a.json'), 'utf-8');
  assert.ok(body.includes('USER_PLACEHOLDER') && body.includes('WPP_VENDOR_HOST.example.com'));
  assert.ok(!body.includes('FAKE_USER') && !body.includes('FAKEVENDOR.example'));
  assert.ok(body.includes('keep me') && body.includes('"n": 42'));
  assert.strictEqual(run(['--check', tree], env).code, 0, '脱敏后必须过门');
});

test('check: 报出命中文件名 (可定位), 空目录/干净目录 exit 0', () => {
  const { tree, env } = fixture();
  fs.mkdirSync(path.join(tree, 'sub'));
  fs.writeFileSync(path.join(tree, 'sub', 'dirty.ts'), 'const u = "FAKE_USER";\n');
  fs.writeFileSync(path.join(tree, 'clean.md'), '# nothing here\n');
  const r = run(['--check', tree], env);
  assert.strictEqual(r.code, 1);
  assert.ok(r.out.includes('dirty.ts'), '必须指出是哪个文件');
  assert.ok(!r.out.includes('clean.md'));
});

test('前后视断言: 长数字 ID / hex 里的片段不得被误伤, 独立手机号才替换', () => {
  const { tree, env } = fixture();
  const src = [
    'const MAX = 9007199254740992;',                  // 内含 11 位片段, 两侧都是数字 ⇒ 不动
    'msg_id: 1861234567890123456',                    // 同理
    'const fileNo = "305f020100044b304902010002041f02010";',
    '手机号: 1XXXXXXXXXX 请回电',                       // 独立 ⇒ 替换
  ].join('\n');
  fs.writeFileSync(path.join(tree, 'x.ts'), src + '\n');
  assert.strictEqual(run(['--apply', tree], env).code, 0);
  const body = fs.readFileSync(path.join(tree, 'x.ts'), 'utf-8');
  assert.ok(body.includes('9007199254740992'), 'MAX_SAFE_INTEGER 不能被改');
  assert.ok(body.includes('1861234567890123456'), '16 位 msg_id 不能被改');
  assert.ok(body.includes('305f020100044b304902010002041f02010'), 'hex blob 不能被改');
  assert.ok(body.includes('1XXXXXXXXXX'), '独立手机号必须替换');
  assert.ok(!body.includes('1XXXXXXXXXX'));
});

test('群 ID 兜底规则不自我匹配 (幂等, 无死循环)', () => {
  const { tree, env } = fixture();
  fs.writeFileSync(path.join(tree, 'g.json'), '{"g":["333333333@chatroom","123456789@chatroom"]}\n');
  run(['--apply', tree], env);
  const once = fs.readFileSync(path.join(tree, 'g.json'), 'utf-8');
  assert.ok(once.includes('123456789@chatroom') && !once.includes('333333333'));
  run(['--apply', tree], env);                        // 再跑一遍
  assert.strictEqual(fs.readFileSync(path.join(tree, 'g.json'), 'utf-8'), once, 'apply 必须幂等');
  assert.strictEqual(run(['--check', tree], env).code, 0, '替换结果不得再命中规则 (否则门永远红)');
});

test('@scan 只查不改 (apply 不动它, check 拦下它)', () => {
  const { tree, env } = fixture();
  const f = path.join(tree, 's.sh');
  fs.writeFileSync(f, 'PERSONAL="DEADBEEFSEKRIT"\n');
  run(['--apply', tree], env);
  assert.ok(fs.readFileSync(f, 'utf-8').includes('DEADBEEFSEKRIT'), '只查的串不该被 apply 改写');
  const r = run(['--check', tree], env);
  assert.strictEqual(r.code, 1, '但必须被门拦下 (宁可挡住发布)');
});

test('规则文件缺失 ⇒ 拒绝工作 (绝不跳过脱敏继续发)', () => {
  const { tree, env } = fixture();
  const r = run(['--check', tree], { ...env, WPP_SANITIZE_RULES: path.join(tree, 'nope.txt') });
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /规则文件不存在/);
  const r2 = run(['--apply', tree], { ...env, WPP_SANITIZE_RULES: path.join(tree, 'nope.txt') });
  assert.strictEqual(r2.code, 1);
});

test('emit-filter-repo: 输出 regex:<键>==><值>, 含 @scan 的改写串', () => {
  const { tree, env } = fixture();
  const out = path.join(tree, 'fr.txt');
  const r = run(['--emit-filter-repo', out], env);
  assert.strictEqual(r.code, 0);
  const lines = fs.readFileSync(out, 'utf-8').trim().split('\n');
  assert.strictEqual(lines.length, RULE_LINES.length);
  assert.ok(lines[0].startsWith('regex:FAKE_USER==>USER_PLACEHOLDER'));
  assert.ok(lines.some((l) => l.startsWith('regex:DEADBEEFSEKRIT==>REDACTED')));
  assert.strictEqual(fs.statSync(out).mode & 0o777, 0o600, '含敏感串的中间产物必须 0600');
});

test('发布链脚本不得内联脱敏串 (2026-09-26 泄漏成因: 规则外置, 脚本只调执行器)', () => {
  for (const name of ['build-release.sh', 'sync-github.sh']) {
    const src = fs.readFileSync(path.join(ROOT, name), 'utf-8');
    assert.doesNotMatch(src, /^\s*PERSONAL=/m, `${name} 不得再内联 PERSONAL 正则`);
    assert.doesNotMatch(src, /\bsanitize_file\b/, `${name} 不得再自带 sanitize_file 实现`);
    assert.match(src, /sanitize-source\.sh/, `${name} 必须调用 tools/sanitize-source.sh`);
  }
});

test('提交元数据门: 作者邮箱命中规则被拦下, 干净提交放行 (文件内容门看不见元数据)', () => {
  const { dir, env } = fixture(['boss@personal.example\tboss@noreply.example']);
  const repo = path.join(dir, 'repo');
  const git = (...a) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf-8' });
  fs.mkdirSync(repo);
  git('init', '-q');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'content with no secret\n');
  const gateScript = path.join(ROOT, 'tools', 'check-commit-metadata.sh');
  const runGate = () => {
    const r = spawnSync('bash', [gateScript, repo, 'HEAD'], { encoding: 'utf-8', env });
    return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  };

  // 干净身份 ⇒ 放行
  git('config', 'user.name', 'tester');
  git('config', 'user.email', 'tester@example.com');
  git('add', '-A'); git('commit', '-qm', 'clean commit');
  assert.strictEqual(runGate().code, 0, '干净提交必须放行');

  // 换成个人 gmail 作者 ⇒ 必须拦下 (2026-09-26 二次事故的复现)
  git('config', 'user.email', 'boss@personal.example');
  fs.appendFileSync(path.join(repo, 'a.txt'), 'more\n');
  git('add', '-A'); git('commit', '-qm', 'leaky author');
  const bad = runGate();
  assert.strictEqual(bad.code, 1, '个人 gmail 作者必须被拦下');
  assert.match(bad.out, /boss@personal\.example/, '报错必须指出是哪个身份');

  // 规则文件缺失 ⇒ 同样拒绝 (绝不静默放过元数据)
  const noRules = spawnSync('bash', [gateScript, repo, 'HEAD'], {
    encoding: 'utf-8', env: { ...env, WPP_SANITIZE_RULES: path.join(dir, 'nope.txt') },
  });
  assert.strictEqual(noRules.status ?? 1, 1, '规则缺失时必须拒绝');
});

test('真实规则文件不在仓内, 且在仓外时权限为 0600 (dev 侧)', () => {
  const real = process.env.WPP_SANITIZE_RULES || path.join(os.homedir(), '.openclaw', 'wpp-sanitize.rules');
  assert.ok(!real.startsWith(ROOT), '真实规则文件绝不能放进仓库');
  if (fs.existsSync(real)) {
    assert.strictEqual(fs.statSync(real).mode & 0o777, 0o600, '真实规则文件必须 0600');
  }
});
