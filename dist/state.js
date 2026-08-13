const TTL_MS = 30 * 60 * 1000;
const sessionChatInfo = new Map();
export function setSessionChatInfo(sessionKey, info) {
    if (!sessionKey)
        return;
    sessionChatInfo.set(sessionKey, {
        ...info,
        updatedAt: Date.now(),
    });
    if (sessionChatInfo.size > 500) {
        const now = Date.now();
        for (const [k, v] of sessionChatInfo) {
            if (now - v.updatedAt > TTL_MS)
                sessionChatInfo.delete(k);
        }
    }
}
export function getSessionChatInfo(sessionKey) {
    const info = sessionChatInfo.get(sessionKey);
    if (!info)
        return undefined;
    if (Date.now() - info.updatedAt > TTL_MS) {
        sessionChatInfo.delete(sessionKey);
        return undefined;
    }
    return info;
}
export function deleteSessionChatInfo(sessionKey) {
    return sessionChatInfo.delete(sessionKey);
}
export function clearAllSessionChatInfo() {
    sessionChatInfo.clear();
}
export function sessionChatInfoSize() {
    return sessionChatInfo.size;
}
