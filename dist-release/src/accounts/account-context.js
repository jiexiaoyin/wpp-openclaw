import { info as loggerInfo, warn as loggerWarn, error as loggerError, debug as loggerDebug, formatErr, } from "../core/logger.js";
import { WechatpadproApiClient } from "../api-client.js";
export class AccountContext {
    accountId;
    config;
    apiClient;
    createdAt;
    wsClient;
    webhookServer;
    webhookPaths = [];
    inboundFlushHook = null;
    attachInboundFlush(hook) {
        this.inboundFlushHook = hook;
    }
    retryTimers = new Set();
    vendorAuthed = false;
    authcode;
    selfWxid;
    logPrefix;
    constructor(init) {
        this.accountId = init.accountId;
        this.config = init.config;
        this.apiClient = new WechatpadproApiClient(init.config, init.accountId);
        this.createdAt = Date.now();
        this.authcode = init.config.authcode;
        this.selfWxid = init.config.selfWxid;
        this.logPrefix = `[WPP:${this.accountId}]`;
    }
    info(msg, fields) {
        loggerInfo(`${this.logPrefix} ${msg}`, { accountId: this.accountId, ...(fields ?? {}) });
    }
    warn(msg, fields) {
        loggerWarn(`${this.logPrefix} ${msg}`, { accountId: this.accountId, ...(fields ?? {}) });
    }
    error(msg, err) {
        loggerError(`${this.logPrefix} ${msg}`, {
            accountId: this.accountId,
            err: err === undefined ? undefined : formatErr(err),
        });
    }
    debug(msg, fields) {
        loggerDebug(`${this.logPrefix} ${msg}`, { accountId: this.accountId, ...(fields ?? {}) });
    }
    updateConfig(patch) {
        const changed = [];
        const target = this.config;
        for (const [k, v] of Object.entries(patch)) {
            if (k === "authcode" || k === "selfWxid")
                continue;
            if (JSON.stringify(target[k]) !== JSON.stringify(v)) {
                changed.push(k);
            }
            target[k] = v;
        }
        if (patch.authcode !== undefined && patch.authcode !== this.authcode) {
            this.authcode = patch.authcode;
            changed.push("authcode");
        }
        if (patch.selfWxid !== undefined && patch.selfWxid !== this.selfWxid) {
            this.selfWxid = patch.selfWxid;
            changed.push("selfWxid");
        }
        if (changed.length > 0) {
            this.info(`config hot-reloaded`, { changed: changed.join(",") });
        }
        else {
            this.debug(`config hot-reload no-op (无变化)`);
        }
    }
    setVendorAuth(selfWxid, authcode) {
        this.vendorAuthed = true;
        this.selfWxid = selfWxid;
        this.authcode = authcode;
        this.info(`vendor auth updated`, { selfWxid });
    }
    attachWsClient(ws) {
        this.wsClient = ws;
        this.info(`ws client attached`);
    }
    attachWebhookServer(srv, paths = []) {
        this.webhookServer = srv;
        this.webhookPaths = paths;
        this.info(`webhook server attached`, { port: this.config.webhookPort, paths });
    }
    setRetryTimer(timer) {
        this.retryTimers.add(timer);
    }
    clearRetryTimer(timer) {
        if (timer) {
            this.retryTimers.delete(timer);
            clearInterval(timer);
        }
        else {
            for (const t of this.retryTimers)
                clearInterval(t);
            this.retryTimers.clear();
        }
    }
    get isConfigured() {
        return !!(this.config.enabled && this.config.tokenKey && this.config.apiBaseUrl);
    }
    get isEnabled() {
        return this.config.enabled === true;
    }
    get vendorBaseUrl() {
        return this.config.apiBaseUrl.replace(/\/$/, "");
    }
    async stop() {
        if (this.retryTimers.size > 0) {
            this.clearRetryTimer();
            this.info(`cleared ${this.retryTimers.size} retry timer(s)`);
        }
        if (this.inboundFlushHook) {
            try {
                await this.inboundFlushHook();
                this.info(`inbound flush completed (debouncer buffered messages dispatched)`);
            }
            catch (e) {
                this.warn(`inbound flush error: ${formatErr(e)}`);
            }
        }
        if (this.wsClient) {
            try {
                await this.wsClient.stop();
            }
            catch (e) {
                this.warn(`ws stop error: ${formatErr(e)}`);
            }
        }
        if (this.webhookServer) {
            try {
                for (const p of this.webhookPaths) {
                    this.webhookServer.removePath(p);
                }
                this.webhookPaths = [];
            }
            catch (e) {
                this.warn(`webhook removePath error: ${formatErr(e)}`);
            }
        }
        this.info(`account context stopped`);
    }
    toJSON() {
        return {
            accountId: this.accountId,
            createdAt: this.createdAt,
            enabled: this.config.enabled,
            vendorBaseUrl: this.vendorBaseUrl,
            vendorAuthed: this.vendorAuthed,
            selfWxid: this.selfWxid,
            hasWsClient: !!this.wsClient,
            hasWebhookServer: !!this.webhookServer,
            wsConnected: this.wsClient?.isConnected() ?? false,
        };
    }
}
