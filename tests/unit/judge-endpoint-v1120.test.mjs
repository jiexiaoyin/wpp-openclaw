/**
 * v1.12.0 judge 端点可配 (2026-10-03)
 *
 * 背景: 老板拍板把心流判分从 deepseek-flash 切到阿里云 token-plan MaaS 的 qwen3.8-flash。
 *   换端点这一动作有两个**必须同时做**的一半:
 *     ① llm-judge 的 baseUrl (env JUDGE_BASE_URL —— v1.14.0 前叫 DEEPSEEK_BASE_URL)
 *     ② safe-fetch 的 SSRF host 白名单
 *   只做①不做② ⇒ 每条 judge 调用抛 `host not in whitelist`, 而 heartflow 把 judge 异常
 *   吞成"不回复" ⇒ 心流静默停摆 (与 2026-09-11 那次瘫 3 天同族形态)。
 *
 * 本测试锁四类判据 (任一去牙即 FAIL):
 *   1. baseUrl 来源优先级: overrides > env > 默认; 空串/空白 env 按"没设"处理; 尾斜杠去掉。
 *   2. **单旋钮耦合**: 同一个 env 值既进 baseUrl 又进白名单; env 没设时那个 host 必须**进不来**
 *      —— 这条才真正证明"两处共用同一常量", 而不是各自读了一个碰巧同名的变量。
 *   3. 安全面不退化: 指向私网/回环/metadata 的 env 值**不得**因此被放行;
 *      非法 env 值不许把白名单搞崩(不许抛)。
 *   4. 端点自述日志**绝不泄漏 key**; dist 产物里必须有那行自述与 env 常量 (防回退)。
 */
import assert from 'node:assert';
import { test } from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));
const { resolveJudgeCreds, resolveJudgeBaseUrl, describeJudgeEndpoint, DEFAULT_JUDGE_ENDPOINTS } =
  await import(new URL('../../dist/llm-judge.js', import.meta.url).href);
const { isHostAllowed, JUDGE_BASE_URL_ENV } =
  await import(new URL('../../dist/util/safe-fetch.js', import.meta.url).href);

// v1.14.0 (2026-10-04) 改名: 老板拍板「阿里的那个不能使用 deepseek*」⇒ 本常量名随源码一起换了
// (旧名 DEEPSEEK_BASE_URL 已不再被任何代码读取; 反向判据见 judge-env-rename-v1140.test.mjs)。
const ENV = 'JUDGE_BASE_URL';
/** 新端点 (阿里云 token-plan MaaS, 老板 2026-10-03 拍板) */
const NEW_BASE = 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';
const NEW_HOST = 'token-plan.cn-beijing.maas.aliyuncs.com';

/** 临时设 env + 还原 (env 是全局状态, 必须 try/finally) */
function withEnv(value, fn) {
  return withEnvs({ [ENV]: value }, fn);
}

/**
 * 同时设多个 env 并还原。
 * ⚠️ 必须连 `JUDGE_API_KEY` 一起控制: `resolveJudgeCreds` 的 openai 分支**只在有 key 时**走,
 * 没 key 就落到 minimax 分支 (baseUrl=api.minimaxi.com/anthropic) —— 测试环境里没有生产 env,
 * 不显式设 key 就会"基线路径根本没被行使"而误判 (第一版就是这么红的)。
 */
function withEnvs(vars, fn) {
  const saved = new Map();
  for (const [k, v] of Object.entries(vars)) {
    saved.set(k, [Object.prototype.hasOwnProperty.call(process.env, k), process.env[k]]);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, [had, orig]] of saved) {
      if (had) process.env[k] = orig;
      else delete process.env[k];
    }
  }
}

/** judge 完整链路 (有 key, 走 openai 分支) */
function withJudgeEnv(value, fn) {
  return withEnvs({ JUDGE_API_KEY: 'sk-test-fake', MINIMAX_API_KEY: undefined, [ENV]: value }, fn);
}

// ===== 1. baseUrl 来源优先级 =====

test('v1.12.0: 未设 env → 仍是默认 api.deepseek.com (不设 env 的行为与 v1.11.0 逐字一致)', () => {
  withJudgeEnv(undefined, () => {
    assert.strictEqual(resolveJudgeBaseUrl(), DEFAULT_JUDGE_ENDPOINTS.deepseek);
    assert.strictEqual(resolveJudgeCreds().baseUrl, 'https://api.deepseek.com');
    assert.strictEqual(resolveJudgeCreds().format, 'openai');
  });
});

test('v1.12.0: env 生效 (含 /compatible-mode/v1 路径与尾斜杠归一化)', () => {
  withJudgeEnv(NEW_BASE, () => {
    assert.strictEqual(resolveJudgeCreds().baseUrl, NEW_BASE);
    assert.strictEqual(resolveJudgeCreds().format, 'openai', '新端点走 openai 格式');
    assert.strictEqual(resolveJudgeCreds().apiKey, 'sk-test-fake', 'key 仍来自 JUDGE_API_KEY');
  });
  withJudgeEnv(`${NEW_BASE}/`, () => {
    assert.strictEqual(resolveJudgeBaseUrl(), NEW_BASE, '尾部斜杠必须去掉 (否则拼出 //chat/completions)');
  });
  withJudgeEnv(`  ${NEW_BASE}  \n`, () => {
    assert.strictEqual(resolveJudgeBaseUrl(), NEW_BASE, 'env 前后空白必须 trim');
  });
});

test('v1.12.0: 空串/纯空白 env 按"没设"处理 (回默认, 不许拼出坏 URL)', () => {
  withJudgeEnv('', () => assert.strictEqual(resolveJudgeBaseUrl(), DEFAULT_JUDGE_ENDPOINTS.deepseek));
  withJudgeEnv('   ', () => assert.strictEqual(resolveJudgeBaseUrl(), DEFAULT_JUDGE_ENDPOINTS.deepseek));
});

test('v1.12.0: 调用方 override 优先于 env (旧签名语义不变)', () => {
  withJudgeEnv(NEW_BASE, () => {
    assert.strictEqual(
      resolveJudgeCreds({ judgeBaseUrl: 'https://example.deepseek.com' }).baseUrl,
      'https://example.deepseek.com',
    );
  });
});

// ===== 2. 单旋钮耦合 (本项的核心判据: 防"改了 baseUrl 没改白名单") =====

test('v1.12.0 ★ 耦合: env 声明的 host 必须同时进白名单 (只改一半 = 心流静默停摆)', () => {
  withJudgeEnv(NEW_BASE, () => {
    // 同一份 env 值: 一边是 baseUrl, 一边是白名单 —— 而且判据下在**真实请求 URL** 上
    const creds = resolveJudgeCreds();
    assert.strictEqual(new URL(creds.baseUrl).hostname, NEW_HOST);
    assert.ok(
      isHostAllowed(`${creds.baseUrl}/chat/completions`),
      'judge 真正要打的 URL 必须被 safeFetch 放行 —— 否则每条 judge 调用都抛 host not in whitelist',
    );
  });
});

test('v1.12.0 ★ 耦合反向: env 没设时该 host 进不来 (证明确实是 env 放它进来的)', () => {
  withJudgeEnv(undefined, () => {
    assert.strictEqual(isHostAllowed(NEW_BASE), false,
      '新 host 不得被静态写死进白名单 (发布版不含私域端点 ⇒ 必须由运维的 env 指名)');
    assert.strictEqual(isHostAllowed(`${NEW_BASE}/chat/completions`), false);
  });
});

test('v1.12.0 ★ 同源: safe-fetch 导出的常量就是 llm-judge 读的那个 env 名', () => {
  assert.strictEqual(JUDGE_BASE_URL_ENV, ENV);
  // 行为面自证: 用**这个**常量名设 env, baseUrl 与白名单两边同时变
  withJudgeEnv(NEW_BASE, () => {
    assert.strictEqual(process.env[JUDGE_BASE_URL_ENV], NEW_BASE);
    assert.strictEqual(resolveJudgeBaseUrl(), NEW_BASE);
    assert.strictEqual(isHostAllowed(`${NEW_BASE}/chat/completions`), true);
  });
});

// ===== 3. 安全面不退化 =====

test('v1.12.0 安全: 指向私网/回环/metadata 的 env 值不得被放行 (黑名单优先)', () => {
  for (const bad of [
    'http://169.254.169.254/latest/meta-data',
    'http://127.0.0.1:8080/v1',
    'http://10.0.0.5/v1',
    'http://192.168.1.7:4398/v1',
    'http://localhost/v1',
  ]) {
    withEnv(bad, () => {
      assert.strictEqual(isHostAllowed(bad), false, `env 不得成为 SSRF 后门: ${bad}`);
    });
  }
});

test('v1.12.0 安全: 非法 env 值不抛且不污染白名单 (原有默认仍可用)', () => {
  for (const junk of ['not-a-url', 'ftp://x.example.com/v1', 'javascript:alert(1)', '//evil.com']) {
    withEnv(junk, () => {
      assert.doesNotThrow(() => resolveJudgeBaseUrl(), `非法 env 不许抛: ${junk}`);
      assert.ok(isHostAllowed('https://api.deepseek.com/v1'),
        '非法 env 值不得把白名单搞崩 (原有静态项照旧)');
      assert.strictEqual(isHostAllowed('https://evil.example.com/v1'), false);
    });
  }
});

test('v1.12.0 安全: 非白名单 host 仍一律拒绝 (默认拒绝语义未变)', () => {
  withJudgeEnv(NEW_BASE, () => {
    assert.strictEqual(isHostAllowed('https://random.attacker.example/v1'), false);
    assert.strictEqual(isHostAllowed('file:///etc/passwd'), false);
  });
});

// ===== 4. 端点自述 (现场核的正面证据) 与 dist 产物 =====

test('v1.12.0: describeJudgeEndpoint 只报 host/路径/key 有无 —— 绝不含 key 本身', () => {
  const creds = { apiKey: 'sk-super-secret', baseUrl: NEW_BASE, format: 'openai' };
  const line = describeJudgeEndpoint(creds);
  assert.match(line, /^openai https:\/\/token-plan\.cn-beijing\.maas\.aliyuncs\.com\/compatible-mode\/v1 /);
  assert.match(line, /key=set/);
  assert.doesNotMatch(line, /sk-super-secret/, '端点自述绝不许带出 key');
  assert.strictEqual(describeJudgeEndpoint({ ...creds, apiKey: '' }).includes('key=MISSING'), true,
    'key 缺失必须显式可见 (现场核要能一眼分清"没读到 key")');
  assert.doesNotMatch(describeJudgeEndpoint({ ...creds, baseUrl: '不是URL' }), /sk-super-secret/,
    '非法 baseUrl 分支也不许漏 key');
});

test('v1.12.0: dist 产物含 env 常量与自述 (防回退成硬编码端点)', () => {
  const judge = fs.readFileSync(`${DIST}llm-judge.js`, 'utf-8');
  const sf = fs.readFileSync(`${DIST}util/safe-fetch.js`, 'utf-8');
  assert.match(judge, /JUDGE_BASE_URL_ENV/, 'llm-judge 必须读 safe-fetch 导出的 env 常量');
  assert.match(judge, /describeJudgeEndpoint/, '启动自述必须编进产物');
  assert.match(sf, /JUDGE_BASE_URL_ENV\s*=\s*"JUDGE_BASE_URL"/, 'safe-fetch 必须导出同一个 env 名');
  assert.match(sf, /getEnvDeclaredHosts/, 'safe-fetch 必须把 env 声明的 host 解析进白名单');
  // 反向 (只查**代码**行, 注释里的举例 URL 不算 —— 否则这条会变成"注释里不许写文档"):
  //   不许把生产端点烤成可执行字面量 (发布版不含私域端点, 端点必须来自运维的 env)
  assert.doesNotMatch(codeOnly(sf), /token-plan/, 'safe-fetch 代码里不许出现生产端点字面量');
  assert.doesNotMatch(codeOnly(judge), /token-plan/, 'llm-judge 代码里不许出现生产端点字面量');
});

/** 去掉整行注释 (与 four-layer-fallback 那条"排除注释"同款做法) */
function codeOnly(src) {
  return src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
}
