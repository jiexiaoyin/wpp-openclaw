// src/accounts/account-context.ts - Phase G1 单账号环境隔离
// 封装 1 个账号的: config + apiClient + 运行时状态 + 隔离 logger
// 仿 本项目 AccountContext 设计 (本仓库 v0.1.0 沿用 module singleton 模式, G1 升级为 class)
//
// 关键不变量:
//   1. 1 accountId = 1 AccountContext (G2 Registry 保证)
//   2. AccountContext 与现有 WppAccountState 结构兼容 (structural typing)
//      → outbound / dispatch / inbound 现有 call site 不用动
//   3. logger 自带 accountId 字段 + [WPP:<id>] 前缀 → 多账号 log grep 隔离
//   4. 构造纯内存 (不连 DB / 网络) → 单测 0 依赖

import {
  info as loggerInfo,
  warn as loggerWarn,
  error as loggerError,
  debug as loggerDebug,
  formatErr,
} from "../core/logger.js";
import { WechatpadproApiClient } from "../api-client.js";
import type {
  WppAccountConfig,
  WppApiClient,
  WppWebhookServer,
  WppWsClient,
} from "../types.js";

type Fields = Record<string, unknown>;

export interface AccountContextInit {
  accountId: string;
  config: WppAccountConfig;
}

export class AccountContext {
  readonly accountId: string;
  readonly config: WppAccountConfig;
  readonly apiClient: WppApiClient;
  readonly createdAt: number;

  // 运行时挂载资源 (startAccount 之后由 index.ts attach)
  wsClient?: WppWsClient;
  webhookServer?: WppWebhookServer;

  // v1.1.12 P1-1 (2026-08-08): periodic setWebhook retry timer 集合
  // 多个 timer 可能并存 (e.g. 启动失败 + 后续仍 retry), shutdown 时全部 clear
  private readonly retryTimers = new Set<NodeJS.Timeout>();

  // vendor 鉴权状态 (login/checkLogin 成功后由 inbound 流程更新)
  vendorAuthed = false;
  authcode: string;
  selfWxid: string;

  // 私有 logger prefix
  private readonly logPrefix: string;

  constructor(init: AccountContextInit) {
    this.accountId = init.accountId;
    this.config = init.config;
    this.apiClient = new WechatpadproApiClient(init.config);
    this.createdAt = Date.now();
    this.authcode = init.config.authcode;
    this.selfWxid = init.config.selfWxid;
    this.logPrefix = `[WPP:${this.accountId}]`;
  }

  // ============ 隔离 logger (4 件套) ============
  // 每条 log 自动带 accountId 字段 + [WPP:<id>] 前缀
  // → 多账号并发时 grep `accountId=` 即可过滤单账号流量

  info(msg: string, fields?: Fields): void {
    loggerInfo(`${this.logPrefix} ${msg}`, { accountId: this.accountId, ...(fields ?? {}) });
  }

  warn(msg: string, fields?: Fields): void {
    loggerWarn(`${this.logPrefix} ${msg}`, { accountId: this.accountId, ...(fields ?? {}) });
  }

  error(msg: string, err?: unknown): void {
    loggerError(`${this.logPrefix} ${msg}`, {
      accountId: this.accountId,
      err: err === undefined ? undefined : formatErr(err),
    });
  }

  debug(msg: string, fields?: Fields): void {
    loggerDebug(`${this.logPrefix} ${msg}`, { accountId: this.accountId, ...(fields ?? {}) });
  }

  // ============ 状态变更 (setter 都走 logger 留痕) ============

  /**
   * v1.1.15 HOT-RELOAD (2026-08-08 接总立方案 A): 运行时更新配置
   * readonly 只禁止换引用, 不禁止改字段 → Object.assign 原地更新
   * 所有持 this.config 引用的运行时读点 (allowFrom/groupPolicy/requireAtMention 等) 即刻生效
   * 注: apiClient 是构造时 new 的 (持旧 config 引用), 改 baseUrl/tokenKey 需重建 client 的场景
   *    (极少数) 暂不支持, 热重载主要覆盖运行时决策字段 (白名单/群策略/@要求/debounce)
   */
  updateConfig(patch: Partial<WppAccountConfig>): void {
    const changed: string[] = [];
    const target = this.config as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) {
      if (k === "authcode" || k === "selfWxid") continue; // 下面单独处理
      if (JSON.stringify(target[k]) !== JSON.stringify(v)) {
        changed.push(k);
      }
      target[k] = v;
    }
    // 同步鉴权字段 (构造时从 config 拷的独立字段)
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
    } else {
      this.debug(`config hot-reload no-op (无变化)`);
    }
  }

  setVendorAuth(selfWxid: string, authcode: string): void {
    this.vendorAuthed = true;
    this.selfWxid = selfWxid;
    this.authcode = authcode;
    this.info(`vendor auth updated`, { selfWxid });
  }

  attachWsClient(ws: WppWsClient): void {
    this.wsClient = ws;
    this.info(`ws client attached`);
  }

  attachWebhookServer(srv: WppWebhookServer): void {
    this.webhookServer = srv;
    this.info(`webhook server attached`, { port: this.config.webhookPort, path: this.config.webhookPath });
  }

  // v1.1.12 P1-1 (2026-08-08): periodic setWebhook retry timer 管理
  // 启动时 setWebhook 失败 → 后台每 5 分钟重试, 成功 clearInterval
  // shutdown 时统一 clear (防泄漏)
  setRetryTimer(timer: NodeJS.Timeout): void {
    this.retryTimers.add(timer);
  }
  clearRetryTimer(timer?: NodeJS.Timeout): void {
    if (timer) {
      this.retryTimers.delete(timer);
      clearInterval(timer);
    } else {
      // 清空所有 (shutdown 时调)
      for (const t of this.retryTimers) clearInterval(t);
      this.retryTimers.clear();
    }
  }

  // ============ 派生属性 ============

  get isConfigured(): boolean {
    return !!(this.config.enabled && this.config.tokenKey && this.config.apiBaseUrl);
  }

  get isEnabled(): boolean {
    return this.config.enabled === true;
  }

  get vendorBaseUrl(): string {
    return this.config.apiBaseUrl.replace(/\/$/, "");
  }

  // ============ 生命周期 ============

  /**
   * 优雅停止: 停 ws + webhook, 不抛 (单个失败不影响另一个)
   * registry.delete 由 AccountRegistry 在调用 stop 后负责 (G2)
   */
  async stop(): Promise<void> {
    // v1.1.12 P1-1: 先清所有 retry timer (避免 setInterval 仍在跳)
    if (this.retryTimers.size > 0) {
      this.clearRetryTimer();
      this.info(`cleared ${this.retryTimers.size} retry timer(s)`);
    }
    if (this.wsClient) {
      try {
        await this.wsClient.stop();
      } catch (e) {
        this.warn(`ws stop error: ${formatErr(e)}`);
      }
    }
    if (this.webhookServer) {
      try {
        await this.webhookServer.stop();
      } catch (e) {
        this.warn(`webhook stop error: ${formatErr(e)}`);
      }
    }
    this.info(`account context stopped`);
  }

  /**
   * 调试 dump: 不包含 tokenKey / authcode / webhookSecret (敏感字段)
   */
  toJSON(): Record<string, unknown> {
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
