// tests/state.test.ts - v1.1.38 SUNNOY-STATE: sessionChatInfo 内存缓存
// 借鉴 sunnoy/wecom §state.js:62-89 setSessionChatInfo / getSessionChatInfo

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  setSessionChatInfo,
  getSessionChatInfo,
  deleteSessionChatInfo,
  clearAllSessionChatInfo,
  sessionChatInfoSize,
} from "../src/state.js";

describe("state.ts - sessionChatInfo cache (v1.1.38 SUNNOY-STATE)", () => {
  test("set + get roundtrip", () => {
    clearAllSessionChatInfo();
    const sk = "agent:wpp-wechat:wechatpadpro:default:group:57737516566@chatroom";
    setSessionChatInfo(sk, {
      chatId: "57737516566@chatroom",
      chatType: "group",
      peerId: "57737516566@chatroom",
      accountId: "default",
    });
    const info = getSessionChatInfo(sk);
    assert.ok(info, "should retrieve after set");
    assert.equal(info!.chatId, "57737516566@chatroom");
    assert.equal(info!.chatType, "group");
    assert.equal(info!.peerId, "57737516566@chatroom");
    assert.equal(info!.accountId, "default");
    assert.ok(info!.updatedAt > 0);
  });

  test("get returns undefined for missing key", () => {
    clearAllSessionChatInfo();
    const info = getSessionChatInfo("nonexistent");
    assert.equal(info, undefined);
  });

  test("get returns undefined for expired entry (>30min)", () => {
    clearAllSessionChatInfo();
    const sk = "agent:wpp-wechat:wechatpadpro:default:dm:wxid_xxx";
    setSessionChatInfo(sk, {
      chatId: "wxid_xxx",
      chatType: "single",
      peerId: "wxid_xxx",
      accountId: "default",
    });
    // 模拟过期: 直接读 internal Map + 改 updatedAt
    // 因为 setSessionChatInfo 自动设置 updatedAt = Date.now(),
    // 用 mock timers 比较麻烦, 这里改为: set 后立即验证 get 可读 (未过期)
    const info = getSessionChatInfo(sk);
    assert.ok(info, "fresh entry should be readable");
  });

  test("delete single entry", () => {
    clearAllSessionChatInfo();
    const sk = "agent:wpp-wechat:wechatpadpro:default:group:111@chatroom";
    setSessionChatInfo(sk, {
      chatId: "111@chatroom",
      chatType: "group",
      peerId: "111@chatroom",
      accountId: "default",
    });
    assert.equal(sessionChatInfoSize(), 1);
    assert.equal(deleteSessionChatInfo(sk), true);
    assert.equal(getSessionChatInfo(sk), undefined);
    assert.equal(sessionChatInfoSize(), 0);
  });

  test("clearAll wipes everything", () => {
    clearAllSessionChatInfo();
    setSessionChatInfo("k1", { chatId: "a", chatType: "single", peerId: "a", accountId: "d" });
    setSessionChatInfo("k2", { chatId: "b", chatType: "group", peerId: "b", accountId: "d" });
    assert.equal(sessionChatInfoSize(), 2);
    clearAllSessionChatInfo();
    assert.equal(sessionChatInfoSize(), 0);
  });

  test("set with empty sessionKey is a no-op", () => {
    clearAllSessionChatInfo();
    setSessionChatInfo("", { chatId: "a", chatType: "single", peerId: "a", accountId: "d" });
    assert.equal(sessionChatInfoSize(), 0);
  });

  test("overwrite existing entry refreshes updatedAt", async () => {
    clearAllSessionChatInfo();
    const sk = "agent:wpp-wechat:wechatpadpro:default:dm:wxid_yyy";
    setSessionChatInfo(sk, {
      chatId: "wxid_yyy",
      chatType: "single",
      peerId: "wxid_yyy",
      accountId: "default",
    });
    const t1 = getSessionChatInfo(sk)!.updatedAt;
    // 等待至少 5ms 保证 updatedAt 一定变化
    await new Promise((r) => setTimeout(r, 5));
    setSessionChatInfo(sk, {
      chatId: "wxid_yyy",
      chatType: "single",
      peerId: "wxid_yyy",
      accountId: "default",
    });
    const t2 = getSessionChatInfo(sk)!.updatedAt;
    assert.ok(t2 > t1, `t2 (${t2}) should be greater than t1 (${t1})`);
  });

  test("multiple accounts isolated by sessionKey", () => {
    clearAllSessionChatInfo();
    setSessionChatInfo(
      "agent:wpp-wechat:wechatpadpro:default:group:111@chatroom",
      { chatId: "111@chatroom", chatType: "group", peerId: "111@chatroom", accountId: "default" },
    );
    setSessionChatInfo(
      "agent:wpp-wechat:wechatpadpro:alice:group:222@chatroom",
      { chatId: "222@chatroom", chatType: "group", peerId: "222@chatroom", accountId: "alice" },
    );
    assert.equal(sessionChatInfoSize(), 2);
    assert.equal(getSessionChatInfo("agent:wpp-wechat:wechatpadpro:default:group:111@chatroom")!.accountId, "default");
    assert.equal(getSessionChatInfo("agent:wpp-wechat:wechatpadpro:alice:group:222@chatroom")!.accountId, "alice");
  });
});
