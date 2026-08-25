import { Type } from "typebox";
import { makeWppOfficialAccounts } from "../../send/officialaccounts.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";
function getOfficialAccountsApi() {
    const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
    if (!state)
        throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
    return makeWppOfficialAccounts({
        baseUrl: state.config.apiBaseUrl,
        tokenKey: state.config.tokenKey,
        authcode: state.authcode,
        accountId: getCurrentAccountId() ?? "default",
    });
}
export const OFFICIAL_ACCOUNTS_META = {
    followOfficialAccount: [
        "关注公众号. operation: follow|unfollow.",
        Type.Object({
            biz: Type.String(),
            operation: Type.Union([Type.Literal("follow"), Type.Literal("unfollow")]),
        }),
        (biz, operation) => getOfficialAccountsApi().follow(biz, operation),
    ],
    quitOfficialAccount: [
        "取消关注公众号.",
        Type.Object({ biz: Type.String() }),
        (biz) => getOfficialAccountsApi().quit(biz),
    ],
    getOfficialAccountHistory: [
        "获取公众号历史消息.",
        Type.Object({
            biz: Type.String(),
            offset: Type.Optional(Type.Number()),
        }),
        (biz, _offset) => getOfficialAccountsApi().getMpHistory(biz),
    ],
    getOfficialAccountHistoryMessage: [
        "获取公众号历史消息 HTML (for 文章抓取).",
        Type.Object({ url: Type.String() }),
        (url) => getOfficialAccountsApi().getMpHistoryMessage(url),
    ],
    getOfficialAccountArticleExt: [
        "阅读公众号文章, 返回在看 / 点赞 / 阅读数据.",
        Type.Object({ url: Type.String() }),
        (url) => getOfficialAccountsApi().getAppMsgExt(url),
    ],
    authOfficialAccountLogin: [
        "授权公众号登录 (web 扫码).",
        Type.Object({ url: Type.String() }),
        (url) => getOfficialAccountsApi().authMpLogin(url),
    ],
    likeOfficialAccountArticle: [
        "点赞公众号文章, 返回分享 / 在看 / 阅读数据.",
        Type.Object({ url: Type.String() }),
        (url) => getOfficialAccountsApi().getAppMsgExtLike(url),
    ],
    preVerifyOfficialAccountJsapi: [
        "公众号 JSAPI 预验证 (用于网页/小程序授权前置).",
        Type.Object({ appId: Type.String() }),
        (appId) => getOfficialAccountsApi().jsapiPreVerify(appId),
    ],
    getOfficialAccountA8Key: [
        "获取公众号文章 key 和 uin.",
        Type.Object({ url: Type.String() }),
        (url) => getOfficialAccountsApi().mpGetA8Key(url),
    ],
    authorizeOfficialAccount: [
        "公众号 OAuth 授权 (url 是授权链接).",
        Type.Object({ url: Type.String() }),
        (url) => getOfficialAccountsApi().oauthAuthorize(url),
    ],
    requestOfficialAccountQrAuthorize: [
        "公众号二维码授权请求 (获取授权二维码).",
        Type.Object({ url: Type.String() }),
        (url) => getOfficialAccountsApi().qrConnectAuthorize(url),
    ],
    confirmOfficialAccountQrAuthorize: [
        "公众号二维码授权确认 (url 是确认链接).",
        Type.Object({ url: Type.String() }),
        (url) => getOfficialAccountsApi().qrConnectAuthorizeConfirm(url),
    ],
    articleList: [
        "获取公众号文章列表. accountId=公众号 __biz 标识 或 historyUrl=历史页链接 (二选一), limit=数量.",
        Type.Object({
            accountId: Type.Optional(Type.String()),
            historyUrl: Type.Optional(Type.String()),
            limit: Type.Optional(Type.Number()),
            offset: Type.Optional(Type.Number()),
        }),
        (opts) => getOfficialAccountsApi().articleList(opts.accountId ?? "", opts.historyUrl ?? "", opts.limit ?? 20, opts.offset ?? 0),
    ],
    articleMarkdown: [
        "把公众号文章 URL 转成 Markdown (返回标题/公众号/正文/图片).",
        Type.Object({ url: Type.String() }),
        (url) => getOfficialAccountsApi().articleMarkdown(url),
    ],
    articleRead: [
        "解析公众号文章链接 (短链转正文 Markdown + 图片).",
        Type.Object({ url: Type.String() }),
        (url) => getOfficialAccountsApi().articleRead(url),
    ],
};
