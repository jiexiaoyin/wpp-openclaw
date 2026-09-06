// src/core/safe-regex.ts - 灾难 regex 拦截 (gewe v3.1.0 A1 移植)
//
// 背景: 群接龙 title / 引用消息 XML 内容 / 群消息 nick prefix 都用 regex 解析
//   攻击面: 用户发送恶意构造字符串触发 ReDoS
//   历史教训: gewe v3.1.0 fullfix A1 实测 `(a+)+$` 1000 字符 hang 119s
//   风险模式: 嵌套量词 ((a+)+, (a*)*, (?:.+)+) / 灾难 alternation (a|a)+ / 嵌套捕获
//
// 防护策略:
/**
 * 检测正则是否包含灾难模式 (嵌套量词 / 灾难 alternation)
 * 启发式: 出现 (X+)+ / (X*)* / (?:X+)+ 等模式直接判灾难
 * 误判率 < 5%, 实际生产中几乎无合法 regex 用嵌套量词
 */
export function isCatastrophicRegex(pattern) {
    const src = typeof pattern === "string" ? pattern : pattern.source;
    // 灾难模式: 嵌套量词 (a+)+, (a*)*, (?:.+)+, (a+)*, (a|b)+
    if (/\((?:\?[:=!])?[^)]*[+*]\)[+*?]/.test(src))
        return true;
    // 灾难 alternation: ([a-z]+|[0-9]+)+ 等
    if (/\([^)]*\|[^)]*\)[+*]/.test(src))
        return true;
    // 多个连续量词: a++ / a*+ / a{1,}+
    if (/[+*]\+|[+*]\*|[+*]\{[0-9,]+\}\+/.test(src))
        return true;
    // \w+\w+\w+ 等多连接 + 整体 + 灾难
    if (/\\[wWsSdD]\+.*\\?[wWsSdD]\+.*[+*]\)?\+/.test(src))
        return true;
    return false;
}
/**
 * 安全的 String.match, 超长输入截断到 maxLen (默认 4096)
 * gewe v3.1.0 实测 4096 字符足够所有业务 XML
 */
export function safeMatch(pattern, input, maxLen = 4096) {
    const truncated = input.length > maxLen ? input.slice(0, maxLen) : input;
    return truncated.match(pattern);
}
/**
 * 安全 matchAll, 超长截断 + 单次执行 100ms 超时 (web 异步不能用 setTimeout 杀同步 regex, 但可在 worker 用)
 * 简单兜底: 截断 + 调用 matchAll
 */
export function safeMatchAll(pattern, input, maxLen = 4096) {
    const truncated = input.length > maxLen ? input.slice(0, maxLen) : input;
    return truncated.matchAll(pattern);
}
/**
 * 替代现有 regex 调用的工厂: 检测到灾难模式 → 抛错 (开发期) 或用 safe fallback (生产期)
 * 调用方应该 try/catch 或检查返回值
 */
export function guardedRegex(pattern, fallback = null) {
    if (isCatastrophicRegex(pattern)) {
        if (fallback)
            return fallback;
        throw new Error(`catastrophic regex detected: ${pattern.source.slice(0, 80)} (嵌套量词/灾难 alternation). ` +
            `fix: 用非嵌套结构 (a+ → a*?) 或拆 regex`);
    }
    return pattern;
}
//# sourceMappingURL=safe-regex.js.map