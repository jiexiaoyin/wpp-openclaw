// tests/send-message-attachments.test.ts - v1.3.38 attachments 数组兼容 (借鉴 gewe)
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMediaFromAttachments } from "../src/dispatch/send-message.js";

test("attachments[0].media 优先", () => {
  const r = resolveMediaFromAttachments([{ type: "image", media: "https://x/img.png" }]);
  assert.equal(r.mediaUrl, "https://x/img.png");
});

test("attachments[0].path fallback", () => {
  const r = resolveMediaFromAttachments([{ path: "https://x/v.mp4" }]);
  assert.equal(r.mediaUrl, "https://x/v.mp4");
});

test("attachments[0].url fallback + attName", () => {
  const r = resolveMediaFromAttachments([{ url: "https://x/f.pdf", name: "doc.pdf" }]);
  assert.equal(r.mediaUrl, "https://x/f.pdf");
  assert.equal(r.attName, "doc.pdf");
});

test("无 attachments 用 content fallback", () => {
  const r = resolveMediaFromAttachments(undefined, "https://x/old.mp3", "old.mp3");
  assert.equal(r.mediaUrl, "https://x/old.mp3");
  assert.equal(r.attName, "old.mp3");
});

test("attachments 空数组 fallback content", () => {
  const r = resolveMediaFromAttachments([], "https://x/content.png");
  assert.equal(r.mediaUrl, "https://x/content.png");
});
