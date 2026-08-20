import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppSayHello(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        modelv1: (url, verifyContent = "") => dispatch("/SayHello/Modelv1", verifyContent ? { url, verifyContent } : { url }),
        modelv2: (toUserName, content = "", scene = 15) => dispatch("/SayHello/Modelv2", {
            toUserName,
            content,
            scene,
            fromScene: 0,
            searchScene: 1,
        }),
        modelv3: (scene, v3, v4 = "", verifyContent = "") => dispatch("/SayHello/Modelv3", {
            scene,
            v3,
            ...(v4 ? { v4 } : {}),
            ...(verifyContent ? { verifyContent } : {}),
        }),
    };
}
