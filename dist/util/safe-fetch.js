import { URL } from "node:url";
function getAllowedHosts() {
    const vendorHost = process.env.WPP_VENDOR_HOST || "";
    return new Set([
        "openclaw-a.oss-cn-hangzhou.aliyuncs.com",
        vendorHost,
        "dashscope.aliyuncs.com",
        "api.minimaxi.com",
        "api.siliconflow.cn",
    ]);
}
const BLOCKED_HOST_PATTERNS = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^0\.0\.0\.0$/,
    /^::1$/,
    /^fe80:/i,
    /^localhost$/i,
];
export function isHostAllowed(url) {
    let u;
    try {
        u = new URL(url);
    }
    catch {
        return false;
    }
    if (!/^https?:$/.test(u.protocol))
        return false;
    if (BLOCKED_HOST_PATTERNS.some((p) => p.test(u.hostname)))
        return false;
    if (getAllowedHosts().has(u.hostname))
        return true;
    return false;
}
export async function safeFetch(url, init) {
    if (!isHostAllowed(url)) {
        throw new Error(`safeFetch: host not in whitelist: ${url}`);
    }
    return fetch(url, init);
}
export const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
export async function safeFetchWithCap(url, init, maxBytes = MAX_MEDIA_BYTES) {
    const resp = await safeFetch(url, init);
    if (!resp.ok)
        throw new Error(`safeFetchWithCap: HTTP ${resp.status} (${url})`);
    const contentLength = parseInt(resp.headers.get("content-length") ?? "0", 10);
    if (contentLength > maxBytes) {
        throw new Error(`safeFetchWithCap: Content-Length ${contentLength} > cap ${maxBytes} (${url})`);
    }
    const reader = resp.body?.getReader();
    if (!reader)
        throw new Error(`safeFetchWithCap: no body reader (${url})`);
    const chunks = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            total += value.byteLength;
            if (total > maxBytes) {
                await reader.cancel().catch(() => { });
                throw new Error(`safeFetchWithCap: stream exceeded cap ${maxBytes} bytes (${url})`);
            }
            chunks.push(value);
        }
    }
    catch (e) {
        await reader.cancel().catch(() => { });
        throw e;
    }
    let len = 0;
    for (const c of chunks)
        len += c.byteLength;
    return Buffer.concat(chunks, len);
}
