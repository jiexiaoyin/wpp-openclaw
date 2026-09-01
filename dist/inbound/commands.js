// src/inbound/commands.ts - 命令白名单检查
// 范式: 检查消息是否命令 / 命令是否在白名单 → { isCommand, allowed, blockMessage?, reason? }
// 场景: /reset /status /help 这类命令不该被 AI 当普通消息; 白名单命中直接执行, 不命中发 blockMessage
/**
 * 检查消息是否命令 / 命令是否在白名单
 *
 * @example
 *   checkCommandAllowlist("/reset", { allowlist: ["reset", "status"] })   // → allowed: true
 *   checkCommandAllowlist("/foo", { allowlist: ["reset"] })               // → allowed: false
 *   checkCommandAllowlist("hello bot", { allowlist: ["reset"] })          // → isCommand: false
 *   checkCommandAllowlist("/reset --all", { allowlist: ["reset"] })       // → args: "--all"
 */
export function checkCommandAllowlist(text, config) {
    const prefix = config.prefix ?? "/";
    const blockMessage = config.blockMessage ?? "当前账号未授权此命令，请联系管理员。";
    // 非命令 (不以 prefix 开头)
    const trimmed = text.trimStart();
    if (!trimmed.startsWith(prefix)) {
        return { isCommand: false };
    }
    // 解析命令名 + 参数
    const withoutPrefix = trimmed.slice(prefix.length);
    const spaceIdx = withoutPrefix.indexOf(" ");
    const name = (spaceIdx === -1 ? withoutPrefix : withoutPrefix.slice(0, spaceIdx)).trim();
    const args = spaceIdx === -1 ? "" : withoutPrefix.slice(spaceIdx + 1).trim();
    if (!name) {
        return { isCommand: true, allowed: false, name: "", reason: "empty command name", blockMessage };
    }
    // 白名单检查
    if (config.allowlist.length === 0 || !config.allowlist.includes(name)) {
        return {
            isCommand: true,
            allowed: false,
            name,
            reason: `command "${name}" not in allowlist`,
            blockMessage,
        };
    }
    return { isCommand: true, allowed: true, name, args };
}
//# sourceMappingURL=commands.js.map