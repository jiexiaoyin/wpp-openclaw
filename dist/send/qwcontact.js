import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppQWContact(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        qwApplyAddContact: (v1, v2) => dispatch("/QWContact/QWApplyAddContact", { v1, v2 }),
        qwAddContact: (v1, v2) => dispatch("/QWContact/QWContact/QWAddContact", { v1, v2 }),
        searchQWContact: (keyword) => dispatch("/QWContact/SearchQWContact", { keyword }),
    };
}
