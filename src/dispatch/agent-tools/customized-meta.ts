// src/dispatch/agent-tools/customized-meta.ts - Customized tag (定制, 1)

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppCustomized } from "../../send/index.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";

function getCus() {
  const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
  if (!state) throw new Error("account not found: default");
  return makeWppCustomized({
    baseUrl: state.config.apiBaseUrl,
    tokenKey: state.config.tokenKey,
    authcode: state.authcode,
    accountId: getCurrentAccountId() ?? "default",
  });
}

export const CUSTOMIZED_META: ToolMeta = {
  customizedUniftyAuthBatch: [
    "批量开小程序 (定制接口, 仅 vendor 客户).",
    Type.Object({ appIds: Type.String({ description: "appId 数组 join(',')" }) }),
    // 原版 api.wxctdUniftyAuthBatch(appIds) — 但 api.wxctdUniftyAuthBatch 签名是 (username: string)
    // 历史不一致, 不优化
    (appIds: string) => getCus().wxctdUniftyAuthBatch(appIds),
  ],
};
