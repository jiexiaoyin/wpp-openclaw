// src/monitor/metrics.ts - Prometheus counters (wechatpadpro_*)
// 范式仿 本项目/src/monitor/metrics.ts

const counters = new Map<string, number>();

/** Counter namespacing: wpp_messages_received_total etc. */
const ns = "wpp";

/** 增 1 (default) 或增 n */
export function incCounter(name: string, n = 1): void {
  const k = `${ns}_${name}`;
  counters.set(k, (counters.get(k) ?? 0) + n);
}

/** 读 (测试/debug 用) */
export function getCounter(name: string): number {
  return counters.get(`${ns}_${name}`) ?? 0;
}

/** 重置 (测试/teardown 用) */
export function resetAllCounters(): void {
  counters.clear();
}

/** 输出 Prometheus 0.0.4 text format */
export function renderPrometheus(): string {
  const lines: string[] = [];
  const byType = new Map<string, string[]>();
  for (const k of counters.keys()) {
    const [type, ...rest] = k.split("_");
    if (!type) continue;
    const restStr = rest.join("_");
    if (restStr === undefined) continue;
    const base = restStr.replace(/_total$/, "");
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type)!.push(base);
  }
  for (const [type, names] of byType) {
    for (const n of names) {
      lines.push(`# TYPE ${ns}_${type}_${n} counter`);
      lines.push(`${ns}_${type}_${n}_total ${counters.get(`${ns}_${type}_${n}_total`) ?? 0}`);
    }
  }
  return lines.join("\n") + "\n";
}

/** 在 webhook 入口统一打的预定义计数 helpers (v1.0.2: 11 counters) */
export const WebhookMetrics = {
  incReceived: () => incCounter("messages_received_total"),
  incRejectedPath: () => incCounter("messages_rejected_path_total"),
  incRejectedSecret: () => incCounter("messages_rejected_secret_total"),
  incRejectedDedupe: () => incCounter("messages_rejected_dedupe_total"),
  incRejectedPolicy: () => incCounter("messages_rejected_policy_total"),
  // v1.0.2 新增 (FIX-3: webhook-receiver.ts port metrics)
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
