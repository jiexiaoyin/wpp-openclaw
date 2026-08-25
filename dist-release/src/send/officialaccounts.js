import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppOfficialAccounts(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        authMpLogin: (url) => dispatch("/OfficialAccounts/AuthMpLogin", { url }),
        follow: (biz, operation) => dispatch("/OfficialAccounts/Follow", { biz, operation }),
        getAppMsgExt: (url) => dispatch("/OfficialAccounts/GetAppMsgExt", { url }),
        getAppMsgExtLike: (url) => dispatch("/OfficialAccounts/GetAppMsgExtLike", { url }),
        getMpHistory: (url, wxid = "") => dispatch("/OfficialAccounts/GetMpHistory", { url, wxid }),
        getMpHistoryMessage: (url) => dispatch("/OfficialAccounts/GetMpHistoryMessage", { url }),
        jsapiPreVerify: (appId) => dispatch("/OfficialAccounts/JSAPIPreVerify", { appId }),
        mpGetA8Key: (url) => dispatch("/OfficialAccounts/MpGetA8Key", { url }),
        oauthAuthorize: (url) => dispatch("/OfficialAccounts/OauthAuthorize", { url }),
        qrConnectAuthorize: (url) => dispatch("/OfficialAccounts/QRConnectAuthorize", { url }),
        qrConnectAuthorizeConfirm: (url) => dispatch("/OfficialAccounts/QRConnectAuthorizeConfirm", { url }),
        quit: (biz) => dispatch("/OfficialAccounts/Quit", { biz }),
        articleList: (accountId = "", historyUrl = "", limit = 20, offset = 0) => dispatch("/OfficialAccounts/ArticleList", {
            ...(accountId ? { account_id: accountId } : {}),
            ...(historyUrl ? { history_url: historyUrl } : {}),
            limit, offset,
        }),
        articleMarkdown: (url) => dispatch("/OfficialAccounts/ArticleMarkdown", { url }),
        articleRead: (url) => dispatch("/OfficialAccounts/ArticleRead", { url }),
    };
}
