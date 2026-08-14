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
 * v1.3.54 RELAY-TRIGGER (2026-08-12 接总立): 识别接龙消息。
 *
 * 真实 vendor 接龙推送 (v1 schema) 是 **type=49 (app, category=app_message)**, title/content 以 "#接龙" 开头;
 * handler 之前只判断 `msgType === 53` (describeMsgType 映射的 chat-history) → 从未匹配 → 接龙不解析、不触发 AI。
 * (v1.3.37 RELAY-PARSE 测试用的 53 是假设, 跟真实 vendor 数据不符 — 集成 bug)
 *
 * 识别:
 *   - msgType===53 (旧 chat-history, 兼容历史)
 *   - msgType===49 && (content/title 含 "#接龙" 或 "接龙" + 编号条目)
 */
export function isRelayMessage(m: { msgType?: number; content?: string; raw?: unknown }): boolean {
  if (m.msgType === 53) return true; // 旧 chat-history (历史兼容)
  if (m.msgType !== 49) return false; // 非 app → 非接龙
  const rawApp = (m.raw as { app?: { title?: unknown } } | undefined)?.app;
  const rawTitle = typeof rawApp?.title === "string" ? rawApp.title : "";
  const text = `${m.content ?? ""} ${rawTitle}`;
  // 微信接龙模板以 "#接龙" 开头; 兼容 "接龙" + 编号条目 (N. xxx) 变体
  return text.includes("#接龙") || (text.includes("接龙") && /(?:^|\n)\s*\d+\.\s/.test(text));
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
  // v1.3.57 (2026-08-13): 无 <title> 标签时 (真实接龙 type=49 常无), 用 "#接龙 xxx" 首行作 title —
  //   否则所有接龙 title 为空 → 接龙节流 key 相同 → 不同接龙互相节流
  const titleWithFallback = title || text.split("\n")[0]?.trim() || "";

  // 列表条目 — vendor push 用 `<recorditem>` 块或裸 `\n<index>. <nickname>: <text>`
  // 实测: vendor binary 不一定写 <recorditem>, 而是直接 `<index>. <text>` per line
  const recordBlocks = text.match(/<recorditem>[\s\S]*?<\/recorditem>/g);
  let items: RelayItem[] = [];
  if (recordBlocks && recordBlocks.length > 0) {
    items = recordBlocks.map(parseRecordItem);
  } else {
    items = parsePlainList(text);
  }

  return { title: titleWithFallback, items };
}

function parseRecordItem(block: string, idx: number): RelayItem {
  const wxid = block.match(/<username>([\s\S]*?)<\/username>/)?.[1]?.trim();
  const nickname = block.match(/<nickname>([\s\S]*?)<\/nickname>/)?.[1]?.trim();
  const text = block.match(/<text>([\s\S]*?)<\/text>/)?.[1]?.trim();
  return { index: idx + 1, wxid, nickname, text };
}

/**
 * v2026-08-14 10:45 fix (老板 query): 兼容 vendor push 单行无换行接龙.
 * 实测: vendor 把整条接龙 title + 规则 + 接龙者 拼成 1 行字符串, 没有 \n.
 * 例: "#接龙 🎯🎯🎯 ... ㊗益融8月大卖...🥳 1. 门店＋型号 2. 金源北路GT7蓝 倪彩霞"
 * → 直接按 \d+\. 切, 拿到 ["1. 门店＋型号 ", "2. 金源北路GT7蓝 倪彩霞"]
 *   (按老板 6-09 / 8-12 指正: 不假设首词=昵称, 整段给 AI 自己判断)
 */
/** P2-3: 剥掉首个 \d+\.\s 之前的接龙前缀 ("#接龙 xxx 3. 周年庆 ...") — 回退用 */
function stripTitlePrefix(text: string): string {
  const idx = text.search(/\d+\.\s/);
  return idx > 0 ? text.slice(idx) : text;
}

function parsePlainListSingleLine(text: string): RelayItem[] {
  // v1.3.63 P2-3 (2026-08-14 审阅): title 里可能含 "N. " (如 "#接龙 3. 周年庆 1. 门店＋型号 2. ...")
  //   → 不剥前缀会把 "3. 周年庆" 误判成条目且序号乱。策略:
  //     条目总是从 `1. ` 开始 → 从第一个 `1. ` 处切起 (title 里即使有 "3. 周年庆" 也在 1. 之前被弃)
  //     无 `1. ` 时回退: 剥掉首个 \d+\.\s 之前的接龙前缀再切。
  const oneIdx = text.search(/(?:^|\s)1\.\s/);
  const body = oneIdx >= 0 ? text.slice(oneIdx).replace(/^\s+/, "") : stripTitlePrefix(text);
  const chunks = body.split(/(?=\d+\.\s)/).filter((c) => /^\d+\.\s/.test(c.trim()));
  return chunks
    .map((chunk, i): RelayItem | null => {
      const m = chunk.trim().match(/^(\d+)\.\s*(.*)$/);
      if (!m) return null;
      const [, idxStr, rest] = m;
      return {
        index: Number(idxStr ?? i + 1),
        text: rest?.trim() || undefined,
      };
    })
    .filter((x): x is RelayItem => x !== null);
}

function parsePlainList(text: string): RelayItem[] {
  // 统一处理: 先按 \n 分行, 非 "N." 开头的行合并到上一条 (条目内换行延续, 如 "2. 倪彩霞\ngt7")
  //   再按 `\d+\.` 切分成条目 (支持单行 "1. 2. 倪彩霞 gt7 3. ..." 和无换行混合)
  //
  // v2026-08-14 10:45 fix (老板 query, per 6-09 教训回归): vendor push 接龙内容**单行无换行**,
  //   原代码 `text.split(/\n+/)` 只返回 1 个 line, 后续 for loop 因 line 不以 \d+. 开头被跳过,
  //   merged 永远是空 → items=[]. 修法: line 单一时直接走 regex split, 不依赖 \n.
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  // 合并: 不以 \d+. 开头的行 → 追加到上一条 (条目内换行)
  const merged: string[] = [];
  if (lines.length === 1) {
    // 单行无换行 (vendor push 真实格式): 直接按 \d+\. 切, 不依赖 \n 分行
    return parsePlainListSingleLine(lines[0]!);
  }
  for (const line of lines) {
    if (/^\d+\.\s/.test(line)) {
      merged.push(line);
    } else if (merged.length > 0) {
      merged[merged.length - 1] += " " + line;
    } else {
      // 前导描述 (接龙标题等), 忽略
    }
  }
  // 按 `\d+\.` 切分 (支持单行多条 + 已合并的多行)
  const chunks = merged.join("\n").split(/(?=\d+\.\s)/).filter((c) => /^\d+\.\s/.test(c.trim()));
  return chunks
    .map((chunk, i): RelayItem | null => {
      const m = chunk.trim().match(/^(\d+)\.\s*(.*)$/);
      if (!m) return null;
      const [, idxStr, rest] = m;
      // 保守解析: 只按序号切开, 整段保留原文 (老板 2026-08-11 指正:
      //   接龙用户可改/删昵称, 不能假设首词=昵称 — 让 AI 从上下文理解)
      return {
        index: Number(idxStr ?? i + 1),
        text: rest?.trim() || undefined,
      };
    })
    .filter((x): x is RelayItem => x !== null);
}
