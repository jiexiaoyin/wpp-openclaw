// tests/parser-business-cb.test.ts - v1.1.15 BUSINESS-CB (2026-08-08 接总立 老板 15:19)
// 验证: parser 适配 vendor /Webhook/Business/Set + StartAutoSync 推送的真实 payload 结构
// fixture 来自 DEBUG-WH 15:21:16 老板真发消息抓到的 payload

import { test } from "node:test";
import assert from "node:assert/strict";
import { payloadToInboundMessage, payloadToAllInboundMessages } from "../src/inbound/parser.js";

test("1. payloadToAllInboundMessages — business callback AddMsgs 多条 → 逐条解析", () => {
  const fixture = {
    Wxid: "q139198824",
    EventType: "sync_message",
    Timestamp: 1786173676,
    Data: {
      Code: 0,
      Success: true,
      Message: "成功",
      Data: {
        AddMsgs: [
          {
            Content: { string: "wxid_0cuam97sl5il21:\n交换机当时买的时候有联系方式吗" },
            CreateTime: 1786087246,
            FromUserName: { string: "57237508162@chatroom" },
            ImgBuf: { iLen: 0 },
            ImgStatus: 1,
            MsgId: 196152515,
            MsgSeq: 821821004,
            MsgType: 1,
            NewMsgId: "1378809248178357000",
            Status: 3,
            ToUserName: { string: "q139198824" },
          },
        ],
      },
    },
  };
  const msgs = payloadToAllInboundMessages("default", fixture);
  assert.equal(msgs.length, 1, "应返回 1 条");
  assert.equal(msgs[0].peerKind, "group", "@chatroom 应识别为群聊");
  assert.equal(msgs[0].chatroomId, "57237508162@chatroom");
  // v1.1.15 vendor 群消息: FromUserName=chatroomId (没单独发成员 wxid, 成员在 PushContent / XML 里)
  // 暂用 chatroomId 作为 fromWxid (peerId 一致即可), 后续 dispatcher 知道是群消息
  assert.equal(msgs[0].fromWxid, "57237508162@chatroom");
  assert.equal(msgs[0].msgType, 1);
  assert.equal(msgs[0].content, "wxid_0cuam97sl5il21:\n交换机当时买的时候有联系方式吗");
  assert.equal(msgs[0].msgId, "196152515");
  assert.equal(msgs[0].ts, 1786087246);
});

test("2. AddMsgs 多条 (3 条) → 全部解析", () => {
  const fixture = {
    EventType: "sync_message",
    Data: { Data: { AddMsgs: [
      { FromUserName: { string: "a" }, ToUserName: { string: "q139198824" }, Content: { string: "m1" }, MsgType: 1, MsgId: 1, CreateTime: 100 },
      { FromUserName: { string: "b" }, ToUserName: { string: "q139198824" }, Content: { string: "m2" }, MsgType: 1, MsgId: 2, CreateTime: 200 },
      { FromUserName: { string: "c" }, ToUserName: { string: "q139198824" }, Content: { string: "m3" }, MsgType: 1, MsgId: 3, CreateTime: 300 },
    ] } },
  };
  const msgs = payloadToAllInboundMessages("default", fixture);
  assert.equal(msgs.length, 3);
  assert.equal(msgs[0].content, "m1");
  assert.equal(msgs[2].content, "m3");
});

test("3. AddMsgs 为空 → 返回空数组 (跳过)", () => {
  const fixture = { EventType: "sync_message", Data: { Data: { AddMsgs: [] } } };
  const msgs = payloadToAllInboundMessages("default", fixture);
  assert.equal(msgs.length, 0);
});

test("4. 不是 business callback 格式 → 走原 payloadToInboundMessage 路径", () => {
  const flat = { fromWxid: "wxid_x", content: "hello", msgType: 1, msgId: "x1" };
  const msgs = payloadToAllInboundMessages("default", flat);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].fromWxid, "wxid_x");
});

test("5. MsgType=51 操作消息 (XML) 保留 XML 原文", () => {
  const fixture = {
    EventType: "sync_message",
    Data: { Data: { AddMsgs: [{
      FromUserName: { string: "q139198824" },
      ToUserName: { string: "wxid_dbdmq8riblxo12" },
      Content: { string: "<msg>\n<op id='5'>\n<username>wxid_dbdmq8riblxo12</username>\n</op>\n</msg>" },
      MsgType: 51, MsgId: 76427376, CreateTime: 1786173675,
    }] } },
  };
  const msgs = payloadToAllInboundMessages("default", fixture);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].msgType, 51);
  assert.equal(msgs[0].peerKind, "direct", "单聊 (ToUserName 是 wxid)");
  assert.ok(msgs[0].content.includes("<op id='5'>"));
});

test("6. payloadToInboundMessage 兼容老路径 (扁平格式)", () => {
  const m = payloadToInboundMessage("default", { fromWxid: "x", content: "y", msgType: 1, msgId: "1" });
  assert.equal(m?.content, "y");
});
// ============ v1.1.17 FULL-FIX (P1, 2026-08-08 老板指令): vendor v1 真实格式 ============

test("v1.1.17 — v1 格式 Data.messages[] → 逐条解析 (真实 payload 17:20 日志)", () => {
  // fixture 来自 17:20:21 日志实测 (schema=wechatpad.message.v1)
  const fixture = {
    Wxid: "q139198824",
    EventType: "sync_message",
    Timestamp: 1786180821,
    Data: {
      count: 1,
      messages: [
        {
          content: "你好，帮我查一下库存",
          conversation_id: "wxid_dbdmq8riblxo12",
          created_at: 1786180821,
          direction: "incoming",
          id: "2371605221780442944",
          image_bytes: 0,
          image_status: 1,
          is_group: false,
          kind: "text",
          local_id: 1394186877,
          message_source: "<msgsource/>",
          recipient_id: "q139198824",
          sender_id: "wxid_dbdmq8riblxo12",
          sequence: 821823070,
          source: "wechat_pad",
          status: 3,
          type: 1,
        },
      ],
      schema: "wechatpad.message.v1",
    },
  };
  const msgs = payloadToAllInboundMessages("default", fixture);
  assert.equal(msgs.length, 1, "应返回 1 条");
  assert.equal(msgs[0].peerKind, "direct", "is_group=false → DM");
  assert.equal(msgs[0].fromWxid, "wxid_dbdmq8riblxo12");
  assert.equal(msgs[0].msgId, "2371605221780442944", "大整数 msgId 保留");
  assert.equal(msgs[0].content, "你好，帮我查一下库存");
  assert.equal(msgs[0].msgType, 1);
});

test("v1.1.17 — v1 格式 outgoing 消息 → 过滤 (不触发 AI)", () => {
  const fixture = {
    Wxid: "q139198824",
    EventType: "sync_message",
    Timestamp: 1786180821,
    Data: {
      count: 1,
      messages: [
        {
          content: "<msg><op id='2'><username>gh_1be33aa4340f</username></op></msg>",
          conversation_id: "gh_1be33aa4340f",
          created_at: 1786180821,
          direction: "outgoing",
          id: "2371605221780442944",
          is_group: false,
          kind: "status",
          recipient_id: "gh_1be33aa4340f",
          sender_id: "q139198824",
          source: "wechat_pad",
          status: 3,
          type: 51,
        },
      ],
      schema: "wechatpad.message.v1",
    },
  };
  const msgs = payloadToAllInboundMessages("default", fixture);
  assert.equal(msgs.length, 0, "outgoing + status → 过滤");
});

test("v1.1.17 — v1 格式 gh_ 公众号消息 → 过滤 (bot 不回复公众号)", () => {
  const fixture = {
    Wxid: "q139198824",
    EventType: "sync_message",
    Timestamp: 1786180821,
    Data: {
      count: 1,
      messages: [
        {
          content: "公众号推送",
          conversation_id: "gh_1be33aa4340f",
          created_at: 1786180821,
          direction: "incoming",
          id: "999",
          is_group: false,
          kind: "text",
          recipient_id: "q139198824",
          sender_id: "gh_1be33aa4340f",
          source: "wechat_pad",
          status: 3,
          type: 1,
        },
      ],
      schema: "wechatpad.message.v1",
    },
  };
  const msgs = payloadToAllInboundMessages("default", fixture);
  assert.equal(msgs.length, 0, "gh_ 公众号 → 过滤");
});

test("v1.1.17 — v1 格式群聊 is_group=true → 群聊解析", () => {
  const fixture = {
    Wxid: "q139198824",
    EventType: "sync_message",
    Timestamp: 1786180821,
    Data: {
      count: 1,
      messages: [
        {
          content: "大家好",
          conversation_id: "57237508162@chatroom",
          created_at: 1786180821,
          direction: "incoming",
          id: "1000",
          is_group: true,
          kind: "text",
          recipient_id: "57237508162@chatroom",
          sender_id: "wxid_0cuam97sl5il21",
          source: "wechat_pad",
          status: 3,
          type: 1,
        },
      ],
      schema: "wechatpad.message.v1",
    },
  };
  const msgs = payloadToAllInboundMessages("default", fixture);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].peerKind, "group", "is_group=true → 群聊");
  assert.equal(msgs[0].chatroomId, "57237508162@chatroom");
  assert.equal(msgs[0].peerId, "57237508162@chatroom");
});
