// src/core/signature.ts - Webhook 签名验证 (v1.1.1 full mode)
// 范式: 仿 OpenClaw v2026.7.1+ src/core/signature.ts (HMAC + timingSafeEqual + multi-algorithm)
//
// v1.1.1 状态 (2026-08-04):
//   - vendor 暂未公开算法, 但实现支持 sha256 / sha1 / md5 多算法 (兼容主流 webhook)
//   - signatureRequired 改 strict mode (无 secret 也返 true, 强制 webhook 必须配 secret)
//   - extractSignatureHeader 优先 X-Signature, fallback X-Hub-Signature-256, X-WPP-Signature
//
// 调用方约定:
//   - verifySignature(body, signature, secret, opts) - 一站式, 默认 sha256
//   - signatureRequired(secret) - 决定是否验签 (v1.1.1 strict: 永远 true, 业务决定)
//   - extractSignatureHeader(headers) - 多 candidate 提取
import { createHmac, timingSafeEqual } from "node:crypto";
const ALGO_PREFIX = {
    sha256: "sha256=",
    sha1: "sha1=",
    md5: "md5=",
};
/**
 * v1.1.1: 验证 webhook 签名 (多算法支持).
 * 替代 v1.0.1 的 verifyHmacSha256, 默认 sha256 (向后兼容).
 *
 * @param body raw webhook body (Buffer 或 string, 必须是 vendor 签的原内容)
 * @param signature signature header 值 (e.g. "sha256=hex" 或 "sha1=hex" 或纯 hex)
 * @param secret webhook secret (跟 vendor 后台配的一致)
 * @param opts.algorithm 默认 sha256
 * @returns true = 验签通过, false = 失败
 */
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
        return false; // hex 解析失败
    }
}
/**
 * 保持 v1.0.1 API 兼容 (deprecated, v1.2+ 删).
 * @deprecated use verifySignature instead
 */
export function verifyHmacSha256(body, signature, secret) {
    return verifySignature(body, signature, secret, { algorithm: "sha256" });
}
/**
 * v1.1.10 P0-3 (2026-08-05 回滚): 是否需要 signature 验证 — 改回 v1.0.1 permissive.
 *
 * 决策: 是否有 secret → 决定是否验签.
 *   - secret 已配 → 返 true (强制 verify, caller 调 verifySignature 验)
 *   - secret 未配 → 返 false (skip 整个 verify 步骤)
 *
 * v1.5.1 P2-fix (2026-08-25 21:30 老板拍 A): 加固防再犯
 *   教训: 2026-08-25 P2-1 修复时, AI 错误激活 HMAC (配了 WECHATPRO_WEBHOOK_SECRET env)
 *         导致 vendor (wx.juhe.chat) 推送无 signature header → plugin 401 拒绝 → 0 入库
 *         (历史曾发生: v1.1.1 strict 永远 true → 老板 2026-08-05 拍板改 permissive)
 *   设计: secret 配了才验签, 没配就 skip (vendor 不发 signature 必须 skip)
 *   启用 HMAC 条件: vendor 公开签名算法 + env WECHATPRO_WEBHOOK_SECRET=真值
 *   fail-safe: vendor 不支持签名时 (当前), 业务方必须不配 WECHATPRO_WEBHOOK_SECRET env
 *
 * 历史:
 *   - v1.0.1: 返 !!secret (permissive, 跟 github webhook 行为一致)
 *   - v1.1.1: 改 strict 永远 true (没 secret 也强制 verify) — 这版跟 vendor 不兼容
 *     vendor `/Webhook/Set` (src/send/webhook.ts) 不提供签名字段, 推 webhook 不带 X-Signature 头
 *     → 老板 2026-08-05 21:35 拍的 401 全是 vendor 不签造成的
 *   - v1.1.10: 老板拍改回 permissive. secret 留 / 空由业务方决定.
 *     risk: webhook 公网暴露会被人乱刷, 但 1Panel openresty 反代层已挡 + authcode 路径段当隐式 auth 凑合用.
 *
 * 注: 未来 vendor 真提供签名后再用 v1.1.1 strict 也行 (那时 secret 必须填).
 */
export function signatureRequired(secret) {
    return !!secret;
}
/**
 * 签名 header 候选 (按优先级).
 * OpenClaw 兼容: 优先 X-Signature (vendor 通用), fallback X-Hub-Signature-256 (GitHub), X-WPP-Signature (wpp 私有).
 */
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
//# sourceMappingURL=signature.js.map