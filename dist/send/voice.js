import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppVoice(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        messageTranscribe: (msgId, newMsgId, fromUserName, chatRoomName = "", clientMsgId = "", voiceId = "", length = 0) => dispatch("/Voice/MessageTranscribe", {
            msg_id: msgId,
            new_msg_id: newMsgId,
            from_user_name: fromUserName,
            chat_room_name: chatRoomName,
            client_msg_id: clientMsgId,
            voice_id: voiceId,
            length,
            encode_type: 0,
            sample_rate: 16000,
            bits_per_sample: 16,
            file_type: 2,
            scene: 0,
            wait_seconds: 5,
            poll_interval_ms: 1000,
            master_buf_id: "",
        }),
        result: (voiceId) => dispatch("/Voice/Result", { voice_id: voiceId }),
        transcribe: (audioBase64, fromUserName, toUserName, scene = 0, encodeType = 2, sampleRate = 16000) => dispatch("/Voice/Transcribe", {
            audio_base64: audioBase64,
            from_user_name: fromUserName,
            to_user_name: toUserName,
            scene,
            encode_type: encodeType,
            sample_rate: sampleRate,
            bits_per_sample: 16,
            file_type: 2,
            wait_seconds: 5,
            poll_interval_ms: 1000,
            voice_id: "",
            chunk_size: 4096,
        }),
    };
}
