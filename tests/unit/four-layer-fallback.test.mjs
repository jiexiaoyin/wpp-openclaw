/**
 * 4 层兜底链 (maxRetries/timeoutMs) 对齐测试
 * v1.4.0 P0-fix 19:30: L1=L2=L3=L4=1, timeoutMs=5000
 * 测试 fixture: 硬编码 L1 expected 值, 验证 deploy 端 L4 真实加载
 */
import assert from 'node:assert';
import { test } from 'node:test';
import fs from 'node:fs';

const DEPLOY = '/root/.openclaw/extensions/wechatpadpro/';
const DEV = '/root/dev/wechatpadpro-openclaw/';

test('L1 deploy accounts cfg maxRetries=1 (heartflow/affection/jargon)', () => {
  const d = JSON.parse(fs.readFileSync(`${DEPLOY}accounts/default.json`, 'utf-8'));
  assert.strictEqual(d.heartflow.maxRetries, 1, 'L1 heartflow.maxRetries must be 1');
  assert.strictEqual(d.affection.maxRetries, 1, 'L1 affection.maxRetries must be 1');
  assert.strictEqual(d.jargon.maxRetries, 1, 'L1 jargon.maxRetries must be 1');
});

test('L1 deploy accounts cfg timeoutMs=5000', () => {
  const d = JSON.parse(fs.readFileSync(`${DEPLOY}accounts/default.json`, 'utf-8'));
  assert.strictEqual(d.heartflow.timeoutMs, 5000);
  assert.strictEqual(d.affection.timeoutMs, 5000);
  assert.strictEqual(d.jargon.timeoutMs, 5000);
});

test('L1 heartflow.whitelistGroups = 5 群 (益融管理/全员/华为/移动 + 调试群 + 53977339882 + 45575237076)', () => {
  const d = JSON.parse(fs.readFileSync(`${DEPLOY}accounts/default.json`, 'utf-8'));
  const list = d.heartflow.whitelistGroups;
  // v1.5.2 升级: 老板 23:09 共 5 群
  assert.strictEqual(list.length, 5, `whitelistGroups must have 5 groups, got ${list.length}`);
  assert.ok(list.includes('53889526119@chatroom'), '益融管理群');
  assert.ok(list.includes('44971342037@chatroom'), '益融全员群');
  assert.ok(list.includes('19908568237@chatroom'), '益融华为群');
  assert.ok(list.includes('21354014635@chatroom'), '移动业务对接群Ⅱ益融机友');
  assert.ok(list.includes('57737516566@chatroom'), 'gewe 调试群');
});

test('L2 schema heartflow/affection/jargon 只暴露 enabled (maxRetries/timeoutMs/model 不回流 UI schema)', () => {
  const d = JSON.parse(fs.readFileSync(`${DEPLOY}openclaw.plugin.json`, 'utf-8'));
  const sc = d.channelConfigs.wechatpadpro.schema.properties;
  for (const k of ['heartflow', 'affection', 'jargon']) {
    const obj = sc[k];
    assert.ok(obj && obj.properties && obj.properties.enabled, `L2 schema.${k} 必须保留总开关 enabled`);
    assert.equal(obj.properties.maxRetries, undefined, `L2 schema.${k}.maxRetries 不许回流 UI schema (L1 账号文件 / L3 代码默认 / L4 运行兜底权威)`);
    assert.equal(obj.properties.timeoutMs, undefined, `L2 schema.${k}.timeoutMs 不许回流 UI schema`);
  }
});

test('L3 dev defaultHeartflowConfig/Affection/JargonConfig timeoutMs=5000', () => {
  for (const f of ['heartflow', 'affection', 'jargon']) {
    const src = fs.readFileSync(`${DEV}src/inbound/${f}.ts`, 'utf-8');
    assert.match(src, /timeoutMs:\s*5000/, `L3 ${f} defaultConfig timeoutMs must be 5000`);
  }
});

test('L3 dev heartflow defaultConfig maxRetries=1', () => {
  const src = fs.readFileSync(`${DEV}src/inbound/heartflow.ts`, 'utf-8');
  assert.match(src, /maxRetries:\s*1[^\d]/, 'L3 heartflow defaultConfig maxRetries must be 1');
});

test('L4 deploy heartflow.js judge fallback maxRetries=1 timeoutMs=5000', () => {
  const src = fs.readFileSync(`${DEPLOY}dist/inbound/heartflow.js`, 'utf-8');
  assert.match(src, /cfg\.maxRetries \?\? 1/, 'L4 heartflow maxRetries fallback must be 1');
  assert.match(src, /cfg\.timeoutMs \?\? (5000|5e3|5_000)/, 'L4 heartflow timeoutMs fallback must be 5000');
});

test('L4 deploy affection + jargon timeoutMs=5000', () => {
  for (const f of ['affection', 'jargon']) {
    const src = fs.readFileSync(`${DEPLOY}dist/inbound/${f}.js`, 'utf-8');
    assert.match(src, /cfg\.timeoutMs \?\? (5000|5e3|5_000)/, `L4 ${f} timeoutMs fallback must be 5000`);
  }
});

test('L4 deploy dist/ 全文件 0 MiniMax-M2.5 hardcode (排除 node_modules)', () => {
  for (const [f, subdir] of [['intent-llm','dispatch/'],['dispatcher','dispatch/'],['heartflow','inbound/'],['affection','inbound/'],['jargon','inbound/']]) {
    const src = fs.readFileSync(`${DEPLOY}dist/${subdir}${f}.js`, 'utf-8');
    const codeLines = src.split('\n').filter(l => !l.trim().startsWith('//'));
    const hits = codeLines.filter(l => /"MiniMax-M2\.5"/.test(l));
    assert.strictEqual(hits.length, 0, `${f}.js should have 0 MiniMax-M2.5 hardcode, found ${hits.length}`);
  }
});

test('L1/L2 deepseek-flash 切 fallback (B-fix 19:39 老板拍 B)', () => {
  const d1 = JSON.parse(fs.readFileSync(`${DEPLOY}accounts/default.json`, 'utf-8'));
  assert.strictEqual(d1.heartflow.model, 'deepseek-flash', 'L1 heartflow.model must be deepseek-flash');
  assert.strictEqual(d1.affection.model, 'deepseek-flash', 'L1 affection.model must be deepseek-flash');
  assert.strictEqual(d1.jargon.model, 'deepseek-flash', 'L1 jargon.model must be deepseek-flash');
  const d2 = JSON.parse(fs.readFileSync(`${DEPLOY}openclaw.plugin.json`, 'utf-8'));
  const sc = d2.channelConfigs.wechatpadpro.schema.properties;
  for (const k of ['heartflow', 'affection', 'jargon']) {
    assert.equal(sc[k].properties.model, undefined, `L2 schema.${k}.model 不许回流 UI schema (deepseek-flash 切档真相=L1 账号文件 + L3 代码默认)`);
  }
});
