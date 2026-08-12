// tests/friendcircle-guard.test.ts - v1.3.41 FRIENDCIRCLE-GUARD (老板 2026-08-11)
// 朋友圈发布控制: 默认禁用 + admin 白名单 (用注入 getCfg 测试, 不依赖 registry)
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertFriendCirclePublishAllowed } from "../src/send/friendcircle.js";

function cfg(c: Record<string, unknown>) {
  return () => c as never;
}

test("guard — 默认禁用 (无配置 → 拒绝)", () => {
  assert.throws(() => assertFriendCirclePublishAllowed("default", undefined, cfg({})), /未启用/);
});

test("guard — 启用后白名单外拒绝", () => {
  assert.throws(
    () => assertFriendCirclePublishAllowed("default", "wxid_other", cfg({ friendCirclePublishEnabled: true, adminUsers: ["wxid_boss"] })),
    /无权限|不在白名单/,
  );
});

test("guard — 启用后 admin 允许", () => {
  assert.doesNotThrow(() =>
    assertFriendCirclePublishAllowed("default", "wxid_boss", cfg({ friendCirclePublishEnabled: true, adminUsers: ["wxid_boss"] })),
  );
});

test("guard — friendCirclePublishAllowFrom 优先于 adminUsers", () => {
  assert.doesNotThrow(() =>
    assertFriendCirclePublishAllowed("default", "wxid_special", cfg({
      friendCirclePublishEnabled: true,
      friendCirclePublishAllowFrom: ["wxid_special"],
      adminUsers: ["wxid_boss"],
    })),
  );
  assert.throws(() =>
    assertFriendCirclePublishAllowed("default", "wxid_boss", cfg({
      friendCirclePublishEnabled: true,
      friendCirclePublishAllowFrom: ["wxid_special"],
      adminUsers: ["wxid_boss"],
    })),
    /无权限/,
  );
});

test("guard — 未传 callerWxid 仅查开关", () => {
  assert.doesNotThrow(() => assertFriendCirclePublishAllowed("default", undefined, cfg({ friendCirclePublishEnabled: true })));
});
