import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppSayHello(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        modelv1: (scene, v1) => dispatch("/SayHello/Modelv1", { scene, v1 }),
        modelv2: (v1, v2) => dispatch("/SayHello/Modelv2", { v1, v2 }),
    };
}
