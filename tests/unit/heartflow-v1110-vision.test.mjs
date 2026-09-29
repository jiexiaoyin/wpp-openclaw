// tests/unit/heartflow-v1110-vision.test.mjs - v1.11.0 心流"看图" (老板 2026-09-29 拍板)
//
// 背景 (实测, 非推测): 群里的图片在 judge 眼里只有一行 `[图片] https://…jpg` 文本,
//   模型看不到图 ⇒ 判分只能靠上下文猜。拿生产群 5 条真实图片消息复放 (2 张业务图 + 3 张无关图, 逐张人工核对过),
//   纯文本一律 ~0.25-0.31 (含两张明显该接的业务图); 把图当多模态内容块交给同一个 prompt 后:
//   两张业务图分别 0.25→0.66~0.705、0.31→0.705~0.72 (过线), 三张无关图仍 0.25 (挡下)
//   —— 是"由瞎猜变实读", 不是无脑抬分。故本文件钉住四件事:
//   A. 纯函数行为 (URL 抠得准、认得少、有上界)
//   B. 请求体形状 (有图才变内容块数组; 无图时**逐字节不变**, 老行为零回归)
//   C. 端点/格式边界 (只 openai 格式生效; 非 http(s)/data:image 一律不送厂商)
//   D. 接线与常量 (judge 真的把图传下去了; 默认生效; 不进 UI schema)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const src = (rel) => fs.readFileSync(`${ROOT}/${rel}`, 'utf-8');

let HF = null;
let J = null;
try {
  HF = await import(new URL('../../dist/inbound/heartflow.js', import.meta.url));
  J = await import(new URL('../../dist/llm-judge.js', import.meta.url));
} catch (e) {
  console.error(`[heartflow-v1110] dist 缺失: ${e.message}`);
}
const skipNoDist = (t, m) => { if (!m) t.skip('dist 缺失 (先 npm run build)'); };

/** 取某个顶层声明的完整正文 (切成"从声明到下一个顶层声明"—— 与 heartflow-budget.test.mjs 同款) */
function fnBody(rel, decl) {
  const s = src(rel);
  const i = s.indexOf(decl);
  assert.ok(i >= 0, `${rel} 里找不到声明: ${decl}`);
  const rest = s.slice(i + decl.length);
  const next = rest.search(/\n(?:\/\*\*|export (?:async )?function|export const|export interface|const _)/);
  return s.slice(i, next < 0 ? s.length : i + decl.length + next);
}

/** 取请求体里的 user 消息 (openai 分支: 有 systemPrompt 时是 messages[1], 否则 messages[0]) */
const userMsg = (body) => body.messages[body.messages.length - 1];

// 桩数据统一用 example.com —— 真实群 ID / 图片直链一律不许进仓 (见脱敏门)
const U1 = 'https://example.com/a.jpg';
const U2 = 'https://example.com/b.jpg';

const { callJudge } = J ?? {};
const CREDS = { apiKey: 'sk-test', baseUrl: 'https://api.deepseek.com', format: 'openai' };
const OK_PAYLOAD = {
  choices: [{ message: { content: '{"relevance":5,"willingness":5}' }, finish_reason: 'stop' }],
};

/** 桩: 抓请求体; 用完必须还原 (try/finally) */
function withStubbedFetch(payload, fn) {
  const orig = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), body: JSON.parse(init.body) };
    return { ok: true, status: 200, json: async () => payload };
  };
  return Promise.resolve()
    .then(() => fn(() => captured))
    .finally(() => { globalThis.fetch = orig; });
}

// ===== A. 纯函数: extractHfImageUrls / resolveHfVisionCfg =====

test('A1 抠出 [图片] 直链 (handler enrich 的真实形态: 首行"收到一张图片" + 次行标记)', (t) => {
  skipNoDist(t, HF);
  const content = `收到一张图片\n[图片] ${U1}`;
  assert.deepEqual(HF.extractHfImageUrls(content, 1), [U1]);
});

test('A2 vendor v1 schema 分支尾部的 "(注: …)" 说明不会被带进 URL', (t) => {
  skipNoDist(t, HF);
  const content = `收到一张图片\n[图片] ${U1} (注: vendor v1 schema 推送, 仅下载首 64KB, 大图部分可能截断)`;
  assert.deepEqual(HF.extractHfImageUrls(content, 1), [U1]);
});

test('A3 去重 + 按出现顺序 + maxImages 截断', (t) => {
  skipNoDist(t, HF);
  const content = `收到一张图片\n[图片] ${U1}\n[图片] ${U2}\n[图片] ${U1}`;
  assert.deepEqual(HF.extractHfImageUrls(content, 2), [U1, U2], '去重后不足 2 张时不该补重复的');
  assert.deepEqual(HF.extractHfImageUrls(content, 9), [U1, U2]);
  assert.deepEqual(HF.extractHfImageUrls(content, 1), [U1]);
});

test('A4 只认 http(s):// —— 本地路径/令牌/其他 scheme 一律不抠 (防把本机路径当图交给厂商)', (t) => {
  skipNoDist(t, HF);
  const bad = [
    'file:///etc/passwd',
    'data:image/png;base64,AAAA', // 提取器只认 http(s); data: 是 judge 侧白名单, 保给本地缩略图路线
    '/root/.openclaw/accounts/default.json',
    'xcxthumb:abc',
  ];
  const content = `收到一张图片\n${bad.map((b) => `[图片] ${b}`).join('\n')}`;
  assert.deepEqual(HF.extractHfImageUrls(content, 5), [], '4 条全是不该送的');
});

test('A5 无标记 / 空文本 / max=0 → 空数组', (t) => {
  skipNoDist(t, HF);
  assert.deepEqual(HF.extractHfImageUrls('今天开会', 1), []);
  assert.deepEqual(HF.extractHfImageUrls('', 1), []);
  assert.deepEqual(HF.extractHfImageUrls(`[图片] ${U1}`, 0), []);
  assert.deepEqual(HF.extractHfImageUrls(`[图片] ${U1}`, -3), []);
});

test('A6 缺省解析: enabled=true / maxImages=1 且上界收口', (t) => {
  skipNoDist(t, HF);
  assert.deepEqual(HF.resolveHfVisionCfg(undefined), { enabled: true, maxImages: 1 });
  assert.deepEqual(HF.resolveHfVisionCfg(null), { enabled: true, maxImages: 1 });
  assert.deepEqual(HF.resolveHfVisionCfg({}), { enabled: true, maxImages: 1 });
  assert.strictEqual(HF.resolveHfVisionCfg({ enabled: false }).enabled, false, '显式关必须真的关');
  assert.strictEqual(HF.resolveHfVisionCfg({ maxImages: 3.7 }).maxImages, 3);
  assert.strictEqual(HF.resolveHfVisionCfg({ maxImages: -1 }).maxImages, 0);
  assert.strictEqual(HF.HF_VISION_DEFAULTS.maxImages, 1, '默认只送 1 张: 每张约 +1000 prompt tokens');
});

test('A7 默认配置链下看图是**开**的 (别让它悄悄回退成瞎猜)', (t) => {
  skipNoDist(t, HF);
  const cfg = HF.defaultHeartflowConfig();
  assert.strictEqual(HF.resolveHfVisionCfg(cfg.vision).enabled, true);
});

// ===== B/C. 请求体形状与格式边界 (桩 fetch, 不打网络) =====

test('B1 无图 ⇒ user content 仍是纯字符串 (老行为逐字节不变)', async (t) => {
  if (!callJudge) return t.skip('dist 缺失 (先 npm run build)');
  await withStubbedFetch(OK_PAYLOAD, async (cap) => {
    await callJudge({ model: 'deepseek-flash', userPrompt: '打分', systemPrompt: 'SYS', creds: CREDS });
    const u = userMsg(cap().body);
    assert.strictEqual(typeof u.content, 'string');
    assert.strictEqual(u.content, '打分');
    assert.strictEqual(cap().url, 'https://api.deepseek.com/chat/completions');
  });
});

test('B2 有图 ⇒ [文本块, 图片块…] 且顺序为文本在前', async (t) => {
  if (!callJudge) return t.skip('dist 缺失 (先 npm run build)');
  await withStubbedFetch(OK_PAYLOAD, async (cap) => {
    await callJudge({ model: 'deepseek-flash', userPrompt: '打分', creds: CREDS, images: [U1, U2] });
    const c = userMsg(cap().body).content;
    assert.ok(Array.isArray(c));
    assert.deepEqual(c[0], { type: 'text', text: '打分' });
    assert.deepEqual(c[1], { type: 'image_url', image_url: { url: U1 } });
    assert.deepEqual(c[2], { type: 'image_url', image_url: { url: U2 } });
    assert.deepEqual(cap().body.thinking, { type: 'disabled' },
      '看图不该把关思考弄丢 (v1.6.1: 思考与正文共享 max_tokens ⇒ 不关就空正文)');
  });
});

test('B3 混进非法 URL ⇒ 该条被丢, 剩下的照发 (纵深防御; 提取器已经挡一层)', async (t) => {
  if (!callJudge) return t.skip('dist 缺失 (先 npm run build)');
  await withStubbedFetch(OK_PAYLOAD, async (cap) => {
    await callJudge({ model: 'deepseek-flash', userPrompt: 'x', creds: CREDS, images: ['file:///etc/passwd', U1, 'xcxthumb:abc'] });
    const c = userMsg(cap().body).content;
    const urls = c.filter((p) => p.type === 'image_url').map((p) => p.image_url.url);
    assert.deepEqual(urls, [U1]);
  });
});

test('B4 只给非法 URL ⇒ 退化成纯字符串请求 (不是发个没有图的内容块数组)', async (t) => {
  if (!callJudge) return t.skip('dist 缺失 (先 npm run build)');
  await withStubbedFetch(OK_PAYLOAD, async (cap) => {
    await callJudge({ model: 'deepseek-flash', userPrompt: 'x', creds: CREDS, images: ['file:///etc/passwd'] });
    assert.strictEqual(typeof userMsg(cap().body).content, 'string');
  });
});

test('B5 data:image/ 是合法的 (本地缩略图路线给日后留的口子)', async (t) => {
  if (!callJudge) return t.skip('dist 缺失 (先 npm run build)');
  const dataUrl = 'data:image/jpeg;base64,/9j/4AAQ';
  await withStubbedFetch(OK_PAYLOAD, async (cap) => {
    await callJudge({ model: 'm', userPrompt: 'x', creds: CREDS, images: [dataUrl] });
    assert.strictEqual(userMsg(cap().body).content[1].image_url.url, dataUrl);
  });
});

test('C1 anthropic 格式端点: 图被忽略, 走的还是纯文本 /v1/messages', async (t) => {
  if (!callJudge) return t.skip('dist 缺失 (先 npm run build)');
  const payload = { content: [{ type: 'text', text: '{"relevance":5}' }] };
  const orig = globalThis.fetch;
  let cap = null;
  globalThis.fetch = async (url, init) => { cap = { url: String(url), body: JSON.parse(init.body) }; return { ok: true, status: 200, json: async () => payload }; };
  try {
    await callJudge({ model: 'm', userPrompt: '打分', creds: { ...CREDS, format: 'anthropic', baseUrl: 'https://api.minimaxi.com/anthropic' }, images: [U1] });
  } finally { globalThis.fetch = orig; }
  assert.ok(cap.url.endsWith('/v1/messages'));
  assert.strictEqual(typeof userMsg(cap.body).content, 'string');
  assert.ok(!JSON.stringify(cap.body).includes('image_url'), 'anthropic 分支不许混进多模态块');
});

// ===== D. 接线与常量 =====

test('D1 judgeHeartflow 真的取图并传给 callJudge (且只取待判定消息, 不取上下文图)', (t) => {
  const body = fnBody('src/inbound/heartflow.ts', 'export async function judgeHeartflow(');
  assert.match(body, /resolveHfVisionCfg\(cfg\.vision\)/, '要走缺省收口, 不许手写 cfg.vision?.enabled ?? true');
  assert.match(body, /extractHfImageUrls\(input\.content,\s*vision\.maxImages\)/, '只从待判定消息取图 (成本/焦点都可控)');
  assert.ok(!/extractHfImageUrls\(input\.recentMessages/.test(body), '上下文图不许抠 (会成倍烧 token)');
  assert.match(body, /^\s*images,\s*$/m, '必须把 images 传进 callJudge');
  assert.ok(!/cfg\.vision\.maxImages/.test(body), '不许绕过 resolveHfVisionCfg 直接用原始值');
});

test('D2 callJudge 的 openai 分支才做多模态; 图片白名单在调用侧也过一遍', (t) => {
  const body = fnBody('src/llm-judge.ts', 'async function callJudgeInner(');
  assert.match(body, /const imgs = \(images \?\? \[\]\)\.filter/, '要有正则白名单过滤');
  assert.ok(body.includes('/^(https?:\\/\\/|data:image\\/)/i'), '白名单正则必须限定 http(s) 与 data:image');
  assert.match(body, /type: "image_url"/);
  const anthropic = body.slice(body.indexOf('// anthropic'));
  assert.ok(anthropic.length > 0 && !/image_url/.test(anthropic), 'anthropic 分支不许出现 image_url');
});

test('D3 图片 URL 的图标/数量都不进 UI schema (与 budget 同惯例, 只走 accounts JSON)', (t) => {
  const manifest = JSON.parse(src('openclaw.plugin.json'));
  const props = manifest.channelConfigs.wechatpadpro.schema.properties.heartflow.properties;
  assert.deepEqual(Object.keys(props).sort(), ['enabled'], 'UI 只暴露总开关; vision 属运维级参数');
});

test('D4 accounts JSON 里的 vision 能热生效且不会被写回抹掉 (无字段白名单)', (t) => {
  const s = src('src/index.ts');
  assert.match(s, /const applyMutable = <T extends object>/, '热重载用的是泛型逐键覆盖');
  assert.match(s, /applyMutable\(hf, resolveAiConfig\(newCfg, "heartflow"\)/, 'heartflow 必须走这条路');
  const cfgSrc = src('src/config.ts');
  assert.match(cfgSrc, /const hfRaw = \(raw\.heartflow as Record<string, unknown> \| undefined\) \?\? \{\}/,
    '读原始 heartflow 对象要整体拿, 不挑字段');
  assert.match(cfgSrc, /raw\.heartflow = hfRaw;/, '写回必须是原对象 ⇒ 未列出的键 (budget/profile/vision) 都不会被抹掉');
});
