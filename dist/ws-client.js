import WebSocket from "ws";
import { logObj as log, formatErr } from "./core/logger.js";
import { payloadToInboundMessage } from "./inbound/parser.js";
import { getSynckey, saveSynckey } from "./db.js";
import { parseJsonText } from "./api/client.js";
export class WechatpadproWsClient {
    wsUrl;
    authcode;
    opts;
    ws = null;
    connected = false;
    retryDelay;
    maxRetryDelay;
    retryMultiplier;
    stopped = false;
    consecutive502 = 0;
    static CONSECUTIVE_502_THRESHOLD = 5;
    static LONG_BACKOFF_MS = 300_000;
    lastBackoffReason = null;
    syncInFlight = false;
    fallbackTimer = null;
    fallbackSyncMs;
    constructor(wsUrl, authcode, opts) {
        this.wsUrl = wsUrl;
        this.authcode = authcode;
        this.opts = opts;
        this.fallbackSyncMs = opts.fallbackSyncMs ?? 60_000;
        this.retryDelay = opts.wsReconnect?.initialDelayMs ?? 1_000;
        this.maxRetryDelay = opts.wsReconnect?.maxDelayMs ?? 30_000;
        this.retryMultiplier = opts.wsReconnect?.multiplier ?? 2;
    }
    async start() {
        this.stopped = false;
        this.connect();
        if (this.fallbackSyncMs > 0) {
            this.fallbackTimer = setInterval(() => {
                void this.triggerSync("fallback-timer");
            }, this.fallbackSyncMs);
            this.fallbackTimer.unref?.();
        }
    }
    async stop() {
        this.stopped = true;
        if (this.fallbackTimer) {
            clearInterval(this.fallbackTimer);
            this.fallbackTimer = null;
        }
        if (this.ws) {
            try {
                this.ws.close();
            }
            catch (e) {
                log.warn(`ws close error: ${formatErr(e)}`);
            }
            this.ws = null;
        }
        this.connected = false;
        log.info("ws client stopped");
    }
    isConnected() {
        return this.connected;
    }
    connect() {
        if (this.stopped)
            return;
        const url = `${this.wsUrl}?authcode=${encodeURIComponent(this.authcode)}`;
        log.info(`ws connecting: ${this.wsUrl} (authcode set)`);
        try {
            this.ws = new WebSocket(url);
        }
        catch (e) {
            log.error(`ws construction error: ${formatErr(e)}`);
            this.scheduleRetry();
            return;
        }
        this.ws.on("open", () => {
            this.connected = true;
            this.retryDelay = this.opts.wsReconnect?.initialDelayMs ?? 1_000;
            if (this.consecutive502 > 0) {
                log.info(`ws reset 502 counter: prev=${this.consecutive502} (vendor recovered)`);
            }
            this.consecutive502 = 0;
            log.info("ws connected");
            void this.triggerSync("ws-open");
        });
        this.ws.on("message", async (data) => {
            try {
                const text = data.toString();
                const json = parseJsonText(text);
                const dataField = json["Data"];
                const type = dataField?.["type"];
                if (type === "connection_ready") {
                    log.info("ws recv: connection_ready (handshake ack)");
                    return;
                }
                log.debug(`ws recv: trigger sync (kind=${String(type ?? "unknown")})`);
                void this.triggerSync("ws-push");
            }
            catch (e) {
                log.warn(`ws message parse error: ${formatErr(e)}`);
            }
        });
        this.ws.on("close", (code, reason) => {
            this.connected = false;
            log.warn(`ws closed: code=${code} reason=${reason.toString() || "<none>"}`);
            if (!this.stopped)
                this.scheduleRetry();
        });
        this.ws.on("error", (err) => {
            log.error(`ws error: ${err.message}`);
            if (/502|503|504/.test(err.message)) {
                this.consecutive502 += 1;
                if (this.consecutive502 >= WechatpadproWsClient.CONSECUTIVE_502_THRESHOLD) {
                    this.lastBackoffReason = `502 x ${this.consecutive502}`;
                    log.warn(`ws smart backoff triggered: ${this.consecutive502} consecutive vendor 5xx, next retry in ${WechatpadproWsClient.LONG_BACKOFF_MS}ms (5min)`);
                    this.retryDelay = WechatpadproWsClient.LONG_BACKOFF_MS;
                }
            }
        });
    }
    async triggerSync(reason) {
        if (this.stopped)
            return;
        if (this.syncInFlight) {
            log.debug(`ws sync skipped (in-flight): reason=${reason}`);
            return;
        }
        this.syncInFlight = true;
        try {
            const prevSynckey = await getSynckey(this.opts.accountId);
            const sync = await this.opts.apiClient.call("/Msg/Sync", { Scene: 0, Synckey: prevSynckey ?? "" });
            const newKey = sync?.Data?.KeyBuf?.buffer;
            if (newKey) {
                await saveSynckey(this.opts.accountId, newKey);
            }
            else {
                log.debug(`ws sync: no KeyBuf returned (reason=${reason})`);
            }
            const list = sync?.Data?.CmdList?.List ?? [];
            const count = list.length;
            if (count > 0) {
                log.info(`ws sync pulled ${count} message(s): reason=${reason} synckey=${prevSynckey ? "incremental" : "full"}`);
            }
            else {
                log.debug(`ws sync pulled 0 messages: reason=${reason} synckey=${prevSynckey ? "incremental" : "full"}`);
            }
            for (const raw of list) {
                try {
                    const obj = raw;
                    const msg = payloadToInboundMessage(this.opts.accountId, obj);
                    if (msg) {
                        await this.opts.onInboundMessage(msg);
                    }
                }
                catch (e) {
                    log.warn(`ws sync inbound dispatch failed: ${formatErr(e)}`);
                }
            }
        }
        catch (e) {
            log.warn(`ws sync /Msg/Sync failed: ${formatErr(e)}`);
        }
        finally {
            this.syncInFlight = false;
        }
    }
    scheduleRetry() {
        if (this.stopped)
            return;
        const delay = Math.min(this.retryDelay, this.maxRetryDelay);
        log.info(`ws reconnect in ${delay}ms${this.lastBackoffReason ? ` (smart backoff: ${this.lastBackoffReason})` : ""}`);
        setTimeout(() => this.connect(), delay);
        this.retryDelay = Math.min(this.retryDelay * this.retryMultiplier, this.maxRetryDelay);
        this.lastBackoffReason = null;
    }
}
