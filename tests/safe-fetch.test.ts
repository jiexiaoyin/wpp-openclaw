// tests/safe-fetch.test.ts - v1.3.27 P3-safe-fetch 白名单回归
// 覆盖: 3 个新增 AI 域名放行 + 内网/loopback/metadata 仍拦截 + 非白名单拒绝
// 依据: util/safe-fetch.ts getAllowedHosts (vendor + OSS + dashscope/minimaxi/siliconflow)

import { test } from "node:test";
import assert from "node:assert/strict";
import { isHostAllowed } from "../src/util/safe-fetch.js";

// ===== 放行: 3 个新增 AI 服务域名 (v1.3.27) =====
test("白名单 — dashscope (阿里 embedding)", () => {
  assert.equal(
    isHostAllowed("https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings"),
    true,
  );
});

test("白名单 — api.minimaxi (MiniMax LLM)", () => {
  assert.equal(isHostAllowed("https://api.minimaxi.com/anthropic/v1/messages"), true);
});

test("白名单 — api.siliconflow (SiliconFlow STT)", () => {
  assert.equal(
    isHostAllowed("https://api.siliconflow.cn/v1/audio/transcriptions"),
    true,
  );
});

// ===== 既有白名单 (防回归) =====
test("白名单 — vendor 反代 + OSS 仍放行", () => {
  assert.equal(isHostAllowed("https://wx.juhe.chat/api/Login/GetQR"), true);
  assert.equal(
    isHostAllowed("https://openclaw-a.oss-cn-hangzhou.aliyuncs.com/media/1.png"),
    true,
  );
});

// ===== 拦截: 内网/loopback/metadata (safe-fetch 核心价值) =====
test("拦截 — 私网 10/172.16/192.168", () => {
  assert.equal(isHostAllowed("http://10.0.0.1/"), false);
  assert.equal(isHostAllowed("http://172.16.0.1/"), false);
  assert.equal(isHostAllowed("http://192.168.1.1/"), false);
});

test("拦截 — loopback + cloud metadata", () => {
  assert.equal(isHostAllowed("http://127.0.0.1:4398/"), false);
  assert.equal(isHostAllowed("http://localhost/"), false);
  assert.equal(isHostAllowed("http://169.254.169.254/latest/meta-data/"), false);
});

test("拦截 — 非白名单公网域名", () => {
  assert.equal(isHostAllowed("https://evil.example.com/steal"), false);
});

// ===== 协议/格式防御 =====
test("拦截 — 非 http/https 协议", () => {
  assert.equal(isHostAllowed("file:///etc/passwd"), false);
  assert.equal(isHostAllowed("ftp://wx.juhe.chat/"), false);
});

test("拦截 — 非法 URL 不抛", () => {
  assert.equal(isHostAllowed("not a url"), false);
});
