import { Type } from "typebox";
import { callMcpTool } from "../../vendor-mcp-client.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";
function mcpEnabledForCurrentAccount() {
    const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
    return state?.config.mcpEnabled !== false;
}
async function readMcp(name, args = {}) {
    const accountId = getCurrentAccountId();
    if (!mcpEnabledForCurrentAccount()) {
        return `MCP 未启用 (账号 ${accountId ?? "default"} mcpEnabled=false), 无法调用 ${name}`;
    }
    const r = await callMcpTool(name, args, accountId);
    if (!r)
        return `MCP ${name} 调用失败 (vendor MCP 不可用或无 WECHATPRO_AUTHCODE env)`;
    const result = r;
    if (result.isError)
        return `MCP ${name} 返回错误: ${result.content?.[0]?.text ?? "unknown"}`;
    const texts = (result.content ?? [])
        .filter((b) => typeof b.text === "string")
        .map((b) => b.text)
        .join("\n");
    return texts || `MCP ${name} 返回空`;
}
export const MCP_META = {
    mcpAccountStatus: [
        "查询当前微信账号状态 (在线/设备模式/昵称). 无需参数.",
        Type.Object({}),
        () => readMcp("wechat_account_status", {}),
    ],
    mcpGetContact: [
        "查询单个微信联系人详情 (需之前 list/search 返回的 id).",
        Type.Object({ id: Type.String({ description: "联系人 id (list/search 返回) 或 wxid" }) }),
        (id) => readMcp("wechat_get_contact", { id }),
    ],
    mcpGetGroup: [
        "查询单个微信群详情 (id, 群名, 群主, 成员数, 公告).",
        Type.Object({ id: Type.String({ description: "群 id (@chatroom)" }) }),
        (id) => readMcp("wechat_get_group", { id }),
    ],
    mcpRecentMessages: [
        "查询最近 24 小时收到的消息 (最多 500 条). 用于看最近对话/定位某人消息.",
        Type.Object({ limit: Type.Optional(Type.Number({ description: "条数 1-500, 默认 50" })) }),
        (limit) => readMcp("wechat_get_recent_messages", { limit: limit ?? 50 }),
    ],
    mcpListContacts: [
        "分页列出微信联系人. 用 next_offset 翻页.",
        Type.Object({
            offset: Type.Optional(Type.Number({ description: "起始偏移, 用上次返回的 next_offset" })),
            limit: Type.Optional(Type.Number({ description: "每页 1-100, 默认 20" })),
        }),
        (offset, limit) => readMcp("wechat_list_contacts", { offset: offset ?? 0, limit: limit ?? 20 }),
    ],
    mcpListGroups: [
        "分页列出微信群. 用 next_offset 翻页.",
        Type.Object({
            offset: Type.Optional(Type.Number({ description: "起始偏移, 用上次返回的 next_offset" })),
            limit: Type.Optional(Type.Number({ description: "每页 1-100, 默认 20" })),
        }),
        (offset, limit) => readMcp("wechat_list_groups", { offset: offset ?? 0, limit: limit ?? 20 }),
    ],
    mcpSearch: [
        "搜索微信 (公众号/文章/小程序/视频号/朋友圈等). category 选类别, query 关键词.",
        Type.Object({
            query: Type.String({ description: "搜索词 (2-100 字符)" }),
            category: Type.String({ description: "类别: all/article/official_account/channels/mini_program/moments/ai/live/image/read/listen/emoji/baike/news/wechat_index/mini_game/sticker/underline" }),
            offset: Type.Optional(Type.Number({ description: "翻页偏移" })),
            limit: Type.Optional(Type.Number({ description: "每页 1-100, 默认 10" })),
        }),
        (query, category, offset, limit) => readMcp("wechat_search", { query, category, offset: offset ?? 0, limit: limit ?? 10 }),
    ],
};
