import { stripGroupPrefix } from "./parser/content.js";
export function isRelayMessage(m) {
    if (m.msgType === 53)
        return true;
    if (m.msgType !== 49)
        return false;
    const rawApp = m.raw?.app;
    const rawTitle = typeof rawApp?.title === "string" ? rawApp.title : "";
    const text = `${m.content ?? ""} ${rawTitle}`;
    return text.includes("#接龙") || (text.includes("接龙") && /(?:^|\n)\s*\d+\.\s/.test(text));
}
export function parseRelayText(raw) {
    const text = raw.replace(/\\n/g, "\n").replace(/\r\n/g, "\n");
    const titleMatch = text.match(/<title>([\s\S]*?)<\/title>/);
    const titleRaw = titleMatch?.[1] ?? "";
    const title = stripGroupPrefix(titleRaw).trim();
    const titleWithFallback = title || text.split("\n")[0]?.trim() || "";
    const recordBlocks = text.match(/<recorditem>[\s\S]*?<\/recorditem>/g);
    let items = [];
    if (recordBlocks && recordBlocks.length > 0) {
        items = recordBlocks.map(parseRecordItem);
    }
    else {
        items = parsePlainList(text);
    }
    return { title: titleWithFallback, items };
}
function parseRecordItem(block, idx) {
    const wxid = block.match(/<username>([\s\S]*?)<\/username>/)?.[1]?.trim();
    const nickname = block.match(/<nickname>([\s\S]*?)<\/nickname>/)?.[1]?.trim();
    const text = block.match(/<text>([\s\S]*?)<\/text>/)?.[1]?.trim();
    return { index: idx + 1, wxid, nickname, text };
}
function parsePlainList(text) {
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const merged = [];
    for (const line of lines) {
        if (/^\d+\.\s/.test(line)) {
            merged.push(line);
        }
        else if (merged.length > 0) {
            merged[merged.length - 1] += " " + line;
        }
        else {
        }
    }
    const chunks = merged.join("\n").split(/(?=\d+\.\s)/).filter((c) => /^\d+\.\s/.test(c.trim()));
    return chunks
        .map((chunk, i) => {
        const m = chunk.trim().match(/^(\d+)\.\s*(.*)$/);
        if (!m)
            return null;
        const [, idxStr, rest] = m;
        return {
            index: Number(idxStr ?? i + 1),
            text: rest?.trim() || undefined,
        };
    })
        .filter((x) => x !== null);
}
