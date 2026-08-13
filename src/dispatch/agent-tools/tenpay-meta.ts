// src/dispatch/agent-tools/tenpay-meta.ts - TenPay tag (7)
// v1.3.20 P1-TENPAY-FIELDS (2026-08-10): 5 个新端点字段对齐 vendor swagger, 同步更新签名

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppTenPay } from "../../send/tenpay.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";

function getTenPayApi() {
  const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
  if (!state) throw new Error("account not found: default");
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
    "自定义个人收款单 (商家微信收款码).",
    Type.Object({ amount: Type.Number(), desc: Type.String() }),
    // 原版 api.geMaSkdPayQCode(amount, desc) — 但 api 签名是 (amount, name, remark, wxid?)
    // 历史不一致, 不优化
    (amount: number, desc: string) => getTenPayApi().geMaSkdPayQCode(amount, desc, ""),
  ],
  /** /TenPay/SjSkdPayQCode */
  sjSkdPayQCode: [
    "自定义商家收款单.",
    Type.Object({ amount: Type.Number(), desc: Type.String() }),
    // 原版 api.sjSkdPayQCode(amount, desc) — 但 api 签名是 (amount, name, remark, wxid?)
    // 历史不一致, 不优化
    (amount: number, desc: string) => getTenPayApi().sjSkdPayQCode(amount, desc, ""),
  ],
  /** /TenPay/OpenHongBao */
  openHongBao: [
    "抢红包 (带参数, 接收 url + key 自动拆).",
    Type.Object({ url: Type.String(), key: Type.String() }),
    // v1.3.20: 移除 timingIdentifier 参数 (vendor TenPay.HongBaoParam 只有 SendId/SendUserName/Wxid/Xml)
    (url: string, _key: string) => getTenPayApi().openHongBao(url, "", "", ""),
  ],
  /** /TenPay/Openwxhb */
  openRedPacket: [
    "拆开红包 (redPacketId 来自 inbound 红包事件).",
    Type.Object({ redPacketId: Type.String() }),
    (redPacketId: string) => getTenPayApi().openwxhb(redPacketId),
  ],
  /** /TenPay/Qrydetailwxhb */
  queryRedPacketDetail: [
    "查看红包详情.",
    Type.Object({ redPacketId: Type.String() }),
    (redPacketId: string) => getTenPayApi().qrydetailwxhb(redPacketId),
  ],
  /** /TenPay/Receivewxhb */
  receiveRedPacket: [
    "接收红包 (无 key 流程, vendor 自动).",
    Type.Object({ redPacketId: Type.String() }),
    (redPacketId: string) => getTenPayApi().receivewxhb(redPacketId),
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

  /** /TenPay/Collectmoney — 确认收款 (vendor TenPay.CollectmoneyModel) */
  collectMoney: [
    "确认收款.",
    Type.Object({ wxid: Type.String() }),
    (wxid: string) => getTenPayApi().collectMoney(wxid),
  ],
  /**
   * /TenPay/ConfirmPreTransferApi — 确认支付 (vendor TenPay.ConfirmPreTransfer)
   * 注: transferId 在 vendor 模型中无对应字段, 暂以 transactionId 形式传给 wxid 上下文
   * bankSerial/bankType/payPassword/reqKey 来自预支付响应, 高级场景可选用
   */
  confirmPreTransfer: [
    "确认支付.",
    Type.Object({ wxid: Type.String(), transferId: Type.String() }),
    (wxid: string, transferId: string) => getTenPayApi().confirmPreTransfer(wxid, transferId),
  ],
  /** /TenPay/GeneratePayQCode — 生成自定义收款二维码 (vendor TenPay.GeneratePayQCodeModel: money/name/wxid, 无 remark) */
  generatePayQCode: [
    "生成自定义收款二维码.",
    Type.Object({
      amount: Type.Number({ description: "收款金额, 单位元,最多两位小数" }),
      name: Type.String({ description: "收款项目名称" }),
      wxid: Type.Optional(Type.String({ description: "调用方 wxid (可省略, vendor 自动从 AccessToken 取)" })),
    }),
    (amount: number, name: string, wxid?: string) => getTenPayApi().generatePayQCode(amount, name, wxid ?? ""),
  ],
  /**
   * /TenPay/GetRedPacketListApi — 查看红包领取列表 (vendor TenPay.HongBaoDetail: offset/size/wxid/xml)
   * 通常由 inbound 红包事件触发, xml 来自 webhook payload (msg content)
   */
  getRedPacketList: [
    "查看红包领取列表.",
    Type.Object({
      wxid: Type.String({ description: "调用方 wxid" }),
      xml: Type.String({ description: "红包消息中的原始 XML (来自 inbound 红包事件)" }),
      offset: Type.Optional(Type.Number({ description: "领取记录分页偏移, 默认 0" })),
      size: Type.Optional(Type.Number({ description: "领取记录分页数量, 默认 100" })),
    }),
    (wxid: string, xml: string, offset?: number, size?: number) =>
      getTenPayApi().getRedPacketList(wxid, xml, offset ?? 0, size ?? 100),
  ],
  /**
   * /TenPay/WXCreateRedPacketApi — 创建红包 (vendor TenPay.RedPacket: amount/content/count/from/redType/username/wxid)
   * amount 单位"分" (整数), username 是接收人 wxid 或群 ID
   */
  createRedPacket: [
    "创建红包 (微信红包). 接收人是群 ID 或单人 wxid.",
    Type.Object({
      amountFen: Type.Number({ description: "红包总金额, 单位分 (整数)" }),
      content: Type.String({ description: "红包祝福语" }),
      count: Type.Number({ description: "红包个数" }),
      username: Type.String({ description: "接收人 wxid (单人) 或群 ID" }),
      wxid: Type.Optional(Type.String({ description: "调用方 wxid, 可省略" })),
      redType: Type.Optional(Type.Number({ description: "红包类型: 1=普通, 2=群" })),
      from: Type.Optional(Type.Number({ description: "红包来源场景, 0=普通" })),
    }),
    (amountFen: number, content: string, count: number, username: string, wxid?: string, redType?: number, from?: number) =>
      getTenPayApi().createRedPacket(amountFen, content, count, username, wxid ?? "", redType ?? 1, from ?? 0),
  ],
};