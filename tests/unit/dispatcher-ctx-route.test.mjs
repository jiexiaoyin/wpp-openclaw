// tests/unit/dispatcher-ctx-route.test.mjs — ctxPayload 的 To 字段必须指向对话对象
//
// 背景 (2026-10-02 实测):
//   conversations 表出现 8 条重复/错分类会话 —— 同一会话同时存在 kind=direct 与 kind=channel
//   两条记录, 且 peer_id 落成机器人自己 (<BOT_WXID>)。例:
//     conv_<HASH1>  direct   peer_id=<PEER_A>
//     conv_<HASH2>  channel  peer_id=<PEER_A>   ← 重复 (本应为 direct)
//     conv_<HASH3>  group    peer_id=<BOT_WXID> ← 机器人自己 (本应为群ID)
//
// 根因: plugin 传给 framework 的 ctxPayload.To 填的是 msg.toWxid,
//   而 toWxid 是 **receiver(self)** 语义 —— parser.ts:26 注释原文:
//     "toWxid / toUserName : receiver (self) wxid"
//   framework 的 To 却是「投递目标 / 对话端点」语义:
//     bot-message-D_h8xVny.mjs:3046  以 To 构造出站投递 to
//     channel-BZonAecT.mjs:1097      用 To 解析目标通道
//   → framework 拿到 self 当目标, 推出 peer_id=自己 + kind=channel, 会话因此分裂。
//
// 修法: To = `${CHANNEL_ID}:${msg.peerId}`
//   peerId 方向已被保证: 群聊=chatroomId (parser.ts:98), 私聊=对方 wxid
//   (parser.ts:98 赋 fromWxid + handler.ts:907 对 bot 自发私聊改用 toWxid)。
//
// 本文件用**源码级守卫**锁住该不变量 —— buildCtxPayload 是 dispatcher 私有函数
// (未导出, dist 中测不到), 故比照 tests/unit/heartflow-runtime.test.mjs 的护栏写法,
// 直接读编译产物断言 "To 绑定到 peerId" 且 "不再绑定 toWxid"。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ROOT = new URL("../../", import.meta.url);
const DISPATCHER_JS = new URL("dist/dispatch/dispatcher.js", ROOT);

/** 读编译产物 (测试跑的是 dist, 与线上同源) */
function readDispatcher() {
  try {
    return fs.readFileSync(DISPATCHER_JS, "utf-8");
  } catch (e) {
    return null;
  }
}

test("dispatcher ctxPayload: To 必须绑定 msg.peerId (对话对象), 不得绑定 toWxid (self)", (t) => {
  const src = readDispatcher();
  if (!src) return t.skip("dist/dispatch/dispatcher.js 未构建 (先 npm run build)");

  // 正向: To 绑定 peerId
  assert.match(
    src,
    /To:\s*\`\$\{[A-Za-z_$][\w$]*\}:\$\{msg\.peerId\}\`/,
    "ctxPayload.To 必须绑定 msg.peerId —— 它是 framework 的投递目标/对话端点语义",
  );

  // 反向: To 不得绑定 toWxid (历史 bug 的形态)
  assert.doesNotMatch(
    src,
    /To:\s*\`\$\{[A-Za-z_$][\w$]*\}:\$\{toWxid\}\`/,
    "ctxPayload.To 不得绑定 toWxid —— 那是 receiver(self) 语义, 会让会话被误判为 channel 并落 peer_id=机器人自己",
  );
});

test("dispatcher ctxPayload: 不得再取 `msg.toWxid ?? msg.accountId` 作为 To 的来源", (t) => {
  const src = readDispatcher();
  if (!src) return t.skip("dist/dispatch/dispatcher.js 未构建");

  // 该表达式正是 2026-10-02 修复中删掉的那行; 若回归即说明有人把它加回来了
  const stem = "msg.toWxid" + " ?? " + "msg.accountId";
  assert.ok(
    !src.includes(stem),
    `dispatcher 不应再出现 \`${stem}\` —— 该兜底把 To 指向 self, 是会话分类错误的根因`,
  );
});

test("dispatcher ctxPayload: ChatType 只用 group/direct 两值 (不得引入 channel)", (t) => {
  const src = readDispatcher();
  if (!src) return t.skip("dist/dispatch/dispatcher.js 未构建");

  // ChatType 由 peerKind 推导; "channel" 是 framework 的 route kind, 不是会话类型
  assert.match(
    src,
    /ChatType:\s*isGroup\s*\?\s*"group"\s*:\s*"direct"/,
    'ChatType 必须由 isGroup 推导为 "group"/"direct"',
  );
});

test("parser: toWxid 的语义仍是 receiver(self) —— 修复前提不得被改", (t) => {
  const p = new URL("src/inbound/parser.ts", ROOT);
  let src;
  try {
    src = fs.readFileSync(p, "utf-8");
  } catch {
    return t.skip("src/inbound/parser.ts 不可读");
  }

  // 该注释是 "为何不能把 toWxid 当 To" 的判据来源; 若被改掉, 上面对 To 的约束前提即失效
  assert.match(
    src,
    /toWxid\s*\/\s*toUserName\s*:\s*receiver\s*\(self\)\s*wxid/,
    "parser.ts 必须保留 toWxid=receiver(self) 的语义说明 —— 它是 To 字段修复的依据",
  );
});
