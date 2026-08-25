/**
 * triggers.js 4-way OR 触发器测试
 * v1.4.0 P0-fix 19:30: 触发器完整性验证
 */
import assert from 'node:assert';
import { test } from 'node:test';
import fs from 'node:fs';

const DEPLOY = '/root/.openclaw/extensions/wechatpadpro/';

test('triggers.js 4-way OR 触发器 (at/msgType/quoteBot/heartflow)', () => {
  const src = fs.readFileSync(`${DEPLOY}dist/inbound/triggers.js`, 'utf-8');
  for (const via of ['at', 'msgType', 'quoteBot', 'heartflow']) {
    assert.match(src, new RegExp(`via:\\s*"${via}"`), `trigger must include via:"${via}"`);
  }
});

test('triggers.js via blocked (静默拒绝 fail-closed)', () => {
  const src = fs.readFileSync(`${DEPLOY}dist/inbound/triggers.js`, 'utf-8');
  assert.match(src, /via:\s*"blocked"/);
});

test('triggers.js 5-way 拒绝理由 (disabled/not-whitelisted/cooling/judge-cooldown/empty)', () => {
  const src = fs.readFileSync(`${DEPLOY}dist/inbound/heartflow.js`, 'utf-8');
  for (const reason of ['disabled', 'not-whitelisted', 'cooling', 'judge-cooldown', 'empty']) {
    assert.match(src, new RegExp(`reason:\\s*"${reason}"`), `heartflow must include reason:"${reason}"`);
  }
});
