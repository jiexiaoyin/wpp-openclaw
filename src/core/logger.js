// core/logger.ts - 仿 pino 接口日志 (兼容现有 log.info 调用 + 新代码函数式 info/warn/error)
// 范式仿 本项目/src/core/logger.ts
// 关键: formatErr 自动保留 stack (silent killer 永久救回)
import { PLUGIN_VERSION } from "./constants.js";
const LOG_TAG = `[WPP v${PLUGIN_VERSION}]`;
/**
 * formatErr — Error 实例保留 stack; 非 Error 实例走 String()
 * silent killer 永久救回: 之前 18+ 处只打 e.message 漏 stack, prod 难定位
 */
export function formatErr(err) {
    if (err instanceof Error) {
        if (err.stack)
            return `${err.name}: ${err.message}\n${err.stack}`;
        return `${err.name}: ${err.message}`;
    }
    if (err === null || err === undefined)
        return String(err);
    if (typeof err === "string")
        return err;
    try {
        return JSON.stringify(err);
    }
    catch {
        return String(err);
    }
}
function fmtValue(v) {
    if (typeof v === "string") {
        return /[\s,=]/.test(v) ? JSON.stringify(v) : v;
    }
    if (v === null || v === undefined)
        return String(v);
    if (typeof v === "number" || typeof v === "boolean")
        return String(v);
    if (v instanceof Error) {
        return `"${formatErr(v).replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
    }
    try {
        return JSON.stringify(v) ?? "null";
    }
    catch {
        return String(v);
    }
}
function fmtFields(fields) {
    if (!fields)
        return "";
    const parts = [];
    for (const [k, v] of Object.entries(fields)) {
        if (v === undefined)
            continue;
        parts.push(`${k}=${fmtValue(v)}`);
    }
    return parts.length ? " " + parts.join(" ") : "";
}
function emit(level, msg, fields) {
    const line = `${new Date().toISOString()} ${level} ${LOG_TAG} ${msg}${fmtFields(fields)}`;
    if (level === "ERROR")
        console.error(line);
    else if (level === "WARN")
        console.warn(line);
    // eslint-disable-next-line no-console -- 中心 logger INFO/DEBUG 必需
    else
        console.log(line);
}
/**
 * Normalize fields-or-error arg into Fields record.
 * Error instances → { err: "<formatErr>" }, primitives → { value: v }
 */
function normalize(arg) {
    if (arg === undefined)
        return undefined;
    if (arg instanceof Error)
        return { err: formatErr(arg) };
    if (typeof arg === "object" && arg !== null)
        return arg;
    return { value: arg };
}
// ============ 函数式 (本项目 风格 — 新代码推荐) ============
export function info(msg, fieldsOrErr) {
    emit("INFO", msg, normalize(fieldsOrErr));
}
export function warn(msg, fieldsOrErr) {
    emit("WARN", msg, normalize(fieldsOrErr));
}
export function error(msg, err) {
    emit("ERROR", msg, normalize(err));
}
export function debug(msg, fields) {
    if (process.env.WPP_DEBUG !== "1")
        return;
    emit("DEBUG", msg, fields);
}
// ============ 对象式 (兼容现有 log.info/warn/error/debug 调用) ============
function objectStyle(level) {
    return (msg, fieldsOrErr) => {
        emit(level, msg, normalize(fieldsOrErr));
    };
}
export const logObj = {
    info: objectStyle("INFO"),
    warn: objectStyle("WARN"),
    error: objectStyle("ERROR"),
    debug: objectStyle("DEBUG"),
};
/** 默认 export = logObj 对象 (兼容 `import log from ...; log.info(...)`) */
export default logObj;
//# sourceMappingURL=logger.js.map