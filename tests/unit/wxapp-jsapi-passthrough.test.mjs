// wxapp-jsapi-passthrough.test.mjs — v1.6.5 Wxapp 接线修正: data/opt 真透传
//
// 背景 (2026-09-13 实测, 见 CHANGELOG v1.6.5):
//   /Wxapp/JSOperateWxData 是**通用微信 JSAPI 通道**, 实测 data={"api_name":"webapi_getwxaasyncsecinfo",…}
//   ⇒ errcode 0 + 真载荷; data="{}" ⇒ -10001 invalid request; 非法 api_name ⇒ -12003.
//   而 meta 里的 execute 是 `(appId, _data) => …jsOperateWxData(appId, {})` —— **data 被丢、opt 从不发**,
//   于是助手侧这条通道 100% 得到 -10001 (即「工具存在但永远失败」). cloudCallFunction 同病, 且多发一个
//   契约里没有的顶层 functionName. 本测试把「真透传」钉死.
//
// ⚠️ 教训 (2026-09-13): 「符号出现过」类断言无牙 (反向注入实测) ⇒ 行为断言为主 (fetch 桩抓请求体),
//   必须看源码时断言**完整调用行**.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const read = (p) => fs.readFileSync(p, 'utf-8');

// ⚠️ 必须先剥注释: 本文件注释/源码注释里就写着 "旧码 (appId, functionName, _data)" ——
//   裸断言会被注释假红、"符号出现过"又会被注释假绿 (2026-09-13 踩过两次)
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

/** 桩: 抓请求体/URL/headers, 返回固定信封; 用完必须还原 (try/finally) */
async function withStub(fn) {
  const orig = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body), headers: init.headers });
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify({ Code: 0, Data: { ok: true } }),
    };
  };
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = orig;
  }
}

const CTX = { baseUrl: 'https://vendor.test', tokenKey: 'tk-test', authcode: 'ac-test', accountId: 'default' };
const { makeWppWxapp } = await import(pathToFileURL(`${ROOT}/dist/send/wxapp.js`).href);
const api = makeWppWxapp(CTX);

const API_NAME_PAYLOAD = '{"api_name":"webapi_getwxaasyncsecinfo","data":{},"opt":1}';

// ===== 1. JSOperateWxData: data 与 opt 必须原样到厂商 =====
test('1. jsOperateWxData: data 原样透传 (字符串不二次编码, 对象则序列化) + opt 真发出', async () => {
  // 1a. 字符串入参 = 调用方已备好的 JSAPI JSON ⇒ 一个字节都不许改
  await withStub(async (calls) => {
    await api.jsOperateWxData('wx8166b5f9f3ffa696', API_NAME_PAYLOAD, 2);
    assert.equal(calls.length, 1);
    const { url, body } = calls[0];
    assert.match(url, /\/api\/Wxapp\/JSOperateWxData\?authcode=ac-test$/, `端点/authcode 不对: ${url}`);
    assert.equal(body.data, API_NAME_PAYLOAD, 'data 必须逐字节透传 (旧码恒发 {} ⇒ -10001)');
    assert.equal(body.opt, 2, 'opt 必须发出 (旧码从不发)');
    assert.equal(body.appid, 'wx8166b5f9f3ffa696', 'appid 按契约小写拼写 (实测可用)');
  });

  // 1b. 对象入参 ⇒ send 层序列化 (契约 data 是 string)
  await withStub(async (calls) => {
    await api.jsOperateWxData('wx1', { api_name: 'x', data: { a: 1 } });
    assert.deepEqual(JSON.parse(calls[0].body.data), { api_name: 'x', data: { a: 1 } });
    assert.ok(!('opt' in calls[0].body), 'opt 未给 ⇒ 不得凭空造一个 (厂商 1=写入, 猜错是写操作)');
  });
});

// ===== 2. CloudCallFunction: data 透传 + 不许再发契约外的顶层 functionName =====
test('2. cloudCallFunction: 只发 {appid,data}; 顶层 functionName 不得出现', async () => {
  await withStub(async (calls) => {
    await api.cloudCallFunction('wx1', '{"functionName":"getActivity","data":{}}');
    const { body } = calls[0];
    assert.equal(body.data, '{"functionName":"getActivity","data":{}}');
    assert.equal(body.appid, 'wx1');
    // 契约 (POST_Wxapp_CloudCallFunction) 只有 appid/data ⇒ 未知字段被 Go 静默忽略, 发了等于撒谎
    assert.deepEqual(Object.keys(body).sort(), ['appid', 'authcode', 'data'], `body 键集合不对: ${Object.keys(body)}`);
  });
});

// ===== 3. GetWxAppRecord: 契约无参 (旧码发的 appId 厂商不认) =====
test('3. getWxAppRecord: body 只有 authcode (无 appId)', async () => {
  await withStub(async (calls) => {
    await api.getWxAppRecord();
    const { url, body } = calls[0];
    assert.match(url, /\/api\/Wxapp\/GetWxAppRecord\?authcode=ac-test$/);
    assert.deepEqual(Object.keys(body), ['authcode'], `不得发契约外字段: ${JSON.stringify(body)}`);
  });

  // ⚠️ 上面这条行为断言**抓不到**「签名被加回一个可选 appId」——因为我们自己的调用本来就不传参,
  //   JSON.stringify 又会把 undefined 丢掉 (2026-09-13 反向注入实测: 该变异 MISSED). 这类回归是**源码形态**问题,
  //   只能靠完整行断言兜住 (回归真发生 = 有人又给这条无参端点塞参数, 正是 v1.6.5 修掉的那个 bug).
  const sendSrc = stripComments(read(`${ROOT}/src/send/wxapp.ts`));
  const line = sendSrc.split('\n').map((l) => l.trim()).find((l) => l.startsWith('getWxAppRecord:'));
  assert.equal(
    line,
    'getWxAppRecord: () => dispatch("/Wxapp/GetWxAppRecord", {}),',
    `getWxAppRecord 签名/调用行必须逐字如此 (契约无参): ${line}`,
  );
});

// ===== 4. meta 接线: 断言完整调用行 (符号出现过不算数) =====
test('4. wxapp-meta: 调用行逐字锁定 (data/opt 透传, 再无 _data)', () => {
  const src = stripComments(read(`${ROOT}/src/dispatch/agent-tools/wxapp-meta.ts`));
  const lines = src.split('\n').map((l) => l.trim());

  const jsOp = lines.find((l) => l.includes('jsOperateWxData(appId'));
  assert.ok(jsOp, 'meta 必须有 jsOperateWxData 的调用行');
  assert.equal(
    jsOp,
    '(appId: string, data: string, opt?: number) => getWxappApi().jsOperateWxData(appId, data, opt),',
    `jsOperateWxData 调用行必须逐字如此 (旧码丢弃 data ⇒ 恒发 {} ⇒ -10001): ${jsOp}`,
  );
  const cloud = lines.find((l) => l.includes('cloudCallFunction(appId'));
  assert.ok(cloud, 'meta 必须有 cloudCallFunction 的调用行');
  assert.equal(
    cloud,
    '(appId: string, data: string) => getWxappApi().cloudCallFunction(appId, data),',
    `cloudCallFunction 调用行必须逐字如此: ${cloud}`,
  );

  // schema: jsOperateWxData 必须暴露 opt; cloudCallFunction 不得再暴露契约外的 functionName
  assert.match(src, /opt: Type\.Optional\(Type\.Number\(/, 'jsOperateWxData 必须暴露 opt');
  assert.doesNotMatch(src, /functionName/, 'cloudCallFunction 不得再暴露契约外的 functionName');
  // 描述里要写清 data 的形状, 否则模型只会传 "{}" (就退化成 -10001)
  assert.match(src, /api_name/, 'jsOperateWxData 描述必须给出 api_name 形状');
});
