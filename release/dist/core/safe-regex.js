export function isCatastrophicRegex(pattern) {
    const src = typeof pattern === "string" ? pattern : pattern.source;
    if (/\((?:\?[:=!])?[^)]*[+*]\)[+*?]/.test(src))
        return true;
    if (/\([^)]*\|[^)]*\)[+*]/.test(src))
        return true;
    if (/[+*]\+|[+*]\*|[+*]\{[0-9,]+\}\+/.test(src))
        return true;
    if (/\\[wWsSdD]\+.*\\?[wWsSdD]\+.*[+*]\)?\+/.test(src))
        return true;
    return false;
}
export function safeMatch(pattern, input, maxLen = 4096) {
    const truncated = input.length > maxLen ? input.slice(0, maxLen) : input;
    return truncated.match(pattern);
}
export function safeMatchAll(pattern, input, maxLen = 4096) {
    const truncated = input.length > maxLen ? input.slice(0, maxLen) : input;
    return truncated.matchAll(pattern);
}
export function guardedRegex(pattern, fallback = null) {
    if (isCatastrophicRegex(pattern)) {
        if (fallback)
            return fallback;
        throw new Error(`catastrophic regex detected: ${pattern.source.slice(0, 80)} (嵌套量词/灾难 alternation). ` +
            `fix: 用非嵌套结构 (a+ → a*?) 或拆 regex`);
    }
    return pattern;
}
