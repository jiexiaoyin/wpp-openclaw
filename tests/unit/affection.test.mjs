/**
 * affection.ts + jargon.ts 单元测试
 * v1.4.0 P0-fix 19:30: 单次调用 timeoutMs=5000
 */
import assert from 'node:assert';
import { test } from 'node:test';

test('affection.ts defaultAffectionConfig timeoutMs=5000', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../src/inbound/affection.ts', import.meta.url), 'utf-8');
  assert.match(src, /timeoutMs:\s*5000/, 'defaultAffectionConfig.timeoutMs must be 5000');
});

test('affection.ts AbortSignal.timeout 5000ms', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../src/inbound/affection.ts', import.meta.url), 'utf-8');
  assert.match(src, /signal: AbortSignal\.timeout\(cfg\.timeoutMs \?\? 5000\)/);
});

test('jargon.ts defaultJargonConfig timeoutMs=5000', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../src/inbound/jargon.ts', import.meta.url), 'utf-8');
  assert.match(src, /timeoutMs:\s*5000/, 'defaultJargonConfig.timeoutMs must be 5000');
});

test('jargon.ts: no MiniMax-M2.5 hardcode (P0-fix 19:31 消除)', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../src/inbound/jargon.ts', import.meta.url), 'utf-8');
  const codeLines = src.split('\n').filter(l => !l.trim().startsWith('//'));
  const hits = codeLines.filter(l => /"MiniMax-M2\.5"/.test(l));
  assert.strictEqual(hits.length, 0, `jargon.ts should have 0 MiniMax-M2.5 hardcode, found: ${hits.join('; ')}`);
});

test('intent-llm.ts: no MiniMax-M2.5 hardcode', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../src/dispatch/intent-llm.ts', import.meta.url), 'utf-8');
  const codeLines = src.split('\n').filter(l => !l.trim().startsWith('//'));
  const hits = codeLines.filter(l => /"MiniMax-M2\.5"/.test(l));
  assert.strictEqual(hits.length, 0, `intent-llm.ts should have 0 MiniMax-M2.5 hardcode, found: ${hits.join('; ')}`);
});

test('dispatcher.ts: no MiniMax-M2.5 hardcode', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../src/dispatch/dispatcher.ts', import.meta.url), 'utf-8');
  const codeLines = src.split('\n').filter(l => !l.trim().startsWith('//'));
  const hits = codeLines.filter(l => /"MiniMax-M2\.5"/.test(l));
  assert.strictEqual(hits.length, 0, `dispatcher.ts should have 0 MiniMax-M2.5 hardcode, found: ${hits.join('; ')}`);
});