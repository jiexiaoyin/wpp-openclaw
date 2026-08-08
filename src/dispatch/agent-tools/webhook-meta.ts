// src/dispatch/agent-tools/webhook-meta.ts - Webhook tag (6)

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppWebhook } from "../../send/webhook.js";
import type { WppAccountCtx } from "../../send/factory.js";

const ctx: WppAccountCtx = { baseUrl: "", tokenKey: "", accountId: "" };
const api = makeWppWebhook(ctx);

export const WEBHOOK_META: ToolMeta = {
  /** /Webhook/Set */
  setWebhook: [
    "设置 webhook 推送 URL. vendor 会 push 实时事件到该 URL.",
    Type.Object({ url: Type.String() }),
    api.set,
  ],
  /** /Webhook/Get */
  getWebhook: [
    "读取当前 webhook 配置.",
    Type.Object({}),
    api.get,
  ],
  /** /Webhook/Remove */
  removeWebhook: [
    "删除 webhook 配置.",
    Type.Object({}),
    api.remove,
  ],
  /** /Webhook/Test */
  testWebhook: [
    "测试发送 webhook 消息 (用于诊断 vendor push).",
    Type.Object({}),
    api.test,
  ],
  /** /Webhook/Business/Set */
  setBusinessWebhook: [
    "设置业务回调 URL (按授权码).",
    Type.Object({ url: Type.String() }),
    api.businessSet,
  ],
  /** /Webhook/Business/Get */
  getBusinessWebhook: [
    "获取业务回调 URL.",
    Type.Object({}),
    api.businessGet,
  ],
};
