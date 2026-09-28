// src/monitor/metrics.ts - Prometheus counters (wechatpadpro_*)
// 范式仿 本项目/src/monitor/metrics.ts

const counters = new Map<string, number>();

/** v1.9.2: gauges (瞬时值, 如"当前是否 connected") —— 与 counters 分开存, 语义不同不可混 */
const gauges = new Map<string, number>();

/** Counter namespacing: wpp_messages_received_total etc. */
const ns = "wpp";

/** 增 1 (default) 或增 n */
export function incCounter(name: string, n = 1): void {
  const k = `${ns}_${name}`;
  counters.set(k, (counters.get(k) ?? 0) + n);
}

/**
 * v1.9.2: 预声明 counter (0 值)。
 * 为什么需要: 未自增过的指标不会出现在导出里 ⇒ 无法区分"值为 0"与"埋点没接上/进程没走到",
 * 而后者恰恰是观测系统最该报警的情形。预声明让零值序列从进程启动起就存在。
 */
export function declareCounter(name: string): void {
  const k = `${ns}_${name}`;
  if (!counters.has(k)) counters.set(k, 0);
}

/** 读 (测试/debug 用) */
export function getCounter(name: string): number {
  return counters.get(`${ns}_${name}`) ?? 0;
}

/** 重置 (测试/teardown 用) */
export function resetAllCounters(): void {
  counters.clear();
}

// ============ Gauge (v1.9.2) ============

/** 设 gauge 为绝对值 */
export function setGauge(name: string, value: number): void {
  gauges.set(`${ns}_${name}`, value);
}

/** 读 gauge (未设过 → 0) */
export function getGauge(name: string): number {
  return gauges.get(`${ns}_${name}`) ?? 0;
}

/** 重置 gauge (测试/teardown 用) */
export function resetAllGauges(): void {
  gauges.clear();
}

/** 输出 Prometheus 0.0.4 text format */
export function renderPrometheus(): string {
  // v1.9.2 修复 (2026-09-28): 原实现把已带 ns 前缀的键再拆一次 type 并重新拼 ns,
  //   产出双重前缀名 (wpp_wpp_...) 且用拼错的键回查 → **每个样本值恒为 0**。
  //   由于该函数此前零调用方、零测试, 缺陷从未暴露; 补 metrics 测试时第一次撞出。
  //   修法: counters 里存的键已经是完整指标名 (incCounter 写入时即加 ns),
  //   直接用原键读值, 只把 `_total` 后缀从 TYPE 行里去掉 (TYPE 行不放 _total)。
  const lines: string[] = [];
  for (const k of counters.keys()) {
    const base = k.replace(/_total$/, "");
    lines.push(`# TYPE ${base} counter`);
    lines.push(`${k} ${counters.get(k) ?? 0}`);
  }
  return lines.join("\n") + "\n";
}

/**
 * v1.9.2: 输出 JSON 快照 (只读观测端点用)。
 * 为什么不用 Prometheus 文本格式作为对外输出: 本插件没有 Prometheus 抓取端, 运维/排障时
 * 是 `curl 127.0.0.1:PORT/metrics | jq` 直接看 —— JSON 才能被 jq/脚本消费而不需要解析器。
 * 两个格式并存: renderPrometheus 保留给未来接入真 Prometheus 的场景。
 */
export function renderJson(): string {
  const toObj = (m: Map<string, number>): Record<string, number> => {
    const o: Record<string, number> = {};
    for (const [k, v] of m) o[k] = v;
    return o;
  };
  return JSON.stringify(
    {
      ts: new Date().toISOString(),
      counters: toObj(counters),
      gauges: toObj(gauges),
    },
    null,
    2,
  );
}

/** 在 webhook 入口统一打的预定义计数 helpers (v1.0.2: 11 counters) */
export const WebhookMetrics = {
  incReceived: () => incCounter("messages_received_total"),
  incRejectedPath: () => incCounter("messages_rejected_path_total"),
  incRejectedSecret: () => incCounter("messages_rejected_secret_total"),
  incRejectedDedupe: () => incCounter("messages_rejected_dedupe_total"),
  incRejectedPolicy: () => incCounter("messages_rejected_policy_total"),
  incRejectedBodySize: () => incCounter("messages_rejected_body_size_total"),
  incRejectedTimeout: () => incCounter("messages_rejected_timeout_total"),
  incRejectedSignature: () => incCounter("messages_rejected_signature_total"),
  incRejectedParse: () => incCounter("messages_rejected_parse_total"),
  incProcessed: () => incCounter("messages_processed_total"),
  incSavedDb: () => incCounter("messages_saved_db_total"),
  incEnrichFailed: () => incCounter("enrich_save_failed_total"),
  incHandlerOnError: () => incCounter("handler_onerror_total"),
  incDispatchDispatched: () => incCounter("dispatch_dispatch_total"),
};

// v1.1.12 P2-1 (2026-08-08): setWebhook tag metrics (autoSetWebhook 用)
// 监控: 启动时 setWebhook 成功/失败/重试/periodic retry
// 按结果分开: ok / fail / retry / periodic_ok / periodic_fail
export const SetWebhookMetrics = {
  // 启动时 3 次 backoff 内
  incSetWebhookOk: () => incCounter("setwebhook_ok_total"),
  incSetWebhookFail: () => incCounter("setwebhook_fail_total"),
  // 周期性 retry
  incPeriodicOk: () => incCounter("setwebhook_periodic_ok_total"),
  incPeriodicFail: () => incCounter("setwebhook_periodic_fail_total"),
  // 跳过原因
  incSkippedNoPublicUrl: () => incCounter("setwebhook_skipped_no_public_url_total"),
  incSkippedNoAuthcode: () => incCounter("setwebhook_skipped_no_authcode_total"),
  incSkippedDisabled: () => incCounter("setwebhook_skipped_disabled_total"),
};

// ============================================================================
// v1.9.2 (2026-09-28) 可观测性补强: ws / judge / 入站 三条关键路径
// ----------------------------------------------------------------------------
// 动因: 现有日志分布严重失衡 (info 106 / warn 122 / error 仅 5), 而 warn 密集区恰好就是
//   "ws 断连重连" 与 "judge 失败" —— 也就是最需要看趋势的两处。日志只有个案, 没有聚合量,
//   判断"最近是不是断得更频繁了"只能人工翻日志。
// 埋点原则: **只在关键路径的单点收敛处接**, 不逐函数埋。
//   - ws: ws-client 的 close 回调 + scheduleRetry (全仓唯一的 ws 生命周期实现)
//   - judge: llm-judge.callJudge (heartflow/jargon/affection/enrich 四机制的公共入口)
//   - 入站: inbound handler 的 handle() (ws 直推 + webhook 共 4 个调用点全部经此)
// ============================================================================

declareCounter("ws_disconnects_total");
declareCounter("ws_reconnects_total");
declareCounter("judge_calls_total");
declareCounter("judge_failures_total");
declareCounter("messages_in_total");

export const WsMetrics = {
  /** ws 连接关闭 (含 vendor idle 断连 / 网络抖动 / 主动 stop) */
  incDisconnect: () => incCounter("ws_disconnects_total"),
  /** 安排一次重连 (scheduleRetry 真正排期时才计; stop 之后的调用不计) */
  incReconnect: () => incCounter("ws_reconnects_total"),
  /**
   * 当前连接态 (gauge 1/0)。
   * 为什么 counter 之外还要 gauge: 断连/重连两个 counter 只给"发生过多少次", 回答不了
   * "此刻是不是断的" —— 而 health-monitor 重启账号正是按"当前是否 connected"判定的。
   */
  setConnected: (connected: boolean) => setGauge("ws_connected", connected ? 1 : 0),
};

export const JudgeMetrics = {
  /** callJudge 调用次数 (四机制公共入口) */
  incCall: () => incCounter("judge_calls_total"),
  /** callJudge 抛错次数 (无 apiKey / HTTP 非 2xx / 空正文 / 超时) */
  incFailure: () => incCounter("judge_failures_total"),
};

export const InboundMetrics = {
  /** 解析成功、进入流水线的入站消息条数 (计在去重之前, 故可能包含被去重丢弃的) */
  incMessagesIn: (n = 1) => incCounter("messages_in_total", n),
};
