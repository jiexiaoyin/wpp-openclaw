// src/storage/silk.ts - Silk 编解码 (从 gewe v3.1.6 fork, WPP 适配)
//
// 编码器/解码器路径:
//   - 编码: /root/silk_decoder/silk/encoder (MP3/PCM → silk for outbound 语音发送)
//   - 解码: /root/silk_decoder/silk/decoder (silk → PCM for STT)
//
// 仿 gewe src/storage/silk.ts 86 行, 但 WPP 简化:
//   - 不引 env config (WPP 用 accounts/<id>.json 配置, demo 阶段先用 default)
//   - 不接 OSS 音频后端 (WPP 暂无)
//   - mkdtemp + try/finally 范式 (gewe 11 处已确认安全)

import { execAsync } from "../util/exec.js";
import { unlinkSync, mkdtempSync, rmdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import os from "node:os";

// v1.3.19 RELEASE: silk 二进制路径可经 env 覆盖 (接收方可能装在不同位置)
//   生产不设 env → 默认 /root/silk_decoder/ (行为不变)
const DEFAULT_SILK_ENCODER_PATH = process.env.WPP_SILK_ENCODER_PATH || "/root/silk_decoder/silk/encoder";
const DEFAULT_SILK_DECODER_PATH = process.env.WPP_SILK_DECODER_PATH || "/root/silk_decoder/silk/decoder";

export interface SilkDecodeResult {
  buffer: Buffer;
  contentType: string;
  fileName: string;
}

/**
 * 解码 silk → PCM
 * @param silkBuffer 输入 silk 二进制
 * @param outputPath 输出路径 (可选, 默认临时文件)
 * @param decoderPath 自定义 decoder 路径 (可选)
 */
export async function decodeSilkToPcm(
  silkBuffer: Buffer,
  outputPath?: string,
  decoderPath?: string,
): Promise<Buffer> {
  const tmpDir = mkdtempSync(join(os.tmpdir(), "wpp-silk-"));
  const silkPath = join(tmpDir, "voice.silk");
  const pcmPath = outputPath ?? join(tmpDir, "voice.pcm");

  try {
    await writeFile(silkPath, silkBuffer);

    const decoder = decoderPath ?? DEFAULT_SILK_DECODER_PATH;
    // 10s timeout 防 native binary hang
    await execAsync(decoder, [silkPath, pcmPath], { timeoutMs: 10_000 });
    return await readFile(pcmPath);
  } finally {
    try { unlinkSync(silkPath); } catch { /* ignore */ }
    if (!outputPath) {
      try { rmdirSync(tmpDir); } catch { /* ignore */ }
    }
  }
}

/**
 * 编码 PCM → silk (出站语音消息用, sendVoice pipeline)
 */
export async function encodePcmToSilk(
  pcmBuffer: Buffer,
  outputPath?: string,
  encoderPath?: string,
): Promise<Buffer> {
  const tmpDir = mkdtempSync(join(os.tmpdir(), "wpp-silk-enc-"));
  const pcmPath = join(tmpDir, "voice.pcm");
  const silkPath = outputPath ?? join(tmpDir, "voice.silk");

  try {
    await writeFile(pcmPath, pcmBuffer);
    const encoder = encoderPath ?? DEFAULT_SILK_ENCODER_PATH;
    await execAsync(encoder, [pcmPath, silkPath], { timeoutMs: 10_000 });
    return await readFile(silkPath);
  } finally {
    try { unlinkSync(pcmPath); } catch { /* ignore */ }
    if (!outputPath) {
      try { rmdirSync(tmpDir); } catch { /* ignore */ }
    }
  }
}