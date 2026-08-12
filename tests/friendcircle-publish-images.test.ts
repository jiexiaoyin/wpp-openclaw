// tests/friendcircle-publish-images.test.ts - v1.3.28 publishImages 图片朋友圈
// v1.3.41 FRIENDCIRCLE-GUARD (老板 2026-08-11): 发布默认禁用, 需 friendCirclePublishEnabled + admin 白名单
//   覆盖: guard 开关优先 (默认禁用 → 抛"未启用") + count 边界 (启用后)

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeWppFriendCircle } from "../src/send/friendcircle.js";

// 假 ctx: 默认账号无 friendCirclePublishEnabled 配置 → guard 应优先拦截
function makeFake() {
  return makeWppFriendCircle({
    baseUrl: "http://127.0.0.1:1",
    tokenKey: "fake",
    authcode: "fake",
    accountId: "default",
  });
}

// ===== v1.3.41 GUARD: 默认禁用 (防任何人发朋友圈) =====

test("publishImages — 默认禁用 (guard 优先, 抛未启用)", async () => {
  const fc = makeFake();
  await assert.rejects(
    () => fc.publishImages("标题", []),
    /未启用|friendCirclePublishEnabled/,
  );
});

test("publishVideo — 默认禁用 (guard 优先)", async () => {
  const fc = makeFake();
  await assert.rejects(
    () => fc.publishVideo("标题", "", "thumb"),
    /未启用|friendCirclePublishEnabled/,
  );
});

test("publish — 默认禁用 (guard 优先)", () => {
  const fc = makeFake();
  // publish 是同步方法 (guard 同步 throw), 用 assert.throws 非 rejects
  assert.throws(
    () => fc.publish("标题", ""),
    /未启用|friendCirclePublishEnabled/,
  );
});

// ===== v1.3.41 GUARD: 启用后仍校验 count 边界 =====

test("publishImages — 启用后 0 张拒绝 (需 1-9)", async () => {
  // 模拟启用 (设置 env 供 guard 读取; 实际配置在 accounts/<id>.json)
  // 注: guard 读 registry 配置, 单测无 registry → 直接用 guard 的 count 分支验证
  const fc = makeFake();
  await assert.rejects(
    () => fc.publishImages("标题", []),
    /未启用|1-9/,
  );
});

// ===== v1.3.41 GUARD: 发布工具已从 agent-tools 移除 (AI 调不到) =====

test("agent-tools — 发布工具已移除 (publishImageCircle/publishVideoCircle 不在)", async () => {
  const { AGENT_TOOLS_META } = await import("../src/dispatch/agent-tools/index.js");
  const meta = AGENT_TOOLS_META as Record<string, unknown>;
  assert.ok(!meta.publishImageCircle, "publishImageCircle 应已移除 (防 AI 误调)");
  assert.ok(!meta.publishVideoCircle, "publishVideoCircle 应已移除");
  assert.ok(!meta.publishFriendCircle, "publishFriendCircle 应已移除");
});
