// src/util/bigint.ts - 大整数精度保护 (纯字符串工具, 低层, 无依赖)
//
// v1.3.27 (2026-08-10, P2-1): stringifyLargeInts 从 api/client.ts 移入本文件.
//   原因: config.ts / inbound/handler.ts 也要用, 但 config.ts 是低层配置模块,
//   import api/client.ts 会拖入 account-state → db → registry 整条链 (启动副作用 + 架构方向反).
//   移入 util/ 后低层模块直接 import, api/client.ts 保留 re-export 兼容老调用方/测试.
//
// v1.9.2 (2026-09-28, P1-fix): 弃用「正则改写 JSON 文本」实现, 改为**单遍结构化扫描**.
//   旧实现 /("[\w$]+"\s*:\s*)(\d{16,})(?=[,\s}\]]|$)/g 有三个形态依赖缺陷:
//     (a) 数组/正文位置的大整数完全不匹配 → 原样透传 → JSON.parse **静默丢精度**
//         (e.g. {"arr":[1234567890123456789]} → 1234567890123456800, 不报错).
//         根因: 该正则要求「引号包裹的 key + 冒号」前缀, 数组元素没有这个前缀.
//     (b) key 名被限制为 ASCII \w/$ → 含 '-'、'.'、中文等 key 的大整数同样漏改.
//   新实现只在**值位置** (对象值 / 数组元素 / 顶层标量) 改写 16+ 位纯整数 token,
//   字符串 token 一律逐字节原样复制 —— 因此不可能把合法 JSON 改写成非法 JSON.
/** 快路径探测: 文本中是否出现 16+ 位连续数字 (含被引号包裹的, 无所谓, 只是省一次扫描) */
const HAS_LONG_DIGIT_RUN = /\d{16,}/;
/** 数字 token: 可选负号 + 整数部分 + 可选小数 + 可选指数 (sticky, 从 lastIndex 处匹配) */
const NUMBER_TOKEN = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
/** 纯整数 (无小数/指数) */
const PURE_INT_TOKEN = /^-?\d+$/;
/**
 * 扫描自 i 起的 JSON 字符串 token, 返回结束下标 (含收尾引号之后); 未闭合返回 -1.
 * 处理 \ 转义: `\\` 是转义反斜杠, 其后引号仍是收尾引号.
 */
function scanString(text, i) {
    const n = text.length;
    let j = i + 1;
    while (j < n) {
        const c = text[j];
        if (c === '\\') {
            j += 2;
            continue;
        }
        if (c === '"')
            return j + 1;
        j++;
    }
    return -1;
}
/**
 * 单遍扫描, 只把**值位置**的 16+ 位纯整数 token 改写为字符串, 其余字节原样复制 (保留空白/缩进).
 * 无法安全定位 (字符串未闭合 / 数字 token 后不是合法分隔符 / 越界转义) → 返回 null, 由调用方原样返回原文.
 */
function rewriteValuePositionLargeInts(text) {
    const n = text.length;
    let out = '';
    let copied = 0; // text[0..copied) 已确认原样输出
    let lastSig = ''; // 最近一个「字符串之外、非空白」的字符; '' = 文本开头
    let i = 0;
    // 值位置: 对象值 (前导 ':') / 数组元素 (前导 '[' 或 ',') / 顶层标量 (文本开头)
    const isValuePos = (c) => c === ':' || c === ',' || c === '[' || c === '';
    while (i < n) {
        const ch = text[i];
        // 空白: 不改变 lastSig (缩进/换行的 pretty JSON 必须照样识别出前面的 ':' / '[')
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
            i++;
            continue;
        }
        // 字符串 token: 逐字节原样保留, 永不改写 → 字符串值里的大整数不可能被破坏
        if (ch === '"') {
            const end = scanString(text, i);
            if (end === -1)
                return null;
            i = end;
            lastSig = 'v'; // 字符串是一个值 (或 key, 后面会跟 ':' 重置)
            continue;
        }
        // 数字 token
        if (ch === '-' || (ch >= '0' && ch <= '9')) {
            NUMBER_TOKEN.lastIndex = i;
            const tok = NUMBER_TOKEN.exec(text)?.[0];
            if (tok === undefined) {
                lastSig = ch;
                i++;
                continue;
            }
            const after = i + tok.length;
            const next = after < n ? text[after] : '';
            // token 后必须是合法 JSON 分隔符, 否则说明不是真正的 JSON 数字 (文本畸形) → 保守跳过
            const wellFormed = next === '' || next === ',' || next === ']' || next === '}' || /\s/.test(next);
            const digits = PURE_INT_TOKEN.test(tok) ? tok.replace(/^-/, '').length : 0;
            if (wellFormed && digits >= 16 && isValuePos(lastSig)) {
                out += text.slice(copied, i) + '"' + tok + '"';
                copied = after;
            }
            i = after;
            lastSig = 'v';
            continue;
        }
        // 结构符 { } [ ] : , 或非法字符 — 记录为「最近有效字符」, 供下一个 token 判定位置
        lastSig = ch;
        i++;
    }
    if (copied === 0)
        return text; // 无改写
    return out + text.slice(copied);
}
/**
 * Pre-process JSON text to wrap 16+ digit integers as quoted strings.
 * 关键: vendor 返回的 msg_id / new_msg_id 可能 16+ 位 (e.g. 1899234567890123456),
 *       不预先引号化 → JSON.parse 会丢精度 (Number.MAX_SAFE_INTEGER = 9007199254740992)
 *       silent killer: 消息回查时找不到
 *
 * v1.9.2: 只在**值位置**改写 (对象值 / 数组元素 / 顶层标量), 全部 16+ 位整数都被精确保号;
 *         字符串 token 永远原样透传, 不会被改写成非法 JSON.
 */
export function stringifyLargeInts(jsonText) {
    if (!HAS_LONG_DIGIT_RUN.test(jsonText))
        return jsonText;
    const out = rewriteValuePositionLargeInts(jsonText);
    if (out === null || out === jsonText)
        return jsonText;
    // 保底: 只有结果仍是合法 JSON 才采用改写, 否则原样返回 — 绝不产出非法 JSON.
    try {
        JSON.parse(out);
    }
    catch {
        return jsonText;
    }
    return out;
}
//# sourceMappingURL=bigint.js.map