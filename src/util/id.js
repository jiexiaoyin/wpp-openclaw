// util/id.ts - 16-hex unique id (替代 Date.now() 作 OSS key/tmp filename)
import { randomBytes } from "node:crypto";
/**
 * Returns 16-char hex id from randomBytes(8).
 * 用于: OSS keys, tmp filename, dedupe nonce, recovery token 等
 * 防 Date.now() 同一毫秒碰撞导致 silent corruption
 */
export function uniqueId() {
    return randomBytes(8).toString("hex");
}
/** 24-char hex (randomBytes(12)) — 长链路追踪用 */
export function longUniqueId() {
    return randomBytes(12).toString("hex");
}
//# sourceMappingURL=id.js.map