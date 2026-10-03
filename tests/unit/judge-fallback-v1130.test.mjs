/**
 * v1.13.0 judge 兜底端点 (判分层二级端点) — 2026-10-03 老板拍板「心流策略保留 deepseek 作兜底」
 *
 * 形状: 主端点 (env DEEPSEEK_BASE_URL, 现为阿里云 token-plan MaaS 的 qwen3.8-flash) **任何**抛错后,
 *   callJudge 自动换 DEEPSEEK 那套 (JUDGE_FALLBACK_*) 重试一次; 兜底被用到时 WARNING 出声。
 *
 * 本测试锁五类判据 (任一去牙即 FAIL):
 *   1. 三种配置态分得开: off (三项全没设, 行为与 v1.12.0 逐字一致) / partial (缺一两项, **必须出声**,
 *      且**不重试**) / on。半配静默当没配 = 本仓反复在防的"配了却不生效"。
 *   2. 重试的**形状**: 第二次请求必须是兜底端点的 URL + 兜底 model + 兜底 key, 且
 *      images/关思考这些主端点请求的形状**一个不少** (否则兜底一路就退化成"不看图")。
 *   3. 只兜端点故障: 判分结果差 (unparseable) 由调用方处理, 不许触发重试 —— 本文件用"主端点
 *       HTTP 200 空正文"与"HTTP 500"两种端点故障都必须兜, 而"正常返回但分数不好"不在 callJudge 视野里
 *      (callJudgeInner 没有任何一处因判分结果抛错, 这条是结构性保证, 见 src 注释)。
 *   4. 出声与不漏 key: 兜底触发必须 WARNING (journald 只采 WARNING+); 合并报错与自述**绝不含** key。
 *   5. 安全面: 兜底 host 与主端点走**同一套** env 白名单 (未点名进不来 / 私网回环 metadata 一律拒),
 *      且 dist 产物里不许出现硬编码的兜底模型名与生产端点字面量。
 */
import assert from 'node:assert';
import { test } from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));
const {
  callJudge,
  resolveJudgeFallback,
  describeJudgeFallback,
  JUDGE_FALLBACK_VARS,
  resolveJudgeCreds,
} = await import(new URL('../../dist/llm-judge.js', import.meta.url).href);
const { isHostAllowed, JUDGE_BASE_URL_ENV, JUDGE_FALLBACK_BASE_URL_ENV } =
  await import(new URL('../../dist/util/safe-fetch.js', import.meta.url).href);
const { getCounter, resetAllCounters } =
  await import(new URL('../../dist/monitor/metrics.js', import.meta.url).href);

/** 主端点 (静态白名单内的 host, 与 v1.6.1 的老用例同源) */
const PRIMARY_BASE = 'https://api.deepseek.com';
const PRIMARY_KEY = 'sk-primary-fake';
/** 兜底端点: 同一个 host 的不同路径 ⇒ 请求 URL 一眼能分开, 且不必再喂一次白名单 env */
const FB_BASE = 'https://api.deepseek.com/v2';
const FB_KEY = 'sk-fallback-fake';
const FB_MODEL = 'some-deepseek-model';
/** 生产兜底端点 (阿里云侧那个假想兜底), 只用于"白名单耦合"那两条 */
const FB_HOST_NEW = 'https://fb-token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';

const PRIMARY_CREDS = { apiKey: PRIMARY_KEY, baseUrl: PRIMARY_BASE, format: 'openai' };
const JUDGE_ARGS = {
  model: 'qwen3.8-flash',
  userPrompt: '判这条要不要回',
  systemPrompt: '只回 JSON',
  maxTokens: 300,
  timeoutMs: 5000,
  creds: PRIMARY_CREDS,
};

// ===== 桩 =====

/** 临时设/删 env 并还原 (env 是全局状态; 本文件多处 await ⇒ 必须 async 版) */
async function withEnvs(vars, fn) {
  const saved = new Map();
  for (const [k, v] of Object.entries(vars)) {
    saved.set(k, [Object.prototype.hasOwnProperty.call(process.env, k), process.env[k]]);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, [had, orig]] of saved) {
      if (had) process.env[k] = orig;
      else delete process.env[k];
    }
  }
}

/** 兜底三项 env 一次设好 (值传 undefined 即"没设") */
function withFallback({ baseUrl, apiKey, model }, fn) {
  return withEnvs(
    {
      [JUDGE_FALLBACK_VARS.baseUrl]: baseUrl,
      [JUDGE_FALLBACK_VARS.apiKey]: apiKey,
      [JUDGE_FALLBACK_VARS.model]: model,
    },
    fn,
  );
}

/** 三种全 Env 都没配 (基线路径) */
function withNoFallback(fn) {
  return withFallback({ baseUrl: undefined, apiKey: undefined, model: undefined }, fn);
}

/**
 * 桩 fetch: 记录每次 {url, body, auth}, 由 handler 决定回什么 (或抛)。
 * 每次调用记一条 ⇒ "重试了几次" 直接数 calls.length。
 */
async function withStubbedFetch(handler, fn) {
  const orig = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const call = {
      url: String(url),
      body: JSON.parse(init.body),
      auth: init.headers?.authorization ?? init.headers?.Authorization,
    };
    calls.push(call);
    return handler(call, calls.length - 1);
  };
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = orig;
  }
}

const ok200 = (content) => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content }, finish_reason: 'stop' }] }),
});
const http500 = () => ({ ok: false, status: 500, text: async () => 'upstream boom' });
/** HTTP 200 但正文空 = 端点故障 (v1.6.1 那条"空正文必须显式报错") */
const ok200Empty = () => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: '' }, finish_reason: 'length' }] }),
});

/** 抓 console.warn 的行 (logger 的 WARN 走 console.warn) */
async function withCapturedWarn(fn) {
  const orig = console.warn;
  const lines = [];
  console.warn = (...args) => {
    lines.push(args.map((a) => String(a)).join(' '));
  };
  try {
    return await fn(lines);
  } finally {
    console.warn = orig;
  }
}

// ===== 1. 三种配置态 =====

test('v1.13.0: 三项 env 全没设 → off (行为与 v1.12.0 逐字一致: 原异常原样抛, 不重试)', async () => {
  await withNoFallback(async () => {
    assert.strictEqual(resolveJudgeFallback().kind, 'off');
    assert.strictEqual(describeJudgeFallback(), 'none', '自述必须是 none (启动日志一眼看出没配兜底)');
    await withStubbedFetch(http500, async (calls) => {
      await assert.rejects(
        () => callJudge(JUDGE_ARGS),
        (e) => {
          assert.match(e.message, /HTTP 500/, '必须是主端点自己的异常, 不许被包成合并报错');
          return true;
        },
      );
      assert.strictEqual(calls.length, 1, 'off 时不许重试 (一次调用只打一次端点)');
      assert.match(calls[0].url, /^https:\/\/api\.deepseek\.com\/chat\/completions$/);
    });
  });
});

test('v1.13.0 ★ 半配 (缺 model) → partial: 明确报出缺哪一项, 且**不重试**', async () => {
  await withFallback({ baseUrl: FB_BASE, apiKey: FB_KEY, model: undefined }, async () => {
    const st = resolveJudgeFallback();
    assert.strictEqual(st.kind, 'partial');
    assert.deepStrictEqual(st.missing, [JUDGE_FALLBACK_VARS.model]);
    const desc = describeJudgeFallback();
    assert.match(desc, /MISCONFIGURED/);
    assert.match(desc, /JUDGE_FALLBACK_MODEL/, '自述必须点名缺的是哪一个 env (否则运维只能靠猜)');
    assert.doesNotMatch(desc, new RegExp(FB_KEY), '自述绝不含 key');
    // 半配 = 未启用 ⇒ 与 off 同路
    await withStubbedFetch(http500, async (calls) => {
      await assert.rejects(() => callJudge(JUDGE_ARGS), /HTTP 500/);
      assert.strictEqual(calls.length, 1, '半配不许偷偷重试(那等于用一个模型名都没定的端点)');
    });
  });
});

test('v1.13.0: 半配 (只设 key, 缺 baseUrl+model) → partial 且列出两项', async () => {
  await withFallback({ baseUrl: undefined, apiKey: FB_KEY, model: undefined }, async () => {
    const st = resolveJudgeFallback();
    assert.strictEqual(st.kind, 'partial');
    assert.deepStrictEqual(st.missing, [JUDGE_FALLBACK_VARS.baseUrl, JUDGE_FALLBACK_VARS.model]);
  });
});

test('v1.13.0: 三项齐 → on; 自述含端点与模型名、不含 key; 尾斜杠归一化', async () => {
  await withFallback({ baseUrl: `${FB_BASE}/`, apiKey: FB_KEY, model: FB_MODEL }, async () => {
    const st = resolveJudgeFallback();
    assert.strictEqual(st.kind, 'on');
    assert.strictEqual(st.creds.baseUrl, FB_BASE, '尾斜杠必须去掉 (否则拼出 //chat/completions)');
    assert.strictEqual(st.creds.format, 'openai', '兜底点既是 DeepSeek 系 ⇒ 恒 openai 格式');
    assert.strictEqual(st.model, FB_MODEL);
    const desc = describeJudgeFallback();
    assert.match(desc, /^openai https:\/\/api\.deepseek\.com\/v2 key=set /);
    assert.match(desc, new RegExp(`model=${FB_MODEL}`));
    assert.doesNotMatch(desc, new RegExp(FB_KEY), '自述绝不含 key');
  });
});

test('v1.13.0: env 名与 safe-fetch 白名单常量同源 (同一个字符串常量, 不许各写一份)', () => {
  assert.strictEqual(JUDGE_FALLBACK_VARS.baseUrl, JUDGE_FALLBACK_BASE_URL_ENV);
  assert.strictEqual(JUDGE_FALLBACK_BASE_URL_ENV, 'JUDGE_FALLBACK_BASE_URL');
  assert.notStrictEqual(JUDGE_FALLBACK_BASE_URL_ENV, JUDGE_BASE_URL_ENV, '兜底与主端点必须是两个独立旋钮');
});

// ===== 2. 重试的形状 =====

test('v1.13.0 ★ 主端点 HTTP 500 → 兜底重试一次, 第二次请求用的是兜底端点/模型/密钥', async () => {
  await withFallback({ baseUrl: FB_BASE, apiKey: FB_KEY, model: FB_MODEL }, async () => {
    const out = await withStubbedFetch((call, i) => (i === 0 ? http500() : ok200('{"reply":true}')), async (calls) => {
      const text = await callJudge(JUDGE_ARGS);
      assert.strictEqual(calls.length, 2, '恰好重试一次');
      const [p, f] = calls;
      assert.match(p.url, /^https:\/\/api\.deepseek\.com\/chat\/completions$/, '第一次打主端点');
      assert.strictEqual(p.body.model, 'qwen3.8-flash');
      assert.strictEqual(p.auth, `Bearer ${PRIMARY_KEY}`);
      assert.match(f.url, /^https:\/\/api\.deepseek\.com\/v2\/chat\/completions$/, '第二次打兜底端点');
      assert.strictEqual(f.body.model, FB_MODEL, '模型名必须一起换 (model 与端点是一对)');
      assert.strictEqual(f.auth, `Bearer ${FB_KEY}`, '密钥必须一起换');
      return text;
    });
    assert.strictEqual(out, '{"reply":true}', '返回值来自兜底端点');
  });
});

test('v1.13.0 ★ 兜底请求保留主端点的形状 (看图 images / 关思考 / system / max_tokens)', async () => {
  await withFallback({ baseUrl: FB_BASE, apiKey: FB_KEY, model: FB_MODEL }, async () => {
    await withStubbedFetch((call, i) => (i === 0 ? http500() : ok200('ok')), async (calls) => {
      await callJudge({ ...JUDGE_ARGS, images: ['https://openclaw-a.oss-cn-hangzhou.aliyuncs.com/x/y.jpg'] });
      const f = calls[1];
      assert.strictEqual(f.body.temperature, 0);
      assert.strictEqual(f.body.max_tokens, 300);
      assert.deepStrictEqual(f.body.thinking, { type: 'disabled' }, 'v1.6.1 关思考必须一起带过去 (否则兜底一路易返空正文)');
      assert.strictEqual(f.body.messages[0].role, 'system');
      assert.strictEqual(f.body.messages[0].content, '只回 JSON');
      const parts = f.body.messages[1].content;
      assert.ok(Array.isArray(parts), 'v1.11.0 看图: 有图时必须是内容块数组');
      assert.strictEqual(parts[0].type, 'text');
      assert.strictEqual(parts[1].type, 'image_url');
      assert.strictEqual(parts[1].image_url.url, 'https://openclaw-a.oss-cn-hangzhou.aliyuncs.com/x/y.jpg');
    });
  });
});

test('v1.13.0: 网络层抛错 (fetch 直接 throw) 也算端点故障 ⇒ 同样兜底', async () => {
  await withFallback({ baseUrl: FB_BASE, apiKey: FB_KEY, model: FB_MODEL }, async () => {
    await withStubbedFetch((call, i) => {
      if (i === 0) throw new Error('fetch failed: ECONNRESET');
      return ok200('rescued');
    }, async (calls) => {
      assert.strictEqual(await callJudge(JUDGE_ARGS), 'rescued');
      assert.strictEqual(calls.length, 2);
    });
  });
});

test('v1.13.0: 空正文 (HTTP 200) 也是端点故障 ⇒ 兜底 (v1.6.1 那条静默瘫的病根)', async () => {
  await withFallback({ baseUrl: FB_BASE, apiKey: FB_KEY, model: FB_MODEL }, async () => {
    await withStubbedFetch((call, i) => (i === 0 ? ok200Empty() : ok200('{"reply":false}')), async (calls) => {
      assert.strictEqual(await callJudge(JUDGE_ARGS), '{"reply":false}');
      assert.strictEqual(calls.length, 2);
    });
  });
});

test('v1.13.0: 主端点成功 ⇒ 一次都不重试 (兜底只在主端点坏了时才花一次调用)', async () => {
  await withFallback({ baseUrl: FB_BASE, apiKey: FB_KEY, model: FB_MODEL }, async () => {
    await withStubbedFetch(() => ok200('{"reply":true}'), async (calls) => {
      assert.strictEqual(await callJudge(JUDGE_ARGS), '{"reply":true}');
      assert.strictEqual(calls.length, 1);
    });
  });
});

// ===== 3. 两段都失败 =====

test('v1.13.0 ★ 两段都失败 ⇒ 合并报错同时点名两个端点, 且不含任何 key', async () => {
  await withFallback({ baseUrl: FB_BASE, apiKey: FB_KEY, model: FB_MODEL }, async () => {
    await withStubbedFetch(() => http500(), async (calls) => {
      await assert.rejects(
        () => callJudge(JUDGE_ARGS),
        (e) => {
          assert.match(e.message, /主端点与兜底端点均失败/);
          assert.match(e.message, /primary\(openai https:\/\/api\.deepseek\.com key=set\)/);
          assert.match(e.message, new RegExp(`fallback\\(openai https://api\\.deepseek\\.com/v2 key=set model=${FB_MODEL}\\)`));
          assert.match(e.message, /HTTP 500/, '两段的病因都要在');
          assert.doesNotMatch(e.message, new RegExp(PRIMARY_KEY), '合并报错绝不许带出主端点 key');
          assert.doesNotMatch(e.message, new RegExp(FB_KEY), '合并报错绝不许带出兜底 key');
          assert.doesNotMatch(e.message, /\n\s+at /, '不许把堆栈塞进这条 (它要经 heartflow 的 warn 落成一行)');
          return true;
        },
      );
      assert.strictEqual(calls.length, 2, '兜底只重试一次, 不递归 (否则两段都坏时会打成死循环)');
    });
  });
});

// ===== 4. 出声 =====

test('v1.13.0 ★ 兜底被用到必须 WARNING 出声 (且只报端点/模型, 不报 key)', async () => {
  await withFallback({ baseUrl: FB_BASE, apiKey: FB_KEY, model: FB_MODEL }, async () => {
    await withCapturedWarn(async (lines) => {
      await withStubbedFetch((call, i) => (i === 0 ? http500() : ok200('ok')), async () => {
        await callJudge(JUDGE_ARGS);
      });
      const hit = lines.filter((l) => l.includes('WPP JUDGE'));
      assert.strictEqual(hit.length, 1, `兜底触发必须恰好一条 WARNING, 实得 ${hit.length}: ${lines.join(' | ')}`);
      assert.match(hit[0], /WARN/, '级别必须是 WARN (journald 只采 WARNING+)');
      assert.match(hit[0], /转兜底端点重试/);
      assert.match(hit[0], /api\.deepseek\.com\/v2/, '要点出兜底端点是哪个');
      assert.match(hit[0], new RegExp(`model=${FB_MODEL}`));
      assert.match(hit[0], /HTTP 500/, '主端点的病因要在 WARNING 里 (否则只看到"转兜底了"不知道为什么)');
      assert.doesNotMatch(hit[0], new RegExp(PRIMARY_KEY), 'WARNING 不许带出 key');
      assert.doesNotMatch(hit[0], new RegExp(FB_KEY), 'WARNING 不许带出 key');
    });
  });
});

test('v1.13.0: 兜底未配 (off) 时主端点失败**不**发兜底 WARNING (免噪声把真信号淹掉)', async () => {
  await withNoFallback(async () => {
    await withCapturedWarn(async (lines) => {
      await withStubbedFetch(http500, async () => {
        await assert.rejects(() => callJudge(JUDGE_ARGS));
      });
      assert.strictEqual(lines.filter((l) => l.includes('WPP JUDGE')).length, 0);
    });
  });
});

// ===== 5. 指标 (兜底到底有没有用, 只有计数器回答得了) =====

test('v1.13.0: 兜底救回来 ⇒ failures 不涨, fallback/fallback_ok 各 +1', async () => {
  resetAllCounters();
  await withFallback({ baseUrl: FB_BASE, apiKey: FB_KEY, model: FB_MODEL }, async () => {
    await withStubbedFetch((call, i) => (i === 0 ? http500() : ok200('ok')), async () => {
      await callJudge(JUDGE_ARGS);
    });
  });
  assert.strictEqual(getCounter('judge_calls_total'), 1);
  assert.strictEqual(getCounter('judge_fallback_total'), 1, '兜底被启用了一次');
  assert.strictEqual(getCounter('judge_fallback_ok_total'), 1, '兜底救回一次');
  assert.strictEqual(getCounter('judge_failures_total'), 0, 'v1.13.0 语义: 救回来的那次不算失败');
});

test('v1.13.0: 两段都失败 ⇒ failures +1, fallback_ok 不涨', async () => {
  resetAllCounters();
  await withFallback({ baseUrl: FB_BASE, apiKey: FB_KEY, model: FB_MODEL }, async () => {
    await withStubbedFetch(() => http500(), async () => {
      await assert.rejects(() => callJudge(JUDGE_ARGS));
    });
  });
  assert.strictEqual(getCounter('judge_fallback_total'), 1);
  assert.strictEqual(getCounter('judge_fallback_ok_total'), 0);
  assert.strictEqual(getCounter('judge_failures_total'), 1);
});

test('v1.13.0: 兜底未配时的失败计数与旧版逐字一致 (off 路径零行为差异)', async () => {
  resetAllCounters();
  await withNoFallback(async () => {
    await withStubbedFetch(http500, async () => {
      await assert.rejects(() => callJudge(JUDGE_ARGS));
    });
  });
  assert.strictEqual(getCounter('judge_failures_total'), 1);
  assert.strictEqual(getCounter('judge_fallback_total'), 0);
});

// ===== 6. 安全面: 兜底 host 与主端点同一套 env 白名单 =====

test('v1.13.0 ★ 白名单同源: 兜底 env 点名的 host 必须同时被 safeFetch 放行', async () => {
  await withEnvs({ [JUDGE_FALLBACK_BASE_URL_ENV]: FB_HOST_NEW }, async () => {
    const st = resolveJudgeFallback();
    assert.strictEqual(st.kind, 'partial', '只设 baseUrl ⇒ 半配, 但白名单那半仍须生效');
    // 行为面自证: 真正要打的 URL 必须放行 (否则兜底一启用就抛 host not in whitelist ⇒ 静默失效)
    assert.ok(
      isHostAllowed(`${FB_HOST_NEW}/chat/completions`),
      '兜底端点真正要打的 URL 必须被放行 —— 少这一条 = 兜底从未生效过',
    );
  });
});

test('v1.13.0 ★ 反向: 兜底 env 没点名时该 host 进不来 (证明确实是 env 放它进来的)', async () => {
  await withFallback({ baseUrl: undefined, apiKey: undefined, model: undefined }, async () => {
    assert.strictEqual(isHostAllowed(FB_HOST_NEW), false);
    assert.strictEqual(isHostAllowed(`${FB_HOST_NEW}/chat/completions`), false);
  });
});

test('v1.13.0 安全: 指向私网/回环/metadata 的兜底 env 不得被放行 (黑名单优先)', async () => {
  for (const bad of [
    'http://169.254.169.254/latest/meta-data',
    'http://127.0.0.1:8080/v1',
    'http://10.0.0.5/v1',
    'http://192.168.1.7:4398/v1',
    'http://localhost/v1',
  ]) {
    await withEnvs({ [JUDGE_FALLBACK_BASE_URL_ENV]: bad }, async () => {
      assert.strictEqual(isHostAllowed(bad), false, `兜底 env 不得成为 SSRF 后门: ${bad}`);
    });
  }
});

test('v1.13.0 安全: 非法兜底 env 不抛、不污染白名单 (主端点默认仍可用)', async () => {
  for (const junk of ['not-a-url', 'ftp://x.example.com/v1', 'javascript:alert(1)', '//evil.com']) {
    await withEnvs({ [JUDGE_FALLBACK_BASE_URL_ENV]: junk }, async () => {
      assert.doesNotThrow(() => resolveJudgeFallback());
      assert.ok(isHostAllowed('https://api.deepseek.com/v1'), '非法兜底 env 不得把白名单搞崩');
      assert.strictEqual(isHostAllowed('https://evil.example.com/v1'), false);
    });
  }
});

// ===== 7. 与主端点的关系 / dist 产物 =====

test('v1.13.0: 兜底端点与账号文件里的模型名互不干扰 (resolveJudgeCreds 一个字都没变)', async () => {
  await withEnvs(
    { DEEPSEEK_API_KEY: 'sk-main-test', DEEPSEEK_BASE_URL: undefined, MINIMAX_API_KEY: undefined },
    async () => {
      await withFallback({ baseUrl: FB_BASE, apiKey: FB_KEY, model: FB_MODEL }, async () => {
        const c = resolveJudgeCreds();
        assert.strictEqual(c.apiKey, 'sk-main-test', '主端点 key 仍只认 DEEPSEEK_API_KEY');
        assert.strictEqual(c.baseUrl, PRIMARY_BASE);
        assert.strictEqual(c.format, 'openai');
        // 兜底模型名不许回流到主端点 (它是兜底专用的 env, 不是账号文件的 model)
        assert.strictEqual(JUDGE_ARGS.model, 'qwen3.8-flash');
      });
    },
  );
});

test('v1.13.0: dist 产物含兜底解析/自述/两个计数器与白名单常量 (防回退)', () => {
  const judge = fs.readFileSync(`${DIST}llm-judge.js`, 'utf-8');
  const sf = fs.readFileSync(`${DIST}util/safe-fetch.js`, 'utf-8');
  const metrics = fs.readFileSync(`${DIST}monitor/metrics.js`, 'utf-8');
  const index = fs.readFileSync(`${DIST}index.js`, 'utf-8');
  assert.match(judge, /JUDGE_FALLBACK_VARS/);
  assert.match(judge, /JUDGE_FALLBACK_API_KEY/);
  assert.match(judge, /resolveJudgeFallback/);
  assert.match(judge, /describeJudgeFallback/);
  assert.match(judge, /judge_fallback_total/);
  assert.match(judge, /judge_fallback_ok_total/);
  assert.match(sf, /JUDGE_FALLBACK_BASE_URL_ENV\s*=\s*"JUDGE_FALLBACK_BASE_URL"/);
  assert.match(metrics, /judge_fallback_total/);
  assert.match(index, /fallback=\$\{describeJudgeFallback/);
  // 半配那条 WARNING 的分支也要有守卫: 启动自述之外没人再读 partial ⇒ 删掉它测试全绿
  assert.match(index, /fbState\.kind === "partial"/, '半配告警分支必须编进产物');
  assert.match(index, /兜底端点配置不完整/, '半配告警文本必须编进产物');
  // 反向: 模型名不许硬编码 (v1.4.0「消除 hardcode」), 生产端点不许烤成可执行字面量
  assert.doesNotMatch(codeOnly(judge), /deepseek-(chat|flash|reasoner)/, '兜底模型名必须来自 env, 不许硬编码');
  assert.doesNotMatch(codeOnly(judge), /token-plan/);
  assert.doesNotMatch(codeOnly(sf), /token-plan/);
});

/** 去掉整行注释 (与 judge-endpoint-v1120 那条同款做法) */
function codeOnly(src) {
  return src
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');
}
