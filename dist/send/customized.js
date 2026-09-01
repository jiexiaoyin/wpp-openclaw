// src/send/customized.ts - Customized tag (1 endpoint)
import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppCustomized(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        /** /Customized/WXCTDUniftyAuthBatch — 批量开小程序 (v1.2.1 swagger-alignment: WXCTDUniftyAuthParmDoc {Username}) */
        wxctdUniftyAuthBatch: (username) => dispatch("/Customized/WXCTDUniftyAuthBatch", { Username: username }),
    };
}
//# sourceMappingURL=customized.js.map