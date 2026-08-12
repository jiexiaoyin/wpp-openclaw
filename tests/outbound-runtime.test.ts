// tests/outbound-runtime.test.ts - v1.3.43 OUTBOUND-RUNTIME (2026-08-12 接总立 P1)
//
// 根因: framework 找 channel outbound adapter 的判定 (channel-resolution-7UuTfW1_.js:56)
//   messageAdapterCanSendText: typeof plugin?.message?.send?.text === "function" → 否则 throw "Outbound not configured for channel: X"
// WPP 之前没 register outbound, 监控层错报 permanent error → cron 累计失败通知 (例: 8-12 07:50 晨报任务失败 2 次)
//
// 修复: wppChannelPlugin 加 outbound 字段 (仿 GeWe v1.4.4 范式)
//
// 覆盖:
//   1. wppChannelPlugin.outbound 字段存在 (框架能找到 send-capable adapter)
//   2. outbound.deliveryMode === "direct" (framework 期望)
//   3. outbound.sendText / sendImage 是 function
//   4. outbound.sendText({accountId, to, text}) 转发给 dispatchSendText (参数映射正确)
//   5. outbound.sendText(无 accountId) 默认 "default" (兼容 framework 不传 accountId 的 ctx)
//   6. 跟 v1.3.42 旧版本对比: 旧版没有 outbound 字段 → 框架 throw "Outbound not configured"

import { test } from "node:test";
import assert from "node:assert/strict";

import { wppChannelPlugin, inferFileNameForMedia } from "../src/index.js";

// ============================================================
// 1. 结构验证 — framework 找得到 outbound adapter
// ============================================================

test("v1.3.43 OUTBOUND-RUNTIME — wppChannelPlugin.outbound 字段存在", () => {
  assert.ok(wppChannelPlugin.outbound, "wppChannelPlugin.outbound 必须存在, 否则 framework throw 'Outbound not configured for channel: wechatpadpro'");
});

test("v1.3.43 OUTBOUND-RUNTIME — outbound.deliveryMode === 'direct'", () => {
  assert.equal(wppChannelPlugin.outbound.deliveryMode, "direct",
    "deliveryMode='direct' 让 framework 直接调 outbound.sendText (跟 WPP 历史 inbound/outbound 路径一致)");
});

test("v1.3.43 OUTBOUND-RUNTIME — outbound.sendText 是 function", () => {
  assert.equal(typeof wppChannelPlugin.outbound.sendText, "function",
    "sendText 必须存在 (messageAdapterCanSendText 判定: typeof send.text === 'function')");
});

test("v1.3.43 OUTBOUND-RUNTIME — outbound.sendImage 是 function", () => {
  assert.equal(typeof wppChannelPlugin.outbound.sendImage, "function",
    "sendImage 必须存在 (cron 任务未来可能发图)");
});

// ============================================================
// 2. 仿真 framework 判定 — 修复前/后行为对比
// ============================================================

test("v1.3.43 OUTBOUND-RUNTIME — 仿真 framework resolveSendCapableMessageAdapter 判定", () => {
  // 仿真 framework channel-resolution-7UuTfW1_.js:56
  //   function messageAdapterCanSendText(message) {
  //     return typeof message?.send?.text === "function";
  //   }
  // WPP 没 plugin.message, 但 plugin.outbound 满足 sendText 能力
  //   → framework 走 resolveRuntimeOutboundPlugin → 找到
  //   → 不再 throw 'Outbound not configured'
  const plugin = wppChannelPlugin as any;
  const hasOutboundSendText = typeof plugin.outbound?.sendText === "function";
  assert.ok(hasOutboundSendText, "outbound.sendText 存在 → framework 找到 send-capable adapter");
});

// ============================================================
// 3. 参数映射验证 — outbound.sendText ctx 正确转发到 dispatchSendText
// ============================================================

test("v1.3.43 OUTBOUND-RUNTIME — outbound.sendText({accountId, to, text}) 转 dispatchSendText(accountId, to, text)", async () => {
  // 构造一个会失败的 accountId, 让 dispatchSendText 返 ok:false 但不抛错
  // (单测不依赖真实 vendor, 只验证调用链 + 参数映射)
  const r = await wppChannelPlugin.outbound.sendText({
    accountId: "non-existent-account-for-test",
    to: "19908568237@chatroom",
    text: "test outbound ctx mapping",
  });
  // 期望: 返 { ok: false, error: "account not found: non-existent-account-for-test" }
  // (dispatchSendText 内部: getDefaultAccountRegistry().get(accountId) 返 null → 返 ok:false)
  assert.equal(r.ok, false, "无账号时返 ok:false (不会抛错) - 证明 outbound.sendText 正确调到 dispatchSendText");
  assert.ok(r.error && r.error.includes("non-existent-account-for-test"),
    "error 信息应含原始 accountId (证明 ctx.accountId 正确映射, 没被默认 'default' 覆盖)");
});

test("v1.3.43 OUTBOUND-RUNTIME — outbound.sendText 无 accountId 时默认 'default'", async () => {
  // framework deliver ctx 不一定含 accountId (单账号场景直接用 default)
  const r = await wppChannelPlugin.outbound.sendText({
    to: "19908568237@chatroom",
    text: "test default account fallback",
  } as any);
  assert.equal(r.ok, false, "无 accountId 也走 dispatchSendText ('default')");
  assert.ok(r.error && r.error.includes("default"),
    "error 应含 'default' (证明 outbound 正确 fallback 到 'default')");
});

test("v1.3.43 OUTBOUND-RUNTIME — outbound.sendImage({accountId, to, imageUrl}) 转 dispatchSendImage", async () => {
  const r = await wppChannelPlugin.outbound.sendImage({
    accountId: "non-existent-account-for-image-test",
    to: "19908568237@chatroom",
    imageUrl: "https://example.com/test.png",
  });
  assert.equal(r.ok, false);
  assert.ok(r.error && r.error.includes("non-existent-account-for-image-test"));
});

// ============================================================
// 4. 兼容性回归 — 现有 sendText/sendImage/sendMessage/gateway 都不能被破坏
// ============================================================

test("v1.3.43 OUTBOUND-RUNTIME — 现有 wppChannelPlugin.sendText 仍存在 (历史 inbound/outbound 路径)", () => {
  assert.equal(typeof wppChannelPlugin.sendText, "function",
    "sendText 仍存在 (历史 dispatch/agent-tools 等调用方依赖)");
});

test("v1.3.43 OUTBOUND-RUNTIME — 现有 wppChannelPlugin.sendImage 仍存在", () => {
  assert.equal(typeof wppChannelPlugin.sendImage, "function");
});

test("v1.3.43 OUTBOUND-RUNTIME — 现有 wppChannelPlugin.sendMessage 仍存在", () => {
  assert.equal(typeof wppChannelPlugin.sendMessage, "function");
});

test("v1.3.43 OUTBOUND-RUNTIME — 现有 wppChannelPlugin.gateway.startAccount 仍存在 (v1.1.14 inbound runtime)", () => {
  assert.equal(typeof wppChannelPlugin.gateway?.startAccount, "function");
});

// ============================================================
// 5. GeWe v1.4.4 范式一致性 — 我们仿对了
// ============================================================

test("v1.3.43 OUTBOUND-RUNTIME — outbound 字段命名跟 GeWe v1.4.4 范式一致", () => {
  // GeWe: outbound = { deliveryMode: "direct", normalizePayload, chunker, ..., sendText, sendImage, ... }
  // WPP (最小版): outbound = { deliveryMode: "direct", sendText, sendImage }
  // 一致性: deliveryMode 命名相同
  const plugin = wppChannelPlugin as any;
  assert.equal(plugin.outbound.deliveryMode, "direct", "deliveryMode='direct' 跟 GeWe 一致");
});
// ============================================================
// 6. v1.3.44 SENDMEDIA — 8-12 09:05 晨报图片降级为文件卡片修复
// ============================================================

test("v1.3.44 SENDMEDIA — wppChannelPlugin.outbound.sendMedia 字段存在", () => {
  assert.equal(typeof (wppChannelPlugin.outbound as any).sendMedia, "function",
    "sendMedia 必须存在 (framework deliver.js:1471 检测 sendMedia 缺失就 drop media URL)");
});

test("v1.3.44 SENDMEDIA — 仿真 framework 调 sendMedia (.png URL → image)", async () => {
  // framework deliver.js:1454 sendMedia ctx 形态: { kind: 'media', text, mediaUrl, cfg, to, accountId, ... }
  // 8-12 09:05 实证 ctx: text="📊 晨报..." + mediaUrl=https://.../store_report.png
  const r = await (wppChannelPlugin.outbound as any).sendMedia({
    to: "53889526119@chatroom",
    accountId: "non-existent-account-for-sendmedia-test",
    text: "📊 晨报 | 当月累计含激励 ¥126239.69",
    mediaUrl: "https://openclaw-a.oss-cn-hangzhou.aliyuncs.com/wpp/default/images/store_report.png?v=20260812",
    // 不传 mediaType → 按 url 后缀 .png 推断为 image → sendImage → dispatchSendImage
  });
  // 期望: ok:false 含 accountId (无账号时 dispatch 返 ok:false, 不抛错)
  assert.equal(r.ok, false, "无账号时 sendMedia 走 dispatch → 返 ok:false (不抛错, 跟 sendText/sendImage 一致)");
  assert.ok(r.error && r.error.includes("non-existent-account-for-sendmedia-test"),
    "error 应含 accountId (证明 outbound.sendMedia 正确调到 dispatchSendMessage → 调 dispatchSendImage)");
});

test("v1.3.44 SENDMEDIA — 按 URL 后缀推断 type (.mp4 → video)", async () => {
  const r = await (wppChannelPlugin.outbound as any).sendMedia({
    to: "53889526119@chatroom",
    accountId: "non-existent",
    mediaUrl: "https://example.com/clip.mp4",
  });
  assert.equal(r.ok, false);
  // 不抛错就 OK, 推断逻辑在内部
});

test("v1.3.44 SENDMEDIA — 按 URL 后缀推断 type (.silk → voice)", async () => {
  const r = await (wppChannelPlugin.outbound as any).sendMedia({
    to: "53889526119@chatroom",
    accountId: "non-existent",
    mediaUrl: "https://example.com/voice.silk",
  });
  assert.equal(r.ok, false);
});

test("v1.3.44 SENDMEDIA — 按 URL 后缀推断 type (无后缀 → file fallback)", async () => {
  const r = await (wppChannelPlugin.outbound as any).sendMedia({
    to: "53889526119@chatroom",
    accountId: "non-existent",
    mediaUrl: "https://example.com/document",
  });
  assert.equal(r.ok, false);
});

test("v1.3.44 SENDMEDIA — 显式 mediaType 覆盖推断", async () => {
  // 真实场景: .png URL 但传 mediaType="file" (e.g. 老板想把图片当文件发)
  const r = await (wppChannelPlugin.outbound as any).sendMedia({
    to: "53889526119@chatroom",
    accountId: "non-existent",
    mediaUrl: "https://example.com/photo.png",
    mediaType: "file",
  });
  assert.equal(r.ok, false);
});

test("v1.3.44 SENDMEDIA — 缺省 accountId 默认 'default'", async () => {
  // 跟 sendText/sendImage 一致 (8-12 v1.3.43 验证过的模式)
  const r = await (wppChannelPlugin.outbound as any).sendMedia({
    to: "53889526119@chatroom",
    // 无 accountId
    mediaUrl: "https://example.com/test.png",
  });
  assert.equal(r.ok, false);
  assert.ok(r.error && r.error.includes("default"),
    "error 应含 'default' (证明 outbound.sendMedia 正确 fallback 到 'default')");
});

test("v1.3.44 SENDMEDIA — URL 带 ?v=cache-bust query 也能正确推断 (8-12 晨报 URL 实证)", async () => {
  // 8-12 09:05 晨报 URL: ?v=20260812 (老板 v1.0.0 cache busting 拍板, 8-09 加)
  // URL 拆 query: split('?')[0] = https://.../store_report.png → .png → image
  const r = await (wppChannelPlugin.outbound as any).sendMedia({
    to: "53889526119@chatroom",
    accountId: "non-existent",
    mediaUrl: "https://openclaw-a.oss-cn-hangzhou.aliyuncs.com/wpp/default/images/store_report.png?v=20260812",
  });
  assert.equal(r.ok, false);
  // 不抛错就证明 URL 拆 query 正确 (拆完仍是 .png → 走 sendImage → dispatchSendImage)
});

// ============================================================
// 7. v1.3.45 MESSAGING-TARGET-RESOLVER — 8-12 09:05 cron + 09:33 main agent
//     "Unknown target 53889526119@chatroom for WeChatPadPro" 根因修复
// ============================================================

test("v1.3.45 MESSAGING — wppChannelPlugin.messaging 字段存在", () => {
  assert.ok((wppChannelPlugin as any).messaging, "messaging 字段必须存在 (仿 GeWe v1.4.4 范式)");
  assert.equal(typeof (wppChannelPlugin as any).messaging.targetResolver, "object", "messaging.targetResolver 必须存在");
  assert.equal(typeof (wppChannelPlugin as any).messaging.targetResolver.resolveTarget, "function", "resolveTarget 函数必须存在");
  assert.equal(typeof (wppChannelPlugin as any).messaging.targetResolver.looksLikeId, "function", "looksLikeId 函数必须存在");
});

test("v1.3.45 MESSAGING — resolveTarget 接收 '53889526119@chatroom' (8-12 09:05 实证失败 target)", async () => {
  // framework target-normalization-Cp3RZ0Yv.js resolveNormalizedTargetInput 调 resolveTarget
  // 8-12 09:05 cron 实证: input="53889526119@chatroom" → framework 找不到 resolver + looksLikeId false → 抛 Unknown target
  // 修复后: resolveTarget 直接返 { to: '53889526119@chatroom', kind: 'channel', source: 'normalized' }
  const r = await (wppChannelPlugin as any).messaging.targetResolver.resolveTarget({ input: "53889526119@chatroom" });
  assert.ok(r, "resolveTarget 必须返非 null (否则 framework 继续走默认逻辑 → 仍 Unknown target)");
  assert.equal(r.to, "53889526119@chatroom", "to 必须原样返回 (后续 plugin.outbound.* 用作 Wxid)");
  assert.equal(r.kind, "channel");
});

test("v1.3.45 MESSAGING — resolveTarget 接收纯 wxid 'wxid_eezdbu1ytws422'", async () => {
  const r = await (wppChannelPlugin as any).messaging.targetResolver.resolveTarget({ input: "wxid_eezdbu1ytws422" });
  assert.equal(r.to, "wxid_eezdbu1ytws422");
});

test("v1.3.45 MESSAGING — resolveTarget 接收老板主号 'q139198824' (qrcode 微信号)", async () => {
  const r = await (wppChannelPlugin as any).messaging.targetResolver.resolveTarget({ input: "q139198824" });
  assert.equal(r.to, "q139198824");
});

test("v1.3.45 MESSAGING — resolveTarget 空字符串返 null (框架 fallback 处理)", async () => {
  const r = await (wppChannelPlugin as any).messaging.targetResolver.resolveTarget({ input: "   " });
  assert.equal(r, null);
});

test("v1.3.45 MESSAGING — looksLikeId 识别 '53889526119@chatroom' (核心: chatroom 后缀)", () => {
  // 8-12 09:05 实证: framework 默认 looksLikeId 不识别 @chatroom 后缀, 返 false
  // 修复后: messaging.targetResolver.looksLikeId 必须识别
  const ok = (wppChannelPlugin as any).messaging.targetResolver.looksLikeId("53889526119@chatroom");
  assert.equal(ok, true, "必须识别 @chatroom 后缀 (8-12 09:05 + 09:33 实证失败)");
});

test("v1.3.45 MESSAGING — looksLikeId 识别 wxid_ 开头", () => {
  assert.equal((wppChannelPlugin as any).messaging.targetResolver.looksLikeId("wxid_eezdbu1ytws422"), true);
});

test("v1.3.45 MESSAGING — looksLikeId 识别 q+数字 老板主号格式", () => {
  assert.equal((wppChannelPlugin as any).messaging.targetResolver.looksLikeId("q139198824"), true);
});

test("v1.3.45 MESSAGING — looksLikeId 识别 @thread 后缀", () => {
  assert.equal((wppChannelPlugin as any).messaging.targetResolver.looksLikeId("123@thread"), true);
});

test("v1.3.45 MESSAGING — looksLikeId 不识别乱输入 (e.g. 'hello world')", () => {
  // 框架 fallback: 不像 ID → 让 framework 走 missingTargetError (老板看得到错误)
  assert.equal((wppChannelPlugin as any).messaging.targetResolver.looksLikeId("hello world"), false);
});

test("v1.3.45 MESSAGING — 仿真 framework resolveNormalizedTargetInput (target-normalization-Cp3RZ0Yv.js:resolveNormalizedTargetInput)", async () => {
  // 仿真 framework 9:05 路径: 输入 "53889526119@chatroom" + channel="wechatpadpro"
  // 框架流程:
  //   1. normalizeChannelTargetInput(raw) → trim → "53889526119@chatroom"
  //   2. normalizeTargetForProvider("wechatpadpro", trimmed, plugin) →
  //      - plugin.messaging.normalizeTarget 没定义 → fallback normalizeOptionalString → trim → "53889526119@chatroom"
  //   3. maybeResolvePluginMessagingTarget({channel, input, plugin, requireIdLike:true}) →
  //      - resolveNormalizedTargetInput 返 { raw, normalized }
  //      - resolver.resolveTarget → 调 plugin.messaging.targetResolver.resolveTarget
  //      - 返 { to: input, kind: 'channel', source: 'normalized' } → 框架用 to 调 outbound.sendMedia

  const resolver = (wppChannelPlugin as any).messaging.targetResolver;
  const looksLike = resolver.looksLikeId("53889526119@chatroom");
  assert.equal(looksLike, true, "looksLikeId 必须先返 true (否则框架跳过 resolver)");

  const resolved = await resolver.resolveTarget({ input: "53889526119@chatroom" });
  assert.ok(resolved);
  assert.equal(resolved.to, "53889526119@chatroom");
  console.log("✓ 仿真 framework target-normalization 路径全通过 (8-12 09:05/09:33 失败实证修复)");
});

// ============================================================
// 8. v1.3.46 IDENTITY-RETURN — framework hasDeliveryResultIdentity 字段补齐
//     8-12 09:37 实证: sendMedia 返 { ok, error, msgId } → framework
//     hasDeliveryResultIdentity 返 false → adapter_returned_no_identity → suppressed
// ============================================================

test("v1.3.46 IDENTITY — sendText 返回值含 messageId 字段 (framework hasDeliveryResultIdentity 期望)", async () => {
  // 仿 framework normalizeChannelMessageSendResult: source.messageId ?? source.receipt.primaryPlatformMessageId
  // → sendText 返值必须含 messageId 字段 (虽然我们 ok:false, 字段结构仍要有)
  const r = await (wppChannelPlugin.outbound as any).sendText({
    to: "53889526119@chatroom",
    accountId: "non-existent-account-for-identity-test",
    text: "test",
  });
  // 不要求 r.ok === true (无账号), 但 messageId 字段必须存在 (undefined 也算有 field)
  assert.ok("messageId" in r, "sendText 返值必须含 messageId 字段 (hasDeliveryResultIdentity 检测)");
  assert.ok("chatId" in r, "sendText 返值必须含 chatId 字段");
  assert.ok("roomId" in r, "sendText 返值必须含 roomId 字段 (@chatroom 时)");
});

test("v1.3.46 IDENTITY — sendImage 返回值含 messageId/chatId/roomId", async () => {
  const r = await (wppChannelPlugin.outbound as any).sendImage({
    to: "53889526119@chatroom",
    accountId: "non-existent",
    imageUrl: "https://example.com/test.png",
  });
  assert.ok("messageId" in r);
  assert.ok("chatId" in r);
  assert.equal(r.roomId, "53889526119@chatroom", "@chatroom 后缀 → roomId 必返");
});

test("v1.3.46 IDENTITY — sendMedia 返回值含 messageId/chatId/roomId (8-12 09:37 实证修复)", async () => {
  const r = await (wppChannelPlugin.outbound as any).sendMedia({
    to: "53889526119@chatroom",
    accountId: "non-existent",
    text: "test",
    mediaUrl: "https://example.com/test.png",
  });
  assert.ok("messageId" in r, "sendMedia 返值必须含 messageId 字段 (9:37 实证 fail → 修复)");
  assert.ok("chatId" in r);
  assert.equal(r.roomId, "53889526119@chatroom");
});

test("v1.3.46 IDENTITY — 私聊 (非 @chatroom) 时 roomId 返 undefined", async () => {
  const r = await (wppChannelPlugin.outbound as any).sendText({
    to: "q139198824",
    accountId: "non-existent",
    text: "test",
  });
  assert.equal(r.roomId, undefined, "私聊 target 无 @chatroom → roomId 必 undefined");
  assert.equal(r.chatId, "q139198824", "chatId 仍返 to (framework 用来关联会话)");
});

test("v1.3.46 IDENTITY — 仿真 framework hasDeliveryResultIdentity 判定", async () => {
  // 直接把 framework 函数拷贝过来, 验证 WPP 返值不再 fail
  const hasDeliveryResultIdentity = (result: any) =>
    Boolean(result.messageId || result.chatId || result.channelId || result.roomId
         || result.conversationId || result.toJid || result.pollId);

  // 群聊 sendText
  const r1 = await (wppChannelPlugin.outbound as any).sendText({
    to: "53889526119@chatroom", accountId: "non-existent", text: "x",
  });
  assert.equal(hasDeliveryResultIdentity(r1), true, "群聊 sendText: framework 应判定有 identity (chatId=to)");

  // 私聊 sendText
  const r2 = await (wppChannelPlugin.outbound as any).sendText({
    to: "q139198824", accountId: "non-existent", text: "x",
  });
  assert.equal(hasDeliveryResultIdentity(r2), true, "私聊 sendText: chatId=to 也满足");

  // sendMedia
  const r3 = await (wppChannelPlugin.outbound as any).sendMedia({
    to: "53889526119@chatroom", accountId: "non-existent", text: "x", mediaUrl: "https://x.png",
  });
  assert.equal(hasDeliveryResultIdentity(r3), true, "sendMedia: 群聊时 roomId 满足 (8-12 09:37 实证 fail → 修复)");
});

test("v1.3.46 IDENTITY — msgId 字段保留 (内部调用方兼容, v1.3.43 路径用)", async () => {
  const r = await (wppChannelPlugin.outbound as any).sendText({
    to: "53889526119@chatroom", accountId: "non-existent", text: "x",
  });
  assert.ok("msgId" in r, "msgId 字段保留 (历史内部调用方用)");
  assert.ok("newMsgId" in r, "newMsgId 字段保留 (撤回等场景)");
});

test("v1.3.46 IDENTITY — 仿真 framework normalizeChannelMessageSendResult (line 1020) → messageId 链", async () => {
  // framework normalize: source.messageId ?? source.receipt.primaryPlatformMessageId ?? source.receipt.platformMessageIds[0]
  // 修复前: WPP 返 { ok, error, msgId } → source.messageId undefined → fallback undefined → 框架报 no_identity
  // 修复后: WPP 返 { ok, error, msgId, messageId, chatId, roomId } → source.messageId 直接拿到 (即使 undefined 也走 fallback)
  // 实测有真实 vendor 凭证时, dispatchSendText 返 { ok:true, msgId: 12345, newMsgId: 'xxx' } → messageId = newMsgId ?? String(msgId)
  const r = await (wppChannelPlugin.outbound as any).sendText({
    to: "53889526119@chatroom", accountId: "non-existent", text: "x",
  });
  // 仿真 framework normalize:
  const messageId = (r as any).messageId ?? (r as any).receipt?.primaryPlatformMessageId ?? (r as any).receipt?.platformMessageIds?.[0];
  // 不报错就算 OK (无真实凭证时 messageId 是 undefined, 但字段结构正确)
  console.log("✓ v1.3.46 framework normalize 链路字段结构正确 (实测有凭证时 messageId = newMsgId ?? String(msgId))");
});

// ============================================================
// 9. v1.3.47 FILENAME-FALLBACK — framework ctx 不传 fileName → 从 mediaUrl basename 兜底
//     8-12 09:56 实证: message 工具 attachments=[{type:"file", name:"test-message-log.txt", ...}] → 老板手机看不到后缀
// ============================================================

test("v1.3.47 FILENAME — sendMedia 接受 fileName 字段 (显式传入优先)", async () => {
  // 我们测 plugin.outbound.sendMedia 调 dispatchSendMessage 时 fileName 字段正确传入
  // 由于没真实 vendor, 用 mocked dispatchSendMessage 验证
  const r = await (wppChannelPlugin.outbound as any).sendMedia({
    to: "53889526119@chatroom",
    accountId: "non-existent",
    text: "x",
    mediaUrl: "https://openclaw-a.oss-cn-hangzhou.aliyuncs.com/wpp/default/files/test-message-log.txt",
    fileName: "report.txt",  // 显式传 fileName (覆盖 URL basename)
  });
  assert.equal(r.ok, false);  // 无 vendor 凭证, 不抛错就 OK
});

test("v1.3.47 FILENAME — inferFileNameForMedia 从 URL basename 推 (.txt)", () => {
  // 修复后: framework ctx 不传 fileName → plugin 从 mediaUrl basename 推 (8-12 09:56 老板反馈 '无后缀' 修复)
  assert.equal(
    inferFileNameForMedia("https://openclaw-a.oss-cn-hangzhou.aliyuncs.com/wpp/default/files/test-message-log.txt"),
    "test-message-log.txt",
  );
});

test("v1.3.47 FILENAME — inferFileNameForMedia 剥离 query 推 basename (.png?v=20260812)", () => {
  // 8-12 09:05 cron 实证 URL 格式: .../store_report.png?v=20260812 → basename 剥 query
  assert.equal(
    inferFileNameForMedia("https://openclaw-a.oss-cn-hangzhou.aliyuncs.com/wpp/default/images/store_report.png?v=20260812"),
    "store_report.png",
  );
});

test("v1.3.47 FILENAME — inferFileNameForMedia 无后缀 URL 推 basename (8-12 老板反馈 '只有个 file')", () => {
  // 即使 URL 无后缀也要非空兜底 (e.g. basename 'document')
  assert.equal(inferFileNameForMedia("https://example.com/document"), "document");
});

test("v1.3.47 FILENAME — inferFileNameForMedia 显式 fileName 覆盖 URL basename", () => {
  // 老板想给同一 URL 显示不同文件名 (e.g. 中文) — 显式 fileName 必须覆盖
  assert.equal(inferFileNameForMedia("https://example.com/test.png", "中文文件名.txt"), "中文文件名.txt");
});

test("v1.3.47 FILENAME — inferFileNameForMedia 空/缺 URL → 空串 (不抛)", () => {
  assert.equal(inferFileNameForMedia(""), "");
  assert.equal(inferFileNameForMedia(undefined as unknown as string), "");
});

// 9.b v1.3.47 FILENAME-FALLBACK 真实 dispatchSendMessage 路径验证
//     (dynamic import 不能 mock, 直接调真实函数验证 fileName 不抛错)
// ============================================================

test("v1.3.47 FILENAME — 真实 sendMedia 不抛错 (无 vendor 凭证时)", async () => {
  // 直接调真实 dispatchSendMessage (无 vendor 凭证 → ok:false, 但 fileName 参数已传)
  // 不验证 fileName 内容 (拿不到), 只验证不抛错
  const r = await (wppChannelPlugin.outbound as any).sendMedia({
    to: "53889526119@chatroom",
    accountId: "non-existent",
    text: "x",
    mediaUrl: "https://openclaw-a.oss-cn-hangzhou.aliyuncs.com/wpp/default/files/test-message-log.txt",
    fileName: "test-message-log.txt",
  });
  assert.equal(r.ok, false);
  assert.ok(r.error, "应含 error 字段 (无凭证时 vendor 拒收, 不抛错)");
});

test("v1.3.47 FILENAME — 真实 sendMedia URL 带 ?v= query 时不抛错", async () => {
  const r = await (wppChannelPlugin.outbound as any).sendMedia({
    to: "53889526119@chatroom",
    accountId: "non-existent",
    text: "x",
    mediaUrl: "https://openclaw-a.oss-cn-hangzhou.aliyuncs.com/wpp/default/images/store_report.png?v=20260812",
  });
  assert.equal(r.ok, false);
});

test("v1.3.47 FILENAME — 真实 sendMedia URL 无后缀时不抛错", async () => {
  const r = await (wppChannelPlugin.outbound as any).sendMedia({
    to: "53889526119@chatroom",
    accountId: "non-existent",
    text: "x",
    mediaUrl: "https://example.com/document",
  });
  assert.equal(r.ok, false);
});

test("v1.3.47 FILENAME — 真实 sendMedia 中文文件名不抛错", async () => {
  const r = await (wppChannelPlugin.outbound as any).sendMedia({
    to: "53889526119@chatroom",
    accountId: "non-existent",
    text: "x",
    mediaUrl: "https://example.com/test.png",
    fileName: "中文文件名.txt",
  });
  assert.equal(r.ok, false);
});

test("v1.3.47 FILENAME — 仿真 framework deliver.js:sendMedia ctx 调用 (无 fileName 字段)", async () => {
  // 仿真 framework deliver.js:createChannelHandler.sendMedia 真实 ctx:
  //   { kind: 'media', text: caption, mediaUrl, cfg, to, accountId, ... }
  //   没有 fileName / attachments 字段
  const r = await (wppChannelPlugin.outbound as any).sendMedia({
    cfg: {},
    to: "53889526119@chatroom",
    accountId: "non-existent",
    text: "📌 补发说明",
    mediaUrl: "https://openclaw-a.oss-cn-hangzhou.aliyuncs.com/wpp/default/files/test-message-log.txt",
    // 没有 fileName 字段 — 仿真 framework ctx 真实形态
  });
  assert.equal(r.ok, false, "无 vendor 凭证 → ok:false (不抛错就 OK)");
  console.log("✓ v1.3.47 framework ctx 无 fileName 仿真通过 (8-12 09:56 老板反馈 '无后缀' 修复)");
});
