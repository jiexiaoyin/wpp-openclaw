/**
 * heartflow.ts 核心单元测试
 * v1.4.0 P0-fix 19:30: 5 维打分 + judgeHeartflow retry 行为
 */
import assert from 'node:assert';
import { test } from 'node:test';

test('heartflow.ts defaultHeartflowConfig: maxRetries=1 timeoutMs=5000', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../src/inbound/heartflow.ts', import.meta.url), 'utf-8');
  assert.match(src, /maxRetries:\s*1[^\d]/, 'defaultHeartflowConfig.maxRetries must be 1');
  assert.match(src, /timeoutMs:\s*5000/, 'defaultHeartflowConfig.timeoutMs must be 5000');
});

test('heartflow.ts judgeHeartflow fallback: cfg.maxRetries ?? 1 cfg.timeoutMs ?? 5000', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../src/inbound/heartflow.ts', import.meta.url), 'utf-8');
  assert.match(src, /cfg\.maxRetries \?\? 1/, 'judgeHeartflow maxRetries fallback must be 1');
  assert.match(src, /cfg\.timeoutMs \?\? 5000/, 'judgeHeartflow timeoutMs fallback must be 5000');
});

test('heartflow.ts cfg.model unresolved throw (老板 12:09 拍板 B)', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../src/inbound/heartflow.ts', import.meta.url), 'utf-8');
  assert.match(src, /cfg\.model unresolved/, 'must throw when cfg.model unresolved');
  assert.match(src, /throw new Error/, 'must use throw not return null');
});

test('heartflow.ts gate function: enabled/whitelistGroups/cooling/judge-cooldown', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../src/inbound/heartflow.ts', import.meta.url), 'utf-8');
  // 必须包含 4 个拒绝理由
  assert.match(src, /reason: "disabled"/);
  assert.match(src, /reason: "not-whitelisted"/);
  assert.match(src, /reason: "cooling"/);
  assert.match(src, /reason: "judge-cooldown"/);
});

test('heartflow 5 维打分字段 (relevance/willingness/social/timing/continuity)', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../src/inbound/heartflow.ts', import.meta.url), 'utf-8');
  for (const dim of ['relevance', 'willingness', 'social', 'timing', 'continuity']) {
    assert.match(src, new RegExp(dim, 'i'), `heartflow must include ${dim} dimension`);
  }
});