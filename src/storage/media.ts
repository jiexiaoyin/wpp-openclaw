// src/storage/media.ts - 媒体存储抽象 (S3-compatible interface + vendor CDN fallback)
// @aws-sdk/client-s3 完整 S3 API + s3-request-presigner presigned URL;
// 兼容 AWS S3 / MinIO / AliOSS / TXOSS / Cloudflare R2 (path-style 配置)
//
// 用途: 解决 vendor CDN 不稳定时 (高并发限流, 临时不可用) 媒体 (图片/语音/视频) 备份
// 设计:
//   - MediaStorage 抽象接口 (S3-compatible: put/get/sign/url)
//   - PassthroughStorage: 直接返回 vendor 给的 URL (默认, 无副作用)
//   - S3Storage: 用 @aws-sdk 完整 putObject + presigned URL
//   - CompositeStorage: 优先 vendor CDN, 失败 fallback S3 (高可用)
//
// 调用方约定:
//   - storage.put(key, buffer, mimeType) → 返回 { url, etag, ... }
//   - storage.get(key) → 返 buffer
//   - storage.sign(key, expiresIn) → 返 presigned URL (S3 模式) 或 直传 URL (vendor 模式)

import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logObj as log } from "../core/logger.js";

export type StorageKind = "passthrough" | "s3" | "composite";

export interface MediaPutResult {
  url: string;        // 公开访问 URL
  key: string;        // storage key
  etag?: string;      // ETag (S3 模式)
  size: number;       // bytes
  storage: StorageKind;
}

export interface MediaGetResult {
  buffer: Buffer;
  mimeType: string;
  storage: StorageKind;
}

export interface MediaStorage {
  readonly kind: StorageKind;
  put(key: string, buffer: Buffer, mimeType: string): Promise<MediaPutResult>;
  get(key: string): Promise<MediaGetResult>;
  sign(key: string, expiresInSec: number): Promise<string>;
  /** 健康检查 (测试用) */
  ping(): Promise<boolean>;
}

// ============ PassthroughStorage (vendor CDN 直传) ============

/** PassthroughStorage 不存, 返原 URL (vendor 已有 CDN) */
export class PassthroughStorage implements MediaStorage {
  readonly kind = "passthrough" as const;

  constructor(private options: { cdnBase: string }) {
    if (!options.cdnBase) {
      throw new Error("PassthroughStorage requires cdnBase (e.g. https://your-cdn.example.com/cdn)");
    }
  }

  async put(key: string, buffer: Buffer, _mimeType: string): Promise<MediaPutResult> {
    return {
      url: `${this.options.cdnBase}/${key}`,
      key,
      size: buffer.length,
      storage: this.kind,
    };
  }

  async get(_key: string): Promise<MediaGetResult> {
    throw new Error("PassthroughStorage.get: 不支持, 直接用 vendor CDN URL");
  }

  async sign(key: string, _expiresInSec: number): Promise<string> {
    return `${this.options.cdnBase}/${key}`;
  }

  async ping(): Promise<boolean> {
    return true;
  }
}

// ============ S3Storage (真实 S3 集成) ============

export interface S3Config {
  endpoint: string;       // https://s3.amazonaws.com 或 https://oss-cn-hangzhou.aliyuncs.com
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** 是否用 path-style URL (MinIO/部分 OSS 需要) */
  pathStyle?: boolean;
  /** CDN 域名 (返 URL 用, 比 endpoint 直链快) */
  cdnBase?: string;
}

/**
 * @aws-sdk/client-s3 + s3-request-presigner
 * 兼容: AWS S3 / MinIO / AliOSS / TXOSS / Cloudflare R2
 */
export class S3Storage implements MediaStorage {
  readonly kind = "s3" as const;
  private readonly client: S3Client;
  private readonly endpoint: string;
  private readonly cdnBase: string | undefined;

  constructor(private config: S3Config) {
    if (!config.endpoint || !config.bucket) {
      throw new Error("S3Storage requires endpoint + bucket");
    }
    this.endpoint = config.endpoint.replace(/\/$/, "");
    this.cdnBase = config.cdnBase?.replace(/\/$/, "");
    this.client = new S3Client({
      endpoint: this.endpoint,
      region: config.region || "us-east-1",
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.pathStyle ?? false,
    });
  }

  async put(key: string, buffer: Buffer, mimeType: string): Promise<MediaPutResult> {
    const cmd = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    });
    // put/get 加 30s timeout 防 endpoint 挂死时消息队列无限积压
    const resp = await this.withTimeout(this.client.send(cmd), 30_000, `put ${key}`);
    return {
      url: this.publicUrl(key),
      key,
      etag: resp.ETag,
      size: buffer.length,
      storage: this.kind,
    };
  }

  async get(key: string): Promise<MediaGetResult> {
    const cmd = new GetObjectCommand({ Bucket: this.config.bucket, Key: key });
    const resp = await this.withTimeout(this.client.send(cmd), 30_000, `get ${key}`);
    if (!resp.Body) throw new Error(`S3Storage.get: empty body for ${key}`);
    const bytes = await this.withTimeout(resp.Body.transformToByteArray(), 60_000, `get-body ${key}`);
    return {
      buffer: Buffer.from(bytes),
      mimeType: resp.ContentType ?? "application/octet-stream",
      storage: this.kind,
    };
  }

  /**
   * 30s timeout race wrapper for any S3 op.
   * AbortController is the cleanest path but @aws-sdk v3 default config has requestHandler; for simplicity use Promise.race.
   */
  private async withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        p,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`S3Storage: ${label} timeout after ${ms}ms`)), ms);
          timer.unref?.();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async sign(key: string, expiresInSec: number): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: this.config.bucket, Key: key });
    return getSignedUrl(this.client, cmd, { expiresIn: expiresInSec });
  }

  async ping(): Promise<boolean> {
    // 加 timeout (防网络挂死)
    try {
      const cmd = new HeadBucketCommand({ Bucket: this.config.bucket });
      await Promise.race([
        this.client.send(cmd),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("ping timeout")), 3000)),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  /** 公共 URL (virtual-hosted or path-style) */
  private publicUrl(key: string): string {
    if (this.cdnBase) return `${this.cdnBase}/${key}`;
    if (this.config.pathStyle) {
      return `${this.endpoint}/${this.config.bucket}/${key}`;
    }
    // virtual-hosted: {bucket}.{endpoint}/{key}
    const u = new URL(this.endpoint);
    return `${u.protocol}//${this.config.bucket}.${u.host}/${key}`;
  }
}

// ============ CompositeStorage (vendor CDN + S3 fallback) ============

/** 优先用 vendor CDN (passthrough), 失败时 fallback S3 */
export class CompositeStorage implements MediaStorage {
  readonly kind = "composite" as const;

  constructor(
    private primary: MediaStorage,
    private fallback: MediaStorage,
  ) {
    if (primary.kind === "s3" && fallback.kind === "passthrough") {
      throw new Error("CompositeStorage: primary 不能是 s3 + fallback passthrough (无意义)");
    }
  }

  async put(key: string, buffer: Buffer, mimeType: string): Promise<MediaPutResult> {
    try {
      return await this.primary.put(key, buffer, mimeType);
    } catch (e) {
      log.warn(`CompositeStorage.put primary(${this.primary.kind}) failed: ${e}, fallback to ${this.fallback.kind}`);
      return await this.fallback.put(key, buffer, mimeType);
    }
  }

  async get(key: string): Promise<MediaGetResult> {
    try {
      return await this.primary.get(key);
    } catch (e) {
      log.warn(`CompositeStorage.get primary failed: ${e}, fallback`);
      return await this.fallback.get(key);
    }
  }

  async sign(key: string, expiresInSec: number): Promise<string> {
    return this.primary.sign(key, expiresInSec);
  }

  async ping(): Promise<boolean> {
    const a = await this.primary.ping();
    if (a) return true;
    return this.fallback.ping();
  }
}

// ============ factory ============

export function createMediaStorage(config: {
  kind: StorageKind;
  passthrough?: { cdnBase: string };
  s3?: S3Config;
  composite?: { primaryKind: "passthrough" | "s3"; s3?: S3Config; cdnBase?: string };
}): MediaStorage {
  switch (config.kind) {
    case "passthrough":
      if (!config.passthrough?.cdnBase) throw new Error("passthrough requires cdnBase");
      return new PassthroughStorage(config.passthrough);
    case "s3":
      if (!config.s3) throw new Error("s3 requires s3 config");
      return new S3Storage(config.s3);
    case "composite":
      if (!config.composite) throw new Error("composite requires composite config");
      const primary = config.composite.primaryKind === "passthrough"
        ? new PassthroughStorage({ cdnBase: config.composite.cdnBase! })
        : new S3Storage(config.composite.s3!);
      const fallback = config.composite.primaryKind === "passthrough"
        ? new S3Storage(config.composite.s3!)
        : new PassthroughStorage({ cdnBase: config.composite.cdnBase! });
      return new CompositeStorage(primary, fallback);
  }
}
