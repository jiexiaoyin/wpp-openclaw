// src/dispatch/agent-tools/index.ts - aggregate all 21 meta files + AGENT_TOOLS exposed to plugin

import { buildAgentTools } from "./factory.js";
import { LOGIN_META } from "./login-meta.js";
import { MSG_META } from "./msg-meta.js";
import { GROUP_META } from "./group-meta.js";
import { FRIEND_META } from "./friend-meta.js";
import { USER_META } from "./user-meta.js";
import { WEBHOOK_META } from "./webhook-meta.js";
import { FINDER_META } from "./finder-meta.js";
import { FRIEND_CIRCLE_META } from "./friendcircle-meta.js";
import { SEARCH_META } from "./search-meta.js";
import { WXAPP_META } from "./wxapp-meta.js";
import { OFFICIAL_ACCOUNTS_META } from "./officialaccounts-meta.js";
import { TOOLS_META } from "./tools-meta.js";
import { TEN_PAY_META } from "./tenpay-meta.js";
// v1.3.19 MISC-SPLIT: 7 小 tag 各自独立文件 (不再经 misc-meta barrel)
import { FAVORITES_META } from "./favorites-meta.js";
import { LABEL_META } from "./label-meta.js";
import { VOICE_META } from "./voice-meta.js";
import { SAY_HELLO_META } from "./sayhello-meta.js";
import { TRANSLATE_META } from "./translate-meta.js";
import { CUSTOMIZED_META } from "./customized-meta.js";
import { QW_CONTACT_META } from "./qwcontact-meta.js";
import { MCP_META } from "./mcp-meta.js";
import { XIAO_WEI_META } from "./xiaowei-meta.js"; // v1.3.71: 小微预开发 — 工具在 AGENT_TOOLS, 但执行前检查 xiaoweiEnabled 开关

/** 全部 vendor tag meta 合并为 AGENT_TOOLS_META */
export const AGENT_TOOLS_META = {
  ...LOGIN_META,
  ...MSG_META,
  ...GROUP_META,
  ...FRIEND_META,
  ...USER_META,
  ...WEBHOOK_META,
  ...FINDER_META,
  ...FRIEND_CIRCLE_META,
  ...SEARCH_META,
  ...WXAPP_META,
  ...OFFICIAL_ACCOUNTS_META,
  ...TOOLS_META,
  ...TEN_PAY_META,
  ...FAVORITES_META,
  ...LABEL_META,
  ...VOICE_META,
  ...SAY_HELLO_META,
  ...TRANSLATE_META,
  ...CUSTOMIZED_META,
  ...QW_CONTACT_META,
  ...MCP_META, // v1.3.58 MCP-READONLY: vendor MCP 只读工具 (账号/联系人/群/搜索)
  ...XIAO_WEI_META, // v1.3.71: 小微智能体 (工具暴露但执行前检查 xiaoweiEnabled 开关)
};

/** Phase F final: AGENT_TOOLS ChannelAgentTool[] 给 plugin.agentTools 注入 */
export const AGENT_TOOLS = buildAgentTools(AGENT_TOOLS_META);

export type ChannelAgentTool = ReturnType<typeof buildAgentTools>[number];
