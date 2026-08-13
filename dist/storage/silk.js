import { execAsync } from "../util/exec.js";
import { unlinkSync, mkdtempSync, rmdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import os from "node:os";
const DEFAULT_SILK_ENCODER_PATH = process.env.WPP_SILK_ENCODER_PATH || "silk/encoder";
const DEFAULT_SILK_DECODER_PATH = process.env.WPP_SILK_DECODER_PATH || "silk/decoder";
export async function decodeSilkToPcm(silkBuffer, outputPath, decoderPath) {
    const tmpDir = mkdtempSync(join(os.tmpdir(), "wpp-silk-"));
    const silkPath = join(tmpDir, "voice.silk");
    const pcmPath = outputPath ?? join(tmpDir, "voice.pcm");
    try {
        await writeFile(silkPath, silkBuffer);
        const decoder = decoderPath ?? DEFAULT_SILK_DECODER_PATH;
        await execAsync(decoder, [silkPath, pcmPath], { timeoutMs: 10_000 });
        return await readFile(pcmPath);
    }
    finally {
        try {
            unlinkSync(silkPath);
        }
        catch { }
        if (!outputPath) {
            try {
                rmdirSync(tmpDir);
            }
            catch { }
        }
    }
}
export async function encodePcmToSilk(pcmBuffer, outputPath, encoderPath) {
    const tmpDir = mkdtempSync(join(os.tmpdir(), "wpp-silk-enc-"));
    const pcmPath = join(tmpDir, "voice.pcm");
    const silkPath = outputPath ?? join(tmpDir, "voice.silk");
    try {
        await writeFile(pcmPath, pcmBuffer);
        const encoder = encoderPath ?? DEFAULT_SILK_ENCODER_PATH;
        await execAsync(encoder, [pcmPath, silkPath], { timeoutMs: 10_000 });
        return await readFile(silkPath);
    }
    finally {
        try {
            unlinkSync(pcmPath);
        }
        catch { }
        if (!outputPath) {
            try {
                rmdirSync(tmpDir);
            }
            catch { }
        }
    }
}
