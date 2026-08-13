// src/dispatch/agent-tools/mcp-meta.ts - MCP tag (只读工具, 7)
// v1.3.58 MCP-READONLY (2026-08-13 老板拍板方案1): vendor MCP 只读能力整合给 AI。
//
// 背景: vendor MCP (127.0.0.1:8062/mcp) 有 13 工具 (7 只读 + 6 写)。
//   写工具 (send_text 等) 需 2026-07-28 协议 + elicitation 确认流, 当前 SDK 1.30 打不通 (确认流待 vendor 出参考客户端)。
//   只读工具 (account_status/get_contact/get_group/get_recent_messages/list_contacts/list_groups/search) 完全可用。
//
// 价值: AI 可直接查账号状态/联系人/群/搜索微信, 补全现有 vendor HTTP API 之外的能力
//   (现有 API 查联系人要分页, MCP list 更直接; search 是 MCP 独有)。
//
// 安全: 全部只读, 无写副作用; 走 vendor-mcp-client (Bearer authcode + 超时 + 失败返回 null)。

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { callMcpTool } from "../../vendor-mcp-client.js";

/**
 * 调 MCP 只读工具, 返回可读文本。
 * callMcpTool 返回 {content:[{type:"text",text}]} 或 null → 归一化成 text (供 AI 读)。
 */
async function readMcp(name: string, args: Record<string, unknown> = {}): Promise<string> {
  const r = await callMcpTool(name, args);
  if (!r) return `MCP ${name} 调用失败 (vendor MCP 不可用或无 WECHATPRO_AUTHCODE env)`;
  const result = r as { content?: Array<{ type?: string; text?: string }>; isError?: boolean };
  if (result.isError) return `MCP ${name} 返回错误: ${result.content?.[0]?.text ?? "unknown"}`;
  const texts = (result.content ?? [])
    .filter((b) => typeof b.text === "string")
    .map((b) => b.text)
    .join("\n");
  return texts || `MCP ${name} 返回空`;
}

export const MCP_META: ToolMeta = {
  /** 账号状态 (在线/设备模式/昵称) */
  mcpAccountStatus: [
    "查询当前微信账号状态 (在线/设备模式/昵称). 无需参数.",
    Type.Object({}),
    () => readMcp("wechat_account_status", {}),
  ],
  /** 查单个联系人 */
  mcpGetContact: [
    "查询单个微信联系人详情 (需之前 list/search 返回的 id).",
    Type.Object({ id: Type.String({ description: "联系人 id (list/search 返回) 或 wxid" }) }),
    (id: string) => readMcp("wechat_get_contact", { id }),
  ],
  /** 查单个群 */
  mcpGetGroup: [
    "查询单个微信群详情 (id, 群名, 群主, 成员数, 公告).",
    Type.Object({ id: Type.String({ description: "群 id (@chatroom)" }) }),
    (id: string) => readMcp("wechat_get_group", { id }),
  ],
  /** 最近消息 (24h) */
  mcpRecentMessages: [
    "查询最近 24 小时收到的消息 (最多 500 条). 用于看最近对话/定位某人消息.",
    Type.Object({ limit: Type.Optional(Type.Number({ description: "条数 1-500, 默认 50" })) }),
    (limit?: number) => readMcp("wechat_get_recent_messages", { limit: limit ?? 50 }),
  ],
  /** 列联系人 */
  mcpListContacts: [
    "分页列出微信联系人. 用 next_offset 翻页.",
    Type.Object({
      offset: Type.Optional(Type.Number({ description: "起始偏移, 用上次返回的 next_offset" })),
      limit: Type.Optional(Type.Number({ description: "每页 1-100, 默认 20" })),
    }),
    (offset?: number, limit?: number) => readMcp("wechat_list_contacts", { offset: offset ?? 0, limit: limit ?? 20 }),
  ],
  /** 列群 */
  mcpListGroups: [
    "分页列出微信群. 用 next_offset 翻页.",
    Type.Object({
      offset: Type.Optional(Type.Number({ description: "起始偏移, 用上次返回的 next_offset" })),
      limit: Type.Optional(Type.Number({ description: "每页 1-100, 默认 20" })),
    }),
    (offset?: number, limit?: number) => readMcp("wechat_list_groups", { offset: offset ?? 0, limit: limit ?? 20 }),
  ],
  /** 微信搜索 */
  mcpSearch: [
    "搜索微信 (公众号/文章/小程序/视频号/朋友圈等). category 选类别, query 关键词.",
    Type.Object({
      query: Type.String({ description: "搜索词 (2-100 字符)" }),
      category: Type.String({ description: "类别: all/article/official_account/channels/mini_program/moments/ai/live/image/read/listen/emoji/baike/news/wechat_index/mini_game/sticker/underline" }),
      offset: Type.Optional(Type.Number({ description: "翻页偏移" })),
      limit: Type.Optional(Type.Number({ description: "每页 1-100, 默认 10" })),
    }),
    (query: string, category: string, offset?: number, limit?: number) =>
      readMcp("wechat_search", { query, category, offset: offset ?? 0, limit: limit ?? 10 }),
  ],
};
