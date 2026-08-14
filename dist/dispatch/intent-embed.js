import { logObj as log, warn } from "../core/logger.js";
import { safeFetch } from "../util/safe-fetch.js";
export async function embedTexts(texts, opts) {
    if (!texts.length)
        return [];
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
        const json = (await resp.json());
        const data = json.data ?? [];
        if (data.length !== texts.length) {
            warn(`[WPP v1.3.2 EMBED] response count mismatch: got ${data.length}, want ${texts.length}`);
            return null;
        }
        const sorted = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        return sorted.map((d) => d.embedding ?? []);
    }
    catch (e) {
        warn(`[WPP v1.3.2 EMBED] failed (fallback LLM): ${e instanceof Error ? e.message : String(e)}`);
        return null;
    }
}
export function cosineSimilarity(a, b) {
    if (!a.length || a.length !== b.length)
        return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (!normA || !normB)
        return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
export function isCommandIntent(text) {
    return /删|撤回|发|转|帮|改|推送|群发|邀请|踢|移除|改名|建|拉|分享|转发|回复/i.test(String(text ?? ""));
}
const embedCache = new Map();
const EMBED_CACHE_MAX = 2000;
export function cacheEmbedding(msgId, vec) {
    embedCache.set(msgId, vec);
    if (embedCache.size > EMBED_CACHE_MAX) {
        const oldest = embedCache.keys().next().value;
        if (oldest !== undefined)
            embedCache.delete(oldest);
    }
}
export function getCachedEmbedding(msgId) {
    return embedCache.get(msgId);
}
export function clearEmbedCache() {
    embedCache.clear();
}
export async function selectTopNByEmbedding(triggerText, candidates, opts) {
    if (!candidates.length)
        return [];
    const topN = opts.topN ?? 5;
    const threshold = opts.threshold ?? 0.3;
    const toEmbed = [];
    const cachedVectors = candidates.map((c) => getCachedEmbedding(c.msgId));
    candidates.forEach((c, i) => {
        if (!cachedVectors[i])
            toEmbed.push(c.text);
    });
    if (toEmbed.length > 0) {
        const vecs = await embedTexts(toEmbed, opts);
        if (vecs === null)
            return null;
        let vi = 0;
        candidates.forEach((c, i) => {
            if (!cachedVectors[i]) {
                cachedVectors[i] = vecs[vi];
                if (cachedVectors[i])
                    cacheEmbedding(c.msgId, cachedVectors[i]);
                vi++;
            }
        });
    }
    const candidateVecs = cachedVectors;
    if (candidateVecs.some((v) => !v?.length))
        return null;
    const triggerVec = await embedTexts([triggerText], opts);
    if (!triggerVec?.[0]?.length)
        return null;
    const mediaIds = candidates
        .filter((c) => c.type === "file" || c.type === "image" || c.type === "voice" || c.type === "video")
        .map((c) => c.msgId);
    const nonMediaIdx = candidates.map((c, idx) => (c.type === "text" ? idx : -1)).filter((i) => i >= 0);
    const scored = nonMediaIdx.map((idx) => ({
        msgId: candidates[idx].msgId,
        score: cosineSimilarity(triggerVec[0], candidateVecs[idx]),
    }));
    scored.sort((a, b) => b.score - a.score);
    const relevant = scored.filter((s) => s.score >= threshold).slice(0, Math.max(topN - mediaIds.length, 0)).map((s) => s.msgId);
    const all = [...mediaIds, ...relevant];
    log.debug(`[WPP v1.3.2 EMBED] selected ${all.length}/${candidates.length} (media=${mediaIds.length}, text=${relevant.length}, topN=${topN})`);
    return all;
}
