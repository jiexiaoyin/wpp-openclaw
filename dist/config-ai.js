export function resolveAiConfig(cfg, kind) {
    const ai = cfg.ai;
    const base = cfg[kind];
    if (!ai)
        return base;
    const merged = {};
    if (ai.judgeModel && !base?.model)
        merged.model = ai.judgeModel;
    if (ai.timeoutMs && !base?.timeoutMs)
        merged.timeoutMs = ai.timeoutMs;
    if (!merged.model && !merged.timeoutMs)
        return base;
    return { ...(base ?? {}), ...merged };
}
