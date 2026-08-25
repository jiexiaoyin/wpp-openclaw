import { logObj as log } from "../core/logger.js";
import { upsertAccount, getAccounts, getAccount } from "../db.js";
import { AccountContext } from "./account-context.js";
export class AccountRegistry {
    contexts = new Map();
    inFlight = new Map();
    async start(accountId, cfg) {
        const inflight = this.inFlight.get(accountId);
        if (inflight) {
            log.debug(`registry.start: inFlight hit for ${accountId}, awaiting`);
            return inflight;
        }
        if (this.contexts.has(accountId)) {
            log.warn(`registry: account already started: ${accountId}, returning existing`);
            return this.contexts.get(accountId);
        }
        if (!cfg.enabled) {
            throw new Error(`account disabled: ${accountId}`);
        }
        if (!cfg.tokenKey) {
            throw new Error(`account tokenKey missing: ${accountId} (set ${cfg.tokenKeyEnv ?? "env"})`);
        }
        const promise = this._doStart(accountId, cfg);
        this.inFlight.set(accountId, promise);
        try {
            return await promise;
        }
        finally {
            this.inFlight.delete(accountId);
        }
    }
    async _doStart(accountId, cfg) {
        const ctx = new AccountContext({ accountId, config: cfg });
        this.contexts.set(accountId, ctx);
        ctx.info(`account started via registry`);
        return ctx;
    }
    get(accountId) {
        return this.contexts.get(accountId) ?? null;
    }
    has(accountId) {
        return this.contexts.has(accountId);
    }
    resolve(query) {
        if (!query)
            return null;
        const exact = this.contexts.get(query);
        if (exact)
            return exact;
        const lower = query.toLowerCase();
        for (const [id, ctx] of this.contexts) {
            if (id.toLowerCase() === lower)
                return ctx;
        }
        return null;
    }
    getOrThrow(accountId) {
        const ctx = this.contexts.get(accountId);
        if (!ctx) {
            throw new Error(`account not found: ${accountId} (known: ${Array.from(this.contexts.keys()).join(", ") || "none"})`);
        }
        return ctx;
    }
    list() {
        return Array.from(this.contexts.values());
    }
    size() {
        return this.contexts.size;
    }
    listIds() {
        return Array.from(this.contexts.keys());
    }
    async stop(accountId) {
        const ctx = this.contexts.get(accountId);
        if (!ctx) {
            log.warn(`registry: stop called for unknown account: ${accountId}`);
            return;
        }
        await ctx.stop();
        this.contexts.delete(accountId);
    }
    async stopAll() {
        const ids = Array.from(this.contexts.keys());
        for (const id of ids) {
            await this.stop(id);
        }
    }
    async persist(accountId) {
        const ctx = this.get(accountId);
        if (!ctx) {
            log.warn(`registry.persist: account not found: ${accountId}`);
            return;
        }
        const record = {
            account_id: ctx.accountId,
            display_name: ctx.config.nickname,
            self_wxid: ctx.selfWxid,
            nickname: ctx.config.nickname,
            enabled: ctx.config.enabled,
            config_json: JSON.stringify({
                debounceMs: ctx.config.debounceMs,
                requireAtMention: ctx.config.requireAtMention,
                groupPolicy: ctx.config.groupPolicy,
                allowFrom: ctx.config.allowFrom,
                groupAllowFrom: ctx.config.groupAllowFrom,
                apiBaseUrl: ctx.config.apiBaseUrl,
                wsUrl: ctx.config.wsUrl,
                webhookHost: ctx.config.webhookHost,
                webhookPort: ctx.config.webhookPort,
                webhookPath: ctx.config.webhookPath,
            }),
        };
        await upsertAccount(record);
        ctx.debug(`persisted to db (vendorAuthed=${ctx.vendorAuthed})`);
    }
    async loadAllFromDb() {
        return getAccounts();
    }
    async loadFromDb(accountId) {
        return getAccount(accountId);
    }
    toJSON() {
        return {
            size: this.contexts.size,
            accountIds: Array.from(this.contexts.keys()),
            accounts: this.list().map((c) => c.toJSON()),
        };
    }
}
