import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppTranslate(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        send: (toWxid, text, targetLang, sourceLang = "zh", at = "") => dispatch("/Translate/Send", { text, source_lang: sourceLang, target_lang: targetLang, to_wxid: toWxid, at }),
        text: (text, targetLang, sourceLang = "zh") => dispatch("/Translate/Text", { text, source_lang: sourceLang, target_lang: targetLang }),
    };
}
