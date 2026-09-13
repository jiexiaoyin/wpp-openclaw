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
import { safeFetch } from "./util/safe-fetch.js";
export const DEFAULT_JUDGE_ENDPOINTS = {
    deepseek: "https://api.deepseek.com",
    minimax: "https://api.minimaxi.com/anthropic",
};
/**
 * 解析三机制 judge 凭证 (环境变量链: DEEPSEEK_API_KEY 优先, MINIMAX_API_KEY 兜底)
 */
export function resolveJudgeCreds(overrides) {
    const deepseekKey = process.env.DEEPSEEK_API_KEY ?? "";
    const minimaxKey = process.env.MINIMAX_API_KEY ?? "";
    if (deepseekKey) {
        return {
            apiKey: deepseekKey,
            baseUrl: (overrides?.deepseekBaseUrl ?? DEFAULT_JUDGE_ENDPOINTS.deepseek).replace(/\/+$/, ""),
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
 * @returns 模型返回文本; 失败抛错
 */
export async function callJudge({ model, userPrompt, systemPrompt = null, maxTokens = 300, timeoutMs = 5000, creds, }) {
    if (!creds?.apiKey) {
        throw new Error("judge: no apiKey (DEEPSEEK_API_KEY / MINIMAX_API_KEY both missing)");
    }
    const { baseUrl, format } = creds;
    const noThink = creds.noThink ?? true; // v1.6.1: judge 默认关思考 (打分任务不需要思维链)
    let resp;
    if (format === "openai") {
        const messages = [];
        if (systemPrompt)
            messages.push({ role: "system", content: systemPrompt });
        messages.push({ role: "user", content: userPrompt });
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