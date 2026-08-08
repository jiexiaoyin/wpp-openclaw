// src/send/tenpay.ts - TenPay tag (7 endpoints: 微信支付/红包)

import { postWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppTenPay(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /TenPay/GeMaSkdPayQCode — 自定义个人收款单 */
    geMaSkdPayQCode: (amount: number, desc: string) =>
      dispatch("/TenPay/GeMaSkdPayQCode", { amount, desc }),

    /** /TenPay/GetEncryptInfo */
    getEncryptInfo: (info: string) =>
      dispatch("/TenPay/GetEncryptInfo", { info }),

    /** /TenPay/OpenHongBao — 抢红包 */
    openHongBao: (url: string, key: string) =>
      dispatch("/TenPay/OpenHongBao", { url, key }),

    /** /TenPay/Openwxhb — 拆开红包 */
    openwxhb: (redPacketId: string) =>
      dispatch("/TenPay/Openwxhb", { redPacketId }),

    /** /TenPay/Qrydetailwxhb — 查看红包 */
    qrydetailwxhb: (redPacketId: string) =>
      dispatch("/TenPay/Qrydetailwxhb", { redPacketId }),

    /** /TenPay/Receivewxhb — 不用 key 打开 */
    receivewxhb: (redPacketId: string) =>
      dispatch("/TenPay/Receivewxhb", { redPacketId }),

    /** /TenPay/SjSkdPayQCode — 商家收款单 */
    sjSkdPayQCode: (amount: number, desc: string) =>
      dispatch("/TenPay/SjSkdPayQCode", { amount, desc }),
  };
}

export type WppTenPayApi = ReturnType<typeof makeWppTenPay>;
