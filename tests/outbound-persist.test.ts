// tests/outbound-persist.test.ts - v1.3.16 OUTBOUND-PERSIST
// 任意渠道发送到微信的消息入库 (老板拍板 "以便引用 bot 消息")
// 覆盖: outboundMetaFor 端点映射 / persistOutboundMsg 成功入库 / 失败不入库 / sendFile 入库

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

import { outboundMetaFor, persistOutboundMsg, extractOutboundMsgIds } from "../src/send/msg.js";
import { resetAdapter, setAdapterForTest } from "../src/storage/db/factory.js";
import type { DbAdapter, MessageRecord } from "../src/storage/db/types.js";

// ===== fake adapter (mock DB, 捕获 saveMessage) =====
class FakeDb implements DbAdapter {
  readonly backendName = "sqlite" as const;
  saved: MessageRecord[] = [];
  async init(): Promise<void> {}
  async close(): Promise<void> {}
  async ping(): Promise<void> {}
  async saveMessage(record: MessageRecord): Promise<void> {
    this.saved.push(record);
  }
  async getMessages(): Promise<never[]> { return []; }
  async getMessageById(): Promise<null> { return null; }
  async getMessageByMsgIdOrNewId(): Promise<null> { return null; }
  async findMessageByMd5(): Promise<null> { return null; }
  async saveContact() {}
  async getContacts(): Promise<never[]> { return []; }
  async saveChatroom() {}
  async getChatrooms(): Promise<never[]> { return []; }
  async getSessionState() { return null; }
  async upsertSessionState() {}
  async logApiCall() {}
  async getApiCalls(): Promise<never[]> { return []; }
  async upsertAccount() {}
  async getAccounts(): Promise<never[]> { return []; }
  async getAccount(): Promise<null> { return null; }
  async saveSvridMapping() {}
  async getSvridByMd5(): Promise<null> { return null; }
  async saveSynckey() {}
  async getSynckey(): Promise<null> { return null; }
}

let fakeDb: FakeDb;

beforeEach(() => {
  resetAdapter();
  fakeDb = new FakeDb();
  setAdapterForTest(fakeDb);
});

after(() => {
  resetAdapter();
});

// ===== outboundMetaFor 端点映射 =====

test("v1.3.16 — outboundMetaFor: 文本/图片/文件/位置/链接 端点 → msgType + toWxid + 可读 content", () => {
  // 文本
  const text = outboundMetaFor("/Msg/SendTxt", { ToWxid: "wxid_a", Content: "你好", Type: 1 });
  assert.deepEqual(text, { toWxid: "wxid_a", msgType: "text", content: "你好" });
  // CDN 图片 (Content = url)
  const img = outboundMetaFor("/Msg/SendCDNImg", { ToWxid: "wxid_a", Content: "https://oss/a.jpg" });
  assert.deepEqual(img, { toWxid: "wxid_a", msgType: "image", content: "[图片] https://oss/a.jpg" });
  // UploadImg (base64 太长 → [图片] 标记)
  const up = outboundMetaFor("/Msg/UploadImg", { ToWxid: "wxid_a", Base64: "aGVsbG8=" });
  assert.deepEqual(up, { toWxid: "wxid_a", msgType: "image", content: "[图片]" });
  // 文件 (小写 key)
  const file = outboundMetaFor("/Msg/SendCDNFile", { toWxid: "wxid_a", fileUrl: "https://oss/a.pdf" });
  assert.deepEqual(file, { toWxid: "wxid_a", msgType: "file", content: "[文件] https://oss/a.pdf" });
  // 位置
  const loc = outboundMetaFor("/Msg/ShareLocation", { ToWxid: "wxid_a", Label: "天安门", Poiname: "天安门广场" });
  assert.deepEqual(loc, { toWxid: "wxid_a", msgType: "location", content: "[位置] 天安门" });
  // 链接 (ShareLink Xml → title)
  const link = outboundMetaFor("/Msg/ShareLink", { ToWxid: "wxid_a", Type: 5, Xml: "<appmsg><title>标题</title></appmsg>" });
  assert.deepEqual(link, { toWxid: "wxid_a", msgType: "link", content: "[链接] 标题" });
});

test("v1.3.16 — outboundMetaFor: 非发送端点 / 缺 toWxid → null (不入库)", () => {
  assert.equal(outboundMetaFor("/Msg/Sync", { Scene: 0 }), null);
  assert.equal(outboundMetaFor("/Msg/Revoke", { ToWxid: "x" }), null);
  assert.equal(outboundMetaFor("/Msg/SendTxt", { Content: "no toWxid" }), null);
  assert.equal(outboundMetaFor("/Login/GetQR", {}), null);
});

test("v1.3.16 — outboundMetaFor: 群 toWxid (@chatroom) 保留 (peer_kind 判定用)", () => {
  const group = outboundMetaFor("/Msg/SendTxt", { ToWxid: "chat@chatroom", Content: "hi" });
  assert.equal(group?.toWxid, "chat@chatroom");
});

// ===== persistOutboundMsg 入库 =====

test("v1.3.16 — persistOutboundMsg 成功 (Code=0) → 入库 (direction=outbound, peer_kind 判定)", async () => {
  await persistOutboundMsg(
    { baseUrl: "https://test", tokenKey: "tk", accountId: "default" },
    {
      toWxid: "wxid_alice",
      msgType: "text",
      content: "AI 回复",
      resp: { Code: 0, Data: { msgId: 1234567890123456, newMsgId: "998877" }, raw: { x: 1 } },
    },
  );
  assert.equal(fakeDb.saved.length, 1);
  const rec = fakeDb.saved[0]!;
  assert.equal(rec.account_id, "default");
  assert.equal(rec.direction, "outbound");
  assert.equal(rec.peer_kind, "direct");
  assert.equal(rec.peer_id, "wxid_alice");
  assert.equal(rec.msg_type, "text");
  assert.equal(rec.content, "AI 回复");
  // v1.3.20 REVOKE-FIX: msg_id 优先存 newMsgId (vendor 全局唯一, 引用定位/撤回用)
  assert.equal(rec.msg_id, "998877");
  assert.equal(rec.new_msg_id, "998877");
});

test("v1.3.16 — persistOutboundMsg 群 toWxid → peer_kind=group", async () => {
  await persistOutboundMsg(
    { baseUrl: "https://test", tokenKey: "tk", accountId: "default" },
    { toWxid: "chat@chatroom", msgType: "link", content: "[链接] x", resp: { Code: 0, Data: {}, raw: null } },
  );
  assert.equal(fakeDb.saved[0]?.peer_kind, "group");
});

test("v1.3.16 — persistOutboundMsg 失败 (Code≠0) → 不入库 (不留假记录)", async () => {
  await persistOutboundMsg(
    { baseUrl: "https://test", tokenKey: "tk", accountId: "default" },
    { toWxid: "wxid_alice", msgType: "text", content: "x", resp: { Code: -2, Data: null, raw: null } },
  );
  assert.equal(fakeDb.saved.length, 0);
});

test("v1.3.16 — persistOutboundMsg 缺 msgId (Data 空) → 仍入库但 msg_id=null (引用字段可后续回填)", async () => {
  await persistOutboundMsg(
    { baseUrl: "https://test", tokenKey: "tk", accountId: "default" },
    { toWxid: "wxid_alice", msgType: "quote", content: "回复", resp: { Code: 0, Data: {}, raw: null } },
  );
  assert.equal(fakeDb.saved.length, 1);
  assert.equal(fakeDb.saved[0]?.msg_id, null);
  assert.equal(fakeDb.saved[0]?.msg_type, "quote");
});

// ===== v1.3.20 REVOKE-FIX: extractOutboundMsgIds 解析 List[0] =====

test("v1.3.20 REVOKE-FIX — extractOutboundMsgIds 解析 Data.List[0].NewMsgId (vendor SendTxt 真实结构)", () => {
  // NewMsgId 用字符串 (19 位大数 JS number 会丢精度, 真实 vendor 经 stringifyLargeInts 也是 string)
  const ids = extractOutboundMsgIds({
    Code: 0,
    Data: {
      BaseResponse: { ret: 0, errMsg: {} },
      Count: 1,
      List: [{ MsgId: 0, ClientMsgid: 1678393708, NewMsgId: "3471251199231445123", Createtime: 1786354739 }],
    },
    raw: null,
  });
  assert.equal(ids.newMsgId, "3471251199231445123", "应提取 List[0].NewMsgId");
  assert.equal(ids.msgId, "1678393708", "msgId 应回退到 ClientMsgid (撤回 ClientMsgId 参数用)");
  assert.equal(ids.clientMsgId, "1678393708");
  assert.equal(ids.createTime, 1786354739, "应提取 List[0].Createtime");
});

test("v1.3.20 REVOKE-FIX — extractOutboundMsgIds 兼容顶层字段 (非 List 结构)", () => {
  const ids = extractOutboundMsgIds({ Code: 0, Data: { msgId: 111, newMsgId: "222" }, raw: null });
  assert.equal(ids.newMsgId, "222");
  assert.equal(ids.msgId, "111");
});

test("v1.3.20 REVOKE-FIX — extractOutboundMsgIds 空 Data → 全 undefined", () => {
  const ids = extractOutboundMsgIds({ Code: 0, Data: {}, raw: null });
  assert.equal(ids.newMsgId, undefined);
  assert.equal(ids.msgId, undefined);
});

test("v1.3.20 REVOKE-FIX — persistOutboundMsg 用 List[0] 入库 newMsgId (原 msg_id 恒 null bug)", async () => {
  await persistOutboundMsg(
    { baseUrl: "https://test", tokenKey: "tk", accountId: "default" },
    {
      toWxid: "chat@chatroom",
      msgType: "text",
      content: "你好",
      resp: { Code: 0, Data: { List: [{ MsgId: 0, ClientMsgid: 1, NewMsgId: 88889999, Createtime: 100 }] }, raw: null },
    },
  );
  const rec = fakeDb.saved[0]!;
  assert.equal(rec.msg_id, "88889999", "msg_id 应存 List[0].NewMsgId (全局唯一, 引用定位/撤回用)");
  assert.equal(rec.new_msg_id, "88889999");
  assert.equal(rec.peer_kind, "group");
});

// ===== v1.3.22 SELF-MEDIA-OSS: 自己发媒体传 OSS + 入库 =====

test("v1.3.22 — uploadMediaToOss 无 OSS 凭证 → 返回 null (降级不阻塞)", async () => {
  const { uploadMediaToOss } = await import("../src/dispatch/media-oss.js");
  const url = await uploadMediaToOss(Buffer.from("hello"), "image", "jpg", "default", "/tmp/nonexistent-oss-creds.json");
  assert.equal(url, null, "无凭证应返回 null");
});

test("v1.3.22 — uploadMediaToOss 凭证文件不存在 → null (不抛)", async () => {
  const { uploadMediaToOss } = await import("../src/dispatch/media-oss.js");
  const url = await uploadMediaToOss(Buffer.from("x"), "voice", "silk", "default", "/tmp/definitely-missing.json");
  assert.equal(url, null);
});


