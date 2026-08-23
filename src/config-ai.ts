// src/config-ai.ts - v1.3.77 AI-UNIFY: 统一 LLM 判断模型配置 (纯函数可测)
//
// 把 accounts/*.json 的 ai.judgeModel / ai.timeoutMs 作为 heartflow/jargon 的默认值。
// 若 heartflow/jargon 自己配了 model/timeoutMs → 各自覆盖 (优先)。
// 返回 undefined → 各自模块用内置默认 (MiniMax-M2.5/5000)。

import type { WppAccountConfig } from "./types.js";

type AiConfigKind = "heartflow" | "jargon" | "affection";

type AiConfigMap = {
  heartflow: import("./inbound/heartflow.js").HeartflowConfig;
  jargon: import("./inbound/jargon.js").JargonConfig;
  affection: import("./inbound/affection.js").AffectionConfig;
};

export function resolveAiConfig<K extends AiConfigKind>(
  cfg: WppAccountConfig,
  kind: K,
): AiConfigMap[K] | undefined {
  const ai = cfg.ai;
  const base = cfg[kind] as AiConfigMap[K] | undefined;
  if (!ai) return base; // 未配 ai 块 → 原样 (模块各自默认)
  const merged: { model?: string; timeoutMs?: number } = {};
  if (ai.judgeModel && !base?.model) merged.model = ai.judgeModel;
  if (ai.timeoutMs && !base?.timeoutMs) merged.timeoutMs = ai.timeoutMs;
  if (!merged.model && !merged.timeoutMs) return base; // ai 块没提供值 → 原样
  return { ...(base ?? ({} as AiConfigMap[K])), ...merged } as AiConfigMap[K];
}
