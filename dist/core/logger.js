import { PLUGIN_VERSION } from "./constants.js";
const LOG_TAG = `[WPP v${PLUGIN_VERSION}]`;
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
    else
        console.log(line);
}
function normalize(arg) {
    if (arg === undefined)
        return undefined;
    if (arg instanceof Error)
        return { err: formatErr(arg) };
    if (typeof arg === "object" && arg !== null)
        return arg;
    return { value: arg };
}
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
export default logObj;
