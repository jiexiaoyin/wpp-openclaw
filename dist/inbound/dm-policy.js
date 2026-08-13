export function checkDmPolicy(opts) {
    const { msg, allowFrom, adminUsers } = opts;
    const fromWxid = msg.fromWxid;
    if (allowFrom.length > 0 && !allowFrom.includes(fromWxid)) {
        return { allowed: false, reason: `allowFrom mismatch: ${fromWxid}` };
    }
    const isAdmin = adminUsers.includes(fromWxid);
    return { allowed: true, isAdmin };
}
