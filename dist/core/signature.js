import { createHmac, timingSafeEqual } from "node:crypto";
const ALGO_PREFIX = {
    sha256: "sha256=",
    sha1: "sha1=",
    md5: "md5=",
};
export function verifySignature(body, signature, secret, opts = {}) {
    const algo = opts.algorithm ?? "sha256";
    if (!signature)
        return false;
    if (!secret)
        return false;
    let detected = algo;
    let sigValue = signature;
    for (const [a, prefix] of Object.entries(ALGO_PREFIX)) {
        if (signature.startsWith(prefix)) {
            detected = a;
            sigValue = signature.slice(prefix.length);
            break;
        }
    }
    const expectedHex = createHmac(detected, secret).update(body).digest("hex");
    if (sigValue.length !== expectedHex.length)
        return false;
    try {
        return timingSafeEqual(Buffer.from(sigValue, "hex"), Buffer.from(expectedHex, "hex"));
    }
    catch {
        return false;
    }
}
export function verifyHmacSha256(body, signature, secret) {
    return verifySignature(body, signature, secret, { algorithm: "sha256" });
}
export function signatureRequired(secret) {
    return !!secret;
}
export function extractSignatureHeader(headers) {
    const candidates = [
        headers["x-signature"],
        headers["x-hub-signature-256"],
        headers["x-wpp-signature"],
    ];
    for (const c of candidates) {
        if (typeof c === "string" && c.length > 0)
            return c;
        if (Array.isArray(c) && c.length > 0 && typeof c[0] === "string")
            return c[0];
    }
    return undefined;
}
