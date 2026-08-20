// tests/stt.test.ts - v1.3.74 P2-2: SiliconFlow STT 覆盖 (buildWavBuffer 纯函数 + transcribeSilkBuffer 分支)
// 背景: 审阅 P2-2 覆盖率 stt.ts 36.2% 低 — buildWavBuffer 纯函数无测试, transcribeSilkBuffer 分支缺覆盖

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildWavBuffer, transcribeSilkBuffer } from "../src/storage/stt.js";

test("v1.3.74 P2-2 — buildWavBuffer: RIFF/WAVE 头正确 (44 字节头 + PCM)", () => {
  const pcm = Buffer.from([0x01, 0x02, 0x03, 0x04]); // 4 字节 PCM
  const wav = buildWavBuffer(pcm);

  // 总长 = 44 头 + PCM
  assert.equal(wav.length, 44 + 4, "总长 = 44 头 + PCM");
  // RIFF/WAVE 标识
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.toString("ascii", 36, 40), "data");
  // RIFF size = 总长 - 8
  assert.equal(wav.readUInt32LE(4), wav.length - 8, "RIFF chunk size");
  // fmt: PCM=1, channels=1, sampleRate=24000, bits=16
  assert.equal(wav.readUInt16LE(20), 1, "audio format PCM");
  assert.equal(wav.readUInt16LE(22), 1, "channels");
  assert.equal(wav.readUInt32LE(24), 24_000, "sample rate");
  assert.equal(wav.readUInt16LE(34), 16, "bits per sample");
  // data size = PCM len
  assert.equal(wav.readUInt32LE(40), 4, "data size");
  // PCM 数据在 44 偏移
  assert.deepEqual([...wav.subarray(44)], [0x01, 0x02, 0x03, 0x04], "PCM 数据位置");
});

test("v1.3.74 P2-2 — buildWavBuffer: 空 PCM 也合法 (0 字节 data)", () => {
  const wav = buildWavBuffer(Buffer.alloc(0));
  assert.equal(wav.length, 44, "空 PCM → 仅 44 字节头");
  assert.equal(wav.readUInt32LE(40), 0, "data size 0");
});

test("v1.3.74 P2-2 — transcribeSilkBuffer: 缺 apiKey 返 null (不调网络)", async () => {
  const r = await transcribeSilkBuffer(Buffer.from("silk-data"), ""); // 空 apiKey
  assert.equal(r, null, "缺 apiKey 应返 null");
});
