const counters = new Map();
const ns = "wpp";
export function incCounter(name, n = 1) {
    const k = `${ns}_${name}`;
    counters.set(k, (counters.get(k) ?? 0) + n);
}
export function getCounter(name) {
    return counters.get(`${ns}_${name}`) ?? 0;
}
export function resetAllCounters() {
    counters.clear();
}
export function renderPrometheus() {
    const lines = [];
    const byType = new Map();
    for (const k of counters.keys()) {
        const [type, ...rest] = k.split("_");
        if (!type)
            continue;
        const restStr = rest.join("_");
        if (restStr === undefined)
            continue;
        const base = restStr.replace(/_total$/, "");
        if (!byType.has(type))
            byType.set(type, []);
        byType.get(type).push(base);
    }
    for (const [type, names] of byType) {
        for (const n of names) {
            lines.push(`# TYPE ${ns}_${type}_${n} counter`);
            lines.push(`${ns}_${type}_${n}_total ${counters.get(`${ns}_${type}_${n}_total`) ?? 0}`);
        }
    }
    return lines.join("\n") + "\n";
}
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
export const SetWebhookMetrics = {
    incSetWebhookOk: () => incCounter("setwebhook_ok_total"),
    incSetWebhookFail: () => incCounter("setwebhook_fail_total"),
    incPeriodicOk: () => incCounter("setwebhook_periodic_ok_total"),
    incPeriodicFail: () => incCounter("setwebhook_periodic_fail_total"),
    incSkippedNoPublicUrl: () => incCounter("setwebhook_skipped_no_public_url_total"),
    incSkippedNoAuthcode: () => incCounter("setwebhook_skipped_no_authcode_total"),
    incSkippedDisabled: () => incCounter("setwebhook_skipped_disabled_total"),
};
