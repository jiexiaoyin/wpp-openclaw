import { Type } from "typebox";
import { makeWppVoice } from "../../send/index.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";
function getVoi() {
    const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
    if (!state)
        throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
    return makeWppVoice({
        baseUrl: state.config.apiBaseUrl,
        tokenKey: state.config.tokenKey,
        authcode: state.authcode,
        accountId: getCurrentAccountId() ?? "default",
    });
}
export const VOICE_META = {
    voiceTranscribe: [
        "上传语音 base64 并转文字.",
        Type.Object({
            voiceBase64: Type.String(),
            durationMs: Type.Optional(Type.Number()),
        }),
        (voiceBase64, _durationMs) => getVoi().transcribe(voiceBase64, "", ""),
    ],
    voiceMessageTranscribe: [
        "把已收到语音消息转写 (异步).",
        Type.Object({ msgId: Type.String() }),
        (msgId) => getVoi().messageTranscribe(msgId, "", ""),
    ],
    voiceResult: [
        "查询异步语音转写结果.",
        Type.Object({ taskId: Type.String() }),
        (taskId) => getVoi().result(taskId),
    ],
};
