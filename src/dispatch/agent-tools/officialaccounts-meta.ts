// src/dispatch/agent-tools/officialaccounts-meta.ts - OfficialAccounts tag (12)

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppOfficialAccounts } from "../../send/officialaccounts.js";
import type { WppAccountCtx } from "../../send/factory.js";

const ctx: WppAccountCtx = { baseUrl: "", tokenKey: "", accountId: "" };
const api = makeWppOfficialAccounts(ctx);

export const OFFICIAL_ACCOUNTS_META: ToolMeta = {
  /** /OfficialAccounts/Follow */
  followOfficialAccount: [
    "关注公众号. operation: follow|unfollow.",
    Type.Object({
      biz: Type.String(),
      operation: Type.Union([Type.Literal("follow"), Type.Literal("unfollow")]),
    }),
    api.follow,
  ],
  /** /OfficialAccounts/Quit */
  quitOfficialAccount: [
    "取消关注公众号.",
    Type.Object({ biz: Type.String() }),
    api.quit,
  ],
  /** /OfficialAccounts/GetMpHistory */
  getOfficialAccountHistory: [
    "获取公众号历史消息.",
    Type.Object({
      biz: Type.String(),
      offset: Type.Optional(Type.Number()),
    }),
    api.getMpHistory,
  ],
  /** /OfficialAccounts/GetMpHistoryMessage */
  getOfficialAccountHistoryMessage: [
    "获取公众号历史消息 HTML (for 文章抓取).",
    Type.Object({ url: Type.String() }),
    api.getMpHistoryMessage,
  ],
  /** /OfficialAccounts/GetAppMsgExt */
  getOfficialAccountArticleExt: [
    "阅读公众号文章, 返回在看 / 点赞 / 阅读数据.",
    Type.Object({ url: Type.String() }),
    api.getAppMsgExt,
  ],
  /** /OfficialAccounts/AuthMpLogin */
  authOfficialAccountLogin: [
    "授权公众号登录 (web 扫码).",
    Type.Object({ url: Type.String() }),
    api.authMpLogin,
  ],
};
