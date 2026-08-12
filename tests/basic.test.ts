// tests/basic.test.ts - 基础测试
// 2026-08-04 init, 2026-08-09 修

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSessionKey, parseSessionKey } from "../src/session-key.js";

// v1.1.48 P0-FIX (2026-08-09 接总立): 群聊 5 段无 accountId (framework parseSessionDeliveryRoute 期望)
test("buildSessionKey: group 5 段无 accountId (P0-fix 2026-08-09)", () => {
  const key = buildSessionKey({
    agentId: "main",
    accountId: "default",
    peerKind: "group",
    peerId: "123456@chatroom",
  });
  assert.equal(key, "agent:main:wechatpadpro:group:123456@chatroom",
    "群聊不能含 accountId 段 (framework SESSION_DELIVERY_PEER_KINDS 不接受 'default' 当 peerKind)");
});

test("buildSessionKey: 仅 group / direct 两种格式 (PeerKind 当前定义)", () => {
  // 备注: 当前 PeerKindValue 仅 direct/group; framework SESSION_DELIVERY_PEER_KINDS 还支持 channel/dm
  //   未来若 PeerKind 扩展 channel/room, 需在此函数加分支 (按 framework 期望均无 accountId)
  //   当前覆盖: group(5段无accountId) + direct(6段含accountId)
  const group = buildSessionKey({ agentId: "a", accountId: "x", peerKind: "group", peerId: "p" });
  const direct = buildSessionKey({ agentId: "a", accountId: "x", peerKind: "direct", peerId: "p" });
  assert.equal(group, "agent:a:wechatpadpro:group:p");
  assert.equal(direct, "agent:a:wechatpadpro:x:direct:p");
});

test("buildSessionKey: direct 6 段含 accountId (DM 多账号路由需要)", () => {
  const key = buildSessionKey({
    agentId: "wpp-wechat",
    accountId: "default",
    peerKind: "direct",
    peerId: "wxid_abc",
  });
  assert.equal(key, "agent:wpp-wechat:wechatpadpro:default:direct:wxid_abc");
});

test("parseSessionKey: 群聊 5 段 roundtrip (无 accountId)", () => {
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
  assert.equal(parsed!.peerKind, "group");
  assert.equal(parsed!.peerId, "chat1");
  assert.equal(parsed!.accountId, undefined, "群聊 sessionKey 不应包含 accountId");
});

test("parseSessionKey: DM 6 段 roundtrip (含 accountId)", () => {
  const k = buildSessionKey({
    agentId: "main",
    accountId: "store1",
    peerKind: "direct",
    peerId: "wxid_x",
  });
  const parsed = parseSessionKey(k);
  assert.ok(parsed);
  assert.equal(parsed!.agentId, "main");
  assert.equal(parsed!.channelId, "wechatpadpro");
  assert.equal(parsed!.accountId, "store1");
  assert.equal(parsed!.peerKind, "direct");
  assert.equal(parsed!.peerId, "wxid_x");
});

test("parseSessionKey: 无效格式返回 null", () => {
  assert.equal(parseSessionKey("agent:main:wrong:format"), null);
  assert.equal(parseSessionKey("invalid"), null);
  assert.equal(parseSessionKey("agent:main:wechatpadpro:group:chat1:extra:too:many"), null);
  assert.equal(parseSessionKey("agent:main:notwechatpro:group:chat1"), null);
  assert.equal(parseSessionKey("notagent:main:wechatpadpro:group:chat1"), null);
});

// v1.1.48 P0-FIX 端到端: 修复后 sessionKey 必须能被 framework parseSessionDeliveryRoute 解析
test("buildSessionKey → framework parseSessionDeliveryRoute (P0-fix 端到端)", async () => {
  const framework = await import(
    "/root/.local/share/pnpm/global/5/.pnpm/openclaw@2026.7.1-2/node_modules/openclaw/dist/session-key-utils-A-JGvyXu.js"
  );
  const parseSessionDeliveryRoute = framework.u;

  // 群聊 (修复后 5 段)
  const groupKey = buildSessionKey({ agentId: "wpp-wechat", accountId: "default", peerKind: "group", peerId: "57737516566@chatroom" });
  const groupRoute = parseSessionDeliveryRoute(groupKey);
  assert.ok(groupRoute, "群聊 sessionKey 必须能被 framework 解析");
  assert.equal(groupRoute.channel, "wechatpadpro");
  assert.equal(groupRoute.peerKind, "group");
  assert.equal(groupRoute.peerId, "57737516566@chatroom");

  // DM (6 段)
  const dmKey = buildSessionKey({ agentId: "wpp-wechat", accountId: "default", peerKind: "direct", peerId: "wxid_x" });
  const dmRoute = parseSessionDeliveryRoute(dmKey);
  assert.ok(dmRoute, "DM sessionKey 必须能被 framework 解析");
  assert.equal(dmRoute.channel, "wechatpadpro");
  assert.equal(dmRoute.accountId, "default");
  assert.equal(dmRoute.peerKind, "direct");
  assert.equal(dmRoute.peerId, "wxid_x");
});
