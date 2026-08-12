// src/send/officialaccounts.ts - OfficialAccounts tag (12 endpoints: 公众号)

import { postWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppOfficialAccounts(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /** /OfficialAccounts/AuthMpLogin */
    authMpLogin: (url: string) => dispatch("/OfficialAccounts/AuthMpLogin", { url }),

    /** /OfficialAccounts/Follow */
    follow: (biz: string, operation: "follow" | "unfollow") =>
      dispatch("/OfficialAccounts/Follow", { biz, operation }),

    /** /OfficialAccounts/GetAppMsgExt */
    getAppMsgExt: (url: string) => dispatch("/OfficialAccounts/GetAppMsgExt", { url }),

    /** /OfficialAccounts/GetAppMsgExtLike */
    getAppMsgExtLike: (url: string) => dispatch("/OfficialAccounts/GetAppMsgExtLike", { url }),

    /** /OfficialAccounts/GetMpHistory (v1.2.1 swagger-alignment: GetMpHistoryMsgParam {url, wxid}) */
    getMpHistory: (url: string, wxid: string = "") =>
      dispatch("/OfficialAccounts/GetMpHistory", { url, wxid }),

    /** /OfficialAccounts/GetMpHistoryMessage */
    getMpHistoryMessage: (url: string) =>
      dispatch("/OfficialAccounts/GetMpHistoryMessage", { url }),

    /** /OfficialAccounts/JSAPIPreVerify */
    jsapiPreVerify: (appId: string) =>
      dispatch("/OfficialAccounts/JSAPIPreVerify", { appId }),

    /** /OfficialAccounts/MpGetA8Key */
    mpGetA8Key: (url: string) => dispatch("/OfficialAccounts/MpGetA8Key", { url }),

    /** /OfficialAccounts/OauthAuthorize */
    oauthAuthorize: (url: string) => dispatch("/OfficialAccounts/OauthAuthorize", { url }),

    /** /OfficialAccounts/QRConnectAuthorize */
    qrConnectAuthorize: (url: string) =>
      dispatch("/OfficialAccounts/QRConnectAuthorize", { url }),

    /** /OfficialAccounts/QRConnectAuthorizeConfirm */
    qrConnectAuthorizeConfirm: (url: string) =>
      dispatch("/OfficialAccounts/QRConnectAuthorizeConfirm", { url }),

    /** /OfficialAccounts/Quit */
    quit: (biz: string) => dispatch("/OfficialAccounts/Quit", { biz }),
  };
}

export type WppOfficialAccountsApi = ReturnType<typeof makeWppOfficialAccounts>;
