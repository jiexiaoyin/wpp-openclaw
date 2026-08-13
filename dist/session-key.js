export function buildSessionKey(opts) {
    const base = `agent:${opts.agentId}:wechatpadpro`;
    if (opts.peerKind === "group") {
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
