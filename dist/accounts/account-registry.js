// src/accounts/account-registry.ts - 多账号 registry class (显式 start/stop/get/list API)
// 关键设计:
import { logObj as log } from "../core/logger.js";
import { upsertAccount, getAccounts, getAccount } from "../db.js";
import { AccountContext } from "./account-context.js";
export class AccountRegistry {
    contexts = new Map();
    /** inFlight Map 序列化并发 start (防多个 caller 同时 start 同 accountId → 后建覆盖先建导致泄漏) */
    inFlight = new Map();
    // ============ CRUD ============
    /**
     * 注册一个新账号. 已存在同 ID 返回 existing (幂等).
     * 并发安全: 同 accountId 并发调用只创建 1 个 context, 其余等待并收到相同 promise.
     * 抛错条件: enabled=false / tokenKey 空.
     */
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
    /**
     * 内部: 实际创建 context (P2-1 拆分, 让 inFlight lock 涵盖整个 new+set 临界区)
     */
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
    /**
     * 路由解析 (G2-2): 精确匹配 → 大小写不敏感匹配 → null.
     * 故意不做 prefix 模糊匹配 (过于 magic, 易误命中).
     * 故意不做 "default" fallback (调用方应明确知道 accountId; OpenClaw session key 总是带 ID).
     * 空字符串 / null / undefined 一律返回 null (不抛 — 调用方决定如何兜底).
     */
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
    /**
     * 强制拿 context (找不到抛错). 供 dispatch / send 等"必须有 context"的调用方用,
     * 错误信息含所有已知 accountId 便于排查.
     */
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
    /** 所有 account ID (供健康检查 / OpenClaw 路由发现) */
    listIds() {
        return Array.from(this.contexts.keys());
    }
    // ============ Lifecycle ============
    /**
     * 停止单个账号 (context.stop() + 从 registry 移除).
     * 不存在账号 no-op + warn (不抛 — 避免 shutdown 链路单点失败).
     */
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
    // ============ DB 持久化 (G2-3) ============
    // 注意: 不自动 persist — caller 决定时机 (start 后 / 鉴权变化后 / stop 前)
    //       自动 persist 易引入循环依赖 + 难测试, 显式调用更可控
    /**
     * 持久化单个账号状态到 DB.
     * 故意不存 tokenKey / authcode / webhookSecret (走 accounts/<id>.json + env vars)
     * 失败 throw — caller 决定 retry / 兜底 (vs AccountContext.stop 失败仅 warn)
     */
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
                // 非敏感配置 (供 reload 时参考, 但实际仍以 disk 为准)
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
                // 故意不存: tokenKey, authcode, webhookSecret (走 disk + env)
            }),
        };
        await upsertAccount(record);
        ctx.debug(`persisted to db (vendorAuthed=${ctx.vendorAuthed})`);
    }
    /**
     * 列出 DB 中所有已知账号 (按 account_id 排序)
     * 供 plugin 重启时遍历 / OpenClaw setup wizard / 监控
     */
    async loadAllFromDb() {
        return getAccounts();
    }
    /**
     * 单个账号 DB 状态 (null 表示从未注册过)
     */
    async loadFromDb(accountId) {
        return getAccount(accountId);
    }
    // ============ Debug ============
    /**
     * 调试 dump — 不含敏感字段 (AccountContext.toJSON 已脱敏 tokenKey/authcode/webhookSecret)
     */
    toJSON() {
        return {
            size: this.contexts.size,
            accountIds: Array.from(this.contexts.keys()),
            accounts: this.list().map((c) => c.toJSON()),
        };
    }
}
//# sourceMappingURL=account-registry.js.map