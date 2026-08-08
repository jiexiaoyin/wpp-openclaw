// src/inbound/parser/mention.ts - 群消息 @user 提取
// 关键: vendor 推送群消息时 group prefix 通常是 ":\n<sender>:\n<body>",
// 但实际 vendor binary 形态多样; 这里先实现两种最常见的 regex

import { isValidAtUser } from "./wxid.js";

const AT_MENTION_PATTERNS: RegExp[] = [
  // `wxid_xxx@<nickname>` — 见于群聊 @ 通知
  /(wxid_[a-zA-Z0-9]+)@[^,\s]*/g,
  // `\@wxid_xxx ` 中文 @ + wxid
  /@(wxid_[a-zA-Z0-9]+)/g,
  // `<at user="wxid_xxx">` XML 风格
  /<at\s+user="(wxid_[a-zA-Z0-9]+)"/g,
  // 群 XML: <atuserlist><item><username>wxid_xxx</username>
  /<atuserlist>[\s\S]*?<username>(wxid_[a-zA-Z0-9]+)<\/username>/g,
  // v1.1.17 FULL-FIX: 支持微信号格式 (e.g. q139198824 — 老板 selfWxid 是微信号非 wxid_)
  //   之前 regex 硬要求 wxid_/gh_ 前缀 → 微信号 @ 漏判 (群里 @ 机器人永远不触发)
  /<atuserlist>[\s\S]*?<username>([a-zA-Z][a-zA-Z0-9_-]{5,})<\/username>/g,
  /@([a-zA-Z][a-zA-Z0-9_-]{5,})[^\s@]*/g,
];

/**
 * Extract list of valid wxids mentioned in a group message.
 * 去重, 保序.
 */
export function extractAtUserList(content: string): string[] {
  const out = new Set<string>();
  for (const pat of AT_MENTION_PATTERNS) {
    const matches = content.matchAll(pat);
    for (const m of matches) {
      const wxid = m[1];
      if (wxid && isValidAtUser(wxid)) out.add(wxid);
    }
  }
  return Array.from(out);
}

/** Strip `@bot` text tokens from content (留 emoji 之类) */
export function stripAtMentions(content: string, botWxid: string | null): string {
  if (!botWxid) return content;
  // 匹配 wxid_botwxid 或者 @botwxid 等
  const escaped = botWxid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return content
    .replace(new RegExp(`@${escaped}\\s*`, "g"), "")
    .replace(new RegExp(`\\b${escaped}\\b\\s*`, "g"), "")
    .trim();
}

/** True if message text contains @bot */
export function isBotMentionedByText(content: string, botWxid: string | null): boolean {
  if (!botWxid) return false;
  if (!content) return false;
  if (content.includes(`@${botWxid}`)) return true;
  if (content.includes(` ${botWxid}`)) return true;
  return extractAtUserList(content).includes(botWxid);
}
