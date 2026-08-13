import { Type } from "typebox";
import { makeWppTenPay } from "../../send/tenpay.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";
function getTenPayApi() {
    const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
    if (!state)
        throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
    return makeWppTenPay({
        baseUrl: state.config.apiBaseUrl,
        tokenKey: state.config.tokenKey,
        authcode: state.authcode,
        accountId: getCurrentAccountId() ?? "default",
    });
}
export const TEN_PAY_META = {
    geMaSkdPayQCode: [
        "自定义个人收款单 (商家微信收款码).",
        Type.Object({ amount: Type.Number(), desc: Type.String() }),
        (amount, desc) => getTenPayApi().geMaSkdPayQCode(amount, desc, ""),
    ],
    sjSkdPayQCode: [
        "自定义商家收款单.",
        Type.Object({ amount: Type.Number(), desc: Type.String() }),
        (amount, desc) => getTenPayApi().sjSkdPayQCode(amount, desc, ""),
    ],
    openHongBao: [
        "抢红包 (带参数, 接收 url + key 自动拆).",
        Type.Object({ url: Type.String(), key: Type.String() }),
        (url, _key) => getTenPayApi().openHongBao(url, "", "", ""),
    ],
    openRedPacket: [
        "拆开红包 (redPacketId 来自 inbound 红包事件).",
        Type.Object({ redPacketId: Type.String() }),
        (redPacketId) => getTenPayApi().openwxhb(redPacketId),
    ],
    queryRedPacketDetail: [
        "查看红包详情.",
        Type.Object({ redPacketId: Type.String() }),
        (redPacketId) => getTenPayApi().qrydetailwxhb(redPacketId),
    ],
    receiveRedPacket: [
        "接收红包 (无 key 流程, vendor 自动).",
        Type.Object({ redPacketId: Type.String() }),
        (redPacketId) => getTenPayApi().receivewxhb(redPacketId),
    ],
    getEncryptInfo: [
        "获取红包/支付的加密信息 (解密 inbound 红包事件).",
        Type.Object({ info: Type.String({ description: "要解密的原始加密串" }) }),
        (info) => getTenPayApi().getEncryptInfo(info),
    ],
    collectMoney: [
        "确认收款.",
        Type.Object({ wxid: Type.String() }),
        (wxid) => getTenPayApi().collectMoney(wxid),
    ],
    confirmPreTransfer: [
        "确认支付.",
        Type.Object({ wxid: Type.String(), transferId: Type.String() }),
        (wxid, transferId) => getTenPayApi().confirmPreTransfer(wxid, transferId),
    ],
    generatePayQCode: [
        "生成自定义收款二维码.",
        Type.Object({
            amount: Type.Number({ description: "收款金额, 单位元,最多两位小数" }),
            name: Type.String({ description: "收款项目名称" }),
            wxid: Type.Optional(Type.String({ description: "调用方 wxid (可省略, vendor 自动从 AccessToken 取)" })),
        }),
        (amount, name, wxid) => getTenPayApi().generatePayQCode(amount, name, wxid ?? ""),
    ],
    getRedPacketList: [
        "查看红包领取列表.",
        Type.Object({
            wxid: Type.String({ description: "调用方 wxid" }),
            xml: Type.String({ description: "红包消息中的原始 XML (来自 inbound 红包事件)" }),
            offset: Type.Optional(Type.Number({ description: "领取记录分页偏移, 默认 0" })),
            size: Type.Optional(Type.Number({ description: "领取记录分页数量, 默认 100" })),
        }),
        (wxid, xml, offset, size) => getTenPayApi().getRedPacketList(wxid, xml, offset ?? 0, size ?? 100),
    ],
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
        (amountFen, content, count, username, wxid, redType, from) => getTenPayApi().createRedPacket(amountFen, content, count, username, wxid ?? "", redType ?? 1, from ?? 0),
    ],
};
