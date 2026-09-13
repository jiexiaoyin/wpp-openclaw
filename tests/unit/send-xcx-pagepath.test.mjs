// send-xcx-pagepath.test.mjs — v1.6.2/v1.6.3 小程序卡片: 能开内部页面 + 卡片有缩略图
//
// 背景 (2026-09-13 老板实测两轮):
//   ① 要「把国补领券页 (?activity_id=320800) 转发给客户」→ 做不到。legacy buildAppMsgXml 是 appmsg
//      type=2001 + <mmapp><url>, 微信按 url 走 webview ⇒ 只到首页。现代卡片是 type=33 + <weappinfo>。
//   ② 换现代卡片后又**没有图片**。实证: 只给 <weappiconurl>/厂商结构化接口的 thumbUrl 都是灰块;
//      真卡片的图来自 <appattach> 的微信 CDN blob, 旧凭据已失效 (-5103017) ⇒ 必须自己上传一份换新凭据
//      (/Msg/UploadImg 返回的 Fileid/Aeskey 与 appattach 的 cdnthumburl/cdnthumbaeskey 同格式)。
//
// ⚠️ 教训: 「符号出现过」类断言无牙 (反向注入实测过) ⇒ 行为断言为主 (注入式上传 stub);
//   不得已看源码时断言**完整判定行**。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const read = (p) => fs.readFileSync(p, 'utf-8');
const msgSrc = read(`${ROOT}/src/send/msg.ts`);

// 产线真卡片 (2026-09-13 老板转发, 确认能正常打开) 的三要素
const APPID = 'wx8386cf8f5e76d36a';
const USERNAME = 'gh_55addd727905@app';
const PAGE = 'pages/index/index.html?activity_id=320800';
const ICON = 'https://openclaw-a.oss-cn-hangzhou.aliyuncs.com/wpp/default/miniprogram/x.png';
// 实测 /Msg/UploadImg 返回的凭据 (真值, 2026-09-13)
const REF = {
  fileId: '305f020100044b304902010002042ccc2bfa02033d11fd0204346166b402046aa69ded042462393432366634642d666663662d343738362d393332392d336431663938666134666163020401242801020100040d004c56f90000000000000009008b00d2d5',
  aesKey: '68746f66666c756269746c747874616b',
  length: 14884,
  md5: '62c4c83f3c0fa02ffd8b3846343db6f0',
  width: 140,
  height: 140,
};

const ORIGINAL = {
  fileId:
    '305f020100044b304902010002041b2d632702032dcf5b020441cb972402046aa6a1e0042463623334623237392d373939322d343634332d626234342d656236396339333336616362020405140803020100040d004c50bb000000000000000000',
  aesKey: '7a4012a3c3bb6b3bd47b078be17914cd',
  md5: '11c873226d10c81592e367b92823d412',
  width: 720,
  height: 576,
  length: 665315,
  version: 46,
  iconUrl: 'https://mmbiz.qpic.cn/mmbiz_png/sE0uFQmOHVLBKphaz3Ao9E08xeIkXoI7ials440G6GiafNgIK2pS6QIJOYtH2sLqrMkiaH976ZtQfm9BbMmWEiaA3Q/640?wx_fmt=png&wxfrom=200',
};

const mod = await import(new URL('file:///root/dev/wechatpadpro-openclaw/dist/send/msg.js').href);
const { buildMiniProgramCardXml, buildXCXContent, buildAppMsgXml, extractCdnThumbRef, imagePixelSize, cdnThumbRefFromUpload, parseThumbToken, formatThumbToken, THUMB_TOKEN_PREFIX } = mod;

/** 记录调用并返回给定凭据的注入式上传器 */
function spyUploader(ret) {
  const calls = [];
  const fn = async (u) => {
    calls.push(u);
    return ret;
  };
  fn.calls = calls;
  return fn;
}

// ===== 1. 现代 XML 逐节点 =====
test('1. buildMiniProgramCardXml: type=33 + weappinfo 三要素齐 + 转义', () => {
  const xml = buildMiniProgramCardXml({
    title: '快来领取政府家电数码补贴，单件最高补1500元',
    desc: '国家消费品换新补贴微信端',
    appId: APPID,
    pagePath: PAGE,
    username: USERNAME,
    iconUrl: ICON,
    sourceDisplayName: '国家消费品换新补贴微信端',
  });
  assert.match(xml, /^<appmsg>/, '顶层必须是 <appmsg> (厂商 /Msg/SendXCX 的 Content 就是它)');
  assert.match(xml, /<type>33<\/type>/, '33 = 小程序卡片; 2001 是 legacy, 出现即回归');
  assert.ok(!xml.includes('<type>2001</type>') && !xml.includes('<mmapp>'), '现代卡片不得带 legacy 节点');
  assert.ok(xml.includes(`<pagepath>${PAGE}</pagepath>`), 'pagepath 是本次改动唯一目的, 必须逐字在内');
  assert.ok(xml.includes(`<appid>${APPID}</appid>`), 'appid 必须在内');
  assert.ok(xml.includes(`<username>${USERNAME}</username>`), 'username (gh_xxx@app) 必须在内');
  assert.ok(xml.includes('<type>2</type>'), 'weappinfo 内 type=2 (小程序)');
  assert.ok(xml.includes('<sourcedisplayname>国家消费品换新补贴微信端</sourcedisplayname>'));
  assert.ok(xml.includes('<des>国家消费品换新补贴微信端</des>'));
  assert.ok(xml.includes(`<sourceusername>${APPID}</sourceusername>`), '真卡片 sourceusername = appid');
  // 无 appattach 时 (没拿到缩略图凭据) 不得凭空造节点
  assert.ok(!xml.includes('appattach'), '没有凭据就不该有 appattach (半截节点比没有更糟)');
  assert.ok(!xml.includes('undefined'), '不得把 undefined 拼进 XML');
});

// ===== 2. 缩略图节点 (卡片有没有图的唯一决定因素) =====
test('2. buildMiniProgramCardXml + thumb: appattach 六节点与真卡片同构', () => {
  const xml = buildMiniProgramCardXml({
    title: 't', desc: 'd', appId: APPID, pagePath: PAGE, username: USERNAME,
    iconUrl: ICON, thumb: REF, thumbWidth: REF.width, thumbHeight: REF.height,
  });
  assert.ok(xml.includes('<appattach>') && xml.includes('</appattach>'), '有凭据必须发 appattach');
  for (const node of ['cdnthumburl', 'cdnthumbaeskey', 'cdnthumbmd5', 'cdnthumblength', 'cdnthumbwidth', 'cdnthumbheight']) {
    assert.ok(xml.includes(`<${node}>`), `appattach 缺 ${node} (真卡片 6 个都有)`);
  }
  assert.ok(xml.includes(`<cdnthumburl>${REF.fileId}</cdnthumburl>`), 'fileId → cdnthumburl');
  assert.ok(xml.includes(`<cdnthumbaeskey>${REF.aesKey}</cdnthumbaeskey>`), 'aesKey → cdnthumbaeskey');
  assert.ok(xml.includes(`<cdnthumbmd5>${REF.md5}</cdnthumbmd5>`), 'md5');
  assert.ok(xml.includes(`<cdnthumblength>${REF.length}</cdnthumblength>`), 'length');
  assert.ok(xml.includes(`<md5>${REF.md5}</md5>`), '真卡片顶层也有缩略图 md5 (两处同值)');
  // 节点顺序照抄真卡片: url 在 aeskey 前, 顶层 md5 在 des 之后
  assert.ok(xml.indexOf('<cdnthumburl>') < xml.indexOf('<cdnthumbaeskey>'));
  assert.ok(xml.indexOf('</des>') < xml.indexOf(`<md5>${REF.md5}</md5>`), '顶层 md5 必须在 des 之后 (真卡片次序)');
  // 转义: 无论哪个节点塞了 & 都必须转义
  const amp = buildMiniProgramCardXml({ title: 't', appId: APPID, pagePath: PAGE, thumb: { fileId: 'ab'.repeat(10), aesKey: 'cd'.repeat(8), md5: 'e'.repeat(32) } });
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;)/.test(amp), 'XML 内不得有未转义的裸 &');
});

test('2b. extractCdnThumbRef: 认厂商原样字段名 Fileid/Aeskey/TotalLen; 不可信输入一律 null', () => {
  // 实测响应 (字段名是厂商 Go 结构体原样序列化, swagger 里只有 file_id/url 示例, 完全对不上)
  assert.deepEqual(extractCdnThumbRef({ Fileid: REF.fileId, Aeskey: REF.aesKey, TotalLen: 14884 }), {
    fileId: REF.fileId, aesKey: REF.aesKey, length: 14884,
  });
  // 大小写变体容忍
  assert.ok(extractCdnThumbRef({ FileId: REF.fileId, AesKey: REF.aesKey }));
  // 缺任一必需项 ⇒ null (半截凭据会让客户端取图失败)
  assert.equal(extractCdnThumbRef({ Fileid: REF.fileId }), null, '缺 aeskey 必须 null');
  assert.equal(extractCdnThumbRef({ Aeskey: REF.aesKey }), null, '缺 fileid 必须 null');
  // 非 hex / 过短 (占位符 "FILE_ID" 这类) 必须拒 —— 否则会把占位符发上线, 卡片变灰块且难查
  assert.equal(extractCdnThumbRef({ Fileid: 'FILE_ID', Aeskey: REF.aesKey }), null);
  assert.equal(extractCdnThumbRef({ Fileid: 'zz'.repeat(20), Aeskey: REF.aesKey }), null);
  assert.equal(extractCdnThumbRef({ Fileid: 'ab', Aeskey: REF.aesKey }), null, '过短必须拒');
  assert.equal(extractCdnThumbRef(undefined), null);
  assert.equal(extractCdnThumbRef({}), null);
});

test('2c. imagePixelSize: PNG/JPEG 尺寸可读, 认不出返 undefined 不抛', () => {
  // 最小 PNG 头: 签名 + 长度 + IHDR + 宽高 (140×140)
  const png = Buffer.alloc(24);
  png.writeUInt32BE(0x89504e47, 0);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(140, 16);
  png.writeUInt32BE(140, 20);
  assert.deepEqual(imagePixelSize(png), { width: 140, height: 140 });
  // 真图标实测 140×140 (cdnthumbwidth/height 用这个值)
  assert.deepEqual(imagePixelSize(png), { width: REF.width, height: REF.height });
  // JPEG: FF D8 + SOF0 (FFC0, len 17, prec 8, h, w)
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x02, 0xd0, 0x03]);
  assert.deepEqual(imagePixelSize(jpg), { width: 720, height: 600 });
  assert.equal(imagePixelSize(Buffer.from("not an image")), undefined);
  assert.equal(imagePixelSize(Buffer.alloc(0)), undefined);
});

test('2d. cdnThumbRefFromUpload: 响应凭据 + 本地字节 ⇒ 完整 appattach 凭据 (纯函数, 真打厂商那段只剩 IO)', () => {
  const png = Buffer.alloc(24);
  png.writeUInt32BE(0x89504e47, 0);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(REF.width, 16);
  png.writeUInt32BE(REF.height, 20);
  const realPng = Buffer.concat([png, Buffer.alloc(REF.length - 24, 7)]); // 补齐到真图标字节数

  // ① 厂商给了 TotalLen ⇒ 用它 (权威值), 并补上本地算的 md5 + 解析出的尺寸
  const full = cdnThumbRefFromUpload(realPng, { Fileid: REF.fileId, Aeskey: REF.aesKey, TotalLen: REF.length });
  assert.equal(full.fileId, REF.fileId);
  assert.equal(full.aesKey, REF.aesKey);
  assert.equal(full.length, REF.length, 'TotalLen 必须作为 cdnthumblength');
  assert.equal(full.width, REF.width, '必须解析出像素宽 (cdnthumbwidth)');
  assert.equal(full.height, REF.height, '必须解析出像素高 (cdnthumbheight)');
  assert.equal(full.md5, createHash("md5").update(realPng).digest("hex"), 'md5 必须是**本地真实字节**的 md5 (客户端会校验)');
  assert.notEqual(full.md5, createHash("md5").update(png).digest("hex"), '不能拿别的东西凑 md5');

  // ② 厂商没给 TotalLen ⇒ 用本地字节数兜底 (同源同值), 不能是 undefined
  const noLen = cdnThumbRefFromUpload(realPng, { Fileid: REF.fileId, Aeskey: REF.aesKey });
  assert.equal(noLen.length, realPng.length, 'TotalLen 缺失必须用本地字节数兜底');

  // ③ 尺寸认不出 (非 PNG/JPEG) ⇒ 只是没有 width/height, 其余照给 (不能整条作废)
  const junk = Buffer.from("not an image at all");
  const noSize = cdnThumbRefFromUpload(junk, { Fileid: REF.fileId, Aeskey: REF.aesKey });
  assert.equal(noSize.width, undefined);
  assert.equal(noSize.height, undefined);
  assert.equal(noSize.length, junk.length);
  assert.equal(noSize.md5, createHash("md5").update(junk).digest("hex"));
  assert.equal(extractCdnThumbRef({ Fileid: "FILE_ID", Aeskey: REF.aesKey }), null, '占位符响应 ⇒ 整条作废');

  // ④ 响应不可用 ⇒ null (调用方按"没图"发)
  assert.equal(cdnThumbRefFromUpload(realPng, { Code: -8 }), null);
});

// ===== 3. 行为分叉 + 缩略图上传 =====
test('3. buildXCXContent: 有 pagePath ⇒ 现代卡片且先传缩略图; 无 ⇒ legacy 逐字节不变且不传图', async () => {
  const base = { title: '国补领券', desc: '国家消费品换新补贴微信端', url: 'https://example.com/h5', appId: APPID };

  // ① 现代 + 缩略图: 上传器必须被调用一次, 且凭据进 appattach
  const up1 = spyUploader(REF);
  const modern = await buildXCXContent('wxid_me', { ...base, thumbUrl: ICON, pagePath: PAGE, username: USERNAME }, up1);
  assert.deepEqual(up1.calls, [ICON], '必须把 thumbUrl 交给上传器 (卡片有图的关键)');
  assert.ok(modern.includes(`<pagepath>${PAGE}</pagepath>`));
  assert.ok(modern.includes(`<cdnthumburl>${REF.fileId}</cdnthumburl>`), '上传回来的凭据必须进 XML');
  // 像素尺寸也要跟着进 appattach: 上传器给的 ref 里带了 width/height ⇒ 必须出现在 XML 里
  // (cdnthumbwidth/height 是微信端排版依据; 丢了会让卡片缩略图被拉成方形/错位)
  assert.ok(
    modern.includes(`<cdnthumbwidth>${REF.width}</cdnthumbwidth>`) &&
      modern.includes(`<cdnthumbheight>${REF.height}</cdnthumbheight>`),
    '上传器返回的像素尺寸必须进 appattach (cdnthumbwidth/height)',
  );
  assert.ok(modern.includes(`<cdnthumbmd5>${REF.md5}</cdnthumbmd5>`), '上传器算出的 md5 必须进 appattach');
  assert.ok(modern.includes('<type>33</type>'));

  // ② 上传失败 ⇒ 照发卡片但不带 appattach (绝不能因为没图就把消息丢了)
  const up2 = spyUploader(null);
  const noThumb = await buildXCXContent('wxid_me', { ...base, thumbUrl: ICON, pagePath: PAGE, username: USERNAME }, up2);
  assert.equal(up2.calls.length, 1, '失败也要尝试过');
  assert.ok(noThumb.includes(`<pagepath>${PAGE}</pagepath>`), '没图也必须能打开页面');
  assert.ok(!noThumb.includes('appattach'), '没凭据不得发 appattach');

  // ③ 没有 thumbUrl ⇒ 不该无谓打上传端点
  const up3 = spyUploader(REF);
  const noUrl = await buildXCXContent('wxid_me', { ...base, pagePath: PAGE, username: USERNAME }, up3);
  assert.equal(up3.calls.length, 0, '没有图 URL 就不该上传');
  assert.ok(noUrl.includes(`<pagepath>${PAGE}</pagepath>`));

  // ④ legacy 分支: 逐字节与旧实现一致, 且**不触发上传**
  const up4 = spyUploader(REF);
  const legacy = await buildXCXContent('wxid_me', { ...base, thumbUrl: ICON }, up4);
  const expected = buildAppMsgXml('wxid_me', base.title, base.desc, {
    appid: APPID, sourcedisplayname: base.title, url: base.url, weappiconurl: ICON,
  });
  assert.equal(legacy, expected, 'legacy 分支必须与旧实现逐字节一致 (老调用方零回归)');
  assert.equal(up4.calls.length, 0, 'legacy 卡片不得触发上传 (会白发给 filehelper 一条图)');
  assert.ok(!legacy.includes('pagepath') && legacy.includes('<type>2001</type>'));

  // ⑤ 空 pagePath = 没给
  const up5 = spyUploader(REF);
  const empty = await buildXCXContent('wxid_me', { ...base, thumbUrl: ICON, pagePath: '', username: USERNAME }, up5);
  assert.equal(empty, expected, '空 pagePath 必须走 legacy');
  assert.equal(up5.calls.length, 0);
});

// ===== 3b. v1.6.4 凭据透传 (转发原卡片: 图必须与原卡片一致) =====
// 背景: 老板 2026-09-13 实测「转发的小程序卡片图片不是收到的那张」。真相是: 原卡片的 appattach
//   凭据在**微信客户端**手里是好的 (20:45 原样透传 ⇒ 老板看到的就是原图), 而厂商服务端下载口
//   (/Tools/DownloadMiniProgramCover、/Tools/CdnDownloadImage) 对同样凭据恒返 -5103017。
//   ⇒ 转发必须**透传原凭据**, 而不是下载+自己上传 (那只能拿到 140×140 图标当替代品)。
test('3b. 令牌往返: formatThumbToken ↔ parseThumbToken 严格互逆 (含 version/iconUrl 缺省)', () => {
  const t = formatThumbToken(ORIGINAL);
  assert.ok(t.startsWith(THUMB_TOKEN_PREFIX), '令牌带前缀, 便于在注记里被认出');
  // iconUrl 里有 ':' (https://) ⇒ 令牌格式必须能原样还原它, 否则转发会把 weappiconurl 切坏
  assert.deepEqual(parseThumbToken(t), ORIGINAL, '往返必须逐字段相等 (含含冒号的 iconUrl)');

  const noIcon = { fileId: ORIGINAL.fileId, aesKey: ORIGINAL.aesKey, width: 720, height: 576 };
  const t2 = formatThumbToken(noIcon);
  assert.deepEqual(parseThumbToken(t2), noIcon, '缺 md5/version/iconUrl 也要能往返');
  // 只有 fileId+aesKey 的最小令牌
  const min = { fileId: ORIGINAL.fileId, aesKey: ORIGINAL.aesKey };
  assert.deepEqual(parseThumbToken(formatThumbToken(min)), min, '最小令牌往返');

  // 不是令牌 / 凭据不合法 ⇒ null (调用方按"没图"处理, 不许把垃圾塞进 appattach)
  assert.equal(parseThumbToken(undefined), null);
  assert.equal(parseThumbToken(''), null);
  assert.equal(parseThumbToken(ICON), null, '普通 URL 不是令牌');
  assert.equal(parseThumbToken('xcxthumb:abc:def'), null, '字段不够');
  assert.equal(parseThumbToken(`${THUMB_TOKEN_PREFIX}ZZZZ:${ORIGINAL.aesKey}`), null, 'fileId 非 hex');
  assert.equal(parseThumbToken(`${THUMB_TOKEN_PREFIX}${ORIGINAL.fileId}:短`), null, 'aesKey 非 hex/太短');
});

test('3c. buildXCXContent: 令牌 ⇒ 原凭据直接进 appattach, 一个字节都不下载/上传', async () => {
  const base = { title: '苏新消费', desc: '苏新消费', url: '', appId: 'wx8166b5f9f3ffa696' };
  const token = formatThumbToken(ORIGINAL);

  const up = spyUploader(REF);
  const xml = await buildXCXContent(
    'wxid_me',
    { ...base, thumbUrl: token, pagePath: 'subPackages/lottery/pages/bannerActivity/bannerActivity.html?type=zt1', username: 'gh_671ee582e55c@app' },
    up,
  );
  assert.equal(up.calls.length, 0, 'token 路线**不得**触发上传 (上传换来的是替代图, 就是本轮 bug 根因)');
  for (const [node, v] of [
    ['cdnthumburl', ORIGINAL.fileId],
    ['cdnthumbaeskey', ORIGINAL.aesKey],
    ['cdnthumbmd5', ORIGINAL.md5],
    ['cdnthumbwidth', String(ORIGINAL.width)],
    ['cdnthumbheight', String(ORIGINAL.height)],
    ['cdnthumblength', String(ORIGINAL.length)],
  ]) {
    assert.ok(xml.includes(`<${node}>${v}</${node}>`), `${node} 必须是原卡片的值 (透传保真)`);
  }
  assert.ok(xml.includes(`<md5>${ORIGINAL.md5}</md5>`), '顶层 md5 也要透传 (真卡片两处同值)');
  assert.ok(xml.includes(`<version>${ORIGINAL.version}</version>`), 'weappinfo.version 透传');
  assert.ok(xml.includes(`<weappiconurl>${ORIGINAL.iconUrl.replace(/&/g, '&amp;')}</weappiconurl>`), 'iconUrl 透传 (含 & 要转义)');
  assert.ok(!xml.includes(THUMB_TOKEN_PREFIX), '令牌串本身绝不许漏进 XML');

  // 令牌非法 (前缀对但内容坏) ⇒ 既不上传也不带 appattach, 但卡片照发
  const up2 = spyUploader(REF);
  const bad = await buildXCXContent('wxid_me', { ...base, thumbUrl: 'xcxthumb:zzz:zzz', pagePath: PAGE, username: USERNAME }, up2);
  assert.equal(up2.calls.length, 0, '坏令牌不得退化成"当成 URL 去取图"');
  assert.ok(bad.includes(`<pagepath>${PAGE}</pagepath>`));
  assert.ok(!bad.includes('appattach') && !bad.includes('weappiconurl'), '坏令牌不许漏进 XML 任何节点');
});

// ===== 4. sendXCX 接线 =====
test('4. sendXCX: 8 参数 + await buildXCXContent + 注入真实上传器', () => {
  const closure = msgSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .join('\n');
  // 反向注入实测: 把 buildXCXContent 换回 buildAppMsgXml, 或去掉 uploadCdnThumb 注入 ⇒ 本断言必须 FAIL
  const m = closure.match(/Content: await buildXCXContent\([\s\S]*?\)/);
  assert.ok(m, 'sendXCX 的 Content 必须由 buildXCXContent 决定 (唯一分叉点)');
  for (const k of ['title: xcxTitle', 'desc: xcxDesc', 'appId: xcxAppId', 'thumbUrl', 'pagePath', 'username', 'uploadCdnThumb']) {
    assert.ok(m[0].includes(k), `Content 构造必须带上 ${k}: ${m[0]}`);
  }
  assert.ok(
    /sendXCX: async \(\s*toWxid: string,\s*xcxTitle: string,\s*xcxDesc: string,\s*xcxUrl: string,\s*xcxAppId: string,\s*thumbUrl\?: string,\s*pagePath\?: string,\s*username\?: string,\s*\)/.test(
      closure,
    ),
    'sendXCX 必须是 async 8 参数 (pagePath/username 追加在末尾 ⇒ 位置传参的老调用方不位移)',
  );
});

// ===== 5. 上传的安全边界 (真发上线前必须守住的两条) =====
test('5. 缩略图上传: 只发 filehelper + 走 SSRF 安全取图 + 失败非致命', () => {
  // ⚠️ 这条是**安全属性**: 若 THUMB_UPLOAD_TARGET 被改成 toWxid, 每次发卡片都会给客户多推一张图
  //   (而且客户会先收到一张莫名其妙的图片)。故锁死目标常量。
  const target = msgSrc.split('\n').map((l) => l.trim()).find((l) => l.startsWith('const THUMB_UPLOAD_TARGET'));
  assert.equal(target, 'const THUMB_UPLOAD_TARGET = "filehelper";', `上传目标必须是 filehelper (不得是客户): ${target}`);
  // 取图必须复用图片链路的 SSRF 安全实现 (host 白名单 + 大小 cap), 不许自己 fetch
  const block = msgSrc.slice(msgSrc.indexOf('const uploadCdnThumb'), msgSrc.indexOf('const sendFileViaAppFromUrl'));
  assert.ok(block.includes('await resolveImageToBase64(thumbUrl)'), '必须用 resolveImageToBase64 (SSRF 安全) 取图');
  assert.ok(!/\bfetch\(/.test(block), '不得在缩略图链路里裸 fetch');
  assert.ok(block.includes('"/Msg/UploadImg"'), '上传端点必须是 /Msg/UploadImg');
  assert.ok(block.includes('catch'), '上传失败必须被吞掉 (非致命)');
});

// ===== 6. 透传链 =====
test('6. 透传链完整: agent 工具 schema → send-message → sendXCX', () => {
  const sendMsg = read(`${ROOT}/src/dispatch/agent-tools/msg-meta.ts`);
  const at = sendMsg.indexOf('emoji: 大小字节');
  assert.ok(at > 0, '必须能定位到统一入口 schema');
  const schema = sendMsg.slice(at);
  const lastAts = schema.lastIndexOf('ats: Type.Optional');
  const pageAt = schema.indexOf('pagePath: Type.Optional');
  const userAt = schema.indexOf('username: Type.Optional');
  assert.ok(lastAts > 0 && pageAt > 0 && userAt > 0, '三个锚点必须都在统一入口 schema 段内');
  assert.ok(pageAt > lastAts, `pagePath 必须排在既有末参 ats 之后 (位置传参), 实得 ${pageAt} vs ${lastAts}`);
  assert.ok(userAt > pageAt, 'username 必须排在 pagePath 之后');
  assert.ok(/durationMs, size, ats,\s*\n\s*pagePath, username,/.test(sendMsg), '必须送进 sendMessage');
  assert.ok(/getMsgApi\(\)\.sendXCX\(toWxid, xcxTitle, xcxDesc, xcxUrl, xcxAppId, thumbUrl, pagePath, xcxUsername\)/.test(sendMsg),
    'sendMiniProgram 必须透传 thumbUrl/pagePath/xcxUsername (旧版丢了 thumbUrl)');
  const dispatchSrc = read(`${ROOT}/src/dispatch/send-message.ts`);
  assert.ok(/api\.sendXCX\(toWxid, p\.title \?\? "", p\.desc \?\? "", p\.content \?\? "", p\.appId \?\? "", p\.thumbUrl, p\.pagePath, p\.username\)/.test(dispatchSrc),
    'send-message 的 miniprogram 分支必须透传 pagePath/username/thumbUrl');
});

// ===== 7. 入站注记必须带 username (转发必备参数) =====
test('7. 入站注记带 gh_xxx@app ⇒ 小助理能凭注记复现同一张卡片', () => {
  const appCard = read(`${ROOT}/src/inbound/app-card.ts`);
  assert.ok(/info\.username \?\? ""/.test(appCard), 'formatMiniProgramCard 必须输出 username');
  assert.ok(/ids\.join\(", "\)/.test(appCard), 'appid 与 username 同行输出');
  const fixture = JSON.parse(read(`${ROOT}/tests/fixtures/miniprogram-card.json`));
  assert.match(fixture.app.mini_program.username, /^gh_[0-9a-z]+@app$/, '真报文 username 形态');
  assert.ok(/<pagepath>/.test(fixture.app.raw_xml), '真报文 raw_xml 含 pagepath');
  // 真卡片 appattach 的凭据形态 = 我们自造凭据的校验规则 (同构是本次方案的立足点)
  const m = fixture.app.raw_xml.match(/<cdnthumburl>([^<]+)<\/cdnthumburl>/);
  const k = fixture.app.raw_xml.match(/<cdnthumbaeskey>([^<]+)<\/cdnthumbaeskey>/);
  assert.ok(m && k, '真卡片必须带 cdnthumburl/cdnthumbaeskey');
  assert.match(m[1], /^[0-9a-fA-F]+$/, '真卡片 cdnthumburl 是纯 hex');
  assert.equal(k[1].length, 32, '真卡片 cdnthumbaeskey 是 32 位 hex');
  assert.ok(extractCdnThumbRef({ Fileid: m[1], Aeskey: k[1] }), '真卡片凭据必须能过我们的校验 (同构)');
});
