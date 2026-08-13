import { warn, error } from "../core/logger.js";
import { decodeSilkToPcm } from "./silk.js";
import { safeFetch } from "../util/safe-fetch.js";
const SILICONFLOW_STT_URL = process.env.SILICONFLOW_STT_URL || "https://api.siliconflow.cn/v1/audio/transcriptions";
const STT_MODEL = process.env.SILICONFLOW_STT_MODEL || "FunAudioLLM/SenseVoiceSmall";
const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY || "";
const WAV_SAMPLE_RATE = 24_000;
const WAV_CHANNELS = 1;
const WAV_BITS_PER_SAMPLE = 16;
function buildWavBuffer(pcmBuffer) {
    const pcmLen = pcmBuffer.length;
    const totalSize = 44 + pcmLen;
    const wav = Buffer.allocUnsafe(totalSize);
    wav.write("RIFF", 0);
    wav.writeUInt32LE(totalSize - 8, 4);
    wav.write("WAVE", 8);
    wav.write("fmt ", 12);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(WAV_CHANNELS, 22);
    wav.writeUInt32LE(WAV_SAMPLE_RATE, 24);
    wav.writeUInt32LE(WAV_SAMPLE_RATE * WAV_CHANNELS * (WAV_BITS_PER_SAMPLE / 8), 28);
    wav.writeUInt16LE(WAV_CHANNELS * (WAV_BITS_PER_SAMPLE / 8), 32);
    wav.writeUInt16LE(WAV_BITS_PER_SAMPLE, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(pcmLen, 40);
    pcmBuffer.copy(wav, 44);
    return wav;
}
export async function transcribeSilkBuffer(silkBuffer, apiKey = SILICONFLOW_API_KEY) {
    if (!apiKey) {
        warn("[STT] missing SILICONFLOW_API_KEY env var");
        return null;
    }
    let pcmBuffer;
    try {
        pcmBuffer = await decodeSilkToPcm(silkBuffer);
    }
    catch (e) {
        warn(`[STT] silk decode failed: ${e instanceof Error ? e.message : String(e)}`);
        return null;
    }
    const wav = buildWavBuffer(pcmBuffer);
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "voice.wav");
    form.append("model", STT_MODEL);
    form.append("response_format", "json");
    let response = null;
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            response = await safeFetch(SILICONFLOW_STT_URL, {
                method: "POST",
                headers: { Authorization: `Bearer ${apiKey}` },
                body: form,
                signal: AbortSignal.timeout(60_000),
            });
            if (response.ok)
                break;
            const errText = await response.text().catch(() => "");
            const status = response.status;
            const isRetryable = status === 401 || status === 429 || status >= 500;
            if (isRetryable && attempt < 3) {
                warn(`[STT] SiliconFlow ${status} (attempt ${attempt}/3), retrying...`);
                await new Promise((r) => setTimeout(r, attempt * 1000));
                lastError = `HTTP ${status}: ${errText}`;
                continue;
            }
            error(`[STT] SiliconFlow API error ${status}: ${errText.slice(0, 200)}`);
            return null;
        }
        catch (e) {
            lastError = e instanceof Error ? e.message : String(e);
            if (attempt < 3) {
                warn(`[STT] fetch error (attempt ${attempt}/3): ${lastError}`);
                await new Promise((r) => setTimeout(r, attempt * 1000));
                continue;
            }
            error(`[STT] SiliconFlow fetch error after 3 retries: ${lastError}`);
            return null;
        }
    }
    if (!response || !response.ok) {
        error(`[STT] SiliconFlow failed: ${lastError}`);
        return null;
    }
    const data = await response.json();
    const text = data.text || data.transcript || "";
    if (!text) {
        warn("[STT] SiliconFlow returned empty text");
        return null;
    }
    return {
        text: String(text),
        durationMs: Math.round((pcmBuffer.length / (WAV_SAMPLE_RATE * 2)) * 1000),
    };
}
