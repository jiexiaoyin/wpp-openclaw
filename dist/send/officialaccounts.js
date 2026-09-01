// src/send/officialaccounts.ts - OfficialAccounts tag (12 endpoints: 公众号)
import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppOfficialAccounts(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        /** /OfficialAccounts/AuthMpLogin */
        authMpLogin: (url) => dispatch("/OfficialAccounts/AuthMpLogin", { url }),
        /** /OfficialAccounts/Follow */
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
        /** /OfficialAccounts/OauthAuthorize */
        oauthAuthorize: (url) => dispatch("/OfficialAccounts/OauthAuthorize", { url }),
        /** /OfficialAccounts/QRConnectAuthorize */
        qrConnectAuthorize: (url) => dispatch("/OfficialAccounts/QRConnectAuthorize", { url }),
        /** /OfficialAccounts/QRConnectAuthorizeConfirm */
        qrConnectAuthorizeConfirm: (url) => dispatch("/OfficialAccounts/QRConnectAuthorizeConfirm", { url }),
        /** /OfficialAccounts/Quit */
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