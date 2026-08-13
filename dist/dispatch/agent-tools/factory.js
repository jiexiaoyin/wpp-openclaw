import { error as logErr, info, formatErr } from "../../core/logger.js";
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
                const props = parameters.properties ?? {};
                const orderedArgs = [];
                for (const k of Object.keys(props)) {
                    orderedArgs.push(k in params ? params[k] : undefined);
                }
                const r = await fn(...orderedArgs);
                return {
                    content: [{ type: "text", text: typeof r === "string" ? r : JSON.stringify(r) }],
                };
            }
            catch (e) {
                logErr(`tool ${name} failed: ${formatErr(e)}`);
                return {
                    content: [{ type: "text", text: `Error: ${e.message}` }],
                };
            }
        },
    };
}
export function buildAgentTools(meta) {
    const out = [];
    for (const [name, entry] of Object.entries(meta)) {
        out.push(makeTool(name, entry));
        info(`agent-tools: + ${name}`);
    }
    return out;
}
