// tests/policy.test.ts - v1.1.39 SUNNOY-POLICY (group + dm)
// 借鉴 sunnoy/wecom group-policy.js + dm-policy.js 范式

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { checkGroupPolicy } from "../src/inbound/group-policy.js";
import { checkDmPolicy } from "../src/inbound/dm-policy.js";
import type { WppInboundMessage } from "../src/types.js";

const baseMsg: WppInboundMessage = {
  accountId: "default",
  msgId: "m-1",
  newMsgId: "nm-1",
  fromWxid: "wxid_alice",
  fromNickname: "Alice",
  chatroomId: undefined,
  toWxid: undefined,
  msgType: 1,
  content: "hello",
  ts: Date.now(),
  raw: {},
  peerKind: "direct",
  peerId: "wxid_alice",
  trigger: "direct",
};

const groupMsg: WppInboundMessage = {
  ...baseMsg,
  chatroomId: "57737516566@chatroom",
  peerKind: "group",
  peerId: "57737516566@chatroom",
};

// ============ Group Policy ============
describe("checkGroupPolicy (v1.1.39 SUNNOY-GROUP-POLICY)", () => {
  test("disabled 策略拒绝所有群消息", () => {
    const r = checkGroupPolicy({
      msg: groupMsg, policy: "disabled",
      groupAllowFrom: [], requireAtMention: false, selfWxid: "q139198824",
    });
    assert.equal(r.allowed, false);
    if (!r.allowed) assert.match(r.reason, /disabled/);
  });

  test("allowlist + chatroom 不在白名单 = 拒绝", () => {
    const r = checkGroupPolicy({
      msg: groupMsg, policy: "allowlist",
      groupAllowFrom: ["111@chatroom"], requireAtMention: false, selfWxid: "q139198824",
    });
    assert.equal(r.allowed, false);
    if (!r.allowed) assert.match(r.reason, /groupAllowFrom mismatch/);
  });

  test("allowlist + chatroom 在白名单 + 不需要 @ = 通过", () => {
    const r = checkGroupPolicy({
      msg: groupMsg, policy: "allowlist",
      groupAllowFrom: ["57737516566@chatroom"], requireAtMention: false, selfWxid: "q139198824",
    });
    assert.equal(r.allowed, true);
  });

  test("requireAtMention + 未 @ 机器人 = 拒绝", () => {
    const r = checkGroupPolicy({
      msg: { ...groupMsg, content: "随便聊聊" },
      policy: "open",
      groupAllowFrom: [],
      requireAtMention: true,
      selfWxid: "q139198824",
    });
    assert.equal(r.allowed, false);
    if (!r.allowed) assert.match(r.reason, /not @-ed/);
  });

  test("requireAtMention + @ 机器人 = 通过 + 清洗 content (SUNNOY-GROUP-CONTENT)", () => {
    const r = checkGroupPolicy({
      msg: { ...groupMsg, content: "wxid_alice:\n@q139198824 你好" },
      policy: "open",
      groupAllowFrom: [],
      requireAtMention: true,
      selfWxid: "q139198824",
    });
    assert.equal(r.allowed, true);
    if (r.allowed) {
      assert.equal(r.cleanedContent, "你好", "should clean wxid prefix + @bot");
    }
  });

  test("@ 其他人 (没 @ bot) = 拒绝", () => {
    const r = checkGroupPolicy({
      msg: { ...groupMsg, content: "@wxid_alice 你好" },
      policy: "open",
      groupAllowFrom: [],
      requireAtMention: true,
      selfWxid: "q139198824",
    });
    assert.equal(r.allowed, false);
  });

  test("closed 策略 fail-closed (v1.1.17 防 silent accept 教训)", () => {
    const r = checkGroupPolicy({
      msg: groupMsg, policy: "closed",
      groupAllowFrom: [], requireAtMention: false, selfWxid: "q139198824",
    });
    assert.equal(r.allowed, false);
    if (!r.allowed) assert.match(r.reason, /closed/);
  });
});

// ============ DM Policy ============
describe("checkDmPolicy (v1.1.39 SUNNOY-DM-POLICY)", () => {
  test("allowFrom 空 = 允许所有", () => {
    const r = checkDmPolicy({
      msg: baseMsg, allowFrom: [], adminUsers: [],
    });
    assert.equal(r.allowed, true);
    assert.equal(r.isAdmin, false);
  });

  test("allowFrom 含 fromWxid = 允许", () => {
    const r = checkDmPolicy({
      msg: { ...baseMsg, fromWxid: "q139198824" },
      allowFrom: ["q139198824"],
      adminUsers: ["q139198824"],
    });
    assert.equal(r.allowed, true);
    assert.equal(r.isAdmin, true);
  });

  test("allowFrom 不含 fromWxid = 拒绝", () => {
    const r = checkDmPolicy({
      msg: baseMsg, allowFrom: ["q139198824"], adminUsers: [],
    });
    assert.equal(r.allowed, false);
    if (!r.allowed) assert.match(r.reason, /allowFrom mismatch/);
  });

  test("陌生人 DM + allowFrom 非空 = 拒绝 (老板测试场景)", () => {
    const r = checkDmPolicy({
      msg: { ...baseMsg, fromWxid: "wxid_stranger" },
      allowFrom: ["q139198824"],
      adminUsers: ["q139198824"],
    });
    assert.equal(r.allowed, false);
  });

  test("isAdmin 标记基于 adminUsers 列表 (非 selfWxid)", () => {
    // sunnoy isWecomAdmin(senderId, config) — sender 是 admin 才返 true
    const r1 = checkDmPolicy({
      msg: { ...baseMsg, fromWxid: "wxid_admin" },
      allowFrom: [], adminUsers: ["wxid_admin"],
    });
    assert.equal(r1.allowed, true);
    assert.equal(r1.isAdmin, true);

    const r2 = checkDmPolicy({
      msg: baseMsg, allowFrom: [], adminUsers: ["wxid_admin"],
    });
    assert.equal(r2.allowed, true);
    assert.equal(r2.isAdmin, false);
  });
});
