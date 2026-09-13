// src/send/officialaccounts.ts - OfficialAccounts tag (12 endpoints: 公众号)
import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppOfficialAccounts(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        /** /OfficialAccounts/AuthMpLogin */
        authMpLogin: (url) => dispatch("/OfficialAccounts/AuthMpLogin", { url }),
        /**
         * /OfficialAccounts/Follow — 关注/取关公众号.
         * ⚠️ v1.6.0 SWAGGER-323 存疑未改: swagger 此端点引用的是**通用占位** definition
         * `OfficialAccounts.DefaultParamDoc` (只有 `appid` 一个字段, 且被 ../Quit 共用, 明显是自动生成的
         * 占位文档). 项目发的 `{biz, operation}` 语义上更像(公众号标识 + 关注/取关).
         * 两者冲突且**无活体证据**, 故保持原样 — 需要时用管理台/curl 在测试账号上 A/B 一次再定.
         */
        follow: (biz, operation) => dispatch("/OfficialAccounts/Follow", { biz, operation }),
        /** /OfficialAccounts/GetAppMsgExt */
        getAppMsgExt: (url) => dispatch("/OfficialAccounts/GetAppMsgExt", { url }),
        /** /OfficialAccounts/GetAppMsgExtLike */
        getAppMsgExtLike: (url) => dispatch("/OfficialAccounts/GetAppMsgExtLike", { url }),
        /** /OfficialAccounts/GetMpHistory (v1.2.1 swagger-alignment: GetMpHistoryMsgParam {url, wxid}) */
        getMpHistory: (url, wxid = "") => dispatch("/OfficialAccounts/GetMpHistory", { url, wxid }),
        /** /OfficialAccounts/GetMpHistoryMessage */
        getMpHistoryMessage: (url) => dispatch("/OfficialAccounts/GetMpHistoryMessage", { url }),
        /** /OfficialAccounts/JSAPIPreVerify */
        jsapiPreVerify: (appId) => dispatch("/OfficialAccounts/JSAPIPreVerify", { appId }),
        /** /OfficialAccounts/MpGetA8Key */
        mpGetA8Key: (url) => dispatch("/OfficialAccounts/MpGetA8Key", { url }),
        /** /OfficialAccounts/OauthAuthorize — 授权公众号页面
         *  v1.6.0 SWAGGER-323: swagger OfficialAccounts.GetkeyParamDoc {url*, appid*(公众号 AppID)}.
         *  旧码只发 url, 必填的 appid 没发. */
        oauthAuthorize: (url, appid) => dispatch("/OfficialAccounts/OauthAuthorize", { url, appid }),
        /** /OfficialAccounts/QRConnectAuthorize */
        qrConnectAuthorize: (url) => dispatch("/OfficialAccounts/QRConnectAuthorize", { url }),
        /** /OfficialAccounts/QRConnectAuthorizeConfirm */
        qrConnectAuthorizeConfirm: (url) => dispatch("/OfficialAccounts/QRConnectAuthorizeConfirm", { url }),
        /** /OfficialAccounts/Quit — 取关公众号 (⚠️ 同 ../Follow: swagger 用的通用占位 DefaultParamDoc, 存疑未改) */
        quit: (biz) => dispatch("/OfficialAccounts/Quit", { biz }),
        /** /OfficialAccounts/ArticleList — 公众号文章列表 (v1.3.67 新 API; account_id 或 history_url 选填) */
        articleList: (accountId = "", historyUrl = "", limit = 20, offset = 0) => dispatch("/OfficialAccounts/ArticleList", {
            ...(accountId ? { account_id: accountId } : {}),
            ...(historyUrl ? { history_url: historyUrl } : {}),
            limit, offset,
        }),
        /** /OfficialAccounts/ArticleMarkdown — 公众号文章转 Markdown (v1.3.67 新 API; url=文章链接) */
        articleMarkdown: (url) => dispatch("/OfficialAccounts/ArticleMarkdown", { url }),
        /** /OfficialAccounts/ArticleRead — 公众号文章阅读解析 (v1.3.67 新 API; url=文章链接) */
        articleRead: (url) => dispatch("/OfficialAccounts/ArticleRead", { url }),
    };
}
//# sourceMappingURL=officialaccounts.js.map