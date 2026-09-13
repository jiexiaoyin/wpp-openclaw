// src/send/tenpay.ts - TenPay tag (7 endpoints: 微信支付/红包)
// v1.6.0 SWAGGER-323 (2026-09-13): Openwxhb/Qrydetailwxhb/Receivewxhb 三个红包端点此前发的是
//   `redPacketId` — swagger 里不存在该字段, 且注释内嵌的旧结构 (含 Wxid) 现 definition 已删.
//   已改为 Xml/SendUserName/TimingIdentifier/Encrypt_* 真实必填项.
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

    /** /TenPay/Openwxhb — 拆开红包
     *  v1.6.0 SWAGGER-323 对齐: swagger TenPay.OpenwxhbParamDoc
     *    {Xml*, SendUserName*, TimingIdentifier*, Encrypt_key, Encrypt_userinfo}
     *  旧码只发 `redPacketId` — 该字段**在 swagger 里根本不存在**, 且上面注释内嵌的旧结构
     *  (带 Wxid) 现 definition 也已删除. 参数取自红包消息 (Xml) 与其领取结果. */
    openwxhb: (xml: string, sendUserName: string, timingIdentifier: string, encryptKey = "", encryptUserinfo = "") =>
      dispatch("/TenPay/Openwxhb", {
        Xml: xml,
        SendUserName: sendUserName,
        TimingIdentifier: timingIdentifier,
        ...(encryptKey ? { Encrypt_key: encryptKey } : {}),
        ...(encryptUserinfo ? { Encrypt_userinfo: encryptUserinfo } : {}),
      }),

    /** /TenPay/Qrydetailwxhb — 查看红包
     *  v1.6.0: swagger TenPay.QrydetailwxhbParamDoc {Xml*, Encrypt_key, Encrypt_userinfo} (旧码发 redPacketId). */
    qrydetailwxhb: (xml: string, encryptKey = "", encryptUserinfo = "") =>
      dispatch("/TenPay/Qrydetailwxhb", {
        Xml: xml,
        ...(encryptKey ? { Encrypt_key: encryptKey } : {}),
        ...(encryptUserinfo ? { Encrypt_userinfo: encryptUserinfo } : {}),
      }),

    /** /TenPay/Receivewxhb — 打开红包 (不用 key)
     *  v1.6.0: swagger TenPay.ReceivewxhbParamDoc {Xml*, InWay, Encrypt_key, Encrypt_userinfo} (旧码发 redPacketId). */
    receivewxhb: (xml: string, inWay = "", encryptKey = "", encryptUserinfo = "") =>
      dispatch("/TenPay/Receivewxhb", {
        Xml: xml,
        InWay: inWay,
        ...(encryptKey ? { Encrypt_key: encryptKey } : {}),
        ...(encryptUserinfo ? { Encrypt_userinfo: encryptUserinfo } : {}),
      }),

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
     * /TenPay/CreatePreTransfer — 创建转账预订单 (v1.6.0 SWAGGER-323 新端点).
     * swagger: TenPay.CreatePreTransferDoc {toUserName*(转账接收人微信标识), fee*(金额, 单位**分**), description}.
     * **只创建预订单, 不扣款** — 成功后用响应里的 req_key 调 confirmPreTransfer 完成支付
     * (付款方式来自 /Tools/GetBandCardList)。
     * 单位是「分」而非元: 100 = 1.00 元 (与 generatePayQCode 的 money=元 不同, 勿混)。
     */
    createPreTransfer: (toUserName: string, feeFen: number, description = "") =>
      dispatch("/TenPay/CreatePreTransfer", { toUserName, fee: feeFen, description }),

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

    /** /TenPay/OpenHongBaoWithParams — 抢红包完整参数 (v1.3.67 新 API; SendId/SendUserName/TimingIdentifier/Xml) */
    openHongBaoWithParams: (sendId: string, sendUserName: string, timingIdentifier: string, xml: string) =>
      dispatch("/TenPay/OpenHongBaoWithParams", { SendId: sendId, SendUserName: sendUserName, TimingIdentifier: timingIdentifier, Xml: xml }),

    /** /TenPay/ReceivewxhbWithoutEncryption — 打开红包无加密兼容 (v1.3.67 新 API; Xml=红包消息内容) */
    receiveWxhbWithoutEncryption: (xml: string) =>
      dispatch("/TenPay/ReceivewxhbWithoutEncryption", { Xml: xml }),
  };
}

export type WppTenPayApi = ReturnType<typeof makeWppTenPay>;