import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppQWContact(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        qwApplyAddContact: (username, v1, context = "") => dispatch("/QWContact/QWApplyAddContact", context ? { context, username, v1 } : { username, v1 }),
        qwAddContact: (username, v1) => dispatch("/QWContact/QWAddContact", { username, v1 }),
        searchQWContact: (username) => dispatch("/QWContact/SearchQWContact", { username }),
    };
}
