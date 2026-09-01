// llm-judge.ts — 三机制 (heartflow/jargon/affection/enrich) 统一 LLM judge 调用器
// v1.6.0 2026-09-02: 支持双格式
//   - format "openai"  : DeepSeek / 任意 OpenAI 兼容端点  (Authorization: Bearer)
//   - format "anthropic": MiniMax / Anthropic 兼容端点      (x-api-key + anthropic-version)
// 优先 DeepSeek (DEEPSEEK_API_KEY)，MiniMax (MINIMAX_API_KEY) 兜底 —— 与 /root/dev/wpp-hermes 对齐
import { safeFetch } from "./util/safe-fetch.js";

export const DEFAULT_JUDGE_ENDPOINTS = {
  deepseek: "https://api.deepseek.com",
  minimax: "https://api.minimaxi.com/anthropic",
};

export interface JudgeCreds {
  apiKey: string;
  baseUrl: string;
  format: "openai" | "anthropic";
}

/**
 * 解析三机制 judge 凭证 (环境变量链: DEEPSEEK_API_KEY 优先, MINIMAX_API_KEY 兜底)
 */
export function resolveJudgeCreds(overrides?: {
  deepseekBaseUrl?: string;
  minimaxBaseUrl?: string;
}): JudgeCreds {
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
export async function callJudge({
  model,
  userPrompt,
  systemPrompt = null,
  maxTokens = 300,
  timeoutMs = 5000,
  creds,
}: {
  model: string;
  userPrompt: string;
  systemPrompt?: string | null;
  maxTokens?: number;
  timeoutMs?: number;
  creds: JudgeCreds;
}): Promise<string> {
  if (!creds?.apiKey) {
    throw new Error("judge: no apiKey (DEEPSEEK_API_KEY / MINIMAX_API_KEY both missing)");
  }
  const { baseUrl, format } = creds;
  let resp: Response;
  if (format === "openai") {
    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
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
        messages,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      throw new Error(`HTTP ${resp.status}: ${err.slice(0, 120)}`);
    }
    const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content ?? "";
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
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [{ role: "user", content: userPrompt }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status}: ${err.slice(0, 120)}`);
  }
  const json = (await resp.json()) as { content?: Array<{ type?: string; text?: string }> };
  return json.content?.find((b) => b.type === "text")?.text ?? "";
}
