import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppTenPay(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        geMaSkdPayQCode: (amount, name, remark, wxid = "") => dispatch("/TenPay/GeMaSkdPayQCode", { Money: amount, Name: name, Remark: remark, Wxid: wxid }),
        getEncryptInfo: (info) => dispatch("/TenPay/GetEncryptInfo", { info }),
        openHongBao: (sendId, sendUserName, wxid, xml) => dispatch("/TenPay/OpenHongBao", {
            SendId: sendId,
            SendUserName: sendUserName,
            Wxid: wxid,
            Xml: xml,
        }),
        openwxhb: (redPacketId) => dispatch("/TenPay/Openwxhb", { redPacketId }),
        qrydetailwxhb: (redPacketId) => dispatch("/TenPay/Qrydetailwxhb", { redPacketId }),
        receivewxhb: (redPacketId) => dispatch("/TenPay/Receivewxhb", { redPacketId }),
        sjSkdPayQCode: (amount, name, remark, wxid = "") => dispatch("/TenPay/SjSkdPayQCode", { Money: amount, Name: name, Remark: remark, Wxid: wxid }),
        collectMoney: (wxid) => dispatch("/TenPay/Collectmoney", { wxid }),
        confirmPreTransfer: (wxid, transferId, bankSerial = "", bankType = "", payPassword = "", reqKey = "") => dispatch("/TenPay/ConfirmPreTransferApi", {
            wxid,
            bankSerial,
            bankType,
            payPassword,
            reqKey,
            transactionId: transferId,
        }),
        generatePayQCode: (amount, name, wxid = "") => dispatch("/TenPay/GeneratePayQCode", { money: amount, name, wxid }),
        getRedPacketList: (wxid, xml, offset = 0, size = 100) => dispatch("/TenPay/GetRedPacketListApi", { wxid, xml, offset, size }),
        createRedPacket: (amountFen, content, count, username, wxid = "", redType = 1, from = 0) => dispatch("/TenPay/WXCreateRedPacketApi", {
            amount: amountFen,
            content,
            count,
            from,
            redType,
            username,
            wxid,
        }),
        openHongBaoWithParams: (sendId, sendUserName, timingIdentifier, xml) => dispatch("/TenPay/OpenHongBaoWithParams", { SendId: sendId, SendUserName: sendUserName, TimingIdentifier: timingIdentifier, Xml: xml }),
        receiveWxhbWithoutEncryption: (xml) => dispatch("/TenPay/ReceivewxhbWithoutEncryption", { Xml: xml }),
    };
}
