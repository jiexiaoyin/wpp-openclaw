// src/dispatch/runtime-resolve.ts - dispatch 层的配置解析函数（从 dispatcher.ts 拆分）
// v1.5.5 审计修复: D4 dispatcher.ts 953行超标 → 拆分出 resolve 函数独立模块
// 包含: session key 构建 / account+agent 解析 / LLM/embedding 参数解析
// 原则: 纯函数，无 side-effect，便于独立测试
import { getDefaultAccountRegistry } from "../account-state.js";
import { buildSessionKey } from "../session-key.js";
// ── 通用: any→Record 两次强转（绕过 WppAccountConfig 无 index signature）────────
function cfg(msg) {
    const accountId = resolveAccountId(msg);
    const ctx = getDefaultAccountRegistry().get(accountId);
    return (ctx?.config ?? {});
}
function cfgDefault() {
    const ctx = getDefaultAccountRegistry().get("default");
    return (ctx?.config ?? {});
}
// ── account / agentId 解析 ────────────────────────────────
/** 从消息提取 accountId */
export function resolveAccountId(msg) {
    const m = msg;
    return m.accountId ?? "default";
}
/** 解析目标 session 的 agentId（不能硬编码"main"，防多账号串号） */
export function resolveAccountAgentId(msg) {
    const accountId = resolveAccountId(msg);
    const ctx = getDefaultAccountRegistry().get(accountId);
    if (ctx?.agentId)
        return ctx.agentId;
    return undefined; // 落到 framework schema default
}
// ── group context 开关 ─────────────────────────────────
export function resolveGroupContextEnabled(msg) {
    return cfg(msg).groupContextEnabled !== false;
}
// ── LLM intent 判断参数 ─────────────────────────────────
export function resolveLlmIntentEnabled(msg) {
    const val = cfg(msg).llmIntentEnabled;
    if (typeof val === "boolean")
        return val;
    return true; // schema default
}
export function resolveLlmModel(msg) {
    const val = cfg(msg).llmIntentModel;
    if (typeof val === "string" && val)
        return val;
    return "MiniMax-M2.7-highspeed"; // schema default
}
export function resolveLlmTimeoutMs(msg) {
    const val = cfg(msg).llmIntentTimeoutMs;
    if (typeof val === "number" && val > 0)
        return Math.min(val, 30000);
    return 8000; // schema default
}
export function resolveMinimaxApiKey() {
    const cfg0 = cfgDefault();
    return cfg0?.apiKey ?? "";
}
// ── embedding intent 参数 ────────────────────────────────
export function resolveEmbedIntentEnabled(msg) {
    return cfg(msg).embedIntentEnabled === true;
}
export function resolveEmbedTopN(msg) {
    const val = cfg(msg).embedIntentTopN;
    if (typeof val === "number" && val > 0)
        return Math.min(val, 20);
    return 5; // schema default
}
export function resolveEmbedThreshold(msg) {
    const val = cfg(msg).embedIntentThreshold;
    if (typeof val === "number")
        return Math.max(0, Math.min(val, 1));
    return 0.5; // schema default
}
export function resolveBailianEmbeddingKey(_msg) {
    return process.env.BAILIAN_EMBEDDING_API_KEY ?? "";
}
export function resolveEmbeddingBaseUrl(_msg) {
    return process.env.EMBEDDING_BASE_URL ?? "https://agent.minimaxi.com";
}
export function resolveEmbeddingModel(_msg) {
    return process.env.EMBEDDING_MODEL ?? "bge-m3";
}
export function resolveGroupWindow(_msg) {
    return 10; // GROUP_CONTEXT_WINDOW default
}
// ── session key 构建 ───────────────────────────────────
export function buildSessionKeyForMsg(msg) {
    const m = msg;
    const accountId = m.accountId ?? "default";
    const payload = m.payload ?? {};
    const from = m.from ?? {};
    const chatId = payload.chatId ??
        from.user ??
        m.fromWxid ?? // 兼容旧字段
        "";
    return buildSessionKey({ accountId, chatId });
}
//# sourceMappingURL=runtime-resolve.js.map