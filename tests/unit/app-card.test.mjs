// app-card.test.mjs — 小程序卡片 (msgType=49, app.category=mini_program) 入站解析 + 文本化
//
// v1.6.1 MINIPROGRAM-CARD (2026-09-13 老板实测): 老板转发国补小程序卡片给小助理, 小助理只看到一行标题
// 并回「转发时只带了文字」。实测 raw_payload 里 app 块字段齐全 ⇒ 是入站没解析, 不是厂商没推。
// 本测试锁「真报文能解析出 appid/page_path」+「不误吞同族 49 消息」+「handler 接线在落库之前」。
//
// 夹具 = 生产 DB wpp_messages.id=30869 的 raw_payload.app 逐字段保真 (只删了 raw_xml_json 大体积副本)。
// 需要 dist 编译产物 (npm run build 后跑)。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const read = (p) => fs.readFileSync(p, 'utf-8');

// ⚠️ 教训 (2026-09-13, 见 enrich-single-judge.test.mjs): tsc 保留注释 ⇒
//   「不许出现符号 X」类断言会命中注释假红, 「必须有符号 X」类会被注释假绿。凡按行看代码一律先剥注释。
function stripComments(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => {
      const i = line.indexOf('//');
      return i >= 0 ? line.slice(0, i) : line;
    })
    .join('\n');
}

const FIXTURE = JSON.parse(read(join(ROOT, 'tests/fixtures/miniprogram-card.json')));
const realPayload = { app: FIXTURE.app };

const mod = await import(pathToFileURL(join(ROOT, 'dist/inbound/app-card.js')).href);
const { isMiniProgramCard, parseMiniProgramCard, formatMiniProgramCard, planMiniProgramAssetAttempts } = mod;

// ===== 1. 真报文解析 (夹具逐字段) =====
test('1. 真报文: isMiniProgramCard 命中 + 字段逐项保真', () => {
  assert.equal(isMiniProgramCard(realPayload), true);
  const c = parseMiniProgramCard(realPayload);
  assert.ok(c, 'parseMiniProgramCard 必须返回对象');
  assert.equal(c.title, '快来领取政府家电数码补贴，单件最高补1500元');
  assert.equal(c.appId, 'wx8386cf8f5e76d36a');
  // ⭐ 老板口中的「内部页面」就是这一行: 解析不出它, 本次改动等于没做
  assert.equal(c.pagePath, 'pages/index/index.html?activity_id=320800');
  assert.equal(c.username, 'gh_55addd727905@app');
  assert.equal(c.sourceDisplayName, '国家消费品换新补贴微信端');
  // 封面凭证: 走 download_context (端点要 file_no+file_aes_key)
  assert.equal(c.cover.fileNo, FIXTURE.app.cover_image.file_no);
  assert.equal(c.cover.fileAesKey, FIXTURE.app.cover_image.aes_key);
  assert.equal(c.cover.md5, FIXTURE.app.cover_image.md5);
  assert.equal(c.cover.width, 720);
  assert.equal(c.cover.height, 576);
});

// ===== 2. 文本化 =====
test('2. 文本化: 带 appid + 页面路径; omitTitle 去重; 重名描述只打一行', () => {
  const c = parseMiniProgramCard(realPayload);
  const withTitle = formatMiniProgramCard(c);
  assert.match(withTitle, /\[小程序卡片\] 快来领取政府家电数码补贴/);
  assert.match(withTitle, /appid wx8386cf8f5e76d36a/);
  assert.match(withTitle, /页面路径: pages\/index\/index\.html\?activity_id=320800/);
  // 描述 (= 小程序名) 相同 ⇒ 不得重复出现两行
  const descLines = withTitle.split('\n').filter((l) => l.includes('国家消费品换新补贴微信端'));
  assert.equal(descLines.length, 1, `小程序名/描述应只出现 1 次, 实得 ${descLines.length} 行:\n${withTitle}`);

  // handler 侧 content 已含标题 ⇒ omitTitle 不得再重复标题
  const omitted = formatMiniProgramCard(c, { omitTitle: true });
  assert.doesNotMatch(omitted, /快来领取政府家电数码补贴/, 'omitTitle 时不得重复标题');

  // 资产 URL 注入格式要与 deliver/引用注入的既有正则同族 ([...] + 空格 + URL)
  const withCover = formatMiniProgramCard(c, { coverUrl: 'https://oss.example/x.jpg' });
  assert.match(withCover, /\[小程序封面\]\s+https:\/\/oss\.example\/x\.jpg/);
  // ⭐ 封面与图标必须分开标注 —— 标签写错 = 模型以为看到了卡片大图 (实测封面 CDN 恒失败, 常态是 icon)
  const withIcon = formatMiniProgramCard(c, { iconUrl: 'https://oss.example/icon.png' });
  assert.match(withIcon, /\[小程序图标\]\s+https:\/\/oss\.example\/icon\.png/);
  assert.doesNotMatch(withIcon, /\[小程序封面\]/, '降级到图标时不得标注成封面');
});

test('3b. 资产降级顺序: 封面(直链优先 → file_no) → 图标; 无凭证则零尝试', () => {
  const c = parseMiniProgramCard(realPayload);
  // 真报文: download_context 无 url, 只有 file_no+file_aes_key ⇒ ①走 file_no; ②降级 icon_url
  assert.equal(c.cover.url, undefined, '真报文 download_context 不含 url');
  assert.equal(c.cover.iconUrl, FIXTURE.app.icon_url);
  const plan = planMiniProgramAssetAttempts(c.cover);
  assert.equal(plan.length, 2, `应两次尝试(封面+图标), 实得 ${plan.length}`);
  assert.equal(plan[0].kind, 'cover');
  assert.deepEqual(Object.keys(plan[0].body).sort(), ['file_aes_key', 'file_no']);
  assert.equal(plan[0].body.file_no, c.cover.fileNo);
  assert.equal(plan[1].kind, 'icon');
  assert.equal(plan[1].body.url, FIXTURE.app.icon_url);

  // 有直链时封面优先走 url (厂商文档: 优先下载已校验的官方封面地址)
  const withUrl = planMiniProgramAssetAttempts({ url: 'https://mmbiz.example/c.jpg', fileNo: 'f', fileAesKey: 'a', iconUrl: 'https://mmbiz.example/i.png' });
  assert.equal(withUrl[0].body.url, 'https://mmbiz.example/c.jpg');
  assert.equal(withUrl[0].body.file_no, undefined, '有直链时不该再传 file_no');

  // icon_url 与 url 相同 ⇒ 不重复尝试同一地址
  const same = planMiniProgramAssetAttempts({ url: 'https://x/y.png', iconUrl: 'https://x/y.png' });
  assert.equal(same.length, 1);

  assert.deepEqual(planMiniProgramAssetAttempts(undefined), []);
  assert.deepEqual(planMiniProgramAssetAttempts({}), [], '无凭证不得产生尝试 (避免空 body 打厂商)');
});

test('3. 字段缺失不炸: 空 app / 无 mini_program / 无封面', () => {
  assert.equal(parseMiniProgramCard({}), null);
  assert.equal(parseMiniProgramCard({ app: { category: 'mini_program' } }) !== null, true);
  assert.equal(isMiniProgramCard({ app: { category: 'other' } }), false);
  // 空 app 块 → 不抛, 文本化后仍有 [小程序] 骨架行 (不会输出 undefined)
  const t = formatMiniProgramCard(parseMiniProgramCard({ app: { category: 'mini_program' } }));
  assert.doesNotMatch(t, /undefined/, `不得把 undefined 喂给模型: ${t}`);
  assert.match(t, /^\[小程序\] /);
});

// ===== 4. 排他性 (与同族 49 消息互不干扰) =====
test('4. 同族 49 不被误吞: 接龙/文件/引用/转账/图片均不命中', () => {
  for (const category of ['app_message', 'file', 'quote', 'payment_notice', 'link']) {
    // 反向注入: 同一个真报文只改 category ⇒ 必须立刻不命中 (证明判定真的读 category)
    const mutated = { app: { ...FIXTURE.app, category } };
    assert.equal(isMiniProgramCard(mutated), false, `category=${category} 不应命中`);
    assert.equal(parseMiniProgramCard(mutated), null, `category=${category} 不应解析`);
  }
  assert.equal(isMiniProgramCard(undefined), false);
  assert.equal(isMiniProgramCard(null), false);
  assert.equal(isMiniProgramCard({}), false);
  // 接龙 (relay.ts 的领域) 保持不被本模块接手
  assert.equal(isMiniProgramCard({ app: { category: 'app_message', title: '#接龙 3. 周年庆' } }), false);
});

// ===== 5. handler 接线 (本次真正的修) =====
test('5. handler 在落库前完成小程序卡片解析 (否则 DB 与 prompt 仍只有标题)', () => {
  const code = stripComments(read(`${ROOT}/src/inbound/handler.ts`));
  assert.match(code, /formatMiniProgramCard\(card/, 'handler 必须把卡片文本化并写回 m.content');
  assert.match(code, /enrichMiniProgramAsset\(/, 'handler 必须尝试下封面 (老板 2026-09-13 拍板)');
  // 资产类型必须原样透传给文本化 (封面/图标标签不得混)
  assert.match(code, /coverUrl: assetKind === "cover" \? assetUrl : undefined/, '封面 URL 仅在 kind=cover 时注入');
  assert.match(code, /iconUrl: assetKind === "icon" \? assetUrl : undefined/, '图标 URL 仅在 kind=icon 时注入');

  // ⚠️ 这里**必须**用精确行匹配, 不能只断言「符号出现过」:
  //   反向注入实测 (2026-09-13): 把守卫改成 `if (false && m.msgType === MsgType.APP && isMiniProgramCard(m.raw))`
  //   —— 钩子整段变成死代码, 而裸 includes/match 断言**照样 PASS** (符号还在源码里)。
  //   故断言判定行的完整形态, 任何停用/短路/改名立刻 FAIL。
  const guardLine = code
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.includes('isMiniProgramCard(m.raw)'));
  assert.ok(guardLine, 'handler 必须调用 isMiniProgramCard(m.raw) 判定');
  assert.equal(
    guardLine,
    'if (m.msgType === MsgType.APP && isMiniProgramCard(m.raw)) {',
    `小程序卡片守卫必须逐字如下 (禁止 false &&/短路/改名): ${guardLine}`,
  );
  assert.doesNotMatch(guardLine, /\bfalse\b|\btrue\b/, '守卫不得被常量短路');

  // 必须在 Step 1 (enrich 循环) 内 —— 即出现在 enrichBatch( 落库调用之前,
  //   否则注记进不了 DB (与图片 enrich 的既有约定一致: DB 里就是带 [图片] url 的 content)
  const hookAt = code.indexOf('isMiniProgramCard(m.raw)');
  const persistAt = code.indexOf('await enrichBatch(');
  assert.ok(hookAt > 0 && persistAt > 0, '两个锚点都必须存在');
  assert.ok(hookAt < persistAt, `卡片解析必须在 enrichBatch 落库之前 (hook=${hookAt}, persist=${persistAt})`);
  // 封面下载失败必须非致命 (vendor 抖动/无 OSS 凭据不能让消息丢掉)
  assert.match(code, /MINIPROGRAM-CARD\] cover miss \(non-fatal\)/, '封面失败须非致命且留痕');
});

// ===== 6. 封面下载必须复用既有基建, 不自造轮子 =====
test('6. 封面走既有 OSS/下载基建 + 端点名正确', () => {
  const src = read(`${ROOT}/src/inbound/app-card.ts`);
  assert.match(src, /\/Tools\/DownloadMiniProgramCover/, '必须打对的端点 (v1.6.0 SWAGGER-323 接入)');
  assert.match(src, /ossUploadBuffer\(/, '封面必须走既有 OSS 上传 helper');
  assert.match(src, /type: "miniprogram"/, 'OSS key 需按类型归档 (wpp/{account}/miniprogram/...)');
  // 与厂商 swagger 快照一致: 该端点必须真的存在于入仓的 vendor 端点表
  const swagger = JSON.parse(read(join(ROOT, 'tests/fixtures/vendor-swagger-endpoints.json')));
  const flat = JSON.stringify(swagger);
  assert.match(flat, /DownloadMiniProgramCover/, '端点必须存在于入仓 swagger 快照 (防写到已下线端点)');
});
