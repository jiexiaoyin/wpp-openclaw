// tests/unit/finder-meta-deprecation.test.mjs - v1.9.2 P2-提分: decryptWeComSession 主路径 + decryptFinderComment deprecation alias
//
// v1.9.2 (commit 5d3a135): 新增正确命名的 decryptWeComSession; 旧 decryptFinderComment
// 保留为 deprecation alias (向后兼容, 计划 v2.0 移除). 本测试锁定:
//   1. 新工具存在, 描述准确 (能力面 = 企微, 非视频号)
//   2. 旧工具保留, 描述标 @deprecated, 引导 LLM 用新名
//   3. 两者底层调用同一 decrypt (toString 等价, 不是巧合)
//   4. 两者 schema 一致 (Content 字段一致, 避免后续给老工具偷偷改 schema)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FINDER_META } from '../../dist/dispatch/agent-tools/finder-meta.js';

const newName = 'decryptWeComSession';
const oldName = 'decryptFinderComment';

// ── 新工具存在 + 描述准确 ─────────────────────────────────────────────
test('decryptWeComSession 作为主工具存在', () => {
  assert.ok(newName in FINDER_META, `FINDER_META 应含 ${newName} (主路径, 命名准确)`);
  const entry = FINDER_META[newName];
  assert.equal(Array.isArray(entry), true, '工具条目应是 [desc, schema, fn] 三元组');
});

test('decryptWeComSession 描述准确说明能力面 (企微而非视频号)', () => {
  const [desc] = FINDER_META[newName];
  assert.ok(desc.includes('企业微信会话记录'), '描述应说"企业微信会话记录"');
  assert.ok(desc.includes('不用于视频号'), '描述应明示不用于视频号, 避免 LLM 误选型');
  assert.ok(!desc.includes('视频号评论'), '不应再提"视频号评论" (旧名误导语义)');
});

test('decryptWeComSession schema 是 Content 字段', () => {
  const [, schema] = FINDER_META[newName];
  assert.equal(schema.type, 'object');
  assert.ok('content' in schema.properties, 'vendor Content 字段必须暴露');
});

// ── 旧工具保留 + 标 deprecation ──────────────────────────────────────
test('decryptFinderComment 仍存在 (向后兼容)', () => {
  assert.ok(oldName in FINDER_META, `FINDER_META 应仍含 ${oldName} (deprecation alias, 不能直接删除会破现有调用)`);
  const [desc] = FINDER_META[oldName];
  assert.ok(desc.includes('deprecated'), '描述应明示 deprecated, 引导 LLM 改用新名');
  assert.ok(desc.includes(newName), '描述应指向新工具 decryptWeComSession');
});

// ── 两者 schema 等价 ─────────────────────────────────────────────────
test('新旧两个工具的 schema 完全一致 (字段集与键名)', () => {
  const [, schemaNew] = FINDER_META[newName];
  const [, schemaOld] = FINDER_META[oldName];
  const keysNew = Object.keys(schemaNew.properties ?? {}).sort();
  const keysOld = Object.keys(schemaOld.properties ?? {}).sort();
  assert.deepEqual(keysNew, keysOld, '字段集应一致, 避免后续给老工具偷偷改 schema');
});

// ── 两者底层调用同一个 decrypt ────────────────────────────────────────
test('新旧两个工具的 fn toString 等价 (底层同一 decrypt, 非巧合)', () => {
  const [, , fnNew] = FINDER_META[newName];
  const [, , fnOld] = FINDER_META[oldName];
  assert.equal(typeof fnNew, 'function');
  assert.equal(typeof fnOld, 'function');
  // 两者都是箭头函数 (content) => getFinderApi().decrypt(content)
  // 不同引用, 但编译后源码 toString 应一致 — 这是 deprecation alias 的语义保证
  assert.equal(fnNew.toString(), fnOld.toString(), '底层调用应一致 (不能偷偷给老工具加不同行为)');
  assert.ok(fnNew.toString().includes('decrypt'), '应能识别出 decrypt 调用');
});
