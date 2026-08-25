import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logObj as log } from "../core/logger.js";
export class PassthroughStorage {
    options;
    kind = "passthrough";
    constructor(options) {
        this.options = options;
        if (!options.cdnBase) {
            throw new Error("PassthroughStorage requires cdnBase (e.g. https://your-cdn.example.com/cdn)");
        }
    }
    async put(key, buffer, _mimeType) {
        return {
            url: `${this.options.cdnBase}/${key}`,
            key,
            size: buffer.length,
            storage: this.kind,
        };
    }
    async get(_key) {
        throw new Error("PassthroughStorage.get: 不支持, 直接用 vendor CDN URL");
    }
    async sign(key, _expiresInSec) {
        return `${this.options.cdnBase}/${key}`;
    }
    async ping() {
        return true;
    }
}
export class S3Storage {
    config;
    kind = "s3";
    client;
    endpoint;
    cdnBase;
    constructor(config) {
        this.config = config;
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
    async put(key, buffer, mimeType) {
        const cmd = new PutObjectCommand({
            Bucket: this.config.bucket,
            Key: key,
            Body: buffer,
            ContentType: mimeType,
        });
        const resp = await this.withTimeout(this.client.send(cmd), 30_000, `put ${key}`);
        return {
            url: this.publicUrl(key),
            key,
            etag: resp.ETag,
            size: buffer.length,
            storage: this.kind,
        };
    }
    async get(key) {
        const cmd = new GetObjectCommand({ Bucket: this.config.bucket, Key: key });
        const resp = await this.withTimeout(this.client.send(cmd), 30_000, `get ${key}`);
        if (!resp.Body)
            throw new Error(`S3Storage.get: empty body for ${key}`);
        const bytes = await this.withTimeout(resp.Body.transformToByteArray(), 60_000, `get-body ${key}`);
        return {
            buffer: Buffer.from(bytes),
            mimeType: resp.ContentType ?? "application/octet-stream",
            storage: this.kind,
        };
    }
    async withTimeout(p, ms, label) {
        let timer;
        try {
            return await Promise.race([
                p,
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`S3Storage: ${label} timeout after ${ms}ms`)), ms);
                    timer.unref?.();
                }),
            ]);
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
    }
    async sign(key, expiresInSec) {
        const cmd = new GetObjectCommand({ Bucket: this.config.bucket, Key: key });
        return getSignedUrl(this.client, cmd, { expiresIn: expiresInSec });
    }
    async ping() {
        try {
            const cmd = new HeadBucketCommand({ Bucket: this.config.bucket });
            await Promise.race([
                this.client.send(cmd),
                new Promise((_, reject) => setTimeout(() => reject(new Error("ping timeout")), 3000)),
            ]);
            return true;
        }
        catch {
            return false;
        }
    }
    publicUrl(key) {
        if (this.cdnBase)
            return `${this.cdnBase}/${key}`;
        if (this.config.pathStyle) {
            return `${this.endpoint}/${this.config.bucket}/${key}`;
        }
        const u = new URL(this.endpoint);
        return `${u.protocol}//${this.config.bucket}.${u.host}/${key}`;
    }
}
export class CompositeStorage {
    primary;
    fallback;
    kind = "composite";
    constructor(primary, fallback) {
        this.primary = primary;
        this.fallback = fallback;
        if (primary.kind === "s3" && fallback.kind === "passthrough") {
            throw new Error("CompositeStorage: primary 不能是 s3 + fallback passthrough (无意义)");
        }
    }
    async put(key, buffer, mimeType) {
        try {
            return await this.primary.put(key, buffer, mimeType);
        }
        catch (e) {
            log.warn(`CompositeStorage.put primary(${this.primary.kind}) failed: ${e}, fallback to ${this.fallback.kind}`);
            return await this.fallback.put(key, buffer, mimeType);
        }
    }
    async get(key) {
        try {
            return await this.primary.get(key);
        }
        catch (e) {
            log.warn(`CompositeStorage.get primary failed: ${e}, fallback`);
            return await this.fallback.get(key);
        }
    }
    async sign(key, expiresInSec) {
        return this.primary.sign(key, expiresInSec);
    }
    async ping() {
        const a = await this.primary.ping();
        if (a)
            return true;
        return this.fallback.ping();
    }
}
export function createMediaStorage(config) {
    switch (config.kind) {
        case "passthrough":
            if (!config.passthrough?.cdnBase)
                throw new Error("passthrough requires cdnBase");
            return new PassthroughStorage(config.passthrough);
        case "s3":
            if (!config.s3)
                throw new Error("s3 requires s3 config");
            return new S3Storage(config.s3);
        case "composite":
            if (!config.composite)
                throw new Error("composite requires composite config");
            const primary = config.composite.primaryKind === "passthrough"
                ? new PassthroughStorage({ cdnBase: config.composite.cdnBase })
                : new S3Storage(config.composite.s3);
            const fallback = config.composite.primaryKind === "passthrough"
                ? new S3Storage(config.composite.s3)
                : new PassthroughStorage({ cdnBase: config.composite.cdnBase });
            return new CompositeStorage(primary, fallback);
    }
}
