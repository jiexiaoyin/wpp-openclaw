// src/inbound/parser/mention.ts - 群消息 @user 提取
// 注意: 所有 regex 走 safeMatchAll (截断 4096 + 灾难 regex 检测, 防 ReDoS — gewe A1 教训)

import { isValidAtUser } from "./wxid.js";
import { safeMatchAll } from "../../core/safe-regex.js";

const AT_MENTION_PATTERNS: RegExp[] = [
  // `wxid_xxx@<nickname>` — 群聊 @ 通知
  /(wxid_[a-zA-Z0-9]+)@[^,\s]*/g,
  // `\@wxid_xxx ` 中文 @ + wxid
  /@(wxid_[a-zA-Z0-9]+)/g,
  // `<at user="wxid_xxx">` XML 风格
  /<at\s+user="(wxid_[a-zA-Z0-9]+)"/g,
  // 群 XML: <atuserlist><item><username>wxid_xxx</username>
  /<atuserlist>[\s\S]*?<username>(wxid_[a-zA-Z0-9]+)<\/username>/g,
  // 微信号格式 (e.g. wxid_demo — selfWxid 是微信号非 wxid_, 之前硬要求 wxid_ 前缀漏判)
  /<atuserlist>[\s\S]*?<username>([a-zA-Z][a-zA-Z0-9_-]{5,})<\/username>/g,
  /@([a-zA-Z][a-zA-Z0-9_-]{5,})[^\s@]*/g,
];

/** Extract list of valid wxids mentioned in a group message (去重, 保序) */
export function extractAtUserList(content: string): string[] {
  const out = new Set<string>();
  for (const pat of AT_MENTION_PATTERNS) {
    const matches = safeMatchAll(pat, content);
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
  const truncated =
    content.length > 4096 ? content.slice(0, 4096) : content; // v1.1.33: 截断防 ReDoS
  return truncated
    .replace(new RegExp(`@${escaped}\\s*`, "g"), "")
    .replace(new RegExp(`\\b${escaped}\\b\\s*`, "g"), "")
    .trim();
}

/** True if message text contains @bot */
export function isBotMentionedByText(content: string, botWxid: string | null): boolean {
  if (!botWxid) return false;
  if (!content) return false;
  if (content.includes(`@${botWxid}`)) return true;
  if (content.includes(` ${botWxid}`)) return true;
  return extractAtUserList(content).includes(botWxid);
}

// ============ 群消息清洗 (cleanGroupMessage) ============
// 群里 @ 检测通过后, 清洗 content 让 AI 看到干净正文 (去 wxid_xxx:\n sender 前缀 + 去 @bot 提及)。
// 仅清洗给 AI 看的 content, 不动 DB 落库 (持久化路径保持原始)。

import { stripGroupContentPrefix } from "../../send/quote-reply.js";

/**
 * 群消息清洗: 去 sender 前缀 (wxid_xxx:\n) + 去 @bot 提及, 让 AI 看干净正文
 *
 * @example
 *   cleanGroupMessage("wxid_sender:\n@bot 你好", "wxid_demo") // → "你好"
 *   cleanGroupMessage("wxid_xxx:\n@bot @所有人 开会", "wxid_demo")     // → "@所有人 开会" (只去 @bot)
 *   cleanGroupMessage("普通消息", "wxid_demo")                            // → "普通消息"
 */
export function cleanGroupMessage(content: string, botWxid: string | null): string {
  if (!content) return content;
  // 步骤 1: 去 wxid_xxx:\n sender 前缀; 步骤 2: 去 @botwxid 提及
  const noSender = stripGroupContentPrefix(content) ?? content;
  const noAt = stripAtMentions(noSender, botWxid);
  return noAt;
}
