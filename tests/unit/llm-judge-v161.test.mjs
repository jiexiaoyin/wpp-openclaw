/**
 * v1.6.1 judge 守卫 (2026-09-13)
 *
 * 事故背景: 2026-09-11 模型切档 (deepseek-v4-flash → DeepSeek-V4.1-Flash, 推理模型) 后,
 *   judge 的 reasoning_content 与正文共享 max_tokens=300 → 正文恒空 → 旧码静默 return ""
 *   → 调用方只看到 "unparseable: " (冒号后空白) → 心流在全部白名单群静默瘫 3 天 (09-11 09:50
 *   起 169 条 judge failed / 0 成功), 日志无一字提示根因。
 *
 * 本测试锁两件事 (任一回退即 FAIL):
 *   1. openai 格式默认带 thinking:{type:"disabled"} (关思考, 把 max_tokens 留给正文)
 *   2. 空正文必须 throw 且错误里带 finish_reason/reasoning_tokens (禁止静默返回 "")
 * 反向注入自检: noThink:false 时必须**不**带 thinking —— 证明上面第 1 条断言真的看的是请求体。
 */
import assert from 'node:assert';
import { test } from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));
const { callJudge } = await import(new URL('../../dist/llm-judge.js', import.meta.url).href);

const CREDS = { apiKey: 'sk-test', baseUrl: 'https://api.deepseek.com', format: 'openai' };

/** 桩: 捕获请求体 + 返回指定载荷; 用完必须还原 (try/finally) */
function withStubbedFetch(payload, fn) {
  const orig = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), body: JSON.parse(init.body) };
    return { ok: true, json: async () => payload };
  };
  return Promise.resolve()
    .then(() => fn(() => captured))
    .finally(() => {
      globalThis.fetch = orig;
    });
}

const OK_PAYLOAD = {
  choices: [{ message: { content: '{"relevance":5,"willingness":5}' }, finish_reason: 'stop' }],
};

test('v1.6.1: openai judge 默认带 thinking:{type:"disabled"} (关思考)', async () => {
  await withStubbedFetch(OK_PAYLOAD, async (cap) => {
    const out = await callJudge({ model: 'deepseek-flash', userPrompt: 'x', creds: CREDS });
    assert.strictEqual(out, '{"relevance":5,"willingness":5}');
    const body = cap().body;
    assert.deepStrictEqual(
      body.thinking,
      { type: 'disabled' },
      'openai judge 请求体必须带 thinking:{type:"disabled"} (否则推理模型吃光 max_tokens → 正文空)',
    );
    assert.strictEqual(body.model, 'deepseek-flash');
  });
});

test('v1.6.1 反向注入自检: noThink:false 时请求体不得带 thinking', async () => {
  await withStubbedFetch(OK_PAYLOAD, async (cap) => {
    await callJudge({ model: 'm', userPrompt: 'x', creds: { ...CREDS, noThink: false } });
    assert.strictEqual(cap().body.thinking, undefined, 'noThink:false 时不许带 thinking (断言有牙)');
  });
});

test('v1.6.1: 空正文必须 throw, 错误带 finish_reason + reasoning_tokens (禁静默 "")', async () => {
  const emptyPayload = {
    choices: [{ message: { content: '' }, finish_reason: 'length' }],
    usage: { completion_tokens_details: { reasoning_tokens: 300 } },
  };
  await withStubbedFetch(emptyPayload, async () => {
    await assert.rejects(
      () => callJudge({ model: 'deepseek-flash', userPrompt: 'x', creds: CREDS }),
      (e) => {
        assert.match(e.message, /empty content/, '空正文必须显式报错');
        assert.match(e.message, /finish_reason=length/, '错误必须带 finish_reason');
        assert.match(e.message, /reasoning_tokens=300/, '错误必须带 reasoning_tokens');
        return true;
      },
    );
  });
});

test('v1.6.1: dist 产物含修复 (空正文报错 + 关思考), 且无旧的静默 return ""', async () => {
  const src = fs.readFileSync(`${DIST}llm-judge.js`, 'utf-8');
  assert.match(src, /empty content/, 'dist 必须含空正文报错 (v1.6.1)');
  assert.match(src, /thinking:\s*\{\s*type:\s*"disabled"\s*\}/, 'dist 必须含 thinking:{type:"disabled"}');
  assert.doesNotMatch(
    src,
    /content\s*?\?\?\s*""\s*;\s*\n\s*\}\s*\n\s*\/\/ anthropic/,
    '不许回退成 json.choices?.[0]?.message?.content ?? "" 静默返回',
  );
});
