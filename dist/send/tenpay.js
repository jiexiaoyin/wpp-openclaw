// src/send/tenpay.ts - TenPay tag (7 endpoints: 微信支付/红包)
// v1.6.0 SWAGGER-323 (2026-09-13): Openwxhb/Qrydetailwxhb/Receivewxhb 三个红包端点此前发的是
//   `redPacketId` — swagger 里不存在该字段, 且注释内嵌的旧结构 (含 Wxid) 现 definition 已删.
//   已改为 Xml/SendUserName/TimingIdentifier/Encrypt_* 真实必填项.
// v1.3.20 P1-TENPAY-FIELDS (2026-08-10): 5 个新端点字段对齐 vendor swagger
//   - 老端点 GeMaSkd/SjSkd/HongBao*/Openwxhb/Qrydetailwxhb/Receivewxhb 字段名仍为 PascalCase (vendor 老 definition 也是 PascalCase, 保持兼容)
//   - 新端点 Collectmoney/ConfirmPreTransferApi/GeneratePayQCode/GetRedPacketListApi/WXCreateRedPacketApi 字段对齐 vendor 全小写定义 (TenPay.CollectmoneyModel 等)
//   - 同名 wxid: 老端点用 Wxid, 新端点用 wxid (vendor 文档本身混用, 按 swagger definitions 字段为准)
import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
/**
 * 金额 → 线上要求的「单位元、两位小数字符串」(示例 "1.00" / "10.00")。
 * ⚠️ 不要图省事发 number: 线上这几个 model 都把金额声明为 **string**, 而厂商 Go 反序列化对类型是严格的
 *   (同文件 /Msg/Revoke 的实测: 传 string 给 int64 直接 Code=-8 INVALID_ARGUMENT)。旧码发 number ⇒ 必失败。
 */
const yuan = (amount) => amount.toFixed(2);
export function makeWppTenPay(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        /**
         * /TenPay/GeMaSkdPayQCode — 自定义经营个人收款单.
         * 线上 TenPay.GeMaSkdPayQCodeParam {Money*, Name*, Remark} — 三个字段**全是 string** (示例 "1.00"), 无 Wxid。
         * ⚠️ v1.16.1 (2026-10-16) 两处更正: ① Money 由 number 改为两位小数字符串 (类型不符 ⇒ 厂商拒收);
         *   ② 去掉不存在的 Wxid。另注: 线上明确 Name 必须与**已开通经营收款的账户名称完全一致**, 不是商品名/备注。
         */
        geMaSkdPayQCode: (amount, name, remark = "") => dispatch("/TenPay/GeMaSkdPayQCode", { Money: yuan(amount), Name: name, Remark: remark }),
        /** /TenPay/GetEncryptInfo */
        getEncryptInfo: (info) => dispatch("/TenPay/GetEncryptInfo", { info }),
        /**
         * /TenPay/OpenHongBao — 抢红包。
         * ⚠️ v1.16.1 (2026-10-16) 字段更正: 旧版发 `{SendId, SendUserName, Wxid, Xml}`, 依据是注释里那句
         *   "vendor TenPay.HongBaoParam 只有 SendId/SendUserName/Wxid/Xml" —— **那个 model 在容器 swagger 里不存在**。
         *   以 swagger 为准, 线上是 `TenPay.HongBaoParamDoc {SendUserName, Xml, contextId}`:
         *   ⇒ SendId/Wxid 厂商不认 (Go 对未知字段是**静默忽略**, 不报错, 所以一直没人发现),
         *     而 SendUserName/Xml 又被 agent 工具常年传空字符串 ⇒ **整条调用是静默空操作** (抢红包必失败)。
         *   现在按 model 走: 给 contextId 就只发 contextId (厂商标注"推荐使用"); 否则发兼容模式 SendUserName+Xml。
         */
        openHongBao: (opts) => dispatch("/TenPay/OpenHongBao", opts.contextId
            ? { contextId: opts.contextId }
            : { SendUserName: opts.sendUserName ?? "", Xml: opts.xml ?? "" }),
        /** /TenPay/Openwxhb — 拆开红包
         *  v1.6.0 SWAGGER-323 对齐: swagger TenPay.OpenwxhbParamDoc
         *    {Xml*, SendUserName*, TimingIdentifier*, Encrypt_key, Encrypt_userinfo}
         *  旧码只发 `redPacketId` — 该字段**在 swagger 里根本不存在**, 且上面注释内嵌的旧结构
         *  (带 Wxid) 现 definition 也已删除. 参数取自红包消息 (Xml) 与其领取结果. */
        openwxhb: (xml, sendUserName, timingIdentifier, encryptKey = "", encryptUserinfo = "") => dispatch("/TenPay/Openwxhb", {
            Xml: xml,
            SendUserName: sendUserName,
            TimingIdentifier: timingIdentifier,
            ...(encryptKey ? { Encrypt_key: encryptKey } : {}),
            ...(encryptUserinfo ? { Encrypt_userinfo: encryptUserinfo } : {}),
        }),
        /** /TenPay/Qrydetailwxhb — 查看红包
         *  v1.6.0: swagger TenPay.QrydetailwxhbParamDoc {Xml*, Encrypt_key, Encrypt_userinfo} (旧码发 redPacketId). */
        qrydetailwxhb: (xml, encryptKey = "", encryptUserinfo = "") => dispatch("/TenPay/Qrydetailwxhb", {
            Xml: xml,
            ...(encryptKey ? { Encrypt_key: encryptKey } : {}),
            ...(encryptUserinfo ? { Encrypt_userinfo: encryptUserinfo } : {}),
        }),
        /** /TenPay/Receivewxhb — 打开红包 (不用 key)
         *  v1.6.0: swagger TenPay.ReceivewxhbParamDoc {Xml*, InWay, Encrypt_key, Encrypt_userinfo} (旧码发 redPacketId). */
        receivewxhb: (xml, inWay = "", encryptKey = "", encryptUserinfo = "") => dispatch("/TenPay/Receivewxhb", {
            Xml: xml,
            InWay: inWay,
            ...(encryptKey ? { Encrypt_key: encryptKey } : {}),
            ...(encryptUserinfo ? { Encrypt_userinfo: encryptUserinfo } : {}),
        }),
        /** /TenPay/SjSkdPayQCode — 商家收款单 (线上 TenPay.SjSkdPayQCodeParam {Money*, Name*, Remark}, 同 GeMaSkd: 全 string 无 Wxid) */
        sjSkdPayQCode: (amount, name, remark = "") => dispatch("/TenPay/SjSkdPayQCode", { Money: yuan(amount), Name: name, Remark: remark }),
        // ===== v1.3.20 P1-TENPAY-FIELDS: 新增 5 个字段名按 vendor 全小写对齐 =====
        /**
         * /TenPay/Collectmoney — 确认收款。
         * ⚠️ v1.16.1 (2026-10-16) 字段更正: 旧版发 `{wxid}` (注释称 vendor model 里有 wxid), 但容器 swagger 的
         *   `TenPay.CollectmoneyModelDoc` 只有 `{contextId, invalidTime, toUserName, transFerId, transactionId}` ——
         *   **没有 wxid**。也就是说 v1.3.19 那次"修复为小写 wxid"本身是照着一个不存在的字段改的: 唯一那个键被厂商
         *   静默忽略 ⇒ 确认收款是**空操作**。与 openHongBao 同一类病 (照过期 model 写字段名)。
         *   现在: 给 contextId 就只发它 (厂商标注"推荐使用"); 否则发兼容模式 toUserName (付款方微信标识)
         *   + 可选 transFerId/transactionId/invalidTime。
         */
        collectMoney: (opts) => dispatch("/TenPay/Collectmoney", opts.contextId
            ? { contextId: opts.contextId }
            : {
                ...(opts.toUserName ? { toUserName: opts.toUserName } : {}),
                ...(opts.transFerId ? { transFerId: opts.transFerId } : {}),
                ...(opts.transactionId ? { transactionId: opts.transactionId } : {}),
                ...(opts.invalidTime ? { invalidTime: opts.invalidTime } : {}),
            }),
        /**
         * /TenPay/ConfirmPreTransferApi — 确认支付 (完成 createPreTransfer 的预订单)
         * 线上 `TenPay.ConfirmPreTransferDoc {bankSerial*, bankType*, payPassword*, reqKey*}` — 四个**全必填**, 全是 string。
         * v1.16.1 (2026-10-16) 更正: 旧的 `(wxid, transferId, ...)` 形状有两个问题 —
         *   ① 厂商 model 里既没有 wxid 也没有 transactionId (Go 静默忽略未知字段 ⇒ 一直无害但无用);
         *   ② 更要紧的是**工具层**只暴露 wxid/transferId, 那四个必填只能拿默认空串 ⇒ "确认支付"实际发出
         *      `{bankSerial:"",bankType:"",payPassword:"",reqKey:""}`, 线上不可能成功。现在改成 opts 形状,
         *      四个必填由调用方显式给全, 工具层同步暴露这四个 (见 tenpay-meta.ts)。
         */
        confirmPreTransfer: (o) => dispatch("/TenPay/ConfirmPreTransferApi", {
            bankSerial: o.bankSerial,
            bankType: o.bankType,
            payPassword: o.payPassword,
            reqKey: o.reqKey,
        }),
        /**
         * /TenPay/CreatePreTransfer — 创建转账预订单 (v1.6.0 SWAGGER-323 新端点).
         * swagger: TenPay.CreatePreTransferDoc {toUserName*(转账接收人微信标识), fee*(金额, 单位**分**), description}.
         * **只创建预订单, 不扣款** — 成功后用响应里的 req_key 调 confirmPreTransfer 完成支付
         * (付款方式来自 /Tools/GetBandCardList)。
         * 单位是「分」而非元: 100 = 1.00 元 (与 generatePayQCode 的 money=元 不同, 勿混)。
         */
        createPreTransfer: (toUserName, feeFen, description = "") => dispatch("/TenPay/CreatePreTransfer", { toUserName, fee: feeFen, description }),
        /**
         * /TenPay/GeneratePayQCode — 生成自定义收款二维码
         * 线上 TenPay.GeneratePayQCodeModelDoc {money*, name*} — 都是 string, money 单位元两位小数 (示例 "10.00")。
         * v1.16.1: ① money 由 number 改为 yuan() 字符串 (类型不符 ⇒ 厂商拒收); ② 去掉 `wxid`
         *   (旧注释引的 model 里有, 线上没有; Go 静默忽略 ⇒ 一直是死负载)。
         * v1.3.19 错用 Money/Name/Remark → money/name 无 remark (这条仍成立)。
         */
        generatePayQCode: (amount, name) => dispatch("/TenPay/GeneratePayQCode", { money: yuan(amount), name }),
        /**
         * /TenPay/GetRedPacketListApi — 查看红包领取列表
         * 线上 TenPay.HongBaoDetailDoc {xml*, offset, size} (required: xml) — **无 wxid**。
         * v1.16.1: 去掉 wxid (Go 静默忽略的未知键); 旧注释引的 `TenPay.HongBaoDetail {offset,size,wxid,xml}` 已不存在。
         * 通常由 inbound 红包事件触发 (xml 来自 webhook payload)
         */
        getRedPacketList: (xml, offset = 0, size = 100) => dispatch("/TenPay/GetRedPacketListApi", { xml, offset, size }),
        /**
         * /TenPay/WXCreateRedPacketApi — 创建红包
         * 线上 TenPay.RedPacketDoc {amount*(integer, 分), content*, count*, from, redType, username*}
         *   required = [username, count, amount, content]; **无 wxid** (旧注释引的 `TenPay.RedPacket {...wxid}` 已不存在)。
         * v1.16.1: 去掉死负载 wxid (Go 静默忽略的未知键, vendor 从 AccessToken 取调用方身份)。
         * v1.3.19 错用 Money/Name/Wxids/Remark → 完整重写 (这条仍成立)。
         * 注: amount 单位"分" (整数), content 红包祝福语, count 个数, from 红包来源场景, redType 红包类型, username 群 ID 或 wxid
         */
        createRedPacket: (amountFen, // 红包总金额 (单位分)
        content, // 红包祝福语
        count, // 红包个数
        username, // 接收人 wxid 或群 ID
        redType = 1, // 红包类型 (1=普通, 2=群)
        from = 0 // 红包来源场景 (0=普通)
        ) => dispatch("/TenPay/WXCreateRedPacketApi", {
            amount: amountFen,
            content,
            count,
            from,
            redType,
            username,
        }),
        /**
         * /TenPay/PayQCodeStatus — 查收款二维码的**是否真到账** (线上 TenPay.PayQCodeStatusModelDoc {order_id, pay_url}).
         * 配对使用: generatePayQCode 的响应里拿 order_id, 拿它轮询本端点。厂商原话的判据很硬 ——
         *   只有 `Data.status==="paid"` **且** `Data.paid===true` 才算确认到账; 扫码、收到通知、数字状态、金额相同都**不算**;
         *   查询暂不可用会返回 HTTP 503 + PAYMENT_STATUS_UNAVAILABLE 且 Data.paid=false ⇒ 此时应保持原订单状态稍后重试,
         *   **不得**据此判为支付失败。
         * v1.16.1 新增 (线上 324 路径比快照多出的那条, 见 tests/fixtures/vendor-swagger-endpoints.json)。
         */
        payQCodeStatus: (orderId, payUrl = "") => dispatch("/TenPay/PayQCodeStatus", {
            ...(orderId ? { order_id: orderId } : {}),
            ...(payUrl ? { pay_url: payUrl } : {}),
        }),
        /** /TenPay/OpenHongBaoWithParams — 抢红包完整参数 (v1.3.67 新 API; SendId/SendUserName/TimingIdentifier/Xml) */
        openHongBaoWithParams: (sendId, sendUserName, timingIdentifier, xml) => dispatch("/TenPay/OpenHongBaoWithParams", { SendId: sendId, SendUserName: sendUserName, TimingIdentifier: timingIdentifier, Xml: xml }),
        /** /TenPay/ReceivewxhbWithoutEncryption — 打开红包无加密兼容 (v1.3.67 新 API; Xml=红包消息内容) */
        receiveWxhbWithoutEncryption: (xml) => dispatch("/TenPay/ReceivewxhbWithoutEncryption", { Xml: xml }),
    };
}
//# sourceMappingURL=tenpay.js.map