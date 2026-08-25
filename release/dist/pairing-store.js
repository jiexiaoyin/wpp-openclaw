import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
export const PAIRING_CODE_TTL_MS = 60 * 60 * 1000;
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PAIRING_CODE_LENGTH = 8;
export function getPairingDir() {
    return process.env.WPP_PAIRING_DIR || join(homedir(), ".openclaw", "credentials");
}
export function getPairingStorePath(accountId) {
    return join(getPairingDir(), `wechatpadpro-pairing-${accountId}.json`);
}
export function randomCode(length = PAIRING_CODE_LENGTH) {
    const bytes = randomBytes(length);
    let out = "";
    for (let i = 0; i < length; i++) {
        out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    return out;
}
export function normalizePairCode(code) {
    return String(code ?? "").trim().toUpperCase();
}
export function extractPairCode(content) {
    if (!content || typeof content !== "string")
        return null;
    const m = content.match(/^\s*\/pair\s+([A-Z2-9]{8})\s*$/i);
    if (!m)
        return null;
    return m[1].toUpperCase();
}
async function ensureDir(dir) {
    try {
        await mkdir(dir, { recursive: true });
    }
    catch {
    }
}
async function readJsonFileSafe(filePath) {
    try {
        const raw = await readFile(filePath, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
async function writeJsonFileAtomic(filePath, value) {
    await ensureDir(dirname(filePath));
    const tmpPath = `${filePath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(value, null, 2), "utf8");
    await rename(tmpPath, filePath);
}
function isExpired(entry) {
    if (!entry?.createdAt)
        return true;
    return Date.now() - new Date(entry.createdAt).getTime() > PAIRING_CODE_TTL_MS;
}
export async function generatePairingCode(accountId) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PAIRING_CODE_TTL_MS);
    const entry = {
        code: randomCode(),
        accountId,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
    };
    await writeJsonFileAtomic(getPairingStorePath(accountId), entry);
    return entry;
}
export async function readPairingCode(accountId) {
    const entry = await readJsonFileSafe(getPairingStorePath(accountId));
    if (!entry || isExpired(entry))
        return null;
    return entry;
}
export async function redeemPairingCode(code, accountId) {
    const normalizedInput = normalizePairCode(code);
    if (!normalizedInput)
        return { ok: false, reason: "invalid" };
    const filePath = getPairingStorePath(accountId);
    const entry = await readJsonFileSafe(filePath);
    if (!entry)
        return { ok: false, reason: "not-found" };
    if (isExpired(entry)) {
        try {
            await unlink(filePath);
        }
        catch { }
        return { ok: false, reason: "expired" };
    }
    if (entry.accountId && entry.accountId !== accountId) {
        return { ok: false, reason: "wrong-account" };
    }
    const normalizedStored = normalizePairCode(entry.code);
    if (normalizedInput !== normalizedStored) {
        return { ok: false, reason: "invalid" };
    }
    try {
        await unlink(filePath);
    }
    catch { }
    return { ok: true };
}
