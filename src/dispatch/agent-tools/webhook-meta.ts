// src/dispatch/agent-tools/webhook-meta.ts - Webhook tag (6)
// v1.3.18 P1-核心1 fix (2026-08-10): 改成 lazy-evaluate ctx 模式

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppWebhook } from "../../send/webhook.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";

function getWebhookApi() {
  const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
  if (!state) throw new Error("account not found: default");
  return makeWppWebhook({
    baseUrl: state.config.apiBaseUrl,
    tokenKey: state.config.tokenKey,
    authcode: state.authcode,
    accountId: getCurrentAccountId() ?? "default",
  });
}

export const WEBHOOK_META: ToolMeta = {
  /** /Webhook/Set */
  setWebhook: [
    "设置 webhook 推送 URL. vendor 会 push 实时事件到该 URL.",
    Type.Object({ url: Type.String() }),
    (url: string) => getWebhookApi().set(url),
  ],
  /** /Webhook/Get */
  getWebhook: [
    "读取当前 webhook 配置.",
    Type.Object({}),
    () => getWebhookApi().get(),
  ],
  /** /Webhook/Remove */
  removeWebhook: [
    "删除 webhook 配置.",
    Type.Object({}),
    () => getWebhookApi().remove(),
  ],
  /** /Webhook/Test */
  testWebhook: [
    "测试发送 webhook 消息 (用于诊断 vendor push).",
    Type.Object({}),
    () => getWebhookApi().test(),
  ],
  /** /Webhook/Business/Set */
  setBusinessWebhook: [
    "设置业务回调 URL (按授权码).",
    Type.Object({ url: Type.String() }),
    (url: string) => getWebhookApi().businessSet(url),
  ],
  /** /Webhook/Business/Get */
  getBusinessWebhook: [
    "获取业务回调 URL.",
    Type.Object({}),
    () => getWebhookApi().businessGet(),
  ],
};