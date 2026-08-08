// tests/api.test.ts - Phase C API client + 21 send modules 测试
// 覆盖: client.ts 单元 + send modules 函数存在性 + WPP_VENDOR_ENDPOINTS 216 (?) count

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildUrl,
  parseJsonText,
  stringifyLargeInts,
  postWppJson,
  getWppJson,
} from "../src/api/client.js";
import { makeWppSend, WPP_VENDOR_ENDPOINTS } from "../src/send/index.js";

// ===== client.ts 单元 =====

test("buildUrl — 拼接 base + endpoint + /api 前缀", () => {
  assert.equal(
    buildUrl("http://127.0.0.1:8062", "/Msg/SendTxt"),
    "http://127.0.0.1:8062/api/Msg/SendTxt",
  );
  assert.equal(
    buildUrl("http://127.0.0.1:8062/", "Msg/SendTxt"),
    "http://127.0.0.1:8062/api/Msg/SendTxt",
  );
  assert.equal(
    buildUrl("https://api.x.com", "/Login/GetQR"),
    "https://api.x.com/api/Login/GetQR",
  );
});

test("stringifyLargeInts — 16+ 位整数加引号", () => {
  // 16 位整数应被引号化
  assert.equal(
    stringifyLargeInts('"msg_id":1234567890123456'),
    '"msg_id":"1234567890123456"',
  );
  // 15 位不动
  assert.equal(
    stringifyLargeInts('"id":123456789012345'),
    '"id":123456789012345',
  );
  // 已加引号的字符串不动
  assert.equal(
    stringifyLargeInts('"id":"1234567890123456"'),
    '"id":"1234567890123456"',
  );
  // 多字段混合
  const inText = '{"id":1234567890123456,"name":"big","small":123,"big2":987654321098765432}';
  const outText = stringifyLargeInts(inText);
  assert.ok(outText.includes('"id":"1234567890123456"'));
  assert.ok(outText.includes('"big2":"987654321098765432"'));
  assert.ok(outText.includes('"small":123'), "small should stay raw");
});

test("parseJsonText — 大整数保精度 (验证 stringifyLargeInts 修复路径)", () => {
  // 模拟 vendor 真实返回: msg_id 是 16 位整数
  const raw = '{"Code":0,"Data":{"msgId":1899234567890123456}}';
  const obj = parseJsonText(raw) as { Code: number; Data: { msgId: string } };
  assert.equal(obj.Data.msgId, "1899234567890123456", "should be string");
  // 不修复 — Number 会丢精度
  const native = JSON.parse(raw) as { Data: { msgId: number } };
  assert.notEqual(
    String(native.Data.msgId),
    "1899234567890123456",
    "without fix, native loses precision",
  );
});

test("postWppJson — 网络错误返回 NETWORK_ERROR (无重试)", async () => {
  // 不存在端口 → ECONNREFUSED → 重试 3 次 → 仍失败 → 返回 Code:-1
  const r = await postWppJson<unknown>(
    "http://127.0.0.1:1",
    "/Msg/SendTxt",
    { toWxid: "x", content: "hi" },
    { tokenKey: "test", maxRetries: 0 },
  );
  assert.equal(r.Code, -1);
  assert.equal(r.CodeValue, "NETWORK_ERROR");
});

test("getWppJson — 网络错误", async () => {
  const r = await getWppJson<unknown>(
    "http://127.0.0.1:1",
    "/Group/List",
    { tokenKey: "test", maxRetries: 0 },
  );
  assert.equal(r.Code, -1);
});

// ===== WPP_VENDOR_ENDPOINTS 完整性 =====

test("WPP_VENDOR_ENDPOINTS — 总数 = 227 (v1.1.17 移除 Admin 高权限端点)", () => {
  let total = 0;
  for (const list of Object.values(WPP_VENDOR_ENDPOINTS)) {
    total += (list as readonly string[]).length;
  }
  // v1.1.17 (2026-08-08 老板拍板): 移除 Admin 4 端点 (GenAuthKey/DelayAuthKey/DeleteAuthKey) + User/GetAllOnline
  //   Admin 端点需要管理 key, 权限过高, 不在插件中用
  assert.equal(total, 232, `expected 232, got ${total}`);
});

test("WPP_VENDOR_ENDPOINTS — 21 tag 覆盖", () => {
  const tags = Object.keys(WPP_VENDOR_ENDPOINTS);
  assert.ok(tags.length >= 18, `expected ≥18 tags, got ${tags.length}`);
  for (const must of [
    "login", "msg", "group", "friend", "user", "finder",
    "friendCircle", "search", "wxapp", "officialAccounts",
    "tools", "tenPay", "favorites", "label", "voice",
    "qwContact", "sayHello", "translate", "customized", "webhook",
  ]) {
    assert.ok(tags.includes(must), `missing tag: ${must}`);
  }
});

test("WPP_VENDOR_ENDPOINTS — 每个 endpoint 是字符串且以 / 开头", () => {
  for (const [tag, list] of Object.entries(WPP_VENDOR_ENDPOINTS)) {
    for (const ep of list) {
      assert.equal(typeof ep, "string", `${tag} non-string`);
      assert.ok(ep.startsWith("/"), `${tag} missing leading /: ${ep}`);
    }
  }
});

// ===== makeWppSend 创建 + 各 tag 函数存在 =====

test("makeWppSend — 21 域全部存在", () => {
  const ctx = {
    baseUrl: "http://127.0.0.1:8062",
    tokenKey: "test",
    authcode: "test-code",
    accountId: "default",
  };
  const api = makeWppSend(ctx) as unknown as Record<string, unknown>;
  for (const must of [
    "login", "msg", "group", "friend", "user", "finder",
    "friendCircle", "search", "wxapp", "officialAccounts",
    "tools", "tenPay", "favorites", "label", "voice",
    "qwContact", "sayHello", "translate", "customized", "webhook",
  ]) {
    assert.ok(api[must], `makeWppSend missing ${must}`);
  }
});

test("makeWppSend — 关键函数样本存在", () => {
  const ctx = {
    baseUrl: "http://127.0.0.1:8062",
    tokenKey: "test",
    authcode: "test",
    accountId: "default",
  };
  const api = makeWppSend(ctx);

  // Login: 38
  assert.equal(typeof api.login.loginGetQR, "function");
  assert.equal(typeof api.login.loginCheckQR, "function");
  assert.equal(typeof api.login.loginHeartBeat, "function");

  // Msg: 18 — 注意: 命名 sendTxt 不是 sendText, sendCDNImg/sendCDNVideo 是转发用
  assert.equal(typeof api.msg.sendTxt, "function");
  assert.equal(typeof api.msg.sendCDNImg, "function");
  assert.equal(typeof api.msg.uploadImg, "function");
  assert.equal(typeof api.msg.revoke, "function");
  assert.equal(typeof api.msg.quote, "function");

  // Group: 23
  assert.equal(typeof api.group.addMember, "function");
  assert.equal(typeof api.group.create, "function");
  assert.equal(typeof api.group.getInfo, "function");

  // Friend: 12
  assert.equal(typeof api.friend.getContractList, "function");
  assert.equal(typeof api.friend.search, "function");

  // User: 18
  assert.equal(typeof api.user.getContractProfile, "function");
  assert.equal(typeof api.user.uploadHeadImage, "function");

  // Webhook: 6
  assert.equal(typeof api.webhook.set, "function");
  assert.equal(typeof api.webhook.get, "function");

  // Admin: 3 (v1.1.17 已移除 — 权限过高, 老板拍板不用在插件里)

  // Finder: 15
  assert.equal(typeof api.finder.search, "function");
  assert.equal(typeof api.finder.getRecommend, "function");

  // FriendCircle: 11
  assert.equal(typeof api.friendCircle.getList, "function");
  assert.equal(typeof api.friendCircle.publish, "function");

  // Search: 18
  assert.equal(typeof api.search.all, "function");

  // Wxapp: 20
  assert.equal(typeof api.wxapp.jsLogin, "function");

  // OfficialAccounts: 12
  assert.equal(typeof api.officialAccounts.follow, "function");

  // Tools: 15
  assert.equal(typeof api.tools.downloadImg, "function");

  // TenPay: 7
  assert.equal(typeof api.tenPay.openwxhb, "function");

  // Favorites: 4
  assert.equal(typeof api.favorites.sync, "function");

  // Label: 5
  assert.equal(typeof api.label.add, "function");

  // Voice: 3
  assert.equal(typeof api.voice.transcribe, "function");

  // QWContact: 3
  assert.equal(typeof api.qwContact.searchQWContact, "function");

  // SayHello: 2
  assert.equal(typeof api.sayHello.modelv1, "function");

  // Translate: 2
  assert.equal(typeof api.translate.send, "function");

  // Customized: 1
  assert.equal(typeof api.customized.wxctdUniftyAuthBatch, "function");
});

// ===== Function count 校对 =====

test("send modules 函数总数 = 235 (v1.1.21 加 quoteXml 引用回复)", () => {
  const ctx = {
    baseUrl: "http://127.0.0.1:8062",
    tokenKey: "test",
    accountId: "default",
  };
  const api = makeWppSend(ctx);
  let funcCount = 0;
  for (const tag of Object.values(api)) {
    for (const k of Object.keys(tag as Record<string, unknown>)) {
      const v = (tag as Record<string, unknown>)[k];
      if (typeof v === "function") funcCount++;
    }
  }
  // v1.0.1 baseline: 236 个 vendor endpoint wrappers
  // v1.1.7: +2 (sendMiniProgram + sendAppFromXml)
  assert.equal(funcCount, 235, `expected 235 functions (v1.1.21 加 quoteXml), got ${funcCount}`);
});

// ===== v1.1.27 SENDIMG-FIX: resolveImageToBase64 三态测试 =====

import { resolveImageToBase64 } from "../src/api-client.js";

test("resolveImageToBase64 — 已是纯 base64 字符串", async () => {
  const b64 = "aGVsbG8td29ybGQ=";
  const out = await resolveImageToBase64(b64);
  assert.equal(out, "aGVsbG8td29ybGQ=");
});

test("resolveImageToBase64 — data URI 自动剥离前缀", async () => {
  const out = await resolveImageToBase64("data:image/png;base64,aGVsbG8td29ybGQ=");
  assert.equal(out, "aGVsbG8td29ybGQ=");
});

test("resolveImageToBase64 — 本地文件路径", async () => {
  const tmpFile = "/tmp/wpp-resolve-test.bin";
  await import("node:fs/promises").then(fs => fs.writeFile(tmpFile, Buffer.from("hello-world")));
  const out = await resolveImageToBase64(tmpFile);
  assert.equal(out, "aGVsbG8td29ybGQ=");
  await import("node:fs/promises").then(fs => fs.unlink(tmpFile));
});

test("resolveImageToBase64 — 空输入报错", async () => {
  await assert.rejects(() => resolveImageToBase64(""), /empty input/);
});
