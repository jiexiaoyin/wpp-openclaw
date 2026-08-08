// src/dispatch/agent-tools/tenpay-meta.ts - TenPay tag (7)

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppTenPay } from "../../send/tenpay.js";
import type { WppAccountCtx } from "../../send/factory.js";

const ctx: WppAccountCtx = { baseUrl: "", tokenKey: "", accountId: "" };
const api = makeWppTenPay(ctx);

export const TEN_PAY_META: ToolMeta = {
  /** /TenPay/GeMaSkdPayQCode */
  geMaSkdPayQCode: [
    "自定义个人收款单 (商家微信收款码).",
    Type.Object({ amount: Type.Number(), desc: Type.String() }),
    api.geMaSkdPayQCode,
  ],
  /** /TenPay/SjSkdPayQCode */
  sjSkdPayQCode: [
    "自定义商家收款单.",
    Type.Object({ amount: Type.Number(), desc: Type.String() }),
    api.sjSkdPayQCode,
  ],
  /** /TenPay/OpenHongBao */
  openHongBao: [
    "抢红包 (带参数, 接收 url + key 自动拆).",
    Type.Object({ url: Type.String(), key: Type.String() }),
    api.openHongBao,
  ],
  /** /TenPay/Openwxhb */
  openRedPacket: [
    "拆开红包 (redPacketId 来自 inbound 红包事件).",
    Type.Object({ redPacketId: Type.String() }),
    api.openwxhb,
  ],
  /** /TenPay/Qrydetailwxhb */
  queryRedPacketDetail: [
    "查看红包详情.",
    Type.Object({ redPacketId: Type.String() }),
    api.qrydetailwxhb,
  ],
  /** /TenPay/Receivewxhb */
  receiveRedPacket: [
    "接收红包 (无 key 流程, vendor 自动).",
    Type.Object({ redPacketId: Type.String() }),
    api.receivewxhb,
  ],
};
