import { readFile } from "node:fs/promises";
import path from "node:path";
import { safeFetchWithCap } from "../util/safe-fetch.js";
export async function resolveImageToBase64(input) {
    if (!input)
        throw new Error("resolveImageToBase64: empty input");
    const m = DATA_URI_RE.exec(input);
    if (m && m[1])
        return m[1].trim();
    if (/^https?:\/\//i.test(input)) {
        const MAX_BYTES = 15 * 1024 * 1024;
        try {
            const buf = await safeFetchWithCap(input, { signal: AbortSignal.timeout(30_000) }, MAX_BYTES);
            return buf.toString("base64");
        }
        catch (e) {
            throw new Error(`resolveImageToBase64: download failed (${sanitizeHost(input)}): ${e.message}`);
        }
    }
    if (input.startsWith("file://")) {
        const p = input.slice("file://".length);
        return (await readLocalMedia(p)).toString("base64");
    }
    const isPureBase64 = input.length >= 16 && /^[A-Za-z0-9+/=]+$/.test(input) && input.length % 4 === 0;
    if (isPureBase64)
        return input.trim();
    if (input.startsWith("/") || input.startsWith("./") || input.startsWith("../")) {
        return (await readLocalMedia(input)).toString("base64");
    }
    return input.trim();
}
export async function readLocalMedia(p, allowedRootsOverride) {
    const allowedRoots = allowedRootsOverride ?? [
        "/root/.openclaw/media",
        "/root/.openclaw/workspace/media",
        "/root/.openclaw/shared-media",
    ];
    const normalized = path.normalize(p);
    if (normalized.split(/[\\/]/).includes("..")) {
        throw new Error("resolveImageToBase64: path contains .. segment");
    }
    const abs = path.resolve(p);
    if (!allowedRoots.some((root) => {
        const rootWithSep = root.endsWith("/") ? root : root + "/";
        return abs === root || abs.startsWith(rootWithSep);
    })) {
        throw new Error("resolveImageToBase64: local path outside allowed media dirs");
    }
    let real;
    try {
        real = await import("node:fs/promises").then((fsp) => fsp.realpath(abs));
    }
    catch {
        throw new Error("resolveImageToBase64: cannot resolve local path");
    }
    const insideAllowed = allowedRoots.some((root) => {
        const rootWithSep = root.endsWith("/") ? root : root + "/";
        return real === root || real.startsWith(rootWithSep);
    });
    if (!insideAllowed) {
        throw new Error("resolveImageToBase64: local path resolves outside allowed media dirs");
    }
    return readFile(real);
}
function sanitizeHost(url) {
    try {
        return new URL(url).host || "url";
    }
    catch {
        return "url";
    }
}
const DATA_URI_RE = /^data:[^;]+;base64,(.+)$/i;
