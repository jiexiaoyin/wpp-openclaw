import { createServer } from "node:http";
import { logObj as log, formatErr } from "./core/logger.js";
import { WEBHOOK_BODY_LIMIT_BYTES, REQUEST_TIMEOUT_MS } from "./core/constants.js";
import { verifyHmacSha256, signatureRequired, extractSignatureHeader, } from "./core/signature.js";
import { WebhookMetrics } from "./monitor/metrics.js";
import { parseJsonText } from "./api/client.js";
export class WechatpadproWebhookServer {
    host;
    port;
    paths;
    secret;
    server = null;
    bodyLimitBytes;
    constructor(host, port, paths, secret, opts) {
        this.host = host;
        this.port = port;
        this.paths = paths;
        this.secret = secret;
        this.bodyLimitBytes = opts?.bodyLimitBytes ?? WEBHOOK_BODY_LIMIT_BYTES;
    }
    addPath(path, onMessage) {
        if (this.paths.some((p) => p.path === path))
            return;
        this.paths.push({ path, onMessage });
        log.info(`[WPP v1.3.61] webhook addPath: ${path} (total ${this.paths.length})`);
    }
    removePath(path) {
        const before = this.paths.length;
        this.paths = this.paths.filter((p) => p.path !== path);
        if (this.paths.length !== before) {
            log.info(`[WPP v1.3.63] webhook removePath: ${path} (total ${this.paths.length})`);
        }
    }
    async start() {
        return new Promise((resolve, reject) => {
            this.server = createServer((req, res) => {
                WebhookMetrics.incReceived();
                req.setTimeout(REQUEST_TIMEOUT_MS, () => {
                    if (!res.headersSent) {
                        res.statusCode = 408;
                        res.end("request timeout");
                        WebhookMetrics.incRejectedTimeout?.();
                    }
                });
                if (req.method !== "POST") {
                    WebhookMetrics.incRejectedPath();
                    res.statusCode = 404;
                    res.end("not found");
                    return;
                }
                const matched = this.paths.find((p) => p.path === req.url);
                if (!matched) {
                    WebhookMetrics.incRejectedPath();
                    res.statusCode = 404;
                    res.end("not found");
                    return;
                }
                const onMessage = matched.onMessage;
                const matchPath = matched.path;
                const chunks = [];
                let totalSize = 0;
                let bodyTooLarge = false;
                let bodyAborted = false;
                const bodyLimit = this.bodyLimitBytes;
                req.on("data", (chunk) => {
                    if (bodyAborted || bodyTooLarge)
                        return;
                    totalSize += chunk.length;
                    if (totalSize > bodyLimit) {
                        bodyTooLarge = true;
                        WebhookMetrics.incRejectedBodySize?.();
                        if (!res.headersSent) {
                            res.statusCode = 413;
                            res.end("payload too large");
                        }
                        req.destroy();
                        return;
                    }
                    chunks.push(chunk);
                });
                req.on("aborted", () => {
                    bodyAborted = true;
                });
                req.on("end", async () => {
                    if (bodyAborted) {
                        if (!res.headersSent) {
                            res.statusCode = 400;
                            res.end("request aborted");
                        }
                        return;
                    }
                    if (bodyTooLarge)
                        return;
                    const rawBody = Buffer.concat(chunks);
                    if (signatureRequired(this.secret)) {
                        const sig = extractSignatureHeader(req.headers);
                        if (!verifyHmacSha256(rawBody, sig, this.secret)) {
                            log.warn(`webhook signature verify failed: account=${matchPath} ` +
                                `(signature=${sig ? "present" : "missing"})`);
                            WebhookMetrics.incRejectedSignature?.();
                            res.statusCode = 401;
                            res.end("unauthorized");
                            return;
                        }
                        log.debug(`webhook signature ok: path=${matchPath}`);
                    }
                    let payload;
                    try {
                        payload = parseJsonText(rawBody.toString("utf8"));
                        if (!payload)
                            throw new Error("parseJsonText returned null");
                    }
                    catch (e) {
                        log.warn(`webhook parse error: ${formatErr(e)}`);
                        WebhookMetrics.incRejectedParse?.();
                        res.statusCode = 400;
                        res.end("bad request");
                        return;
                    }
                    try {
                        await onMessage(payload);
                        WebhookMetrics.incProcessed();
                        res.statusCode = 200;
                        res.end("ok");
                    }
                    catch (e) {
                        log.warn(`webhook onMessage error: ${formatErr(e)}`);
                        if (!res.headersSent) {
                            res.statusCode = 500;
                            res.end("server error");
                        }
                    }
                });
                req.on("error", (e) => {
                    log.warn(`webhook req error: ${formatErr(e)}`);
                });
            });
            this.server.once("error", reject);
            this.server.listen(this.port, this.host, () => {
                log.info(`webhook server listening: ${this.host}:${this.port}${this.paths.map(p => p.path).join(",")}` +
                    (signatureRequired(this.secret) ? " (signature verification: ON)" : " (signature: OFF, no secret)"));
                resolve();
            });
        });
    }
    async stop() {
        return new Promise((resolve) => {
            if (!this.server) {
                resolve();
                return;
            }
            const s = this.server;
            const safetyTimer = setTimeout(() => {
                log.warn("webhook server stop timeout (3s) - force resolved");
                this.server = null;
                resolve();
            }, 3000);
            safetyTimer.unref?.();
            if (typeof s.closeAllConnections === "function") {
                try {
                    s.closeAllConnections();
                }
                catch { }
            }
            s.close(() => {
                clearTimeout(safetyTimer);
                log.info("webhook server stopped");
                this.server = null;
                resolve();
            });
        });
    }
}
export class SeenTracker {
    map = new Map();
    ttlMs;
    constructor(ttlMs = 30 * 60 * 1000) {
        this.ttlMs = ttlMs;
    }
    check(key, ttlOverride) {
        const ttl = ttlOverride ?? this.ttlMs;
        const now = Date.now();
        const seen = this.map.get(key);
        if (seen !== undefined && now - seen < ttl)
            return false;
        this.map.set(key, now);
        if (this.map.size > 1000) {
            for (const [k, v] of this.map) {
                if (now - v > ttl)
                    this.map.delete(k);
            }
        }
        return true;
    }
    size() {
        return this.map.size;
    }
}
export function buildDedupeKey(appId, newMsgId, msgId, content) {
    let idPart = newMsgId && newMsgId !== "" ? newMsgId :
        msgId && msgId !== "" ? msgId :
            "";
    if (!idPart) {
        idPart = content ? `c:${simpleHash(content)}` : "noid";
    }
    return `${appId ?? "noapp"}:${idPart}`;
}
function simpleHash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h << 5) - h + s.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h).toString(36);
}
