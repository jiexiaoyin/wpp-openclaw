// src/pairing-store.ts - DM 配对码存储 (per-account 隔离)
// v1.2.3 PAIRING: 老板拍板 "配对码能力移植, 不能与多账号冲突"
// 范式: 仿旧版 wechatpadpromax pairing-store.js, 但按 accountId 分文件 → 多账号天然隔离
// 兑换: 用户私聊 /pair <8位码> → redeem 成功 → wxid 写进 accounts/<id>.json allowFrom
// 安全: 码 8 位 (去 I/O/0/1) + TTL 1h + 一次性消耗 (unlink)
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
/** 配对码有效期 (1h, 跟旧版一致) */
export const PAIRING_CODE_TTL_MS = 60 * 60 * 1000;
/** 码字母表 — 去掉易混淆 I/O/0/1 (旧版同款) */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** 码长度 (8 位, 旧版同款) */
export const PAIRING_CODE_LENGTH = 8;
/** 配对码存储目录 — 每次读 env (测试可 WPP_PAIRING_DIR 覆盖), 默认 ~/.openclaw/credentials/ */
export function getPairingDir() {
    return process.env.WPP_PAIRING_DIR || join(homedir(), ".openclaw", "credentials");
}
/**
 * per-account 配对码文件路径 — 关键多账号隔离: 文件名带 accountId, 互不覆盖。
 * 放 credentials/ 而非 accounts/ (listAccountIds 会扫 accounts/*.json 把配对文件当账号注册!)
 */
export function getPairingStorePath(accountId) {
    return join(getPairingDir(), `wechatpadpro-pairing-${accountId}.json`);
}
/** 生成 8 位随机码 (CODE_ALPHABET) */
export function randomCode(length = PAIRING_CODE_LENGTH) {
    const bytes = randomBytes(length);
    let out = "";
    for (let i = 0; i < length; i++) {
        out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    return out;
}
/** 归一化配对码: trim + 大写 (用户输入大小写不敏感) */
export function normalizePairCode(code) {
    return String(code ?? "").trim().toUpperCase();
}
/**
 * 从消息 content 提取配对码 — 严格 /pair 前缀格式 (老板拍板, 不误触发)。
 * 必须是消息整体为 `/pair <8位码>` (可带首尾空白), 不接受尾部垃圾/多余参数。
 * @returns 大写 8 位码, 或 null (不是配对消息)
 */
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
        /* ignore: 目录已存在或无法创建 (调用方会感知) */
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
/** 原子写 (tmp + rename), 防崩溃产生半写文件 */
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
/**
 * 生成配对码 (覆盖旧码) → 存 per-account 文件 → 返回 entry。
 * @param accountId 目标账号 (文件名隔离)
 */
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
/** 读本账号配对码 (不存在 / 过期 → null) */
export async function readPairingCode(accountId) {
    const entry = await readJsonFileSafe(getPairingStorePath(accountId));
    if (!entry || isExpired(entry))
        return null;
    return entry;
}
/**
 * 兑换配对码 — 校验 accountId 匹配 (防跨账号码) + 码正确 + 未过期 → 一次性消耗 (unlink)。
 * @returns { ok: true } 成功; { ok: false, reason } 失败原因
 */
export async function redeemPairingCode(code, accountId) {
    const normalizedInput = normalizePairCode(code);
    if (!normalizedInput)
        return { ok: false, reason: "invalid" };
    const filePath = getPairingStorePath(accountId);
    const entry = await readJsonFileSafe(filePath);
    if (!entry)
        return { ok: false, reason: "not-found" };
    if (isExpired(entry)) {
        // 过期码清理 (无副作用)
        try {
            await unlink(filePath);
        }
        catch { /* ignore */ }
        return { ok: false, reason: "expired" };
    }
    // 跨账号防护: 文件里 accountId 必须匹配 (文件名已隔离, 双保险)
    if (entry.accountId && entry.accountId !== accountId) {
        return { ok: false, reason: "wrong-account" };
    }
    const normalizedStored = normalizePairCode(entry.code);
    if (normalizedInput !== normalizedStored) {
        return { ok: false, reason: "invalid" };
    }
    // 一次性消耗: unlink (防重放)
    try {
        await unlink(filePath);
    }
    catch { /* ignore */ }
    return { ok: true };
}
//# sourceMappingURL=pairing-store.js.map