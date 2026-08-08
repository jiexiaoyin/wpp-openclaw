// tests/signature.test.ts - Phase v1.0.1 P1-1 webhook 签名验证 placeholder
// 覆盖: verifyHmacSha256 / signatureRequired / extractSignatureHeader

import { test } from "node:test";
import assert from "node:assert/strict";

import { createHmac } from "node:crypto";
import {
  verifyHmacSha256,
  signatureRequired,
  extractSignatureHeader,
} from "../src/core/signature.js";

// ===== verifyHmacSha256 =====

test("verifyHmacSha256 — 有效 sha256=hex 签名通过", () => {
  const body = '{"msg":"hello"}';
  const secret = "test-secret";
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const signature = `sha256=${expected}`;
  assert.equal(verifyHmacSha256(body, signature, secret), true);
});

test("verifyHmacSha256 — 纯 hex 签名通过 (无 sha256= 前缀)", () => {
  const body = '{"msg":"hello"}';
  const secret = "test-secret";
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifyHmacSha256(body, expected, secret), true);
});

test("verifyHmacSha256 — 错误签名返 false", () => {
  const body = '{"msg":"hello"}';
  const secret = "test-secret";
  const wrongSignature = `sha256=${"a".repeat(64)}`;
  assert.equal(verifyHmacSha256(body, wrongSignature, secret), false);
});

test("verifyHmacSha256 — 缺 signature 返 false", () => {
  const body = '{"msg":"hello"}';
  const secret = "test-secret";
  assert.equal(verifyHmacSha256(body, undefined, secret), false);
  assert.equal(verifyHmacSha256(body, "", secret), false);
});

test("verifyHmacSha256 — 缺 secret 返 false (拒绝无 secret 验签)", () => {
  const body = '{"msg":"hello"}';
  const signature = "sha256=abc";
  assert.equal(verifyHmacSha256(body, signature, ""), false);
});

test("verifyHmacSha256 — body 篡改后签名失效", () => {
  const body1 = '{"msg":"hello"}';
  const body2 = '{"msg":"evil"}';
  const secret = "test-secret";
  const sig = `sha256=${createHmac("sha256", secret).update(body1).digest("hex")}`;
  assert.equal(verifyHmacSha256(body1, sig, secret), true);
  assert.equal(verifyHmacSha256(body2, sig, secret), false, "body 改了 signature 必失败");
});

test("verifyHmacSha256 — 非 hex 签名返 false (不抛)", () => {
  const body = "x";
  const secret = "s";
  // 非 hex 字符 — timingSafeEqual 会拒绝
  const sig = "sha256=zzzz";
  assert.equal(verifyHmacSha256(body, sig, secret), false);
});

test("verifyHmacSha256 — Buffer body 也支持", () => {
  const body = Buffer.from('{"msg":"hello"}', "utf8");
  const secret = "s";
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifyHmacSha256(body, `sha256=${expected}`, secret), true);
});

// ===== signatureRequired (v1.1.1 strict mode) =====

test("signatureRequired — v1.1.10 permissive 模式 — secret 配 → true, 未配 → false", () => {
  // v1.1.10 老板 21:35 拍改回 permissive: vendor 不签, secret 配也强制验 = 全 401
  // 现在: 有 secret → true; 无 secret → false
  assert.equal(signatureRequired("my-secret"), true);
  assert.equal(signatureRequired(""), false, "空 secret 不要求验签");
  assert.equal(signatureRequired(undefined), false);
  assert.equal(signatureRequired(null), false);
});

test("signatureRequired — caller 根据返值决定是否调 verifySignature", () => {
  // 文档化: signatureRequired 只返 !!secret, 不做实际 crypto
  const r1 = signatureRequired("x");
  const r2 = signatureRequired(undefined);
  assert.equal(r1, true);
  assert.equal(r2, false);
  // 实际 verify 由 verifySignature / verifyHmacSha256 决定
});

// ===== extractSignatureHeader =====

test("extractSignatureHeader — 优先 X-Signature", () => {
  const sig = "sha256=abc";
  assert.equal(
    extractSignatureHeader({
      "x-signature": sig,
      "x-hub-signature-256": "other",
      "x-wpp-signature": "third",
    }),
    sig,
  );
});

test("extractSignatureHeader — fallback X-Hub-Signature-256", () => {
  const sig = "sha256=abc";
  assert.equal(
    extractSignatureHeader({ "x-hub-signature-256": sig }),
    sig,
  );
});

test("extractSignatureHeader — fallback X-WPP-Signature", () => {
  const sig = "sha256=abc";
  assert.equal(
    extractSignatureHeader({ "x-wpp-signature": sig }),
    sig,
  );
});

test("extractSignatureHeader — 无 signature header 返 undefined", () => {
  assert.equal(extractSignatureHeader({}), undefined);
  assert.equal(extractSignatureHeader({ "content-type": "application/json" }), undefined);
});

test("extractSignatureHeader — 数组取第一个", () => {
  assert.equal(
    extractSignatureHeader({ "x-signature": ["first", "second"] }),
    "first",
  );
});
