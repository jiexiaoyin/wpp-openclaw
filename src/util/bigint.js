// src/util/bigint.ts - 大整数精度保护 (纯字符串工具, 低层, 无依赖)
//
// v1.3.27 (2026-08-10, P2-1): stringifyLargeInts 从 api/client.ts 移入本文件.
//   原因: config.ts / inbound/handler.ts 也要用, 但 config.ts 是低层配置模块,
//   import api/client.ts 会拖入 account-state → db → registry 整条链 (启动副作用 + 架构方向反).
//   移入 util/ 后低层模块直接 import, api/client.ts 保留 re-export 兼容老调用方/测试.
/**
 * Pre-process JSON text to wrap 16+ digit integers as quoted strings.
 * 关键: vendor 返回的 msg_id / new_msg_id 可能 16+ 位 (e.g. 1899234567890123456),
 *       不预先引号化 → JSON.parse 会丢精度 (Number.MAX_SAFE_INTEGER = 9007199254740992)
 *       silent killer: 消息回查时找不到
 */
export function stringifyLargeInts(jsonText) {
    // 匹配 key 后接 16+ 整数 value 的 :1234567890123456,
    // 后面可以是 ,/空格/}/] 或字符串末尾
    return jsonText.replace(/("[\w$]+"\s*:\s*)(\d{16,})(?=[,\s}\]]|$)/g, '$1"$2"');
}
//# sourceMappingURL=bigint.js.map