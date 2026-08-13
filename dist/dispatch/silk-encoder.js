import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execAsync } from "../util/exec.js";
import { uniqueId } from "../util/id.js";
import { safeFetchWithCap } from "../util/safe-fetch.js";
import { logObj as log } from "../core/logger.js";
import { readLocalMedia } from "../api/resolve-media.js";
async function readLocalMediaSafe(input) {
    return readLocalMedia(input);
}
const SILK_ENCODER_PATH = process.env.WPP_SILK_ENCODER_PATH ?? "silk/encoder";
export async function encodeMp3ToSilk(input) {
    if (typeof input === "string") {
        const noQuery = (input.split("?")[0] ?? "").toLowerCase();
        const isSilkInput = input.startsWith("data:audio/silk") || noQuery.endsWith(".silk");
        if (isSilkInput) {
            if (input.startsWith("data:") || /^https?:\/\//i.test(input)) {
                const buf = await fetchToBuffer(input);
                return { silkBuffer: buf, voiceDurationMs: 0 };
            }
            if (existsSync(input)) {
                const buf = await readLocalMediaSafe(input);
                return { silkBuffer: buf, voiceDurationMs: 0 };
            }
            throw new Error(`silk input not resolvable: ${input.slice(0, 80)}`);
        }
    }
    const tmpDir = mkdtempSync(join(tmpdir(), "wpp-voice-"));
    let mp3Path = null;
    try {
        if (Buffer.isBuffer(input)) {
            mp3Path = join(tmpDir, `input_${uniqueId()}.mp3`);
            writeFileSync(mp3Path, input);
        }
        else if (input.startsWith("data:") || input.startsWith("http://") || input.startsWith("https://")) {
            const buf = await fetchToBuffer(input);
            mp3Path = join(tmpDir, `input_${uniqueId()}.mp3`);
            writeFileSync(mp3Path, buf);
        }
        else if (existsSync(input)) {
            await readLocalMediaSafe(input);
            mp3Path = input;
        }
        else {
            throw new Error(`Unsupported input: ${typeof input} (not URL/data/path/Buffer)`);
        }
        const ffprobeResult = await execAsync("ffprobe", [
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            mp3Path,
        ], { timeoutMs: 5_000 });
        if (ffprobeResult.code !== 0) {
            throw new Error(`ffprobe failed: ${ffprobeResult.stderr || ffprobeResult.stdout}`);
        }
        const voiceDurationMs = Math.round(parseFloat(ffprobeResult.stdout.trim()) * 1000);
        const pcmPath = join(tmpDir, `voice_${uniqueId()}.pcm`);
        const ffmpegResult = await execAsync("ffmpeg", [
            "-i", mp3Path,
            "-vn", "-acodec", "pcm_s16le",
            "-ar", "24000", "-ac", "1",
            "-f", "s16le", pcmPath, "-y",
        ], { timeoutMs: 10_000 });
        if (ffmpegResult.code !== 0) {
            throw new Error(`ffmpeg failed: ${ffmpegResult.stderr || ffmpegResult.stdout}`);
        }
        if (!existsSync(SILK_ENCODER_PATH)) {
            throw new Error(`silk encoder not found: ${SILK_ENCODER_PATH}`);
        }
        const MAX_SILK_BYTES = 60_000;
        const silkPath = join(tmpDir, `voice_${uniqueId()}.silk`);
        const encodeRates = [
            { rate: undefined, fsApi: undefined },
            { rate: 20000, fsApi: undefined },
            { rate: 16000, fsApi: 16000 },
        ];
        let silkBuffer = null;
        let usedRate = "default";
        for (const { rate, fsApi } of encodeRates) {
            const args = [pcmPath, silkPath, "-tencent", "-quiet"];
            if (rate !== undefined)
                args.push("-rate", String(rate));
            if (fsApi !== undefined)
                args.push("-Fs_API", String(fsApi));
            const silkResult = await execAsync(SILK_ENCODER_PATH, args, { timeoutMs: 10_000 });
            if (silkResult.code !== 0) {
                log.warn(`[WPP v1.3.51 SILK-SIZE-FIX] silk encoder attempt (rate=${rate ?? "default"}) failed: ${silkResult.stderr || silkResult.stdout}`);
                continue;
            }
            const buf = readFileSync(silkPath);
            log.info(`[WPP v1.3.51 SILK-SIZE-FIX] silk encoder attempt rate=${rate ?? "default"} fsApi=${fsApi ?? "default"} → ${buf.length} bytes`);
            if (buf.length <= MAX_SILK_BYTES) {
                silkBuffer = buf;
                usedRate = rate ? `-rate ${rate}` : "default";
                break;
            }
            log.warn(`[WPP v1.3.51 SILK-SIZE-FIX] silk ${buf.length} bytes > MAX ${MAX_SILK_BYTES}, retry lower rate`);
            silkBuffer = buf;
        }
        if (!silkBuffer) {
            throw new Error("silk encoder all rate attempts failed");
        }
        log.info(`[WPP v1.3.48 SILK-ENCODER] mp3 → silk (${silkBuffer.length} bytes, ${voiceDurationMs}ms, ${usedRate})`);
        return { silkBuffer, voiceDurationMs };
    }
    finally {
        try {
            rmSync(tmpDir, { recursive: true, force: true });
        }
        catch { }
    }
}
async function fetchToBuffer(input) {
    if (input.startsWith("data:")) {
        const idx = input.indexOf(",");
        if (idx < 0)
            throw new Error("invalid data URI");
        return Buffer.from(input.slice(idx + 1), "base64");
    }
    const buf = await safeFetchWithCap(input, { signal: AbortSignal.timeout(30_000) }, 20 * 1024 * 1024);
    return buf;
}
export function ossSubdirFor(type) {
    if (type === "audio/silk" || type === "silk" || type === "voice")
        return "gewe/audio";
    if (type === "audio/mpeg")
        return "gewe/audio";
    return "gewe/files";
}
