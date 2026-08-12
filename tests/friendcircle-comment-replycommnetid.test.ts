// tests/friendcircle-comment-replycommnetid.test.ts - v1.3.42 FIX (2026-08-11)
// comment replyCommnetId 类型 bug: 原默认 "" → vendor Go int32 字段 unmarshal 报错
//   (json: cannot unmarshal string into Go struct field CommentParam.replyCommnetId of type int32), 实测确认.
//   fix: 默认 0 (number). 本测试断言 comment() 发出的 body 中 replyCommnetId 是数字 0 而非空字符串.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeWppFriendCircle } from "../src/send/friendcircle.js";

// mock global fetch 捕获 postWppJson 的 body
const sentBodies: Array<{ url: string; body: string }> = [];
const origFetch = globalThis.fetch;
(globalThis as unknown as { fetch: typeof fetch }).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const body = init?.body != null ? String(init.body) : "";
  sentBodies.push({ url, body });
  return new Response(JSON.stringify({ Code: 0, CodeValue: "", Data: { BaseResponse: { ret: 0 } } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

function makeFake() {
  return makeWppFriendCircle({
    baseUrl: "http://127.0.0.1:1",
    tokenKey: "fake",
    authcode: "fake",
    accountId: "default",
  });
}

test("comment — replyCommnetId 默认必须是数字 0 (非空字符串, vendor int32 拒绝 \"\")", async () => {
  sentBodies.length = 0;
  const fc = makeFake();
  await fc.comment("12345", "👍", 1);
  assert.equal(sentBodies.length, 1);
  const body = JSON.parse(sentBodies[0].body);
  assert.equal(body.id, "12345");
  assert.equal(body.type, 1);
  assert.equal(typeof body.replyCommnetId, "number", `replyCommnetId 应为 number, 实际 ${JSON.stringify(body.replyCommnetId)}`);
  assert.equal(body.replyCommnetId, 0, "默认 replyCommnetId 应为 0");
});

test("comment — 显式传 replyCommnetId 保留原值", async () => {
  sentBodies.length = 0;
  const fc = makeFake();
  await fc.comment("abc", "评论", 2, 42);
  const body = JSON.parse(sentBodies[0].body);
  assert.equal(body.replyCommnetId, 42);
});

test("agent-tools — commentFriendCircle 描述含正确 commentType 语义 (1=点赞 2=文本)", async () => {
  const { AGENT_TOOLS_META } = await import("../src/dispatch/agent-tools/index.js");
  const meta = AGENT_TOOLS_META as Record<string, unknown>;
  const desc = String((meta.commentFriendCircle as unknown[])[0] ?? "");
  assert.ok(desc.includes("1=点赞"), `描述应标注 1=点赞: ${desc.slice(0, 80)}`);
  assert.ok(desc.includes("likeFinderPost"), `描述应警示勿用 likeFinderPost`);
});

test.after(() => {
  (globalThis as unknown as { fetch: typeof fetch }).fetch = origFetch;
});
