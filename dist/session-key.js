// session-key.ts - 对齐 framework parseSessionDeliveryRoute 的 sessionKey 构造
// (framework 是 SSOT, 格式必须 100% 一致; 曾因群聊 6 段含 accountId 导致出站路由失败)
/**
 * SessionKey 设计 (framework SSOT: openclaw parseSessionDeliveryRoute):
 *   DM/direct:  agent:<agentId>:<channelId>:<accountId>:<peerKind>:<peerId> (accountId 必需, 多账号路由字段)
 *   group/room: agent:<agentId>:<channelId>:<peerKind>:<peerId> (无 accountId, 按 chatroom 聚合)
 */
export function buildSessionKey(opts) {
    const base = `agent:${opts.agentId}:wechatpadpro`;
    if (opts.peerKind === "group") {
        // 群聊 6 段含 accountId → framework 返 null → 出站路由失败 (实测确认)
        return `${base}:${opts.peerKind}:${opts.peerId}`;
    }
    return `${base}:${opts.accountId}:${opts.peerKind}:${opts.peerId}`;
}
export function parseSessionKey(key) {
    const parts = key.split(":");
    if (parts.length < 5 || parts.length > 6)
        return null;
    const [p0, p1, p2] = parts;
    if (p0 === undefined || p1 === undefined || p2 === undefined)
        return null;
    if (p0 !== "agent" || p2 !== "wechatpadpro")
        return null;
    // 5 段 (群聊类): agent:<id>:<channel>:<peerKind>:<peerId>
    if (parts.length === 5) {
        const [, , , p4, p5] = parts;
        if (p4 === undefined || p5 === undefined)
            return null;
        return {
            agentId: p1,
            channelId: p2,
            peerKind: p4,
            peerId: p5,
        };
    }
    // 6 段 (DM/direct): agent:<id>:<channel>:<accountId>:<peerKind>:<peerId>
    const [, , , p3, p4, p5] = parts;
    if (p3 === undefined || p4 === undefined || p5 === undefined)
        return null;
    return {
        agentId: p1,
        channelId: p2,
        accountId: p3,
        peerKind: p4,
        peerId: p5,
    };
}
//# sourceMappingURL=session-key.js.map