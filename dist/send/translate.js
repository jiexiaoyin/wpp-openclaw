// src/send/translate.ts - Translate tag (2 endpoints: 翻译)
// v1.1.27 TRANSLATE-FIELD-FIX (2026-08-08 P1-2): 字段名对齐 swagger
//   Translate.SendRequest: text + source_lang + target_lang + to_wxid + at
//   Translate.TextRequest: text + source_lang + target_lang
import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppTranslate(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        /** /Translate/Send — 翻译并发送 (text + source_lang + target_lang + to_wxid + at) */
        send: (toWxid, text, targetLang, sourceLang = "zh", at = "") => dispatch("/Translate/Send", { text, source_lang: sourceLang, target_lang: targetLang, to_wxid: toWxid, at }),
        /** /Translate/Text — 翻译文字 (text + source_lang + target_lang) */
        text: (text, targetLang, sourceLang = "zh") => dispatch("/Translate/Text", { text, source_lang: sourceLang, target_lang: targetLang }),
    };
}
//# sourceMappingURL=translate.js.map