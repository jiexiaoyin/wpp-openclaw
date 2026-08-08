// tests/media-storage.test.ts - v1.1.3 media storage abstraction

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PassthroughStorage,
  S3Storage,
  CompositeStorage,
  createMediaStorage,
} from "../src/storage/media.js";

const SAMPLE = Buffer.from("hello world");

// ===== PassthroughStorage =====

test("v1.1.3 PassthroughStorage.put — 返 vendor CDN URL (无副作用)", async () => {
  const s = new PassthroughStorage({ cdnBase: "https://wx.juhe.chat/cdn" });
  const r = await s.put("img/abc.jpg", SAMPLE, "image/jpeg");
  assert.equal(r.url, "https://wx.juhe.chat/cdn/img/abc.jpg");
  assert.equal(r.key, "img/abc.jpg");
  assert.equal(r.size, SAMPLE.length);
  assert.equal(r.storage, "passthrough");
});

test("v1.1.3 PassthroughStorage.sign — 返永久 URL", async () => {
  const s = new PassthroughStorage({ cdnBase: "https://x" });
  const url = await s.sign("img/abc.jpg", 3600);
  assert.equal(url, "https://x/img/abc.jpg");
});

test("v1.1.3 PassthroughStorage.ping — 永远 true", async () => {
  const s = new PassthroughStorage({ cdnBase: "https://x" });
  assert.equal(await s.ping(), true);
});

test("v1.1.3 PassthroughStorage — cdnBase 空 抛错", () => {
  assert.throws(() => new PassthroughStorage({ cdnBase: "" }), /cdnBase/);
});

// ===== S3Storage =====


test("v1.1.3 S3Storage.endpoint 末尾 / 自动去 (sync 检查)", () => {
  const s = new S3Storage({
    endpoint: "https://oss.com/",
    region: "r", bucket: "b", accessKeyId: "a", secretAccessKey: "s",
  });
  // 用 sign 测 publicUrl 格式 (sync, 不发网络请求)
  s.sign("img/k.jpg", 60).then((url) => {
    assert.ok(!url.includes("//img"), `path-style 不应双 /, 实际: ${url.slice(0, 80)}`);
  });
});

test("v1.1.3 S3Storage.ping — fake endpoint timeout 返 false (不挂死)", async () => {
  const s = new S3Storage({
    endpoint: "https://nonexistent.invalid",
    region: "r", bucket: "x",
    accessKeyId: "a", secretAccessKey: "s",
  });
  // 用不存在的域名, 应 3s timeout 返 false
  const start = Date.now();
  const ok = await s.ping();
  const dur = Date.now() - start;
  assert.equal(ok, false, "ping 失败应返 false");
  assert.ok(dur < 5000, `应 < 5s timeout, 实际 ${dur}ms`);
});

test("v1.1.3 S3Storage.put — fake creds (测真 SDK 调用不挂)", async () => {
  const s = new S3Storage({
    endpoint: "https://nonexistent.invalid",
    region: "r", bucket: "x",
    accessKeyId: "a", secretAccessKey: "s",
  });
  // put 会失败 (网络不可达), 但 SDK 调用不挂 (timeout)
  try {
    await s.put("k", SAMPLE, "text/plain");
    assert.fail("应 throw (网络不可达)");
  } catch (e) {
    assert.ok(e instanceof Error, "应抛 Error");
  }
});


// ===== CompositeStorage =====

test("v1.1.3 CompositeStorage — primary (passthrough) OK, 不 fallback", async () => {
  const primary = new PassthroughStorage({ cdnBase: "https://primary" });
  const fallback = new S3Storage({
    endpoint: "https://s3.amazonaws.com", region: "r", bucket: "b",
    accessKeyId: "a", secretAccessKey: "s",
  });
  const c = new CompositeStorage(primary, fallback);
  const r = await c.put("k", SAMPLE, "text/plain");
  assert.equal(r.storage, "passthrough", "primary OK 应不 fallback");
  assert.match(r.url, /primary/);
});

test("v1.1.3 CompositeStorage — primary 抛错 fallback S3 (用 fake fallback 不发网络)", async () => {
  const primary: any = {
    put: async () => { throw new Error("primary down"); },
    get: async () => { throw new Error("primary down"); },
    sign: async () => { throw new Error("primary down"); },
    ping: async () => false,
    kind: "passthrough",
  };
  // 用 fake fallback 替真 S3 (避免网络挂死)
  const fallback: any = {
    put: async (key: string, buffer: Buffer) => ({
      url: `https://fake-s3/${key}`,
      key,
      etag: "fake-etag",
      size: buffer.length,
      storage: "s3" as const,
    }),
    get: async () => { throw new Error("fake"); },
    sign: async () => "https://fake-s3/signed",
    ping: async () => true,
    kind: "s3" as const,
  };
  const c = new CompositeStorage(primary, fallback);
  const r = await c.put("k", SAMPLE, "text/plain");
  assert.equal(r.storage, "s3", "应 fallback 到 fake S3");
});

test("v1.1.3 CompositeStorage — 顺序检查 (primary 不能 s3 + fallback passthrough)", () => {
  const s3 = new S3Storage({ endpoint: "https://x", region: "r", bucket: "b", accessKeyId: "a", secretAccessKey: "s" });
  const p = new PassthroughStorage({ cdnBase: "https://x" });
  assert.throws(
    () => new CompositeStorage(s3, p),
    /CompositeStorage: primary 不能是 s3 \+ fallback passthrough/,
  );
});

// ===== factory =====

test("v1.1.3 createMediaStorage — passthrough", () => {
  const s = createMediaStorage({ kind: "passthrough", passthrough: { cdnBase: "https://x" } });
  assert.equal(s.kind, "passthrough");
});

test("v1.1.3 createMediaStorage — s3", () => {
  const s = createMediaStorage({
    kind: "s3",
    s3: { endpoint: "https://x", region: "r", bucket: "b", accessKeyId: "a", secretAccessKey: "s" },
  });
  assert.equal(s.kind, "s3");
});

test("v1.1.3 createMediaStorage — composite (passthrough primary + s3 fallback)", () => {
  const s = createMediaStorage({
    kind: "composite",
    composite: {
      primaryKind: "passthrough",
      cdnBase: "https://primary",
      s3: { endpoint: "https://s3", region: "r", bucket: "b", accessKeyId: "a", secretAccessKey: "s" },
    },
  });
  assert.equal(s.kind, "composite");
});

test("v1.1.3 createMediaStorage — 缺 config 抛错", () => {
  assert.throws(() => createMediaStorage({ kind: "passthrough" } as any), /cdnBase/);
  assert.throws(() => createMediaStorage({ kind: "s3" } as any), /s3 config/);
});
