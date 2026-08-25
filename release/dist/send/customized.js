import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppCustomized(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        wxctdUniftyAuthBatch: (username) => dispatch("/Customized/WXCTDUniftyAuthBatch", { Username: username }),
    };
}
