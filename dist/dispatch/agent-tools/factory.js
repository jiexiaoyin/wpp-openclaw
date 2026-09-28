// src/dispatch/agent-tools/factory.ts - buildAgentTools()
// 范式仿 本项目/src/dispatch/agent-tools/factory.ts
// 关键:
//  - 取 ordered args from schema.properties keys (不靠 Object.values 避免 missing optional 移位)
//  - 错误转 {content:[{type:"text",text:"Error: ..."}]} 不 throw (防 LLM context 雪崩)
//  - meta 元组顺序 = fn 参数顺序 (1-1 验证由 typebox schema 推)
import { error as logErr, debug, formatErr } from "../../core/logger.js";
/**
 * 运行时窄化: 契约把 tool 入参声明为 `unknown` (Static<TSchema> 实测 = unknown)。
 * 实现需要按键取值 → 用**类型谓词**把 unknown 收敛为可索引对象 (非 as any 抑制)。
 * 非对象入参 (null/字符串/数字) 收敛为 {} → 与旧实现 `k in params` 对原始字符串会
 * 命中字符索引的行为相比, 语义更严且不会崩 (旧实现传字符串时行为未定义)。
 */
function isParamRecord(v) {
    return typeof v === "object" && v !== null;
}
function asParamRecord(v) {
    return isParamRecord(v) ? v : {};
}
function makeTool(name, entry, label = name) {
    const [description, parameters, fn] = entry;
    void fn;
    return {
        name,
        description,
        label,
        parameters,
        async execute(_toolCallId, params) {
            try {
                // 取 ordered args 按 schema.properties 顺序 (关键: 防 optional 缺省导致位置错)
                const props = parameters.properties ?? {};
                const paramsObj = asParamRecord(params);
                const orderedArgs = [];
                for (const k of Object.keys(props)) {
                    orderedArgs.push(k in paramsObj ? paramsObj[k] : undefined);
                }
                const r = await fn(...orderedArgs);
                return {
                    content: [{ type: "text", text: typeof r === "string" ? r : JSON.stringify(r) }],
                    details: undefined,
                };
            }
            catch (e) {
                logErr(`tool ${name} failed: ${formatErr(e)}`);
                return {
                    content: [{ type: "text", text: `Error: ${e.message}` }],
                    details: undefined,
                };
            }
        },
    };
}
/**
 * 整个 TOOL_META 走 buildAgentTools 输出 ChannelAgentTool[]
 */
export function buildAgentTools(meta) {
    const out = [];
    for (const [name, entry] of Object.entries(meta)) {
        out.push(makeTool(name, entry));
        // 工具注册枚举是启动噪音 (200+ 行/load), 排查时开 WPP_DEBUG 再看
        debug(`agent-tools: + ${name}`);
    }
    return out;
}
//# sourceMappingURL=factory.js.map