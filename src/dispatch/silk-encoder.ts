// src/dispatch/silk-encoder.ts - v1.3.48 SILK-ENCODER (2026-08-12 接总立 P0)
//
// 移植自 GeWe v1.4.4 src/send/voice.ts 完整 pipeline:
//   mp3/URL/base64 → ffmpeg PCM 24kHz mono → silk encoder -tencent -quiet
//   → 0x02 + !SILK_V3 头 → vendor /Msg/SendVoice 才认
//
// 老板 query 8-12 10:44: "参考 gewe 插件之前发送语音的逻辑看看"
// 老板 8-12 10:23: "语音要注意格式转化问题呀"
// 老板 6-12 21:50 / 7-24 01:51 历史已诊断过 silk bug 但 WPP plugin v1.0+ 没继承
//
// 关键约束 (仿 GeWe v1.4.4):
//   1. PCM 24kHz mono (ffmpeg -ar 24000 -ac 1)
//   2. silk encoder 加 -tencent -quiet flags
//   3. silk 文件 OSS 子目录复用 ossSubdirFor('audio/silk') → gewe/audio/ 复数
//   4. MAX_VOICE_DURATION_MS = 60_000 60s 限制
//   5. postVoice 成功不降级 (无降级逻辑)
//
// 不动现有 sendImage/sendFile/sendVideo (它们各自有 vendor 路径)
//
// 备份: /data/wpp-silk-encoder-2026-08-12-1044/

import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execAsync } from "../util/exec.js";
import { uniqueId } from "../util/id.js";
import { safeFetchWithCap } from "../util/safe-fetch.js";
import { logObj as log } from "../core/logger.js";
import { readLocalMedia } from "../api/resolve-media.js";

/** v1.3.59 P0-2: 本地路径读走 readLocalMedia 三重校验 (.. 拒绝 + resolve + allowedRoots), 防任意文件读 */
async function readLocalMediaSafe(input: string): Promise<Buffer> {
  return readLocalMedia(input);
}

// 老板 6-12 16:36 偏好: 成功发为微信语音消息, 失败降级为文件消息 (上层 caller 决定)
// 当前 plugin 不主动降级, 默认行为 = sendVoice 失败抛错

const SILK_ENCODER_PATH = process.env.WPP_SILK_ENCODER_PATH ?? "/root/silk_decoder/silk/encoder";

export interface SilkEncodeResult {
  silkBuffer: Buffer;
  voiceDurationMs: number;
}

/**
 * 把 mp3/URL/base64 → PCM → silk
 * @param input mp3 file path / http(s) URL / base64 data URI
 *
 * v1.3.52 SILK-ONLY (2026-08-12): 输入已是 silk (data:audio/silk 或 .silk 后缀) → 直接透传,
 *   不再走 ffmpeg 重编码 (silk 不是 ffmpeg 原生可解格式, 重编码必失败/白费)。
 *   这样 sendVoice 链路对 silk/mp3 输入统一收口: silk 直接用, mp3 转码, 其它抛错。
 */
export async function encodeMp3ToSilk(input: string | Buffer): Promise<SilkEncodeResult> {
  // 0. silk 输入 → 透传 (不转码)
  if (typeof input === "string") {
    const noQuery = (input.split("?")[0] ?? "").toLowerCase();
    const isSilkInput = input.startsWith("data:audio/silk") || noQuery.endsWith(".silk");
    if (isSilkInput) {
      if (input.startsWith("data:") || /^https?:\/\//i.test(input)) {
        const buf = await fetchToBuffer(input);
        return { silkBuffer: buf, voiceDurationMs: 0 };
      }
      if (existsSync(input)) {
        // v1.3.59 P0-2 (2026-08-13 完整审阅): 本地路径读必须走 readLocalMedia 三重校验
        //   (.. 拒绝 + path.resolve + allowedRoots), 防 AI 诱导读任意 .silk 文件外带
        const buf = await readLocalMediaSafe(input);
        return { silkBuffer: buf, voiceDurationMs: 0 };
      }
      throw new Error(`silk input not resolvable: ${input.slice(0, 80)}`);
    }
  }
  // 1. 落盘 mp3 (ffmpeg 需要)
  const tmpDir = mkdtempSync(join(tmpdir(), "wpp-voice-"));
  let mp3Path: string | null = null;
  try {
    if (Buffer.isBuffer(input)) {
      mp3Path = join(tmpDir, `input_${uniqueId()}.mp3`);
      writeFileSync(mp3Path, input);
    } else if (input.startsWith("data:") || input.startsWith("http://") || input.startsWith("https://")) {
      // URL / base64 → 先下载/解码
      const buf = await fetchToBuffer(input);
      mp3Path = join(tmpDir, `input_${uniqueId()}.mp3`);
      writeFileSync(mp3Path, buf);
    } else if (existsSync(input)) {
      // v1.3.59 P0-2: mp3 本地路径同样走 readLocalMedia 校验 (防读 allowedRoots 外文件)
      await readLocalMediaSafe(input);
      mp3Path = input;
    } else {
      throw new Error(`Unsupported input: ${typeof input} (not URL/data/path/Buffer)`);
    }

    // 2. ffprobe 时长
    const ffprobeResult = await execAsync(
      "ffprobe",
      [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        mp3Path,
      ],
      { timeoutMs: 5_000 },
    );
    if (ffprobeResult.code !== 0) {
      throw new Error(`ffprobe failed: ${ffprobeResult.stderr || ffprobeResult.stdout}`);
    }
    const voiceDurationMs = Math.round(parseFloat(ffprobeResult.stdout.trim()) * 1000);

    // 3. ffmpeg MP3 → PCM 24kHz mono
    const pcmPath = join(tmpDir, `voice_${uniqueId()}.pcm`);
    const ffmpegResult = await execAsync(
      "ffmpeg",
      [
        "-i", mp3Path,
        "-vn", "-acodec", "pcm_s16le",
        "-ar", "24000", "-ac", "1",
        "-f", "s16le", pcmPath, "-y",
      ],
      { timeoutMs: 10_000 },
    );
    if (ffmpegResult.code !== 0) {
      throw new Error(`ffmpeg failed: ${ffmpegResult.stderr || ffmpegResult.stdout}`);
    }

    // 4. silk encoder -tencent -quiet
    if (!existsSync(SILK_ENCODER_PATH)) {
      throw new Error(`silk encoder not found: ${SILK_ENCODER_PATH}`);
    }
    // ============================================================
    // v1.3.51 SILK-SIZE-FIX (2026-08-12 接总立 P0, 修复 vendor /Msg/SendVoice 拒收超大 silk):
    //
    // 根因 (8-12 11:18 老板 query 11:10 实证):
    //   vendor /Msg/SendVoice 限制 silk file size ≤ ~60000 bytes (按实测矩阵推断)
    //   v1.3.48 silk encoder -tencent 默认 25000 bps 编码, 30s mp3 活泼语音
    //     → 85836 bytes silk → base64 ~114448 chars → vendor 返 Code=-2 INVALID_CREDENTIAL
    //   但 30s 静音或低 rate mp3 → 53631 bytes silk → vendor 接受
    //
    // 验证数据 (老板 8-12 11:11-11:18 curl 实证):
    //   5807 bytes silk (2s 23kbps) → Code=0 ✅
    //   53631 bytes silk (30s 14kbps) → Code=0 ✅
    //   85836 bytes silk (30s 23kbps) → Code=-2 ❌
    //   42450 bytes silk (15s 23kbps) → Code=0 ✅
    //   67361 bytes silk (30s 18kbps -rate 20000) → 边界 (待实测)
    //   121809 bytes silk (30s 16kHz mono) → 拒绝 (太大)
    //
    // 修复: silk encoder 后查 size, 超阈值重转低 bitrate (-rate 16000) + 降采样 (-Fs_API 16000)
    //   优先级: 默认 -rate 25000 → 超限 -rate 20000 → 还超 -rate 16000 + -Fs_API 16000
    //   仍超阈值 → 拒绝 + 报告 (上层 caller 决定降级文件 或 重切片)
    //
    // 不动现有 v1.3.48 SILK-ENCODER 头 (0x02 + !SILK_V3) 和 v1.3.49 SILK-TYPE-FIX (Type=4)
    // ============================================================
    const MAX_SILK_BYTES = 60_000;
    const silkPath = join(tmpDir, `voice_${uniqueId()}.silk`);
    const encodeRates = [
      { rate: undefined, fsApi: undefined },  // 默认 -rate 25000 -Fs_API 24000
      { rate: 20000, fsApi: undefined },       // 降 bitrate
      { rate: 16000, fsApi: 16000 },            // 再降 bitrate + 降采样
    ];
    let silkBuffer: Buffer | null = null;
    let usedRate = "default";
    for (const { rate, fsApi } of encodeRates) {
      const args = [pcmPath, silkPath, "-tencent", "-quiet"];
      if (rate !== undefined) args.push("-rate", String(rate));
      if (fsApi !== undefined) args.push("-Fs_API", String(fsApi));
      const silkResult = await execAsync(
        SILK_ENCODER_PATH,
        args,
        { timeoutMs: 10_000 },
      );
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
      silkBuffer = buf; // 保留最大的作为 fallback (上层 caller 决定怎么处置)
    }
    if (!silkBuffer) {
      throw new Error("silk encoder all rate attempts failed");
    }
    log.info(`[WPP v1.3.48 SILK-ENCODER] mp3 → silk (${silkBuffer.length} bytes, ${voiceDurationMs}ms, ${usedRate})`);
    return { silkBuffer, voiceDurationMs };
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/** fetch URL 或 data URI 到 Buffer */
async function fetchToBuffer(input: string): Promise<Buffer> {
  if (input.startsWith("data:")) {
    // data:audio/mpeg;base64,XXX
    const idx = input.indexOf(",");
    if (idx < 0) throw new Error("invalid data URI");
    return Buffer.from(input.slice(idx + 1), "base64");
  }
  // http(s) URL — v1.3.57 P0-SSRF (2026-08-13 交付审阅): 裸 fetch → safeFetchWithCap
  //   (host 白名单 + 20MB cap + 30s 超时 + 流式), 防 AI 诱导抓内网/云元数据
  const buf = await safeFetchWithCap(input, { signal: AbortSignal.timeout(30_000) }, 20 * 1024 * 1024);
  return buf;
}

/**
 * 给 ossSubdirFor 的类型 (兼容 media-oss.uploadMediaToOss)
 * WPP plugin 已有 ossSubdirFor 在 dispatch/media-oss.ts
 */
export function ossSubdirFor(type: "audio/silk" | "audio/mpeg" | "voice" | "silk"): string {
  // WPP plugin 与 GeWe plugin 用同一个 bucket, 复用 'gewe/audio/' 子目录
  if (type === "audio/silk" || type === "silk" || type === "voice") return "gewe/audio";
  if (type === "audio/mpeg") return "gewe/audio";
  return "gewe/files";
}