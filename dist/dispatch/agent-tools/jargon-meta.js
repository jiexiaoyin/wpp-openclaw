import { Type } from "typebox";
import { getJargonTerms } from "../../storage/db/jargon.js";
import { getCurrentAccountId } from "../account-context.js";
export function containsJargon(term, text) {
    if (!term || !text)
        return false;
    if (/^[a-zA-Z0-9_+-]+$/.test(term)) {
        return new RegExp(`(?<![a-zA-Z0-9_+-])${escapeRegExp(term)}(?![a-zA-Z0-9_+-])`).test(text);
    }
    return text.includes(term);
}
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
async function queryJargon(groupId, text) {
    const accountId = getCurrentAccountId() ?? "default";
    let terms = [];
    try {
        terms = await getJargonTerms(accountId, groupId, 100);
    }
    catch (e) {
        return `查询黑话失败 (可能 DB 未初始化): ${e instanceof Error ? e.message : String(e)}`;
    }
    if (terms.length === 0) {
        return `群 ${groupId} 暂无已记录的黑话 (群聊消息积累后自动挖掘)。`;
    }
    const hits = text
        ? terms.filter((t) => containsJargon(t.term, text))
        : [];
    if (hits.length > 0) {
        const lines = hits.map((t) => `- ${t.term}: ${t.meaning || "（暂无含义）"}`);
        return `「${text}」中包含以下黑话:\n${lines.join("\n")}\n\n(仅供理解群内用语, 不代表你回复必须使用)`;
    }
    const lines = terms
        .filter((t) => t.is_jargon !== 0)
        .slice(0, 30)
        .map((t) => `- ${t.term}: ${t.meaning || "（暂无含义）"} (频率${t.frequency ?? 1})`);
    return `群 ${groupId} 已知黑话 (共 ${terms.length} 条, 显示前 30):\n${lines.join("\n") || "（暂无）"}\n\n(仅供理解群内用语, 不要刻意使用)`;
}
async function listJargon(groupId) {
    const accountId = getCurrentAccountId() ?? "default";
    let terms = [];
    try {
        terms = await getJargonTerms(accountId, groupId, 100);
    }
    catch (e) {
        return `查询黑话失败: ${e instanceof Error ? e.message : String(e)}`;
    }
    if (terms.length === 0)
        return `群 ${groupId} 暂无已记录的黑话。`;
    const lines = terms
        .filter((t) => t.is_jargon !== 0)
        .map((t) => `- ${t.term}: ${t.meaning || "（暂无含义）"} (频率${t.frequency ?? 1})`);
    return `群 ${groupId} 黑话库 (${terms.length} 条):\n${lines.join("\n")}`;
}
export const JARGON_META = {
    query_jargon: [
        "查询群黑话含义. 当群消息里出现看不懂的缩写/内部梗/圈内用语时, 传入消息文本, 返回其中包含的黑话及含义. 也支持直接传群ID查该群黑话库. 仅供理解, 不要刻意模仿黑话.",
        Type.Object({
            groupId: Type.String({ description: "群 ID (xxx@chatroom)" }),
            text: Type.Optional(Type.String({ description: "消息文本, 用于匹配其中的黑话 (可留空)" })),
        }),
        (groupId, text) => queryJargon(groupId, text),
    ],
    list_jargon: [
        "列出某群的已挖掘黑话库 (词条+含义+频率). 用于了解群内语言习惯. 仅供理解, 不要刻意模仿.",
        Type.Object({
            groupId: Type.String({ description: "群 ID (xxx@chatroom)" }),
        }),
        (groupId) => listJargon(groupId),
    ],
};
