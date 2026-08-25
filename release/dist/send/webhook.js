import { postWppJson, getWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppWebhook(ctx) {
    const opts = ctxToCallOpts(ctx);
    return {
        businessGet: () => getWppJson(ctx.baseUrl, "/Webhook/Business/Get", opts),
        businessSet: (url) => {
            const body = { url, authcode: ctx.authcode ?? "" };
            return postWppJson(ctx.baseUrl, "/Webhook/Business/Set", body, opts);
        },
        get: () => getWppJson(ctx.baseUrl, "/Webhook/Get", opts),
        remove: () => postWppJson(ctx.baseUrl, "/Webhook/Remove", {}, opts),
        set: (url) => {
            const body = { url, authcode: ctx.authcode ?? "", enabled: true, retryCount: 3, timeout: 10, messageTypes: ["all"] };
            return postWppJson(ctx.baseUrl, "/Webhook/Set", body, opts);
        },
        test: (msg) => {
            const body = { msg: msg ?? { hello: "world" }, authcode: ctx.authcode ?? "" };
            return postWppJson(ctx.baseUrl, "/Webhook/Test", body, opts);
        },
    };
}
