/**
 * send/group.ts 单元测试
 * 审计修复: D7 send/group.ts 测试 0% 覆盖 → 补充
 * 验证: PascalCase 字段名符合 vendor swagger 规范 (ChatRoomName/ToWxids/QID/Val 等)
 */
import assert from 'node:assert';
import { test } from 'node:test';
import fs from 'node:fs';

const DEV_SRC = '/root/dev/wechatpadpro-openclaw/src/send/group.ts';
const DEPLOY_DIST = '/root/.openclaw/extensions/wechatpadpro/dist/send/group.js';

test('group.ts PascalCase 字段名: AddChatRoomMember → ChatRoomName + ToWxids', () => {
  const src = fs.readFileSync(DEV_SRC, 'utf-8');
  // 验证 addMember dispatch 包含正确字段
  assert.match(src, /ChatRoomName:\s*chatroomId/, 'addMember 必须用 ChatRoomName');
  assert.match(src, /ToWxids:\s*wxidList\.join\s*\(/, 'addMember 必须用 ToWxids (逗号分隔)');
});

test('group.ts PascalCase 字段名: CreateChatRoom → ToWxids', () => {
  const src = fs.readFileSync(DEV_SRC, 'utf-8');
  assert.match(src, /dispatch\s*\(\s*"\/Group\/CreateChatRoom"\s*,\s*\{[^}]*ToWxids:/,
    'create 必须用 ToWxids');
});

test('group.ts PascalCase 字段名: DelChatRoomMember → ChatRoomName + ToWxids', () => {
  const src = fs.readFileSync(DEV_SRC, 'utf-8');
  assert.match(src, /ChatRoomName:\s*chatroomId.*ToWxids:/s,
    'delMember 必须同时用 ChatRoomName + ToWxids');
});

test('group.ts PascalCase 字段名: OperateChatRoomAdmin → QID + ToWxids + Val', () => {
  const src = fs.readFileSync(DEV_SRC, 'utf-8');
  assert.match(src, /dispatch\s*\(\s*"\/Group\/OperateChatRoomAdmin"\s*,\s*\{[^}]*QID:/,
    'operateAdmin 必须用 QID');
  assert.match(src, /ToWxids:\s*wxid.*Val:\s*operation/, 'operateAdmin 必须用 ToWxids + Val');
});

test('group.ts: 所有 dispatch 端点路径以 /Group/ 开头', () => {
  const src = fs.readFileSync(DEV_SRC, 'utf-8');
  const endpoints = [...src.matchAll(/dispatch\s*\(\s*"(\/[^"]+)"\s*,/g)].map(m => m[1]);
  assert.ok(endpoints.length >= 10, `应至少 10 个端点, 实际 ${endpoints.length}`);
  for (const ep of endpoints) {
    assert.ok(ep.startsWith('/Group/'), `端点 ${ep} 必须以 /Group/ 开头`);
  }
});

test('group.ts: 无 snake_case 残留 (chatroom_name/to_wxids 等)', () => {
  const src = fs.readFileSync(DEV_SRC, 'utf-8');
  const badSnake = src.match(/(chatroom_name|to_wxids|wxid_list)/gi);
  assert.ok(!badSnake, `源码不应有 snake_case 残留, 发现: ${badSnake}`);
});

test('deploy dist 与 dev src 字段名一致: ChatRoomName/ToWxids/QID', () => {
  const dev = fs.readFileSync(DEV_SRC, 'utf-8');
  const dep = fs.readFileSync(DEPLOY_DIST, 'utf-8');
  for (const field of ['ChatRoomName', 'ToWxids', 'QID', 'Val', 'Scene']) {
    assert.ok(dev.includes(field) === dep.includes(field),
      `字段 ${field} 在 dev/deploy 中存在性不一致`);
  }
});
