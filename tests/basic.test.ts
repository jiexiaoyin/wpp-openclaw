// tests/basic.test.ts - 基础测试
// 2026-08-04 init

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSessionKey, parseSessionKey } from "../src/session-key.js";

test("buildSessionKey: 5 段格式正确", () => {
  const key = buildSessionKey({
    agentId: "main",
    accountId: "default",
    peerKind: "group",
    peerId: "123456@chatroom",
  });
  assert.equal(key, "agent:main:wechatpadpro:default:group:123456@chatroom");
});

test("buildSessionKey: direct 私聊", () => {
  const key = buildSessionKey({
    agentId: "main",
    accountId: "default",
    peerKind: "direct",
    peerId: "wxid_abc",
  });
  assert.equal(key, "agent:main:wechatpadpro:default:direct:wxid_abc");
});

test("parseSessionKey: roundtrip", () => {
  const k = buildSessionKey({
    agentId: "main",
    accountId: "store1",
    peerKind: "group",
    peerId: "chat1",
  });
  const parsed = parseSessionKey(k);
  assert.ok(parsed);
  assert.equal(parsed!.agentId, "main");
  assert.equal(parsed!.channelId, "wechatpadpro");
  assert.equal(parsed!.accountId, "store1");
  assert.equal(parsed!.peerKind, "group");
  assert.equal(parsed!.peerId, "chat1");
});

test("parseSessionKey: 无效格式返回 null", () => {
  assert.equal(parseSessionKey("agent:main:wrong:format"), null);
  assert.equal(parseSessionKey("invalid"), null);
});
