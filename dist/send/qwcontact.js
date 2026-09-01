// src/send/qwcontact.ts - QWContact tag (3 endpoints: 企业微信联系人)
import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppQWContact(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        /** /QWContact/QWApplyAddContact — 企业联系人添加 (v1.3.67 对齐新 swagger: context/username/v1) */
        qwApplyAddContact: (username, v1, context = "") => dispatch("/QWContact/QWApplyAddContact", context ? { context, username, v1 } : { username, v1 }),
        /** /QWContact/QWAddContact — 搜索结果添加 (v1.3.67 路径去重 + 对齐 username/v1; 旧 /QWContact/QWContact/QWAddContact 已废弃) */
        qwAddContact: (username, v1) => dispatch("/QWContact/QWAddContact", { username, v1 }),
        /** /QWContact/SearchQWContact — 企业联系人搜索 (v1.3.67 对齐 username; 旧 keyword 已废弃) */
        searchQWContact: (username) => dispatch("/QWContact/SearchQWContact", { username }),
    };
}
//# sourceMappingURL=qwcontact.js.map