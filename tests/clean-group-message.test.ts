// tests/clean-group-message.test.ts - v1.1.39 SUNNOY-GROUP-CONTENT
// 借鉴 sunnoy/wecom extractGroupMessageContent 范式
//
// 群消息 at 检测通过后, 清洗 content 让 AI 看到干净正文
// 清洗顺序: stripGroupContentPrefix (去 wxid_xxx:\n) → stripAtMentions (去 @bot)

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { cleanGroupMessage } from "../src/inbound/parser/mention.js";

const BOT_WXID = "q139198824"; // 老板主号微信号

describe("cleanGroupMessage (v1.1.39 SUNNOY-GROUP-CONTENT)", () => {
  test("去 wxid_xxx:\\n sender 前缀", () => {
    const input = "wxid_eezdbu1ytws422:\n你好";
    const out = cleanGroupMessage(input, BOT_WXID);
    assert.equal(out, "你好");
  });

  test("去 @bot 提及", () => {
    const input = "@q139198824 你好";
    const out = cleanGroupMessage(input, BOT_WXID);
    assert.equal(out, "你好");
  });

  test("组合清洗: wxid + @bot + 正文", () => {
    const input = "wxid_eezdbu1ytws422:\n@q139198824 你好";
    const out = cleanGroupMessage(input, BOT_WXID);
    assert.equal(out, "你好");
  });

  test("保留 @其他人 (只去 @bot)", () => {
    const input = "wxid_xxx:\n@q139198824 @所有人 开会";
    const out = cleanGroupMessage(input, BOT_WXID);
    assert.equal(out, "@所有人 开会", "should strip @bot but keep @所有人");
  });

  test("无前缀无 @ 直接返回原 content", () => {
    const input = "普通消息";
    const out = cleanGroupMessage(input, BOT_WXID);
    assert.equal(out, "普通消息");
  });

  test("空 content 返回空", () => {
    assert.equal(cleanGroupMessage("", BOT_WXID), "");
  });

  test("null botWxid 不去 @ 提及", () => {
    const input = "wxid_xxx:\n@q139198824 你好";
    const out = cleanGroupMessage(input, null);
    // sender 前缀仍然会被去 (@bot 因为 botWxid=null 不去)
    assert.equal(out, "@q139198824 你好");
  });

  test("去微信号 @ (老板 selfWxid 是微信号非 wxid_)", () => {
    const input = "wxid_xxx:\n@q139198824 今天天气";
    const out = cleanGroupMessage(input, "q139198824");
    assert.equal(out, "今天天气");
  });

  test("gh_ 前缀也清洗", () => {
    const input = "gh_abcdef123:\n@q139198824 测试";
    const out = cleanGroupMessage(input, "q139198824");
    assert.equal(out, "测试");
  });

  test("@chatroom 前缀也清洗 (群消息原始格式之一)", () => {
    const input = "57737516566@chatroom:\n@q139198824 测试";
    const out = cleanGroupMessage(input, "q139198824");
    assert.equal(out, "测试");
  });

  test("多行 content 保留换行", () => {
    const input = "wxid_xxx:\n@q139198824 第一行\n第二行\n第三行";
    const out = cleanGroupMessage(input, "q139198824");
    assert.equal(out, "第一行\n第二行\n第三行");
  });

  test("包含多人在 @, 只去 @bot 那个", () => {
    const input = "@q139198824 @wxid_alice @wxid_bob 大家看";
    const out = cleanGroupMessage(input, "q139198824");
    // stripAtMentions 只去 @q139198824, 其他 @ 保留
    assert.equal(out, "@wxid_alice @wxid_bob 大家看");
  });

  test("at 提及在中间位置 (不是开头) 也清洗", () => {
    const input = "wxid_xxx:\n我先说 @q139198824 你怎么看";
    const out = cleanGroupMessage(input, "q139198824");
    assert.equal(out, "我先说 你怎么看");
  });
});
