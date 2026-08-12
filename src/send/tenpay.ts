// src/send/tenpay.ts - TenPay tag (7 endpoints: 微信支付/红包)
// v1.3.20 P1-TENPAY-FIELDS (2026-08-10): 5 个新端点字段对齐 vendor swagger
//   - 老端点 GeMaSkd/SjSkd/HongBao*/Openwxhb/Qrydetailwxhb/Receivewxhb 字段名仍为 PascalCase (vendor 老 definition 也是 PascalCase, 保持兼容)
//   - 新端点 Collectmoney/ConfirmPreTransferApi/GeneratePayQCode/GetRedPacketListApi/WXCreateRedPacketApi 字段对齐 vendor 全小写定义 (TenPay.CollectmoneyModel 等)
//   - 同名 wxid: 老端点用 Wxid, 新端点用 wxid (vendor 文档本身混用, 按 swagger definitions 字段为准)

import { postWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppTenPay(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /TenPay/GeMaSkdPayQCode — 自定义个人收款单 (TenPay.GeMaSkdPayQCodeParam: Money/Name/Remark/Wxid) */
    geMaSkdPayQCode: (amount: number, name: string, remark: string, wxid = "") =>
      dispatch("/TenPay/GeMaSkdPayQCode", { Money: amount, Name: name, Remark: remark, Wxid: wxid }),

    /** /TenPay/GetEncryptInfo */
    getEncryptInfo: (info: string) =>
      dispatch("/TenPay/GetEncryptInfo", { info }),

    /** /TenPay/OpenHongBao — 抢红包 (TenPay.HongBaoParam: SendId/SendUserName/Wxid/Xml; 无 TimingIdentifier) */
    openHongBao: (sendId: string, sendUserName: string, wxid: string, xml: string) =>
      dispatch("/TenPay/OpenHongBao", {
        SendId: sendId,
        SendUserName: sendUserName,
        Wxid: wxid,
        Xml: xml,
      }),

    /** /TenPay/Openwxhb — 拆开红包 (TenPay.OpenwxhbParam: Encrypt_key/Encrypt_userinfo/SendUserName/TimingIdentifier/Wxid/Xml) */
    openwxhb: (redPacketId: string) =>
      dispatch("/TenPay/Openwxhb", { redPacketId }),

    /** /TenPay/Qrydetailwxhb — 查看红包 (TenPay.QrydetailwxhbParam: Encrypt_key/Encrypt_userinfo/Wxid/Xml) */
    qrydetailwxhb: (redPacketId: string) =>
      dispatch("/TenPay/Qrydetailwxhb", { redPacketId }),

    /** /TenPay/Receivewxhb — 不用 key 打开 (TenPay.ReceivewxhbParam: Encrypt_key/Encrypt_userinfo/InWay/Wxid/Xml) */
    receivewxhb: (redPacketId: string) =>
      dispatch("/TenPay/Receivewxhb", { redPacketId }),

    /** /TenPay/SjSkdPayQCode — 商家收款单 (TenPay.SjSkdPayQCodeParam: Money/Name/Remark/Wxid) */
    sjSkdPayQCode: (amount: number, name: string, remark: string, wxid = "") =>
      dispatch("/TenPay/SjSkdPayQCode", { Money: amount, Name: name, Remark: remark, Wxid: wxid }),

    // ===== v1.3.20 P1-TENPAY-FIELDS: 新增 5 个字段名按 vendor 全小写对齐 =====

    /**
     * /TenPay/Collectmoney — 确认收款
     * vendor: TenPay.CollectmoneyModel {invalidTime, toUserName, transFerId, transactionId, wxid}
     * v1.3.19 错用 Wxid, Go 大小写敏感导致字段被忽略 → 修复为小写 wxid
     */
    collectMoney: (wxid: string) => dispatch("/TenPay/Collectmoney", { wxid }),

    /**
     * /TenPay/ConfirmPreTransferApi — 确认支付
     * vendor: TenPay.ConfirmPreTransfer {bankSerial, bankType, payPassword, reqKey, wxid}
     * v1.3.19 错用 Wxid/TransferId, 修复为 wxid
     * 注: bankSerial/bankType/payPassword/reqKey 来自 vendor 预支付响应, 调用方需通过 chainParams 传入
     */
    confirmPreTransfer: (
      wxid: string,
      transferId: string,
      bankSerial = "",
      bankType = "",
      payPassword = "",
      reqKey = ""
    ) =>
      dispatch("/TenPay/ConfirmPreTransferApi", {
        wxid,
        bankSerial,
        bankType,
        payPassword,
        reqKey,
        // transferId 不在 vendor body schema, 仅传给 wxid 关联上下文 (vendor 隐含从 transactionId 取)
        transactionId: transferId,
      }),

    /**
     * /TenPay/GeneratePayQCode — 生成自定义收款二维码
     * vendor: TenPay.GeneratePayQCodeModel {money, name, wxid}
     * v1.3.19 错用 Money/Name/Remark → money/name 无 remark
     */
    generatePayQCode: (amount: number, name: string, wxid = "") =>
      dispatch("/TenPay/GeneratePayQCode", { money: amount, name, wxid }),

    /**
     * /TenPay/GetRedPacketListApi — 查看红包领取列表
     * vendor: TenPay.HongBaoDetail {offset, size, wxid, xml}
     * v1.3.19 错用 RedPacketId → 需要 offset/size/wxid/xml 来自原始红包消息
     * 通常由 inbound 红包事件触发 (xml 来自 webhook payload)
     */
    getRedPacketList: (wxid: string, xml: string, offset = 0, size = 100) =>
      dispatch("/TenPay/GetRedPacketListApi", { wxid, xml, offset, size }),

    /**
     * /TenPay/WXCreateRedPacketApi — 创建红包
     * vendor: TenPay.RedPacket {amount, content, count, from, redType, username, wxid}
     * v1.3.19 错用 Money/Name/Wxids/Remark → 完整重写
     * 注: amount 单位单位"分" (整数), content 红包祝福语, count 个数, from 红包来源场景, redType 红包类型, username 群 ID 或 wxid
     */
    createRedPacket: (
      amountFen: number,  // 红包总金额 (单位分)
      content: string,    // 红包祝福语
      count: number,      // 红包个数
      username: string,   // 接收人 wxid 或群 ID
      wxid = "",          // 调用方 wxid (vendor 隐含从 AccessToken 取)
      redType = 1,        // 红包类型 (1=普通, 2=群)
      from = 0            // 红包来源场景 (0=普通)
    ) =>
      dispatch("/TenPay/WXCreateRedPacketApi", {
        amount: amountFen,
        content,
        count,
        from,
        redType,
        username,
        wxid,
      }),
  };
}

export type WppTenPayApi = ReturnType<typeof makeWppTenPay>;