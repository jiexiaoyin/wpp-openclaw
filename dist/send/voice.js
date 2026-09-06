// src/send/voice.ts - Voice tag (3 endpoints: 语音转写)
// v1.1.27 VOICE-FIELD-FIX (2026-08-08 P1-2): 字段名对齐 swagger
//   Voice.Request: audio_base64 + from_user_name + to_user_name + scene + encode_type + sample_rate + bits_per_sample + file_type + wait_seconds + poll_interval_ms + chunk_size + voice_id
//   Voice.ResultRequest: voice_id
//   Voice.MessageRequest: msg_id + new_msg_id + from_user_name + chat_room_name + client_msg_id + voice_id + length + encode_type + sample_rate + bits_per_sample + file_type + scene + wait_seconds + poll_interval_ms + master_buf_id
import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppVoice(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        /** /Voice/MessageTranscribe — 接收的语音消息转文字 (msg_id + new_msg_id + voice_id + ...) */
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
            file_type: 2, // silk
            scene: 0,
            wait_seconds: 5,
            poll_interval_ms: 1000,
            master_buf_id: "",
        }),
        /** /Voice/Result — 查询异步转写结果 (voice_id) */
        result: (voiceId) => dispatch("/Voice/Result", { voice_id: voiceId }),
        /** /Voice/Transcribe — 上传语音并转文字 (audio_base64 + from/to/scene/encode/sample) */
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
//# sourceMappingURL=voice.js.map