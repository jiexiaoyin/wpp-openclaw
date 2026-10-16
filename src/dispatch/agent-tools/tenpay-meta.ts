// src/dispatch/agent-tools/tenpay-meta.ts - TenPay tag (7)
// v1.3.20 P1-TENPAY-FIELDS (2026-08-10): 5 个新端点字段对齐 vendor swagger, 同步更新签名

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppTenPay } from "../../send/tenpay.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";

function getTenPayApi() {
  const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
  if (!state) throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
  return makeWppTenPay({
    baseUrl: state.config.apiBaseUrl,
    tokenKey: state.config.tokenKey,
    authcode: state.authcode,
    accountId: getCurrentAccountId() ?? "default",
  });
}

export const TEN_PAY_META: ToolMeta = {
  /** /TenPay/GeMaSkdPayQCode */
  geMaSkdPayQCode: [
    "自定义个人收款单 (商家微信收款码). ⚠️ 商户名必须与已开通经营收款的账户名称完全一致, 不是商品名.",
    Type.Object({ amount: Type.Number(), desc: Type.String({ description: "经营收款账户名称 (必须与微信商户账户名完全一致)" }) }),
    // 原版 api.geMaSkdPayQCode(amount, desc) — 但 api 签名是 (amount, name, remark?) — 历史不一致, 不优化
    // (desc 形参名保留: 改它会动 agent 可见的入参名; 但 schema description 已写明它其实必须是账户名)
    (amount: number, desc: string) => getTenPayApi().geMaSkdPayQCode(amount, desc, ""),
  ],
  /** /TenPay/SjSkdPayQCode */
  sjSkdPayQCode: [
    "自定义商家收款单. ⚠️ 商户名必须与已绑定微信商户账户的完整名称一致, 不是商品名.",
    Type.Object({ amount: Type.Number(), desc: Type.String({ description: "商家账户名称 (必须与微信商户账户名完全一致)" }) }),
    // 同上: 形参名历史遗留, 语义按 vendor 走 (Name)
    (amount: number, desc: string) => getTenPayApi().sjSkdPayQCode(amount, desc, ""),
  ],
  /**
   * /TenPay/OpenHongBao — 抢红包
   * ⚠️ v1.16.1 (2026-10-16) 字段更正: 旧版工具收 `{url, key}` 并把两个参数**丢掉**, 调
   *   `openHongBao(url, "", "", "")` ⇒ 发出去的是 `SendUserName:"" + Xml:""`。叠加当时底层还在发
   *   `SendId/Wxid` (线上 model 里都没有) ⇒ 整条调用从未成功过, 且因为 Go 静默忽略未知字段而**不报错**。
   *   现按线上 `TenPay.HongBaoParamDoc {SendUserName, Xml, contextId}` 暴露。
   */
  openHongBao: [
    "抢红包. 推荐传 contextId (红包消息中的上下文标识); 否则传 xml (红包消息内容) + sendUserName (红包发送人).",
    Type.Object({
      xml: Type.String({ description: "红包消息内容 (XML); 与 contextId 二选一" }),
      sendUserName: Type.String({ description: "红包发送人" }),
      contextId: Type.Optional(
        Type.String({ description: "红包上下文标识 (vendor 标注为推荐用法; 给了它就忽略 xml/sendUserName)" }),
      ),
    }),
    (xml: string, sendUserName: string, contextId?: string) =>
      getTenPayApi().openHongBao({ xml, sendUserName, contextId }),
  ],
  /** /TenPay/Openwxhb */
  openRedPacket: [
    "拆开已领取的红包. xml=红包消息内容, sendUserName=红包发送人, timingIdentifier=领取结果返回的时序标识.",
    Type.Object({
      xml: Type.String({ description: "红包消息内容" }),
      sendUserName: Type.String({ description: "红包发送人" }),
      timingIdentifier: Type.String({ description: "领取结果返回的时序标识" }),
    }),
    (xml: string, sendUserName: string, timingIdentifier: string) =>
      getTenPayApi().openwxhb(xml, sendUserName, timingIdentifier),
  ],
  /** /TenPay/Qrydetailwxhb */
  queryRedPacketDetail: [
    "查看红包详情. xml=红包消息内容.",
    Type.Object({ xml: Type.String({ description: "红包消息内容" }) }),
    (xml: string) => getTenPayApi().qrydetailwxhb(xml),
  ],
  /** /TenPay/Receivewxhb */
  receiveRedPacket: [
    "打开红包 (无 key 流程, vendor 自动). xml=红包消息内容.",
    Type.Object({ xml: Type.String({ description: "红包消息内容" }) }),
    (xml: string) => getTenPayApi().receivewxhb(xml),
  ],
  /**
   * v1.3.20 P2-TENPAY: /TenPay/GetEncryptInfo — 获取红包/支付加密信息.
   * info 是要解密的原始字符串 (inbound 红包事件带).
   */
  getEncryptInfo: [
    "获取红包/支付的加密信息 (解密 inbound 红包事件).",
    Type.Object({ info: Type.String({ description: "要解密的原始加密串" }) }),
    (info: string) => getTenPayApi().getEncryptInfo(info),
  ],
  // ===== v1.3.20 P1-TENPAY-FIELDS: 新增 5 个字段名按 vendor 全小写对齐 =====

  /**
   * /TenPay/Collectmoney — 确认收款
   * ⚠️ v1.16.1 (2026-10-16) 字段更正: 旧版只收 `wxid`, 而线上 `TenPay.CollectmoneyModelDoc` 里
   *   **没有 wxid** ⇒ 唯一那个键被静默忽略, 确认收款是空操作 (同 openHongBao 一类病)。
   */
  collectMoney: [
    "确认收款. 推荐传 contextId; 否则传 toUserName (付款方微信标识).",
    Type.Object({
      toUserName: Type.String({ description: "付款方微信标识" }),
      contextId: Type.Optional(
        Type.String({ description: "收款上下文标识 (vendor 标注为推荐用法; 给了它就忽略其余字段)" }),
      ),
      transFerId: Type.Optional(Type.String({ description: "转账单号 (可选)" })),
      transactionId: Type.Optional(Type.String({ description: "交易号 (可选)" })),
      invalidTime: Type.Optional(Type.String({ description: "失效时间 (可选)" })),
    }),
    (toUserName: string, contextId?: string, transFerId?: string, transactionId?: string, invalidTime?: string) =>
      getTenPayApi().collectMoney({ toUserName, contextId, transFerId, transactionId, invalidTime }),
  ],
  /**
   * /TenPay/ConfirmPreTransferApi — 确认支付
   * 线上 TenPay.ConfirmPreTransferDoc {bankSerial*, bankType*, payPassword*, reqKey*} — 四个全必填。
   * ⚠️ v1.16.1 (2026-10-16) 修正一处**真坏点**: 旧工具只暴露 wxid/transferId 两个线上不存在的键,
   *   那四个必填只能拿默认空串 ⇒ 每次"确认支付"都发 `{bankSerial:"",bankType:"",payPassword:"",reqKey:""}`,
   *   线上不可能成功。现在这四个必填直接暴露给调用方 (值来自 createPreTransfer 的响应 + 付款方式来自
   *   /Tools/GetBandCardList)。
   */
  confirmPreTransfer: [
    "确认支付 (完成 createPreTransfer 的预订单). bankSerial/bankType/payPassword/reqKey 缺一不可, 全部来自预支付响应与银行卡列表.",
    Type.Object({
      bankSerial: Type.String({ description: "银行卡序列号 (来自 /Tools/GetBandCardList)" }),
      bankType: Type.String({ description: "银行类型, 如 CFT" }),
      payPassword: Type.String({ description: "支付密码" }),
      reqKey: Type.String({ description: "createPreTransfer 响应里的 req_key" }),
    }),
    (bankSerial: string, bankType: string, payPassword: string, reqKey: string) =>
      getTenPayApi().confirmPreTransfer({ bankSerial, bankType, payPassword, reqKey }),
  ],
  /**
   * /TenPay/PayQCodeStatus — 收款码是否**真到账** (v1.16.1 新接: 线上比旧快照多的那条路径)
   * 判据硬: 只有 status==="paid" 且 paid===true 才算付款; 503/PAYMENT_STATUS_UNAVAILABLE 时**不是**失败, 要稍后重试。
   */
  payQCodeStatus: [
    "查询收款二维码的支付状态 (轮询是否真到账). 只有 status=paid 且 paid=true 才算已付款; 查询不可用 (503) 时必须保持原状态并稍后重试, 不得判为支付失败.",
    Type.Object({
      orderId: Type.String({ description: "generatePayQCode 响应里的 order_id (推荐)" }),
      payUrl: Type.Optional(Type.String({ description: "兼容旧调用: 也可传收款二维码 pay_url" })),
    }),
    (orderId: string, payUrl?: string) => getTenPayApi().payQCodeStatus(orderId, payUrl ?? ""),
  ],
  /** /TenPay/GeneratePayQCode — 生成自定义收款二维码 (线上 TenPay.GeneratePayQCodeModelDoc: money/name, 均 string, 无 wxid/remark) */
  generatePayQCode: [
    "生成自定义收款二维码. 返回 pay_url / qr_code_url 与 order_id (可用 payQCodeStatus 轮询是否到账).",
    Type.Object({
      amount: Type.Number({ description: "收款金额, 单位元,最多两位小数 (发送时按线上要求转成两位小数字符串)" }),
      name: Type.String({ description: "收款项目名称" }),
    }),
    // v1.16.1: 去掉 wxid —— 线上 model 没有这个键 (旧 doc 说"vendor 自动从 AccessToken 取", 其实是无此字段)
    (amount: number, name: string) => getTenPayApi().generatePayQCode(amount, name),
  ],
  /**
   * /TenPay/GetRedPacketListApi — 查看红包领取列表 (线上 TenPay.HongBaoDetailDoc: xml 必填 + offset/size, 无 wxid)
   * 通常由 inbound 红包事件触发, xml 来自 webhook payload (msg content)
   */
  getRedPacketList: [
    "查看红包领取列表.",
    Type.Object({
      xml: Type.String({ description: "红包消息中的原始 XML (来自 inbound 红包事件)" }),
      offset: Type.Optional(Type.Number({ description: "领取记录分页偏移, 默认 0" })),
      size: Type.Optional(Type.Number({ description: "领取记录分页数量, 默认 100" })),
    }),
    // v1.16.1: 去掉 wxid (线上无此字段, 旧码却把它设成必填 ⇒ 调用方白传一个必填项)
    (xml: string, offset?: number, size?: number) =>
      getTenPayApi().getRedPacketList(xml, offset ?? 0, size ?? 100),
  ],
  /**
   * /TenPay/WXCreateRedPacketApi — 创建红包
   * 线上 TenPay.RedPacketDoc: required [username, count, amount, content] + from/redType; **无 wxid**。
   * amount 单位"分" (整数), username 是接收人 wxid 或群 ID
   */
  createRedPacket: [
    "创建红包 (微信红包). 接收人是群 ID 或单人 wxid.",
    Type.Object({
      amountFen: Type.Number({ description: "红包总金额, 单位分 (整数)" }),
      content: Type.String({ description: "红包祝福语" }),
      count: Type.Number({ description: "红包个数" }),
      username: Type.String({ description: "接收人 wxid (单人) 或群 ID" }),
      redType: Type.Optional(Type.Number({ description: "红包类型: 1=普通, 2=群" })),
      from: Type.Optional(Type.Number({ description: "红包来源场景, 0=普通" })),
    }),
    // v1.16.1: 去掉 wxid (线上无此字段)
    (amountFen: number, content: string, count: number, username: string, redType?: number, from?: number) =>
      getTenPayApi().createRedPacket(amountFen, content, count, username, redType ?? 1, from ?? 0),
  ],
  /** /TenPay/OpenHongBaoWithParams — 抢红包完整参数 (v1.3.67 新 API) */
  openHongBaoWithParams: [
    "抢红包 (完整参数). sendId=红包ID, sendUserName=发送者, timingIdentifier=定时标识, xml=红包消息.",
    Type.Object({
      sendId: Type.String(),
      sendUserName: Type.String(),
      timingIdentifier: Type.String(),
      xml: Type.String(),
    }),
    (sendId: string, sendUserName: string, timingIdentifier: string, xml: string) =>
      getTenPayApi().openHongBaoWithParams(sendId, sendUserName, timingIdentifier, xml),
  ],
  /** /TenPay/ReceivewxhbWithoutEncryption — 打开红包无加密 (v1.3.67 新 API) */
  receiveWxhbWithoutEncryption: [
    "打开红包 (无加密兼容模式). xml=红包消息内容.",
    Type.Object({ xml: Type.String() }),
    (xml: string) => getTenPayApi().receiveWxhbWithoutEncryption(xml),
  ],
  /**
   * /TenPay/CreatePreTransfer — 创建转账预订单 (v1.6.0 SWAGGER-323 新 API).
   * **只创建预订单, 不扣款**; 成功后须用返回的 req_key 调 confirmPreTransfer 完成支付.
   */
  createPreTransfer: [
    "创建转账预订单 (只创建不扣款). feeFen 单位是分 (100=1.00元). 成功后用返回的 req_key 调 confirmPreTransfer 完成支付.",
    Type.Object({
      toUserName: Type.String({ description: "转账接收人微信标识" }),
      feeFen: Type.Number({ description: "转账金额, 单位分 (100=1.00元)" }),
      description: Type.Optional(Type.String({ description: "转账备注" })),
    }),
    (toUserName: string, feeFen: number, description?: string) =>
      getTenPayApi().createPreTransfer(toUserName, feeFen, description),
  ],
};