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
import {
  FAVORITES_META,
  LABEL_META,
  VOICE_META,
  SAY_HELLO_META,
  TRANSLATE_META,
  CUSTOMIZED_META,
  QW_CONTACT_META,
} from "./misc-meta.js";

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
};

/** Phase F final: AGENT_TOOLS ChannelAgentTool[] 给 plugin.agentTools 注入 */
export const AGENT_TOOLS = buildAgentTools(AGENT_TOOLS_META);

export type ChannelAgentTool = ReturnType<typeof buildAgentTools>[number];
