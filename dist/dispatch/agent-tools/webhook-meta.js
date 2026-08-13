import { Type } from "typebox";
import { makeWppWebhook } from "../../send/webhook.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";
function getWebhookApi() {
    const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
    if (!state)
        throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
    return makeWppWebhook({
        baseUrl: state.config.apiBaseUrl,
        tokenKey: state.config.tokenKey,
        authcode: state.authcode,
        accountId: getCurrentAccountId() ?? "default",
    });
}
export const WEBHOOK_META = {
    setWebhook: [
        "设置 webhook 推送 URL. vendor 会 push 实时事件到该 URL.",
        Type.Object({ url: Type.String() }),
        (url) => getWebhookApi().set(url),
    ],
    getWebhook: [
        "读取当前 webhook 配置.",
        Type.Object({}),
        () => getWebhookApi().get(),
    ],
    removeWebhook: [
        "删除 webhook 配置.",
        Type.Object({}),
        () => getWebhookApi().remove(),
    ],
    testWebhook: [
        "测试发送 webhook 消息 (用于诊断 vendor push).",
        Type.Object({}),
        () => getWebhookApi().test(),
    ],
    setBusinessWebhook: [
        "设置业务回调 URL (按授权码).",
        Type.Object({ url: Type.String() }),
        (url) => getWebhookApi().businessSet(url),
    ],
    getBusinessWebhook: [
        "获取业务回调 URL.",
        Type.Object({}),
        () => getWebhookApi().businessGet(),
    ],
};
