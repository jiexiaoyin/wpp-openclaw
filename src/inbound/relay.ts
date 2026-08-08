// src/inbound/relay.ts - 群接龙 (chat-history) XML 解析
// 关键: vendor 把 chat-history 作为 appmsg type=53 push, 内含 `<recorditem>` 列表
// (v1 教训: title 字段常含字面 `\n` 真 bug, regex [^\n] 只 match 第 1 条)

import { stripGroupPrefix } from "./parser/content.js";

export interface RelayItem {
  /** 第 N 个条目 (1-based) */
  index: number;
  /** 用户 wxid */
  wxid?: string;
  /** 用户昵称 */
  nickname?: string;
  /** 文字内容 (去 emoji 等) */
  text?: string;
  /** 时间戳 (如有) */
  ts?: number;
}

export interface RelayParseResult {
  title: string;
  items: RelayItem[];
}

/**
 * 解析 vendor 推送的 chat-history/接龙 msg body.
 *
 * 重要: title 字面 `\n` (`\<0x5c><0x6e>`) 不是真换行 — 解析前先 `.replace(/\\n/g, "\n")`.
 * 否则 regex `[^\n]` 只 match 第 1 条 → items.length=1 真 bug
 */
export function parseRelayText(raw: string): RelayParseResult {
  const text = raw.replace(/\\n/g, "\n").replace(/\r\n/g, "\n");

  // 提取 title (chat-history / 接龙)
  // vendor 二进制实测 title 块形如 `<title>...</title>` 或裸字符串
  const titleMatch = text.match(/<title>([\s\S]*?)<\/title>/);
  const titleRaw = titleMatch?.[1] ?? "";
  const title = stripGroupPrefix(titleRaw).trim();

  // 列表条目 — vendor push 用 `<recorditem>` 块或裸 `\n<index>. <nickname>: <text>`
  // 实测: vendor binary 不一定写 <recorditem>, 而是直接 `<index>. <text>` per line
  const recordBlocks = text.match(/<recorditem>[\s\S]*?<\/recorditem>/g);
  let items: RelayItem[] = [];
  if (recordBlocks && recordBlocks.length > 0) {
    items = recordBlocks.map(parseRecordItem);
  } else {
    items = parsePlainList(text);
  }

  return { title, items };
}

function parseRecordItem(block: string, idx: number): RelayItem {
  const wxid = block.match(/<username>([\s\S]*?)<\/username>/)?.[1]?.trim();
  const nickname = block.match(/<nickname>([\s\S]*?)<\/nickname>/)?.[1]?.trim();
  const text = block.match(/<text>([\s\S]*?)<\/text>/)?.[1]?.trim();
  return { index: idx + 1, wxid, nickname, text };
}

function parsePlainList(text: string): RelayItem[] {
  // vendor 常见: "1. Alice: 我...\n2. Bob: ..."
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  return lines
    .map((line, i): RelayItem | null => {
      const m = line.match(/^(\d+)\.\s*(?:([^:]+):)?\s*(.*)$/);
      if (!m) return null;
      const [, idxStr, nickname, content] = m;
      return {
        index: Number(idxStr ?? i + 1),
        nickname: nickname?.trim(),
        text: content?.trim(),
      };
    })
    .filter((x): x is RelayItem => x !== null);
}
