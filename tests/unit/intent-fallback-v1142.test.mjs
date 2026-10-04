/**
 * v1.14.2 llmIntent 接上判分层二级端点兜底 (2026-10-04)
 *
 * 形状: 主端点 (env JUDGE_BASE_URL, 生产 = 阿里云 token-plan MaaS) 的**端点级故障** (网络异常 /
 *   非 2xx / **空正文**) 后, decideIntentWithLlm 自动换 JUDGE_FALLBACK_* 那套 (deepseek) 重试一次;
 *   兜底被用到时 WARNING 出声, 并计 intent_fallback_total / intent_fallback_ok_total。
 *
 * 本测试锁六类判据 (任一去牙即 FAIL):
 *   1. **兜底未配时行为与 v1.14.1 逐字一致**: 主端点挂了 ⇒ 只发一次请求, 返回 null (降级回规则)。
 *      新功能不许改变"没配兜底"这条基线。
 *   2. **重试的形状**: 第二次请求必须是兜底端点的 URL + 兜底 model + 兜底 key, 且提示词 /
 *      max_tokens / temperature / 关思考**一个不少** (否则兜底一路只是"换个模型问同一件事"以外的怪东西)。
 *   3. **只兜端点故障**: 空正文与非 2xx 必须兜; 而"HTTP 200 但答了句非 JSON 废话"**不许**兜
 *      (那是模型质量问题, 换端点治不好, 且会白烧一次调用)。
 *   4. **没 key 不兜**: 凭证缺失是配置问题, 是 v1.14.1 明文保留的降级路径 ⇒ 一次网络都不发,
 *      即使兜底三项齐也不许"偷偷用兜底 key 顶上"。
 *   5. 出声与不漏 key: 兜底触发必须 WARNING (journald 只采 WARNING+); 合并报错与端点自述**绝不含** key。
 *   6. dist 产物: 兜底解析/自述在 intent 产物里真实接线 (防"函数在但没接上"), 且模型名不硬编码。
 */
import assert from 'node:assert';
import { test } from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));
const { decideIntentWithLlm, resolveIntentLlmTarget } =
  await import(new URL('../../dist/dispatch/intent-llm.js', import.meta.url).href);
const { resolveJudgeFallback, JUDGE_FALLBACK_VARS } =
  await import(new URL('../../dist/llm-judge.js', import.meta.url).href);
const { getCounter, resetAllCounters } =
  await import(new URL('../../dist/monitor/metrics.js', import.meta.url).href);

/** 主端点: 阿里云 token-plan MaaS (生产现状, 与 intent-endpoint-v1141 同值) */
const ALI_BASE = 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';
const PRIMARY_KEY = 'sk-ali-fake';
/**
 * 兜底端点: 白名单里已有的 host (api.deepseek.com) 的**不同路径** ——
 * 请求 URL 一眼能分开, 且不必再为兜底单独喂一次 white-list env。
 */
const FB_BASE = 'https://api.deepseek.com/v2';
const FB_KEY = 'sk-fallback-fake';
const FB_MODEL = 'some-deepseek-model';

const INPUT = {
  triggerText: '看看这个',
  candidates: [
    { msgId: 'm1', type: 'text', text: 'hi' },
    { msgId: 'm2', type: 'file', title: '报价单.xlsx', text: '[文件] 报价单.xlsx' },
  ],
};
const OK_BODY = '{"action":"inject","relevant_ids":["m2"]}';
const OPTS = { apiKey: PRIMARY_KEY, model: 'qwen3.8-flash' };

// ===== 桩 =====

/**
 * 临时设/删 env 并还原。⚠️ 必须**等到 Promise 落地**再还原 (与 intent-endpoint-v1141 同款):
 * 用 try/finally 直接包 async fn 的话, finally 在"返回 Promise 那一刻"就跑完了,
 * 于是被 await 的正文读到的是**已还原**的 env。
 */
function withEnvs(vars, fn) {
  const saved = new Map();
  for (const [k, v] of Object.entries(vars)) {
    saved.set(k, [Object.prototype.hasOwnProperty.call(process.env, k), process.env[k]]);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const restore = () => {
    for (const [k, [had, orig]] of saved) {
      if (had) process.env[k] = orig;
      else delete process.env[k];
    }
  };
  let out;
  try {
    out = fn();
  } catch (e) {
    restore();
    throw e;
  }
  if (out && typeof out.then === 'function') return Promise.resolve(out).finally(restore);
  restore();
  return out;
}

/**
 * 主端点档 + 兜底三项.
 * ⚠️ 兜底那三项用 `in` 判定而不是 `??` —— 半配用例要的就是"显式地把某项设成 undefined(没设)",
 *   用 `??` 会被默认值悄悄补回来, 于是"半配"用例看起来像"三项齐"。
 */
function withAllEnv({ fb = {}, noFb = false } = {}, fn) {
  const pick = (key, dflt) => (noFb ? undefined : key in fb ? fb[key] : dflt);
  return withEnvs(
    {
      JUDGE_API_KEY: PRIMARY_KEY,
      JUDGE_BASE_URL: ALI_BASE,
      MINIMAX_API_KEY: undefined,
      [JUDGE_FALLBACK_VARS.baseUrl]: pick('baseUrl', FB_BASE),
      [JUDGE_FALLBACK_VARS.apiKey]: pick('apiKey', FB_KEY),
      [JUDGE_FALLBACK_VARS.model]: pick('model', FB_MODEL),
    },
    fn,
  );
}

/** 桩 fetch: 记每次 {url, body, auth}, 由 handler 决定回什么 (或抛)。calls.length = 打了几次 */
async function withStubbedFetch(handler, fn) {
  const orig = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const call = {
      url: String(url),
      body: JSON.parse(init.body),
      auth: init.headers?.authorization ?? init.headers?.Authorization,
      apiKeyHeader: init.headers?.['x-api-key'],
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
  json: async () => ({ choices: [{ message: { content } }] }),
});
const http500 = () => ({ ok: false, status: 500, text: async () => 'upstream boom' });
/** HTTP 200 但正文空 = 端点故障 (推理模型 max_tokens 被思考吃光的那种形态) */
const ok200Empty = () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '' } }] }) });

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

// ===== 1. 基线: 没配兜底 ⇒ 与 v1.14.1 逐字一致 =====

test('v1.14.2: 兜底未配 + 主端点 500 ⇒ 只发一次, 返回 null (降级回规则, 零行为变化)', async () => {
  await withAllEnv({ noFb: true }, async () => {
    assert.strictEqual(resolveJudgeFallback().kind, 'off', '前置: 兜底确实是 off');
    await withStubbedFetch(http500, async (calls) => {
      assert.strictEqual(await decideIntentWithLlm(INPUT, OPTS), null);
      assert.strictEqual(calls.length, 1, 'off 时不许重试');
      assert.strictEqual(calls[0].url, `${ALI_BASE}/chat/completions`);
    });
  });
});

test('v1.14.2: 半配 (缺 model) ⇒ 不重试 (与 judge 层同口径: 半配 = 未启用, 但要点名)', async () => {
  await withAllEnv({ fb: { model: undefined } }, async () => {
    assert.strictEqual(resolveJudgeFallback().kind, 'partial');
    await withStubbedFetch(http500, async (calls) => {
      assert.strictEqual(await decideIntentWithLlm(INPUT, OPTS), null);
      assert.strictEqual(calls.length, 1, '半配不许拿一个模型名都没定的端点去重试');
    });
  });
});

test('v1.14.2: 主端点成功 ⇒ 一次都不重试 (兜底只在主端点坏了时才花一次调用)', async () => {
  await withAllEnv({}, async () => {
    await withStubbedFetch(() => ok200(OK_BODY), async (calls) => {
      assert.deepStrictEqual(await decideIntentWithLlm(INPUT, OPTS), { action: 'inject', relevantIds: ['m2'] });
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].body.model, 'qwen3.8-flash', '主端点仍用账号 cfg 的模型名');
      assert.strictEqual(calls[0].auth, `Bearer ${PRIMARY_KEY}`);
    });
  });
});

// ===== 2. 重试的形状 =====

test('v1.14.2 ★ 主端点 500 ⇒ 兜底重试一次, 第二次用兜底端点/模型/密钥', async () => {
  await withAllEnv({}, async () => {
    await withStubbedFetch((call, i) => (i === 0 ? http500() : ok200(OK_BODY)), async (calls) => {
      const d = await decideIntentWithLlm(INPUT, OPTS);
      assert.deepStrictEqual(d, { action: 'inject', relevantIds: ['m2'] }, '返回值来自兜底端点');
      assert.strictEqual(calls.length, 2, '恰好重试一次');
      const [p, f] = calls;
      assert.strictEqual(p.url, `${ALI_BASE}/chat/completions`, '第一次打主端点 (阿里)');
      assert.ok(!p.url.includes('deepseek.com'), '主端点不许落到 deepseek');
      assert.strictEqual(f.url, `${FB_BASE}/chat/completions`, '第二次打兜底端点');
      assert.strictEqual(f.body.model, FB_MODEL, '模型名必须一起换 (model 与端点是一对)');
      assert.strictEqual(f.auth, `Bearer ${FB_KEY}`, '密钥必须一起换');
    });
  });
});

test('v1.14.2 ★ 兜底请求保留主端点的形状 (提示词 / max_tokens / temperature / 关思考)', async () => {
  await withAllEnv({}, async () => {
    await withStubbedFetch((call, i) => (i === 0 ? http500() : ok200(OK_BODY)), async (calls) => {
      await decideIntentWithLlm(INPUT, { ...OPTS, maxTokens: 321, timeoutMs: 4000 });
      const f = calls[1].body;
      assert.strictEqual(f.max_tokens, 321, 'maxTokens 必须带过去');
      assert.strictEqual(f.temperature, 0);
      assert.deepStrictEqual(f.thinking, { type: 'disabled' }, '关思考必须一起带过去 (否则兜底一路易返空正文)');
      assert.strictEqual(f.messages[0].role, 'system');
      assert.strictEqual(f.messages[1].role, 'user');
      // 提示词必须与主端点**同一份** (触发文本 + 候选都还在), 否则兜底是在问另一件事
      assert.match(f.messages[1].content, /看看这个/);
      assert.match(f.messages[1].content, /报价单\.xlsx/);
      assert.strictEqual(f.messages[1].content, calls[0].body.messages[1].content, '两次的 user prompt 逐字相同');
    });
  });
});

test('v1.14.2: 网络层抛错 (fetch 直接 throw) 也算端点故障 ⇒ 同样兜底', async () => {
  await withAllEnv({}, async () => {
    await withStubbedFetch((call, i) => {
      if (i === 0) throw new Error('fetch failed: ECONNRESET');
      return ok200(OK_BODY);
    }, async (calls) => {
      assert.deepStrictEqual(await decideIntentWithLlm(INPUT, OPTS), { action: 'inject', relevantIds: ['m2'] });
      assert.strictEqual(calls.length, 2);
    });
  });
});

test('v1.14.2 ★ 空正文 (HTTP 200) 也算端点故障 ⇒ 兜底 (改掉"静默吞成 unparseable")', async () => {
  await withAllEnv({}, async () => {
    await withStubbedFetch((call, i) => (i === 0 ? ok200Empty() : ok200(OK_BODY)), async (calls) => {
      assert.deepStrictEqual(await decideIntentWithLlm(INPUT, OPTS), { action: 'inject', relevantIds: ['m2'] });
      assert.strictEqual(calls.length, 2, '空正文必须走兜底 (旧版把它当 unparseable 静默吞掉)');
    });
  });
});

// ===== 3. 只兜端点故障 =====

test('v1.14.2 ★ 非空但坏 JSON ⇒ 返回 null 且**不重试** (模型质量问题, 换端点治不好)', async () => {
  await withAllEnv({}, async () => {
    await withStubbedFetch(() => ok200('我觉得这个问题嘛……说不好'), async (calls) => {
      assert.strictEqual(await decideIntentWithLlm(INPUT, OPTS), null);
      assert.strictEqual(calls.length, 1, '答非所问不许触发兜底 (白烧一次调用还掩盖真实问题)');
    });
  });
});

// ===== 4. 没 key =====

test('v1.14.2 ★ 没凭证 ⇒ 一次网络都不发, 且**不**拿兜底 key 顶上 (即使兜底三项齐)', async () => {
  await withAllEnv({}, async () => {
    await withStubbedFetch(() => ok200(OK_BODY), async (calls) => {
      assert.strictEqual(await decideIntentWithLlm(INPUT, { apiKey: '', model: 'qwen3.8-flash' }), null);
      assert.strictEqual(calls.length, 0, '凭证缺失是配置问题, 走既定降级路径 (v1.14.1 明文保留)');
    });
  });
});

test('v1.14.2: 没凭证那条也计一次 failure (否则"意图链一直裸奔"没有聚合信号)', async () => {
  resetAllCounters();
  await withAllEnv({}, async () => {
    await withStubbedFetch(() => ok200(OK_BODY), async () => {
      await decideIntentWithLlm(INPUT, { apiKey: '', model: 'qwen3.8-flash' });
    });
  });
  assert.strictEqual(getCounter('intent_calls_total'), 1);
  assert.strictEqual(getCounter('intent_failures_total'), 1);
  assert.strictEqual(getCounter('intent_fallback_total'), 0, '没 key 不算"兜底被启用"');
});

// ===== 5. 两段都失败 + 出声 =====

test('v1.14.2 ★ 两段都失败 ⇒ 返回 null, WARN 同时点名两个端点且不含任何 key', async () => {
  await withAllEnv({}, async () => {
    await withCapturedWarn(async (lines) => {
      await withStubbedFetch(() => http500(), async (calls) => {
        assert.strictEqual(await decideIntentWithLlm(INPUT, OPTS), null);
        assert.strictEqual(calls.length, 2, '兜底只重试一次, 不递归');
      });
      const joined = lines.join('\n');
      assert.match(joined, /主端点与兜底端点均失败/);
      assert.match(joined, /HTTP 500/, '两段的病因都要在');
      assert.doesNotMatch(joined, new RegExp(PRIMARY_KEY), '绝不许带出主端点 key');
      assert.doesNotMatch(joined, new RegExp(FB_KEY), '绝不许带出兜底 key');
    });
  });
});

test('v1.14.2 ★ 兜底被用到必须 WARNING 出声 (说清从哪个端点换到哪个, 不报 key)', async () => {
  await withAllEnv({}, async () => {
    await withCapturedWarn(async (lines) => {
      await withStubbedFetch((call, i) => (i === 0 ? http500() : ok200(OK_BODY)), async () => {
        await decideIntentWithLlm(INPUT, OPTS);
      });
      const hit = lines.filter((l) => l.includes('LLM-INTENT') && l.includes('转兜底端点重试'));
      assert.strictEqual(hit.length, 1, `兜底触发必须恰好一条 WARNING, 实得 ${hit.length}: ${lines.join(' | ')}`);
      assert.match(hit[0], /WARN/, '级别必须是 WARN (journald 只采 WARNING+)');
      assert.match(hit[0], /token-plan\.cn-beijing\.maas\.aliyuncs\.com/, '要点出主端点是哪个');
      assert.match(hit[0], /api\.deepseek\.com\/v2/, '要点出兜底端点是哪个');
      assert.match(hit[0], new RegExp(`model=${FB_MODEL}`), '兜底模型名要在');
      assert.match(hit[0], /HTTP 500/, '主端点的病因要在 (否则只知道"转兜底了"不知道为什么)');
      assert.doesNotMatch(hit[0], new RegExp(PRIMARY_KEY));
      assert.doesNotMatch(hit[0], new RegExp(FB_KEY));
    });
  });
});

test('v1.14.2: 兜底未配时主端点失败**不**发兜底 WARNING (免噪声淹掉真信号)', async () => {
  await withAllEnv({ noFb: true }, async () => {
    await withCapturedWarn(async (lines) => {
      await withStubbedFetch(http500, async () => {
        await decideIntentWithLlm(INPUT, OPTS);
      });
      assert.strictEqual(lines.filter((l) => l.includes('转兜底端点重试')).length, 0);
    });
  });
});

// ===== 6. 指标 =====

test('v1.14.2: 兜底救回来 ⇒ failures 不涨, fallback / fallback_ok 各 +1', async () => {
  resetAllCounters();
  await withAllEnv({}, async () => {
    await withStubbedFetch((call, i) => (i === 0 ? http500() : ok200(OK_BODY)), async () => {
      await decideIntentWithLlm(INPUT, OPTS);
    });
  });
  assert.strictEqual(getCounter('intent_calls_total'), 1);
  assert.strictEqual(getCounter('intent_fallback_total'), 1, '兜底被启用了一次');
  assert.strictEqual(getCounter('intent_fallback_ok_total'), 1, '兜底没抛错');
  assert.strictEqual(getCounter('intent_failures_total'), 0, '与 judge 同口径: 救回来的那次不算失败');
});

test('v1.14.2: 两段都失败 ⇒ failures +1, fallback_ok 不涨', async () => {
  resetAllCounters();
  await withAllEnv({}, async () => {
    await withStubbedFetch(() => http500(), async () => {
      await decideIntentWithLlm(INPUT, OPTS);
    });
  });
  assert.strictEqual(getCounter('intent_fallback_total'), 1);
  assert.strictEqual(getCounter('intent_fallback_ok_total'), 0);
  assert.strictEqual(getCounter('intent_failures_total'), 1);
});

test('v1.14.2: 兜底端点是坑 (答非 JSON) ⇒ fallback_ok 照计 (端点通了, 只是答案不好)', async () => {
  resetAllCounters();
  await withAllEnv({}, async () => {
    await withStubbedFetch((call, i) => (i === 0 ? http500() : ok200('废话一句')), async () => {
      assert.strictEqual(await decideIntentWithLlm(INPUT, OPTS), null);
    });
  });
  assert.strictEqual(getCounter('intent_fallback_total'), 1);
  assert.strictEqual(getCounter('intent_fallback_ok_total'), 1, '口径: fallback_ok = 兜底**没抛错**');
  assert.strictEqual(getCounter('intent_failures_total'), 0, '端点没坏 ⇒ 不算 failure');
});

// ===== 7. 端到端接线 + dist 产物 =====

test('v1.14.2 ★ 兜底端点与主端点用的是两套独立 env (不许各自解析出同一个真相源)', async () => {
  await withAllEnv({}, async () => {
    const t = resolveIntentLlmTarget();
    assert.strictEqual(t.baseUrl, ALI_BASE, '主端点仍由 JUDGE_BASE_URL 决定 (v1.14.1 收口不变)');
    const st = resolveJudgeFallback();
    assert.strictEqual(st.kind, 'on');
    assert.strictEqual(st.creds.baseUrl, FB_BASE);
    assert.notStrictEqual(st.creds.baseUrl, t.baseUrl, '兜底必须是与主端点不同的那个端点');
  });
});

test('v1.14.2: dist 产物里兜底解析/自述/两个计数器都真实接线 (防"函数在但没接上")', () => {
  const intent = fs.readFileSync(`${DIST}dispatch/intent-llm.js`, 'utf-8');
  const metrics = fs.readFileSync(`${DIST}monitor/metrics.js`, 'utf-8');
  assert.match(intent, /resolveJudgeFallback/, '兜底解析必须在 intent 产物里');
  assert.match(intent, /describeJudgeFallback/, '自述必须在 (否则出声那条说不出换了哪个端点)');
  assert.match(intent, /intent_fallback_total/, '兜底计数必须接上');
  assert.match(intent, /intent_fallback_ok_total/);
  assert.match(metrics, /intent_fallback_total/, '指标必须在 metrics 里声明 (否则 /metrics 上看不见 0)');
  assert.match(metrics, /intent_calls_total/);
  // 反向: 模型名不许硬编码 (v1.4.0「消除 hardcode」), 生产端点不许烤成可执行字面量
  const code = codeOnly(intent);
  assert.doesNotMatch(code, /deepseek-(chat|flash|reasoner)/, '兜底模型名必须来自 env');
  assert.doesNotMatch(code, /token-plan/, '生产端点不许硬编码进产物');
});

/** 去掉整行注释/块注释 (与 judge-fallback-v1130 同款做法) */
function codeOnly(src) {
  return src
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');
}
