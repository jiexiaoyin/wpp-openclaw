export function checkCommandAllowlist(text, config) {
    const prefix = config.prefix ?? "/";
    const blockMessage = config.blockMessage ?? "当前账号未授权此命令，请联系管理员。";
    const trimmed = text.trimStart();
    if (!trimmed.startsWith(prefix)) {
        return { isCommand: false };
    }
    const withoutPrefix = trimmed.slice(prefix.length);
    const spaceIdx = withoutPrefix.indexOf(" ");
    const name = (spaceIdx === -1 ? withoutPrefix : withoutPrefix.slice(0, spaceIdx)).trim();
    const args = spaceIdx === -1 ? "" : withoutPrefix.slice(spaceIdx + 1).trim();
    if (!name) {
        return { isCommand: true, allowed: false, name: "", reason: "empty command name", blockMessage };
    }
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
