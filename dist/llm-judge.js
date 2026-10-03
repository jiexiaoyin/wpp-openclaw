// llm-judge.ts — 三机制 (heartflow/jargon/affection/enrich) 统一 LLM judge 调用器
// v1.6.0 2026-09-02: 支持双格式
//   - format "openai"  : DeepSeek / 任意 OpenAI 兼容端点  (Authorization: Bearer)
//   - format "anthropic": MiniMax / Anthropic 兼容端点      (x-api-key + anthropic-version)
// 优先 DeepSeek (DEEPSEEK_API_KEY)，MiniMax (MINIMAX_API_KEY) 兜底 —— 与 /root/dev/wpp-hermes 对齐
// v1.6.1 2026-09-13: judge 关思考 (默认) + 空正文显式报错
//   - deepseek-flash 是推理模型, reasoning_content 与 content **共享** max_tokens 预算;
//     judge 只要打分, 实测不关时 300 tokens 被思考吃光 → content="" (且掷骰子: 时而正常时而空)
//   - 关思考参数只有 thinking:{type:"disabled"} 有效; enable_thinking:false 服务端不认 (实测)
//     同 src/dispatch/intent-llm.ts 既有写法
//   - 空正文/被截断 → throw 带 finish_reason + reasoning_tokens, 替代原先静默返回 ""
// v1.12.0 2026-10-03: judge 主端点可经 env 覆盖 (老板拍板切阿里云 token-plan MaaS 的 qwen3.8-flash;
//   该端点与 DeepSeek 同走 openai 格式 ⇒ 仍复用这条凭证链, 只换 baseUrl + 账号文件里的 model 名)
//   - env: DEEPSEEK_BASE_URL (常量 JUDGE_BASE_URL_ENV 从 safe-fetch 导入, 那边同时把它解析进 SSRF 白名单)
//   - 未设 → 默认 api.deepseek.com, 行为与 v1.11.0 完全一致
// v1.13.0 2026-10-03: 判分层二级端点 (老板拍板「保留 deepseek 作兜底」) —— 主端点**任何**抛错后,
//   自动换 DEEPSEEK 那一套 (JUDGE_FALLBACK_*) 重试一次; 兜底被用到时 WARNING 出声。
//   - 兜底在 **callJudge 内部**按 env 解析: heartflow/affection/jargon 各自 new 一个 JudgeCreds 对象
//     (heartflow.ts 的 creds 字面量里 format 兜底是 "anthropic"), 从 resolveJudgeCreds 里带新字段
//     会被它们丢掉 ⇒ 只有解析在这一层, 三条机制才能零改动同时拿到。
//   - 只兜"端点故障", **不兜"分数不好"**: callJudgeInner 的每一处 throw 都是端点级
//     (无 key / HTTP 非 2xx / 空正文 / 网络 / 超时 / JSON 解析), 没有一处因判分结果而抛 ⇒
//     "任何 throw 就重试" 恰好等于"只兜端点故障"。**判分好坏永远不触发重试** (否则会变成刷分)。
//   - 三项 env 必须**同时**给全 (baseUrl + key + model): 模型名不许硬编码 (v1.4.0「消除 hardcode」),
//     半配一律不启用且在启动时 WARNING —— 免得再造一个"配了却永远不生效"的开关。
import { safeFetch, JUDGE_BASE_URL_ENV, JUDGE_FALLBACK_BASE_URL_ENV } from "./util/safe-fetch.js";
import { JudgeMetrics } from "./monitor/metrics.js";
import { warn } from "./core/logger.js";
/** v1.13.0: 兜底端点的三个 env (缺一个都不算启用, 见 resolveJudgeFallback) */
export const JUDGE_FALLBACK_VARS = {
    baseUrl: JUDGE_FALLBACK_BASE_URL_ENV,
    apiKey: "JUDGE_FALLBACK_API_KEY",
    model: "JUDGE_FALLBACK_MODEL",
};
/**
 * v1.13.0: 解析兜底端点 (每调用一次读一次 env, **不缓存** —— 缓存会让测试之间互相污染,
 * 而这条链一次调用只多三次 process.env 读, 相对一次网络调用可忽略)。
 *
 * ⚠️ 格式恒为 "openai": 兜底点的既定用途就是 DeepSeek 系 (老板原话「保留 deepseek 作兜底」),
 *    与主端点同协议。若把兜底指到一个 anthropic 兼容端点, 它会以 openai 请求体打过去并被
 *    判为非 2xx ⇒ 走"两段都失败"的合并报错 (响, 不静默), 属可接受的失败面。
 * ⚠️ 尾斜杠归一化与 resolveJudgeBaseUrl 同款 (否则拼出 `//chat/completions`)。
 */
export function resolveJudgeFallback() {
    const baseUrl = (process.env[JUDGE_FALLBACK_VARS.baseUrl] ?? "").trim();
    const apiKey = (process.env[JUDGE_FALLBACK_VARS.apiKey] ?? "").trim();
    const model = (process.env[JUDGE_FALLBACK_VARS.model] ?? "").trim();
    const missing = [];
    if (!baseUrl)
        missing.push(JUDGE_FALLBACK_VARS.baseUrl);
    if (!apiKey)
        missing.push(JUDGE_FALLBACK_VARS.apiKey);
    if (!model)
        missing.push(JUDGE_FALLBACK_VARS.model);
    if (missing.length === 0) {
        return { kind: "on", creds: { apiKey, baseUrl: baseUrl.replace(/\/+$/, ""), format: "openai" }, model };
    }
    // 三项全缺 = 压根没配 (正常); 缺一两项 = 半配 (必须出声)
    return missing.length === 3 ? { kind: "off" } : { kind: "partial", missing };
}
/**
 * v1.13.0: 一行兜底自述 (启动日志 / 端点半配告警用) —— 复用 describeJudgeEndpoint (同样绝不含 key)。
 */
export function describeJudgeFallback(state = resolveJudgeFallback()) {
    if (state.kind === "off")
        return "none";
    if (state.kind === "partial")
        return `MISCONFIGURED (缺 ${state.missing.join(", ")})`;
    return `${describeJudgeEndpoint(state.creds)} model=${state.model}`;
}
/**
 * v1.9.2 观测包装: callJudge 是 heartflow/jargon/affection/enrich 四机制的公共调用入口,
 * 在这里计"调用/失败"最省埋点且不会漏 — 各机制自己 catch 掉的错误也已被计入。
 *
 * v1.13.0: 主端点抛错后**重试一次**兜底端点 (env 三项齐时)。兜底未配/半配 ⇒ 行为与 v1.12.0
 * 逐字一致 (原异常原样抛出, 只多一次 env 读)。
 *
 * ⚠️ 指标语义变化 (v1.13.0, 已在 CHANGELOG 记明): `judge_failures_total` 从"callJudge 抛错次数"
 *    收紧为"**最终**失败次数" —— 主端点挂了但兜底救回来的那次不再计失败 (它没失败), 改由
 *    `judge_fallback_total` / `judge_fallback_ok_total` 出声。兜底没配时两者完全同值。
 */
export async function callJudge(params) {
    JudgeMetrics.incCall();
    let primaryErr;
    try {
        return await callJudgeInner(params);
    }
    catch (e) {
        primaryErr = e;
    }
    const fb = resolveJudgeFallback();
    if (fb.kind !== "on") {
        JudgeMetrics.incFailure();
        throw primaryErr;
    }
    JudgeMetrics.incFallback();
    // 兜底被用到 = 主端点此刻是坏的, 这是运维必须看见的事 ⇒ WARNING (journald 只采 WARNING+)
    warn(`[WPP JUDGE] 主端点失败, 转兜底端点重试: ${describeJudgeEndpoint(params.creds)} → ${describeJudgeFallback(fb)}`, primaryErr);
    try {
        const out = await callJudgeInner({ ...params, model: fb.model, creds: fb.creds });
        JudgeMetrics.incFallbackOk();
        return out;
    }
    catch (fallbackErr) {
        JudgeMetrics.incFailure();
        // 两段都失败: 报错必须同时点名两个端点 —— 否则现场只看到"心流不回复", 分不清是端点 A 死了
        // 还是兜底 B 也死了 (describeJudgeEndpoint 只出 host/路径, 不含 key)。
        // ⚠️ 只取 message 不取 formatErr: 这条会经 heartflow 的 warn 落进 journald (one line), 带堆栈会糊成一片。
        throw new Error(`judge: 主端点与兜底端点均失败` +
            ` | primary(${describeJudgeEndpoint(params.creds)}) = ${errText(primaryErr)}` +
            ` | fallback(${describeJudgeFallback(fb)}) = ${errText(fallbackErr)}`);
    }
}
/** 取错误的单行文本 (兜底重试的合并报错用; 堆栈由 WARNING 那条 message 承载) */
function errText(e) {
    return e instanceof Error ? e.message : String(e);
}
export const DEFAULT_JUDGE_ENDPOINTS = {
    deepseek: "https://api.deepseek.com",
    minimax: "https://api.minimaxi.com/anthropic",
};
/**
 * v1.12.0 (2026-10-03): judge 主端点 baseUrl 的来源链 — 调用方显式覆盖 > env `DEEPSEEK_BASE_URL`
 * > DEFAULT_JUDGE_ENDPOINTS.deepseek (默认 api.deepseek.com)。
 *
 * ⚠️ env 名取自 src/util/safe-fetch.ts 的 JUDGE_BASE_URL_ENV, **同一个常量**: 那边把它的 host
 *   解析进 SSRF 白名单。只改 baseUrl 而不在白名单里 ⇒ 每条 judge 调用都抛
 *   `host not in whitelist`, 而 heartflow 把 judge 异常吞成"不回复" ⇒ 心流静默停摆。
 *   共用常量就是为了让这两种"换端点"结构性不可能只做一半。
 * 空串按"没设"处理 (与旧代码 `?? DEFAULT` 的直觉一致 —— 空 baseUrl 只会拼出坏 URL)。
 */
export function resolveJudgeBaseUrl(override) {
    const fromEnv = (process.env[JUDGE_BASE_URL_ENV] ?? "").trim();
    return (override || fromEnv || DEFAULT_JUDGE_ENDPOINTS.deepseek).replace(/\/+$/, "");
}
/**
 * v1.12.0: 一行端点自述 (启动日志用) —— 只含 format / host / 路径 / key 有无, **绝不含 key 本身**。
 * 换端点的现场核靠它: 端点拼错、env 没生效、key 没读到, 这三种失败在第一眼就能分开
 * (否则唯一直观信号是"心流不回复了", 与 v1.6.1 那次静默瘫 3 天同族)。
 */
export function describeJudgeEndpoint(creds) {
    const keyState = creds.apiKey ? "set" : "MISSING";
    try {
        const u = new URL(creds.baseUrl);
        return `${creds.format} ${u.origin}${u.pathname.replace(/\/+$/, "")} key=${keyState}`;
    }
    catch {
        return `${creds.format} ${creds.baseUrl} (非法 baseUrl!) key=${keyState}`;
    }
}
/**
 * 解析三机制 judge 凭证 (环境变量链: DEEPSEEK_API_KEY 优先, MINIMAX_API_KEY 兜底)
 */
export function resolveJudgeCreds(overrides) {
    const deepseekKey = process.env.DEEPSEEK_API_KEY ?? "";
    const minimaxKey = process.env.MINIMAX_API_KEY ?? "";
    if (deepseekKey) {
        return {
            apiKey: deepseekKey,
            baseUrl: resolveJudgeBaseUrl(overrides?.deepseekBaseUrl),
            format: "openai",
        };
    }
    return {
        apiKey: minimaxKey,
        baseUrl: (overrides?.minimaxBaseUrl ?? DEFAULT_JUDGE_ENDPOINTS.minimax).replace(/\/+$/, ""),
        format: "anthropic",
    };
}
/**
 * 统一 judge 调用
 * @param p
 * @param p.model 模型名 (cfg.model)
 * @param p.userPrompt 用户提示词
 * @param p.systemPrompt 可选系统提示词 (anthropic 走 system, openai 走 system message)
 * @param p.maxTokens
 * @param p.timeoutMs
 * @param p.creds resolveJudgeCreds() 产出
 * @param p.images v1.11.0: 可选图片 URL 列表 (仅 openai 格式生效)
 * @returns 模型返回文本; 失败抛错
 */
async function callJudgeInner({ model, userPrompt, systemPrompt = null, maxTokens = 300, timeoutMs = 5000, creds, images, }) {
    if (!creds?.apiKey) {
        throw new Error("judge: no apiKey (DEEPSEEK_API_KEY / MINIMAX_API_KEY both missing)");
    }
    const { baseUrl, format } = creds;
    const noThink = creds.noThink ?? true; // v1.6.1: judge 默认关思考 (打分任务不需要思维链)
    let resp;
    if (format === "openai") {
        // v1.11.0 看图: 有图时 user content 变内容块数组 (OpenAI 兼容多模态格式), 无图时保持纯字符串
        // —— 纯文本路径的请求体逐字节不变, 老行为零回归。
        const imgs = (images ?? []).filter((u) => typeof u === "string" && /^(https?:\/\/|data:image\/)/i.test(u));
        const messages = [];
        if (systemPrompt)
            messages.push({ role: "system", content: systemPrompt });
        messages.push({
            role: "user",
            content: imgs.length
                ? [{ type: "text", text: userPrompt }, ...imgs.map((url) => ({ type: "image_url", image_url: { url } }))]
                : userPrompt,
        });
        resp = await safeFetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${creds.apiKey}`,
            },
            body: JSON.stringify({
                model,
                max_tokens: maxTokens,
                temperature: 0,
                // v1.6.1: 关思考 —— V4.1-Flash 等推理模型的思考与正文共享 max_tokens,
                // 不关则 300 tokens 全被 reasoning_content 吃光 → content="" (见文件头)
                ...(noThink ? { thinking: { type: "disabled" } } : {}),
                messages,
            }),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!resp.ok) {
            const err = await resp.text().catch(() => "");
            throw new Error(`HTTP ${resp.status}: ${err.slice(0, 120)}`);
        }
        const json = (await resp.json());
        const choice = json.choices?.[0];
        const content = choice?.message?.content ?? "";
        // v1.6.1: 空正文=必须显式报错. 原先返回 "" → 调用方只看到 "unparseable: " (冒号后空白),
        // 2026-09-11 那次事故就是这样静默瘫了 3 天没人发现.
        if (!content) {
            const rt = json.usage?.completion_tokens_details?.reasoning_tokens;
            const reason = choice?.finish_reason;
            throw new Error(`empty content (finish_reason=${reason ?? "?"}` +
                `${rt != null ? `, reasoning_tokens=${rt}` : ""})` +
                (reason === "length"
                    ? " — 输出被 max_tokens 截断, 思考未关? 见 JudgeCreds.noThink"
                    : ""));
        }
        return content;
    }
    // anthropic
    resp = await safeFetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "anthropic-version": "2023-06-01",
            "x-api-key": creds.apiKey,
        },
        body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            temperature: 0,
            // v1.6.1: 同 openai 分支 —— 关思考 (MiniMax anthropic 兼容端点, 未实测; 若该端点不认此参数
            // 会走 !resp.ok 报错而不是静默返回空正文, 属可接受的失败面)
            ...(noThink ? { thinking: { type: "disabled" } } : {}),
            ...(systemPrompt ? { system: systemPrompt } : {}),
            messages: [{ role: "user", content: userPrompt }],
        }),
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
        const err = await resp.text().catch(() => "");
        throw new Error(`HTTP ${resp.status}: ${err.slice(0, 120)}`);
    }
    const json = (await resp.json());
    const text = json.content?.find((b) => b.type === "text")?.text ?? "";
    // v1.6.1: 同 openai 分支, 空正文显式报错
    if (!text) {
        throw new Error(`empty content (stop_reason=${json.stop_reason ?? "?"})` +
            (json.stop_reason === "max_tokens"
                ? " — 输出被 max_tokens 截断, 思考未关? 见 JudgeCreds.noThink"
                : ""));
    }
    return text;
}
//# sourceMappingURL=llm-judge.js.map