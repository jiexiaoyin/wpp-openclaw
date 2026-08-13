import { Type } from "typebox";
import { makeWppTranslate } from "../../send/index.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";
function getTrn() {
    const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
    if (!state)
        throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
    return makeWppTranslate({
        baseUrl: state.config.apiBaseUrl,
        tokenKey: state.config.tokenKey,
        authcode: state.authcode,
        accountId: getCurrentAccountId() ?? "default",
    });
}
export const TRANSLATE_META = {
    translateText: [
        "文字翻译 (不发送).",
        Type.Object({ content: Type.String(), targetLang: Type.String() }),
        (content, targetLang) => getTrn().text(content, targetLang),
    ],
    translateAndSend: [
        "翻译并发送给 toWxid.",
        Type.Object({
            toWxid: Type.String(),
            content: Type.String(),
            targetLang: Type.String(),
        }),
        (toWxid, content, targetLang) => getTrn().send(toWxid, content, targetLang),
    ],
};
