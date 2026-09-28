// ws-client.ts - WebSocket 客户端 (接 wechatpadpro /ws/sync)
// vendor 推送实时消息 (替代 webhook 模式可选)
//
//   然后 raw → caller 提供的 onInboundMessage handler (统一解析, P0-3).
//   修复 PoC stub: 原实现只 log debug (vendor 推真消息完全不处理).
//
// 关键设计:
import WebSocket from "ws";
import { logObj as log, formatErr } from "./core/logger.js";
import { getSynckey, saveSynckey } from "./db.js";
import { parseJsonText } from "./api/client.js";
import { WsMetrics } from "./monitor/metrics.js";
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
    // 连续 5 次 ws 502 (vendor 推送调度异常) → 切长退避 5min, 避免疯狂重连 vendor
    // 重连成功后重置计数
    consecutive502 = 0;
    static CONSECUTIVE_502_THRESHOLD = 5;
    static LONG_BACKOFF_MS = 300_000; // 5 min
    lastBackoffReason = null;
    /** v1.1.11: pending SyncMessage 锁, 防 ws 推送风暴时多次并发拉消息 */
    syncInFlight = false;
    /** v1.1.11: 兜底定时 SyncMessage (vendor WS 漏推/重启场景). 默认 60s */
    fallbackTimer = null;
    fallbackSyncMs;
    /** v1.9.3-fix: 长连接心跳定时器 (调 /Login/HeartBeatLong 保活, 防 vendor idle 超时断连) */
    heartbeatTimer = null;
    heartbeatMs;
    constructor(wsUrl, authcode, opts) {
        this.wsUrl = wsUrl;
        this.authcode = authcode;
        this.opts = opts;
        this.fallbackSyncMs = opts.fallbackSyncMs ?? 60_000;
        this.heartbeatMs = opts.heartbeatMs ?? 60_000;
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
        if (this.heartbeatMs > 0) {
            this.heartbeatTimer = setInterval(() => {
                void this.sendHeartbeat();
            }, this.heartbeatMs);
            this.heartbeatTimer.unref?.();
        }
    }
    async stop() {
        this.stopped = true;
        if (this.fallbackTimer) {
            clearInterval(this.fallbackTimer);
            this.fallbackTimer = null;
        }
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
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
        WsMetrics.setConnected(false); // v1.9.2 观测: 主动 stop 也归零, 防 gauge 卡在 1
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
            WsMetrics.setConnected(true); // v1.9.2 观测: 当前连接态 gauge
            this.retryDelay = this.opts.wsReconnect?.initialDelayMs ?? 1_000;
            if (this.consecutive502 > 0) {
                log.info(`ws reset 502 counter: prev=${this.consecutive502} (vendor recovered)`);
            }
            this.consecutive502 = 0;
            log.info("ws connected");
            void this.triggerSync("ws-open");
            // v1.9.3-fix: 开启 vendor 自动心跳 (防 idle 超时断连), 与周期 HeartBeatLong 双保险。
            //   每次重连都重新开启 (新 ws 会话需要重新告知 vendor)。
            void this.opts.apiClient.call("/Login/AutoHeartBeat", {}).catch((e) => {
                log.warn(`ws auto-heartbeat enable failed: ${formatErr(e)}`);
            });
        });
        // 注: void 箭头 + async IIFE (而非 ws.on("message", async () => {...}))。
        //   本回调内目前无 await, 但解析失败要用 try/catch, 且后续加 await 的可能性高
        //   (例如把 triggerSync 改成 await) —— 保持 void 返回签名, 避免将来引入
        //   "隐式丢弃 Promise" 的路径。
        this.ws.on("message", (data) => {
            void (async () => {
                try {
                    const text = data.toString();
                    // v1.3.18 F6 fix: 用 parseJsonText 预引号化 16+ 位大整数 (vendor 推送 new_msg_id 防丢精度)
                    const json = parseJsonText(text);
                    const dataField = json["Data"];
                    const type = dataField?.["type"];
                    // 握手帧: {"Code":0,"Success":true,"Message":"实时消息通道已就绪","Data":{"timestamp":...,"type":"connection_ready"}}
                    //         跳过 — 不是真消息推送
                    if (type === "connection_ready") {
                        // 与 "ws connected" 重复, 降 debug
                        log.debug("ws recv: connection_ready (handshake ack)");
                        return;
                    }
                    // 其他帧 (有 newMsgId / Wxid / MessageType 等) → 触发 SyncMessage 拉取
                    // 即使 type 未知也走 (vendor 推送类型可能在加新事件)
                    log.debug(`ws recv: trigger sync (kind=${String(type ?? "unknown")})`);
                    void this.triggerSync("ws-push");
                }
                catch (e) {
                    log.warn(`ws message parse error: ${formatErr(e)}`);
                }
            })();
        });
        this.ws.on("pong", () => {
            // vendor 对 ws.ping() 的 RFC6455 响应; 仅 debug, 用于确认 vendor 是否回 pong
            log.debug("ws recv: pong (keepalive ack)");
        });
        this.ws.on("close", (code, reason) => {
            this.connected = false;
            WsMetrics.setConnected(false); // v1.9.2 观测: 当前连接态 gauge
            WsMetrics.incDisconnect(); // v1.9.2 观测: 断连计数 (与下方 warn 同一事件)
            log.warn(`ws closed: code=${code} reason=${reason.toString() || "<none>"}`);
            if (!this.stopped)
                this.scheduleRetry();
        });
        this.ws.on("error", (err) => {
            log.error(`ws error: ${err.message}`);
            // Unexpected server response: 502 是 vendor 推送调度异常的信号
            if (/502|503|504/.test(err.message)) {
                this.consecutive502 += 1;
                if (this.consecutive502 >= WechatpadproWsClient.CONSECUTIVE_502_THRESHOLD) {
                    this.lastBackoffReason = `502 x ${this.consecutive502}`;
                    log.warn(`ws smart backoff triggered: ${this.consecutive502} consecutive vendor 5xx, next retry in ${WechatpadproWsClient.LONG_BACKOFF_MS}ms (5min)`);
                    // 跳到下一个退避轮, 重试 delay 被 override 成 LONG_BACKOFF_MS
                    this.retryDelay = WechatpadproWsClient.LONG_BACKOFF_MS;
                }
            }
            // close handler will be called next
        });
    }
    /**
     * v1.1.11 P0-N1: SyncMessage 拉真实消息, 喂给 caller 提供的 onInboundMessage.
     * 并发安全: syncInFlight 锁, 防 ws 推送风暴/兜底定时器/connection-open 三种 trigger 同时拉.
     */
    async triggerSync(reason) {
        if (this.stopped)
            return;
        if (this.syncInFlight) {
            log.debug(`ws sync skipped (in-flight): reason=${reason}`);
            return;
        }
        this.syncInFlight = true;
        try {
            //   根因: Synckey:"" 每次全量拉取 → 重启后重放风暴 (19:56 一次 1458 条) →
            //     dedup 每条独立 DB 查询 → 事件循环阻塞 → 网关卡顿
            //   修复: 读上次保存的 KeyBuf.buffer 增量拉取; Sync 后保存新 KeyBuf
            const prevSynckey = await getSynckey(this.opts.accountId);
            const sync = await this.opts.apiClient.call("/Msg/Sync", { Scene: 0, Synckey: prevSynckey ?? "" });
            const newKey = sync?.Data?.KeyBuf?.buffer;
            const list = sync?.Data?.CmdList?.List ?? [];
            const count = list.length;
            // ws 轮询/推送每次都会到, 有消息也会由下游 enrich/dispatch 落日志 → 一律 debug
            log.debug(`ws sync pulled ${count} message(s): reason=${reason} synckey=${prevSynckey ? "incremental" : "full"}`);
            // P1 (2026-08-23): 先 enqueue 消息, 再保存 synckey —
            //   之前先 saveSynckey 再处理, 崩溃 (SIGKILL/OOM) 窗口内消息未落库但游标已前进 → 永久丢失。
            //   DB 唯一键幂等 (wpp_messages UNIQUE), 重拉安全 (at-least-once)。
            for (const raw of list) {
                try {
                    // P0-3 (2026-08-23): 不再用 payloadToInboundMessage 预解析 —
                    //   它不认 v1 schema (Data.messages[]), v1 消息返回 null 被静默丢弃。
                    //   直接把原始 raw 交给 caller, 由 handler 的统一解析器 (payloadToAllInboundMessages)
                    //   处理 v1 / 旧格式 / 单条兜底。
                    await this.opts.onInboundMessage(raw);
                }
                catch (e) {
                    log.warn(`ws sync inbound dispatch failed: ${formatErr(e)}`);
                }
            }
            // P1: 消息全部 enqueue 后再保存 synckey (游标前进) — 崩溃窗口不丢消息
            if (newKey) {
                await saveSynckey(this.opts.accountId, newKey);
            }
            else {
                log.debug(`ws sync: no KeyBuf returned (reason=${reason})`);
            }
        }
        catch (e) {
            log.warn(`ws sync /Msg/Sync failed: ${formatErr(e)}`);
        }
        finally {
            this.syncInFlight = false;
        }
    }
    /**
     * v1.9.3-fix: 长连接心跳 (调 /Login/HeartBeatLong 保活 ws)。
     * 根因: ws 层无 ping/pong 保活 → vendor /ws/sync idle timeout (~10min) 主动断开 →
     *       openclaw health-monitor 判 disconnected → 每 10min 重启账号 (连累心流 sweep 被打断)。
     * 只在 ws connected 时发; 失败仅 warn, 断连重连由 close/error handler 负责。
     */
    async sendHeartbeat() {
        if (this.stopped || !this.connected || !this.ws)
            return;
        // v1.9.3-fix(2): 用 ws 层原生 ping 帧保活。
        //   根因修正: 之前只调 HTTP /Login/HeartBeatLong 保活, 但 vendor idle timeout 挂在
        //   vendor 的 /ws/sync 长连接本身 (ws 层 traffic), HTTP 调用不产生 ws 流量 → 仍每 10min
        //   被 code=1005 断连。ping 帧才是 ws 层的真流量, 能重置 idle 计时。
        try {
            this.ws.ping();
        }
        catch (e) {
            log.warn(`ws ping failed: ${formatErr(e)}`);
        }
        // 双保险: 保留 vendor HTTP 心跳 (AutoHeartBeat 已在 open 开启, 这里周期调 HeartBeatLong)
        try {
            const r = await this.opts.apiClient.call("/Login/HeartBeatLong", {});
            if (r.Code !== 0) {
                log.warn(`ws heartbeat: /Login/HeartBeatLong non-zero Code=${r.Code} CodeValue=${r.CodeValue ?? "?"}`);
            }
        }
        catch (e) {
            log.warn(`ws heartbeat failed: ${formatErr(e)}`);
        }
    }
    scheduleRetry() {
        if (this.stopped)
            return;
        WsMetrics.incReconnect(); // v1.9.2 观测: 重连排期计数 (stop 后的调用不算, 故置于 guard 之后)
        // P1 (2026-08-23): 长退避 (LONG_BACKOFF_MS) 不被 maxRetryDelay 截断 —
        //   之前 Math.min 把 5 分钟长退避压到 30s, 智能退避从未生效。
        const delay = this.retryDelay >= WechatpadproWsClient.LONG_BACKOFF_MS
            ? this.retryDelay
            : Math.min(this.retryDelay, this.maxRetryDelay);
        log.info(`ws reconnect in ${delay}ms${this.lastBackoffReason ? ` (smart backoff: ${this.lastBackoffReason})` : ""}`);
        setTimeout(() => this.connect(), delay);
        this.retryDelay = Math.min(this.retryDelay * this.retryMultiplier, this.maxRetryDelay);
        this.lastBackoffReason = null;
    }
}
//# sourceMappingURL=ws-client.js.map