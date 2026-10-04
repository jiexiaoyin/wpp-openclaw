/**
 * v1.14.0 env 改名 (2026-10-04): DEEPSEEK_BASE_URL / DEEPSEEK_API_KEY → JUDGE_BASE_URL / JUDGE_API_KEY
 *
 * 老板拍板: 「1 改名处理, 2 阿里的那个不能使用 deepseek*」。
 * 起因 (v1.12.0 的历史遗留 + 同一个名字三个消费者):
 *   ① 插件 judge 主端点 —— 设计如此、正确 (它自 v1.12.0 起打的就是阿里云 token-plan);
 *   ② openclaw 框架 `models.providers.deepseek` 的 env 兜底 —— 读到同名 key, 把**阿里 key**
 *      POST 到 api.deepseek.com ⇒ 一天 62 条 `Your api key: ****… is invalid`;
 *   ③ TS 插件 llmIntent (`resolveIntentLlmApiKey`) —— 读到同名 key, 打到硬编码的 MiniMax ⇒ 401。
 * ⇒ 名字指向 deepseek, 值却是阿里云套餐凭证; 只要还叫这个名字, ②③ 那两条路就永远开着。
 *
 * 本文件钉的是**改名之后旧名必须彻底死掉** —— 这不是"顺便清理", 而是这项工作唯一的价值所在:
 * 留一个兼容别名 (哪怕只在一条路上) = 撞名那条路原样继续开着。所以判据一律用**反向**:
 * 「只设旧名 ⇒ 拿不到凭证 / 进不了白名单」, 而不是「设了新名能拿到」。
 * (正向判据在 judge-endpoint-v1120 / judge-fallback-v1130 里, 那两个文件的 env 名已同步改名。)
 */
import assert from 'node:assert';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));
const {
  resolveJudgeCreds,
  resolveJudgeBaseUrl,
  JUDGE_MAIN_VARS,
  LEGACY_JUDGE_VARS,
  lingeringLegacyJudgeVars,
  DEFAULT_JUDGE_ENDPOINTS,
} = await import(new URL('../../dist/llm-judge.js', import.meta.url).href);
const { isHostAllowed, JUDGE_BASE_URL_ENV, JUDGE_FALLBACK_BASE_URL_ENV } =
  await import(new URL('../../dist/util/safe-fetch.js', import.meta.url).href);

const NEW_BASE = 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';
/** 一个"看起来就很 deepseek"的端点 —— 旧名若还活着, 它就是最可能被旧名带进白名单的那个 */
const LEGACY_BASE = 'https://legacy-not-allowed.example.com/v1';

/** 临时设 env + 还原 (env 是全局状态, 必须 try/finally); v === undefined ⇒ delete */
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

/** 干净的环境: 四个相关 env 全清 (新名 / 旧名 / minimax / 兜底端点) */
const CLEAN = {
  JUDGE_API_KEY: undefined,
  JUDGE_BASE_URL: undefined,
  DEEPSEEK_API_KEY: undefined,
  DEEPSEEK_BASE_URL: undefined,
  MINIMAX_API_KEY: undefined,
  JUDGE_FALLBACK_API_KEY: undefined,
};

// ===== 1. 名字本身 =====

test('v1.14.0: JUDGE_MAIN_VARS 就是新名, 且 baseUrl 与 safe-fetch 那个"单旋钮"常量同源', () => {
  assert.strictEqual(JUDGE_MAIN_VARS.apiKey, 'JUDGE_API_KEY');
  assert.strictEqual(JUDGE_MAIN_VARS.baseUrl, 'JUDGE_BASE_URL');
  // ★ 这一条是 v1.12.0 那条"单旋钮"契约在改名后的续存判据:
  //   baseUrl 名字必须**就是** safe-fetch 解析进 SSRF 白名单的那个常量 (不是另一个碰巧同名的字符串)
  assert.strictEqual(JUDGE_MAIN_VARS.baseUrl, JUDGE_BASE_URL_ENV);
  assert.notStrictEqual(JUDGE_MAIN_VARS.baseUrl, JUDGE_FALLBACK_BASE_URL_ENV);
});

test('v1.14.0: LEGACY_JUDGE_VARS 恰好是那两个旧名 (不许多、不许少)', () => {
  assert.deepStrictEqual([...LEGACY_JUDGE_VARS].sort(), ['DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL']);
});

// ===== 2. ★ 反向: 旧名不再是凭证 (本文件的核心) =====

test('v1.14.0 ★ 只设旧 DEEPSEEK_API_KEY ⇒ 拿不到主端点凭证 (旧名不再是凭证, 一个字节都不读)', () => {
  withEnvs({ ...CLEAN, DEEPSEEK_API_KEY: 'sk-REDACTED' }, () => {
    const c = resolveJudgeCreds();
    // 落 minimax 分支 (无 minimax key ⇒ apiKey 空 ⇒ 上层会 WARNING "missing judge API key")
    assert.strictEqual(c.apiKey, '', '旧名里的 key 一个字都不许被当成凭证');
    assert.strictEqual(c.format, 'anthropic');
    assert.strictEqual(c.baseUrl, DEFAULT_JUDGE_ENDPOINTS.minimax);
  });
});

test('v1.14.0 ★ 旧名 + 真 minimax key ⇒ 只能走 minimax (旧名连"第二顺位"都不是)', () => {
  withEnvs(
    { ...CLEAN, DEEPSEEK_API_KEY: 'sk-REDACTED', MINIMAX_API_KEY: 'mm-real' },
    () => {
      const c = resolveJudgeCreds();
      assert.strictEqual(c.apiKey, 'mm-real');
      assert.strictEqual(c.format, 'anthropic', '旧名的存在不许把链路掰回 openai 分支');
    },
  );
});

test('v1.14.0 ★ 只设旧 DEEPSEEK_BASE_URL ⇒ baseUrl 不动 (回默认), host 也进不了白名单', () => {
  withEnvs({ ...CLEAN, DEEPSEEK_BASE_URL: LEGACY_BASE }, () => {
    assert.strictEqual(resolveJudgeBaseUrl(), DEFAULT_JUDGE_ENDPOINTS.deepseek,
      '旧名不再是端点旋钮');
    // ★ 单旋钮的反面: 旧名既不动 baseUrl, 也不许把它的 host 塞进 SSRF 白名单
    assert.strictEqual(isHostAllowed(`${LEGACY_BASE}/chat/completions`), false,
      '旧名不得成为 SSRF 白名单的来源 (它已经不是 ENV_DECLARED_HOST_VARS 的一员)');
    // 对照: 同名值设在新名上 ⇒ 立刻就进白名单 (证明上面那条不是因为值本身非法而被拒)
    withEnvs({ JUDGE_BASE_URL: LEGACY_BASE }, () => {
      assert.strictEqual(isHostAllowed(`${LEGACY_BASE}/chat/completions`), true,
        '同一个值放到新名下就必须放行 —— 否则上一条判据是空转的');
    });
  });
});

// ===== 3. 正向: 新名两个旋钮都在, 且各管各的 =====

test('v1.14.0: 新名设齐 ⇒ openai 分支 + 该 host 进白名单 (改名没改掉任何能力)', () => {
  withEnvs({ ...CLEAN, JUDGE_API_KEY: 'sk-main', JUDGE_BASE_URL: NEW_BASE }, () => {
    const c = resolveJudgeCreds();
    assert.strictEqual(c.apiKey, 'sk-main');
    assert.strictEqual(c.baseUrl, NEW_BASE);
    assert.strictEqual(c.format, 'openai');
    assert.strictEqual(isHostAllowed(`${NEW_BASE}/chat/completions`), true);
  });
});

// ===== 4. 启动告警这条唯一的旧名残留通道 =====

test('v1.14.0: lingeringLegacyJudgeVars 只报"真设了的"旧名 (空白不算设)', () => {
  withEnvs(CLEAN, () => {
    assert.deepStrictEqual(lingeringLegacyJudgeVars(), []);
  });
  withEnvs({ ...CLEAN, DEEPSEEK_API_KEY: 'x' }, () => {
    assert.deepStrictEqual(lingeringLegacyJudgeVars(), ['DEEPSEEK_API_KEY']);
  });
  withEnvs({ ...CLEAN, DEEPSEEK_BASE_URL: 'https://x.example.com' }, () => {
    assert.deepStrictEqual(lingeringLegacyJudgeVars(), ['DEEPSEEK_BASE_URL']);
  });
  withEnvs({ ...CLEAN, DEEPSEEK_API_KEY: 'x', DEEPSEEK_BASE_URL: 'https://x.example.com' }, () => {
    // 顺序 = LEGACY_JUDGE_VARS 的顺序 (与声明一致, 便于日志对账)
    assert.deepStrictEqual(lingeringLegacyJudgeVars(), ['DEEPSEEK_BASE_URL', 'DEEPSEEK_API_KEY']);
  });
  withEnvs({ ...CLEAN, DEEPSEEK_API_KEY: '   ', DEEPSEEK_BASE_URL: '\n' }, () => {
    assert.deepStrictEqual(lingeringLegacyJudgeVars(), [], '空白值不许报 (否则每次启动都吵一条假警)');
  });
});

// ===== 5. dist 产物: 旧名只许出现在一处, 且不许有第二个读者 =====

/** 去掉整行/整块注释 (与 four-layer-fallback 那条"排除注释"同款做法) —— 只查代码行 */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')      // 块注释
    .replace(/(^|[^:"'`])\/\/[^\n]*/gm, '$1'); // 行注释 (不碰 https:// 与字符串里的 //)
}

/** dist 下所有 .js (跳过 .map) */
function distJsFiles(dir = DIST) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...distJsFiles(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

test('v1.14.0 ★ 全 dist 代码里, 旧名只许在 LEGACY_JUDGE_VARS 那一行 (没有第二个读者)', () => {
  const hits = new Map(); // 文件名 → 命中次数
  for (const f of distJsFiles()) {
    const code = codeOnly(fs.readFileSync(f, 'utf-8'));
    for (const name of LEGACY_JUDGE_VARS) {
      const n = code.split(name).length - 1;
      if (n > 0) hits.set(path.relative(DIST, f), (hits.get(path.relative(DIST, f)) ?? 0) + n);
    }
  }
  const llm = fs.readFileSync(`${DIST}llm-judge.js`, 'utf-8');
  assert.match(codeOnly(llm), /LEGACY_JUDGE_VARS\s*=\s*\["DEEPSEEK_BASE_URL",\s*"DEEPSEEK_API_KEY"\]/,
    '两个旧名只许作为"告警名单"的字面量存在');
  // 除 llm-judge.js 之外, 任何文件都不许在代码里提到旧名 (提到 = 有人把兼容别名加回来了)
  for (const [file, n] of hits) {
    if (file === 'llm-judge.js') {
      assert.strictEqual(n, 2, `llm-judge.js 里旧名只许出现 2 次 (名单里各一次), 实际 ${n}`);
      continue;
    }
    assert.fail(`${file} 的代码里出现了旧 env 名 —— 旧名必须彻底死掉 (命中 ${n} 次)`);
  }
  assert.ok(hits.has('llm-judge.js'), 'llm-judge.js 必须仍持有那份告警名单');
});

test('v1.14.0 ★ lingeringLegacyJudgeVars 只有启动告警一个调用方 (定义处 + index.js)', () => {
  const callers = distJsFiles().filter((f) =>
    codeOnly(fs.readFileSync(f, 'utf-8')).includes('lingeringLegacyJudgeVars'),
  ).map((f) => path.relative(DIST, f)).sort();
  assert.deepStrictEqual(callers, ['index.js', 'llm-judge.js'],
    '旧名只允许被"启动时点名告警"读一次; 任何别的消费者都说明它还在当输入用');
});

test('v1.14.0: safe-fetch 的代码里没有旧名 (白名单来源只剩新名 + 兜底名)', () => {
  const sf = codeOnly(fs.readFileSync(`${DIST}util/safe-fetch.js`, 'utf-8'));
  assert.strictEqual(sf.includes('DEEPSEEK_BASE_URL'), false);
  assert.match(sf, /JUDGE_BASE_URL_ENV\s*=\s*"JUDGE_BASE_URL"/);
  assert.match(sf, /JUDGE_FALLBACK_BASE_URL_ENV\s*=\s*"JUDGE_FALLBACK_BASE_URL"/);
});

test('v1.14.0: 两处面向人的文案同步成新名 (否则现场照旧名去配 ⇒ 配了没用)', () => {
  const hf = fs.readFileSync(`${DIST}inbound/heartflow.js`, 'utf-8');
  assert.match(hf, /missing judge API key \(JUDGE_API_KEY \/ MINIMAX_API_KEY\)/);
  const idx = fs.readFileSync(`${DIST}index.js`, 'utf-8');
  assert.match(idx, /检测到已废弃的 env 名/);
  assert.match(idx, /JUDGE_MAIN_VARS\.apiKey/, '告警要告诉运维**改成什么名**, 不能只报旧名没了');
});
