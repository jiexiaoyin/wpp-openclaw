/**
 * v1.14.1 llmIntent 端点收口到 judge 主端点 (2026-10-04)
 *
 * 背景: v1.14.0 把 env 名 `DEEPSEEK_*` → `JUDGE_*` 改了, 但**没动端点** ——
 *   intent-llm.ts 里硬编码 `https://api.minimaxi.com/anthropic` (anthropic 格式),
 *   而 key 自 v1.12.0 起装的是**阿里云 token-plan** 凭证
 *   ⇒ 必 401 ⇒ 静默降级回规则 (功能从未生效), **且那把阿里 token 真的被 POST 到
 *   api.minimaxi.com 的 x-api-key 头** —— 凭据外发给第三方。
 *
 * 本测试锁四类判据 (任一去牙即 FAIL):
 *   1. **端点与凭证同源**: 有 JUDGE_API_KEY + JUDGE_BASE_URL ⇒ 意图链解析出的 baseUrl/format
 *      与 judge 完全一致 (阿里 + openai)。这是"改一处不能只改一半"的结构性判据。
 *   2. **反向判据 (端到端)**: 真调 decideIntentWithLlm (stub globalThis.fetch),
 *      断言真正被请求的 URL 是**阿里**的 `/chat/completions`, 且 `api.minimaxi.com`
 *      一次都没有出现 —— 这比"解析函数返回了什么"强, 它盖住了"解析对了但没接线"。
 *   3. 兜底档不退化: 只有 MINIMAX_API_KEY ⇒ 仍是 minimaxi/anthropic (v1.14.0 前的能力保留);
 *      都没有 ⇒ 回 judge 默认 api.deepseek.com/openai。
 *   4. 形状: dist 里不再有硬编码的 MiniMax base URL; 告警文案与新读取顺序一致
 *      (照旧文案 `missing MINIMAX_API_KEY` 去配会配错那把 key)。
 */
import assert from 'node:assert';
import { test } from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const { resolveIntentLlmTarget } =
  await import(new URL('../../dist/dispatch/intent-llm.js', import.meta.url).href);
const { decideIntentWithLlm } =
  await import(new URL('../../dist/dispatch/intent-llm.js', import.meta.url).href);
const { resolveJudgeCreds } =
  await import(new URL('../../dist/llm-judge.js', import.meta.url).href);

/** 阿里云 token-plan MaaS 主端点 (与 judge-endpoint-v1120 同值) */
const ALI_BASE = 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';
const ALI_HOST = 'token-plan.cn-beijing.maas.aliyuncs.com';
const MINIMAX_BASE = 'https://api.minimaxi.com/anthropic';

/**
 * 临时设多个 env 并还原 (env 是全局状态)。
 * ⚠️ 必须**等到 Promise 落地**再还原 —— 用 `try/finally` 包一个 async fn 的话,
 *   finally 在 fn **返回 Promise 的那一刻**就跑完了, 于是被 await 的正文读到的是**已还原**的 env
 *   (第一版就是这么写的: 端到端用例拿到 minimax, 看起来像"接线错了", 其实是 env 提前还原)。
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

/** 主端点档: 阿里 key + 阿里端点 (生产现状) */
function withAliEnv(fn) {
  return withEnvs(
    { JUDGE_API_KEY: 'sk-ali-fake', JUDGE_BASE_URL: ALI_BASE, MINIMAX_API_KEY: undefined },
    fn,
  );
}

// ===== 1. 端点与凭证同源 =====

test('v1.14.1 ★ 有 JUDGE_API_KEY + JUDGE_BASE_URL ⇒ intent 的 baseUrl/format 与 judge 逐字相同', () => {
  withAliEnv(() => {
    const judge = resolveJudgeCreds();
    const intent = resolveIntentLlmTarget();
    assert.strictEqual(intent.baseUrl, judge.baseUrl, 'intent 必须复用 judge 的端点');
    assert.strictEqual(intent.format, judge.format, '格式也必须跟 judge 一起取 (不按 host 猜)');
    assert.strictEqual(intent.baseUrl, ALI_BASE);
    assert.strictEqual(intent.format, 'openai');
  });
});

test('v1.14.1: env 换回 deepseek ⇒ intent 跟着换 (同一个解析器, 没有第二个真相源)', () => {
  withEnvs(
    { JUDGE_API_KEY: 'sk-ali-fake', JUDGE_BASE_URL: 'https://api.deepseek.com', MINIMAX_API_KEY: undefined },
    () => {
      const intent = resolveIntentLlmTarget();
      assert.strictEqual(intent.baseUrl, 'https://api.deepseek.com');
      assert.strictEqual(intent.format, 'openai');
    },
  );
});

test('v1.14.1: env 带尾斜杠 ⇒ 归一化 (否则拼出 //chat/completions)', () => {
  withEnvs(
    { JUDGE_API_KEY: 'sk-ali-fake', JUDGE_BASE_URL: `${ALI_BASE}/`, MINIMAX_API_KEY: undefined },
    () => assert.strictEqual(resolveIntentLlmTarget().baseUrl, ALI_BASE),
  );
});

// ===== 2. 反向判据: 真发出去的请求 =====

/**
 * 装一个 fetch stub 并记录每次调用的 url/init。
 * ⚠️ 回包形状**按路径分** (openai 的 /chat/completions 走 choices[].message.content,
 * anthropic 的 /v1/messages 走 content[].text) —— 只回一种形状会让另一档的用例
 * "看起来是端点错了", 其实是 stub 说错了话。
 */
function withFetchStub(fn) {
  const calls = [];
  const orig = globalThis.fetch;
  const body = '{"action":"no-op"}';
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    calls.push({ url: u, init });
    const payload = u.endsWith('/chat/completions')
      ? { choices: [{ message: { content: body } }] }
      : { content: [{ type: 'text', text: body }] };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return Promise.resolve()
    .then(() => fn(calls))
    .finally(() => {
      globalThis.fetch = orig;
    });
}

/** 去注释后的源码 (行注释正则不碰 http:// 与字符串里的 //) */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`])\/\/[^\n]*/gm, '$1');
}

const INPUT = { triggerText: '看看这个', candidates: [{ msgId: 'm1', type: 'text', text: 'hi' }] };

test('v1.14.1 ★ 端到端: 真请求打的是阿里 /chat/completions, api.minimaxi.com 一次都没出现', async () => {
  await withAliEnv(async () => {
    await withFetchStub(async (calls) => {
      const d = await decideIntentWithLlm(INPUT, { apiKey: 'sk-ali-fake', model: 'qwen3.8-flash' });
      assert.deepStrictEqual(d, { action: 'no-op' }, 'stub 回的是合法 no-op ⇒ 不该降级成 null');
      assert.strictEqual(calls.length, 1, '只该发一次请求');
      assert.strictEqual(calls[0].url, `${ALI_BASE}/chat/completions`);
      assert.ok(
        calls[0].url.startsWith(`https://${ALI_HOST}/`),
        `请求必须落在阿里 host 上, 实际: ${calls[0].url}`,
      );
      assert.ok(
        !calls[0].url.includes('minimaxi'),
        '★ 端点绝不能再落到 api.minimaxi.com (那正是凭据外发那条路)',
      );
      // 凭据以 Bearer 走 (openai 格式), 而不是 x-api-key (anthropic 格式)
      assert.strictEqual(calls[0].init.headers.authorization, 'Bearer sk-ali-fake');
      assert.strictEqual(calls[0].init.headers['x-api-key'], undefined, 'openai 档不该带 x-api-key');
    });
  });
});

test('v1.14.1: 兜底档 (只有 MINIMAX_API_KEY) 仍打 minimaxi 的 /v1/messages + x-api-key', async () => {
  await withEnvs(
    { JUDGE_API_KEY: undefined, JUDGE_BASE_URL: undefined, MINIMAX_API_KEY: 'sk-mm-fake' },
    async () => {
      await withFetchStub(async (calls) => {
        const d = await decideIntentWithLlm(INPUT, { apiKey: 'sk-mm-fake', model: 'MiniMax-M2.7-highspeed' });
        assert.deepStrictEqual(d, { action: 'no-op' });
        assert.strictEqual(calls[0].url, `${MINIMAX_BASE}/v1/messages`);
        assert.strictEqual(calls[0].init.headers['x-api-key'], 'sk-mm-fake');
        assert.strictEqual(calls[0].init.headers.authorization, undefined);
      });
    },
  );
});

// ===== 3. 解析优先级的完整档位 =====

test('v1.14.1: 两个 key 都没有 ⇒ 落在 judge 的 minimax 兜底分支, 但发起前就被"没 key"挡住', async () => {
  await withEnvs({ JUDGE_API_KEY: undefined, JUDGE_BASE_URL: undefined, MINIMAX_API_KEY: undefined }, async () => {
    // resolveJudgeCreds 的口径: 有主 key 才走主端点; 否则 minimax 分支 (v1.12.0 起如此, 本项不改)
    const t = resolveIntentLlmTarget();
    assert.strictEqual(t.baseUrl, MINIMAX_BASE);
    assert.strictEqual(t.format, 'anthropic');
    // ⇒ 这个端点值**不可达**: 没 key 时 decideIntentWithLlm 在 safeFetch 之前就 return null
    await withFetchStub(async (calls) => {
      const d = await decideIntentWithLlm(INPUT, { apiKey: '', model: 'qwen3.8-flash' });
      assert.strictEqual(d, null);
      assert.strictEqual(calls.length, 0, '★ 没 key ⇒ 一次网络调用都不许发');
    });
  });
});

test('v1.14.1: 显式 override 仍生效; 认不出的 host 兜底成 openai (旧写法会兜成 anthropic)', () => {
  const r = resolveIntentLlmTarget({ baseUrl: 'https://api.siliconflow.cn/v1' });
  assert.strictEqual(r.baseUrl, 'https://api.siliconflow.cn/v1');
  assert.strictEqual(r.format, 'openai', '★ 认不出的 host 必须兜 openai, 不能给 x-api-key');
  // 认得出是 anthropic-messages 的 host 才走 anthropic
  assert.strictEqual(resolveIntentLlmTarget({ baseUrl: MINIMAX_BASE }).format, 'anthropic');
  // 显式 format 优先于任何推断
  assert.strictEqual(
    resolveIntentLlmTarget({ baseUrl: MINIMAX_BASE, format: 'openai' }).format,
    'openai',
  );
  // override 未给时**不受** override 分支影响 (仍走 judge)
  withAliEnv(() => assert.strictEqual(resolveIntentLlmTarget({}).baseUrl, ALI_BASE));
});

test('v1.14.1: 空白 override 按"没给"处理 (与 judge baseUrl 的空串口径一致)', () => {
  withAliEnv(() => {
    assert.strictEqual(resolveIntentLlmTarget({ baseUrl: '   ' }).baseUrl, ALI_BASE);
  });
});

// ===== 4. dist 形状 + 文案 =====

test('v1.14.1 ★ dist 里不再有硬编码的 MiniMax base URL (端点唯一来源是 judge)', () => {
  const raw = fs.readFileSync(fileURLToPath(new URL('../../dist/dispatch/intent-llm.js', import.meta.url)), 'utf-8');
  // ⚠️ 必须去注释再断言: tsc 保留注释, 而本次的注释**故意**引用了那个旧端点 (说明性引用)
  const src = codeOnly(raw);
  assert.doesNotMatch(src, /api\.minimaxi\.com/, '硬编码端点必须彻底消失 (出现即回退)');
  assert.match(src, /resolveIntentLlmTarget/, '端点解析函数必须在产物里');
  assert.match(src, /llm-judge\.js/, '必须从 llm-judge 取凭证 (同一个解析器)');
});

test('v1.14.1: 告警文案与真实读取顺序一致 (JUDGE_API_KEY 优先, MINIMAX_API_KEY 只兜底)', () => {
  const src = codeOnly(
    fs.readFileSync(fileURLToPath(new URL('../../dist/dispatch/intent-llm.js', import.meta.url)), 'utf-8'),
  );
  assert.match(src, /missing JUDGE_API_KEY \(fallback MINIMAX_API_KEY\)/, '文案必须点名真正的 env');
  assert.doesNotMatch(src, /missing MINIMAX_API_KEY, skip/, '旧文案 (只提 MINIMAX) 必须消失');
});

test('v1.14.1: dispatcher 的 intent key 也来自 judge creds (不许自己读 env)', () => {
  const src = codeOnly(
    fs.readFileSync(fileURLToPath(new URL('../../dist/dispatch/dispatcher.js', import.meta.url)), 'utf-8'),
  );
  assert.match(src, /resolveJudgeCreds\(\)\.apiKey/, 'key 必须问 judge 的解析器');
  assert.doesNotMatch(src, /JUDGE_MAIN_VARS/, '不许再自己按 env 名读 (那会与端点分家)');
});
