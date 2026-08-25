// src/dispatch/intent-embed.ts - v1.3.2 embedding 快路径 (混用: embedding + LLM 兜底)
//
// 老板拍板混用: 群聊 @ 触发时, 非命令意图用 embedding 相似度快速定位相关候选 (ms 级),
// 命令类意图 (删/发/转/帮) embedding 判断不了 → LLM 兜底。
//
// embedding: 阿里 dashscope text-embedding-v4 (OpenAI 兼容)
//   POST https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings
//   Body {model, input: [texts]} / Header Authorization: Bearer <BAILIAN_EMBEDDING_API_KEY>

import { logObj as log, warn } from "../core/logger.js";
import { safeFetch } from "../util/safe-fetch.js"; // v1.3.27 P3-safe-fetch: 白名单化防 SSRF
import type { IntentCandidate } from "./intent-llm.js";

export interface EmbeddingOptions {
  apiKey: string; // BAILIAN_EMBEDDING_API_KEY
  baseUrl?: string; // default https://dashscope.aliyuncs.com/compatible-mode/v1
  model?: string; // default text-embedding-v4
  timeoutMs?: number; // default 5000
}

/**
 * 批量文本 → 向量 (dashscope /embeddings, OpenAI 兼容)。失败 → null (调用方降级)。
 * 返回与 input 顺序一致的向量数组。
 */
export async function embedTexts(
  texts: string[],
  opts: EmbeddingOptions,
): Promise<number[][] | null> {
  if (!texts.length) return [];
  if (!opts.apiKey) {
    warn("[WPP v1.3.2 EMBED] missing BAILIAN_EMBEDDING_API_KEY, skip embedding (fallback LLM)");
    return null;
  }
  const baseUrl = (opts.baseUrl ?? "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
  const model = opts.model ?? "text-embedding-v4";
  const timeoutMs = opts.timeoutMs ?? 5000;
  try {
    const resp = await safeFetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({ model, input: texts }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      warn(`[WPP v1.3.2 EMBED] HTTP ${resp.status}: ${err.slice(0, 200)}`);
      return null;
    }
    const json = (await resp.json()) as {
      data?: Array<{ embedding?: number[]; index?: number }>;
    };
    const data = json.data ?? [];
    if (data.length !== texts.length) {
      warn(`[WPP v1.3.2 EMBED] response count mismatch: got ${data.length}, want ${texts.length}`);
      return null;
    }
    // 按 index 排序保证顺序
    const sorted = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return sorted.map((d) => d.embedding ?? []);
  } catch (e) {
    warn(`[WPP v1.3.2 EMBED] failed (fallback LLM): ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** 余弦相似度 (纯函数) */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** 命令类意图 (embedding 判断不了) → 走 LLM */
export function isCommandIntent(text: string): boolean {
  return /删|撤回|发|转|帮|改|推送|群发|邀请|踢|移除|改名|建|拉|分享|转发|回复/i.test(String(text ?? ""));
}

// 候选向量缓存 (msgId → embedding), 消息不变则复用
// v1.3.63 P2-4 (2026-08-14 审阅): 加容量上限防无界增长 (~1024 维 float64 每条 8-16KB,
//   群活跃 2000 条/天 → 月 GB 级). Map 按插入序, 超上限删最旧.
const embedCache = new Map<string, number[]>();
const EMBED_CACHE_MAX = 2000;

/** 缓存一条候选的向量 (测试可清); 超上限删最旧条目 */
export function cacheEmbedding(msgId: string, vec: number[]): void {
  embedCache.set(msgId, vec);
  if (embedCache.size > EMBED_CACHE_MAX) {
    const oldest = embedCache.keys().next().value;
    if (oldest !== undefined) embedCache.delete(oldest);
  }
}

/** 读缓存向量 */
export function getCachedEmbedding(msgId: string): number[] | undefined {
  return embedCache.get(msgId);
}

/** 测试用: 清空向量缓存 */
export function clearEmbedCache(): void {
  embedCache.clear();
}

/**
 * 用 embedding 相似度选 top-N 相关候选 (返回 msgId 列表, 相似度 > threshold)。
 * 失败 (embedding null) → 返回 null (调用方降级 LLM)。
 */
export async function selectTopNByEmbedding(
  triggerText: string,
  candidates: IntentCandidate[],
  opts: EmbeddingOptions & { topN?: number; threshold?: number },
): Promise<string[] | null> {
  if (!candidates.length) return [];
  const topN = opts.topN ?? 5;
  const threshold = opts.threshold ?? 0.3;

  const toEmbed: string[] = [];
  const cachedVectors: Array<number[] | undefined> = candidates.map((c) => getCachedEmbedding(c.msgId));
  candidates.forEach((c, i) => {
    if (!cachedVectors[i]) toEmbed.push(c.text);
  });
  if (toEmbed.length > 0) {
    const vecs = await embedTexts(toEmbed, opts);
    if (vecs === null) return null;
    // 回填缓存
    let vi = 0;
    candidates.forEach((c, i) => {
      if (!cachedVectors[i]) {
        cachedVectors[i] = vecs[vi];
        if (cachedVectors[i]) cacheEmbedding(c.msgId, cachedVectors[i]!);
        vi++;
      }
    });
  }
  const candidateVecs = cachedVectors as number[][];
  if (candidateVecs.some((v) => !v?.length)) return null;

  const triggerVec = await embedTexts([triggerText], opts);
  if (!triggerVec?.[0]?.length) return null;

  // v1.3.3: 媒体候选 (文件/图片/语音/视频) 优先全部保留 — 用户发媒体+"看看"应都看到,
  //   embedding 纯相似度会把文件挤掉 (老板实测: 文档.pdf 没进上下文)
  const mediaIds = candidates
    .filter((c) => c.type === "file" || c.type === "image" || c.type === "voice" || c.type === "video")
    .map((c) => c.msgId);
  const nonMediaIdx = candidates.map((c, idx) => (c.type === "text" ? idx : -1)).filter((i) => i >= 0);
  const scored = nonMediaIdx.map((idx) => ({
    msgId: candidates[idx]!.msgId,
    score: cosineSimilarity(triggerVec![0]!, candidateVecs[idx]!),
  }));
  scored.sort((a, b) => b.score - a.score);
  const relevant = scored.filter((s) => s.score >= threshold).slice(0, Math.max(topN - mediaIds.length, 0)).map((s) => s.msgId);
  const all = [...mediaIds, ...relevant];
  log.debug(`[WPP v1.3.2 EMBED] selected ${all.length}/${candidates.length} (media=${mediaIds.length}, text=${relevant.length}, topN=${topN})`);
  return all;
}
