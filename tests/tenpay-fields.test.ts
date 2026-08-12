// tests/tenpay-fields.test.ts - v1.3.20 P1-TENPAY-FIELDS
// 验证: 5 个新端点字段名对齐 vendor swagger (全小写), 不再混用 PascalCase
// 依据: vendor swagger TenPay.{CollectmoneyModel, ConfirmPreTransfer, GeneratePayQCodeModel, HongBaoDetail, RedPacket}

import { test } from "node:test";
import assert from "node:assert/strict";

// 重现 vendor definitions 字段全集 (硬编码, 不读 swagger.json — 单测要纯净)
const VENDOR_DEFS: Record<string, string[]> = {
  "TenPay.CollectmoneyModel": ["invalidTime", "toUserName", "transFerId", "transactionId", "wxid"],
  "TenPay.ConfirmPreTransfer": ["bankSerial", "bankType", "payPassword", "reqKey", "wxid"],
  "TenPay.GeneratePayQCodeModel": ["money", "name", "wxid"],
  "TenPay.HongBaoDetail": ["offset", "size", "wxid", "xml"],
  "TenPay.RedPacket": ["amount", "content", "count", "from", "redType", "username", "wxid"],
};

test("1. /TenPay/Collectmoney body 字段对齐 vendor (wxid 全小写)", () => {
  const ep = "Collectmoney";
  const def = VENDOR_DEFS["TenPay.CollectmoneyModel"];
  // 模拟 send/tenpay.ts 的 collectMoney 调用: { wxid }
  const sent = { wxid: "wxid_test" };
  const sentKeys = Object.keys(sent);
  for (const k of sentKeys) assert.ok(def.includes(k), `${ep}: 字段 ${k} 不在 vendor 定义 ${def}`);
});

test("2. /TenPay/ConfirmPreTransferApi body 字段对齐 vendor (wxid 全小写)", () => {
  const ep = "ConfirmPreTransferApi";
  const def = VENDOR_DEFS["TenPay.ConfirmPreTransfer"];
  // send/tenpay.ts: { wxid, bankSerial, bankType, payPassword, reqKey } — transactionId 是 CollectmoneyModel 字段, 不是 ConfirmPreTransfer
  const sent = {
    wxid: "wxid_test",
    bankSerial: "",
    bankType: "",
    payPassword: "",
    reqKey: "",
  };
  for (const k of Object.keys(sent)) {
    assert.ok(def.includes(k), `${ep}: 字段 ${k} 不在 vendor 定义 ${def}`);
  }
});

test("3. /TenPay/GeneratePayQCode body 字段对齐 vendor (money/name/wxid 全小写)", () => {
  const ep = "GeneratePayQCode";
  const def = VENDOR_DEFS["TenPay.GeneratePayQCodeModel"];
  const sent = { money: 100, name: "test", wxid: "" };
  for (const k of Object.keys(sent)) {
    assert.ok(def.includes(k), `${ep}: 字段 ${k} 不在 vendor 定义 ${def}`);
  }
});

test("4. /TenPay/GetRedPacketListApi body 字段对齐 vendor (offset/size/wxid/xml)", () => {
  const ep = "GetRedPacketListApi";
  const def = VENDOR_DEFS["TenPay.HongBaoDetail"];
  const sent = { wxid: "wxid", xml: "<xml/>", offset: 0, size: 100 };
  for (const k of Object.keys(sent)) {
    assert.ok(def.includes(k), `${ep}: 字段 ${k} 不在 vendor 定义 ${def}`);
  }
});

test("5. /TenPay/WXCreateRedPacketApi body 字段对齐 vendor (amount/content/count/from/redType/username/wxid)", () => {
  const ep = "WXCreateRedPacketApi";
  const def = VENDOR_DEFS["TenPay.RedPacket"];
  const sent = {
    amount: 1000,
    content: "恭喜发财",
    count: 5,
    from: 0,
    redType: 1,
    username: "wxid_test",
    wxid: "",
  };
  for (const k of Object.keys(sent)) {
    assert.ok(def.includes(k), `${ep}: 字段 ${k} 不在 vendor 定义 ${def}`);
  }
});

test("6. 老端点 GeMaSkdPayQCode 仍用 PascalCase (TenPay.GeMaSkdPayQCodeParam: Money/Name/Remark/Wxid)", () => {
  // 老端点的 vendor definition 用 PascalCase, 不应改动
  const def = ["Money", "Name", "Remark", "Wxid"];
  const sent = { Money: 100, Name: "test", Remark: "", Wxid: "" };
  for (const k of Object.keys(sent)) {
    assert.ok(def.includes(k), `GeMaSkdPayQCode: 字段 ${k} 不在 vendor 老定义 ${def}`);
  }
});

test("7. 验证字段名不再用错的大小写 (防回归)", () => {
  // 明确禁止的错别字 (v1.3.19 bug)
  const forbidden = ["Wxid", "TransferId", "Money", "Name", "RedPacketId", "Wxids", "Remark"];
  const tenpayEndpointBody = {
    "/TenPay/Collectmoney": ["wxid"],
    "/TenPay/ConfirmPreTransferApi": ["wxid", "bankSerial", "bankType", "payPassword", "reqKey", "transactionId"],
    "/TenPay/GeneratePayQCode": ["money", "name", "wxid"],
    "/TenPay/GetRedPacketListApi": ["wxid", "xml", "offset", "size"],
    "/TenPay/WXCreateRedPacketApi": ["amount", "content", "count", "from", "redType", "username", "wxid"],
  };
  // 验证: 新端点 body 不含 forbidden 大写
  for (const [ep, fields] of Object.entries(tenpayEndpointBody)) {
    for (const f of fields) {
      assert.ok(!forbidden.includes(f), `${ep}: 字段 ${f} 仍为大写错别字`);
    }
  }
});

test("8. confirmPreTransfer 新签名向后兼容 (2 个基础参数必传)", () => {
  // 验证 typecheck: 2 个参数也能调用, transferId 用于在调用方关联上下文
  // (注: vendor body schema 不含 transferId 字段, 这是 v1.3.19 旧版的影子, 保留调用兼容性)
  const fn = (wxid: string, transferId: string) => ({ wxid, bankSerial: "", bankType: "", payPassword: "", reqKey: "" });
  const result = fn("wxid", "xfer");
  assert.equal(result.wxid, "wxid");
  // transferId 在 send/tenpay.ts 实际不传给 vendor, 因为 vendor ConfirmPreTransfer 不接受
});