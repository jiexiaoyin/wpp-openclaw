import { info, debug } from "../core/logger.js";
import { safeFetch } from "../util/safe-fetch.js";
const MIN_TERM_LENGTH = 2;
const MIN_FREQUENCY = 5;
const MAX_CONTEXT_EXAMPLES = 10;
const JIEBA_FREQ_THRESHOLD = 100;
const WEIGHT_IDF = 0.4;
const WEIGHT_BURST = 0.3;
const WEIGHT_CONCENTRATION = 0.3;
const NGRAM_MAX = 4;
const BURST_AGE_CAP_DAYS = 14;
const STOPWORDS = new Set([
    "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "个", "上", "也", "很",
    "到", "说", "要", "去", "你", "会", "着", "没", "看", "好", "自", "这", "他", "她", "它", "们",
    "吗", "吧", "呢", "啊", "哦", "嗯", "呀", "哈", "那", "么", "什", "啦", "噢", "嘛", "哇",
    "来", "对", "把", "让", "被", "给", "从", "还", "比", "得", "过", "可", "能", "为", "以", "而",
    "但", "或", "如", "与", "等", "及", "其", "之",
    "这个", "那个", "什么", "怎么", "哪里", "这里", "那里", "自己", "大家", "我们", "你们", "他们", "她们", "谁",
    "哪个", "这些", "那些", "多少", "几个", "某个", "别人",
    "知道", "觉得", "感觉", "可以", "应该", "需要", "已经", "开始", "然后", "因为", "所以", "虽然", "如果",
    "不是", "没有", "不会", "不能", "不要", "不用", "不行", "出来", "出去", "进来", "起来", "下去", "回来", "过来",
    "喜欢", "希望", "想要", "能够", "可能", "一定", "必须", "告诉", "问题", "时候", "东西", "事情", "地方", "方面",
    "今天", "昨天", "明天", "现在", "刚才", "以前", "以后", "时间", "上午", "下午", "晚上", "早上", "中午",
    "真的", "确实", "其实", "当然", "特别", "非常", "一直", "还是", "而且", "只是", "只有", "所有", "一些",
    "比较", "最后", "首先", "接着", "终于", "竟然",
    "朋友", "老师", "同学", "学生", "家里", "公司", "学校", "手机", "电脑", "工作", "生活",
    "哈哈", "哈哈哈", "呵呵", "嘻嘻", "啊啊", "嗯嗯", "谢谢", "感谢", "抱歉", "不好意思", "没关系",
    "图片", "表情", "语音", "视频", "文件", "链接",
]);
let _jieba = null;
let _jiebaTried = false;
function loadJieba() {
    if (_jiebaTried)
        return;
    _jiebaTried = true;
    try {
        const mod = require("@node-rs/jieba");
        const jb = mod.default ?? mod;
        _jieba = {
            cut: (s) => jb.cut(s, false),
            freq: (w) => {
                try {
                    const f = jb.freq?.(w);
                    return typeof f === "number" ? f : 0;
                }
                catch {
                    return 0;
                }
            },
        };
        info(`[WPP JARGON] @node-rs/jieba loaded (enhanced segmentation)`);
    }
    catch {
        debug(`[WPP JARGON] @node-rs/jieba not installed, using n-gram fallback`);
    }
}
function isStandardVocabulary(word) {
    if (!_jieba?.freq)
        return false;
    try {
        return (_jieba.freq(word) ?? 0) > JIEBA_FREQ_THRESHOLD;
    }
    catch {
        return false;
    }
}
export function tokenize(text) {
    if (!text)
        return [];
    loadJieba();
    const cleaned = String(text)
        .replace(/@\S+/g, " ")
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/\[.*?\]/g, " ");
    const rawTokens = _jieba ? _jieba.cut(cleaned) : ngramTokens(cleaned);
    const out = [];
    for (const w of rawTokens) {
        const word = w.trim();
        if (word.length < MIN_TERM_LENGTH)
            continue;
        if (STOPWORDS.has(word))
            continue;
        if (/^[\d\s]+$/.test(word))
            continue;
        if (/^[^\w一-鿿]+$/.test(word))
            continue;
        if (isStandardVocabulary(word))
            continue;
        out.push(word);
    }
    return out;
}
function ngramTokens(text) {
    const segments = text.match(/[一-鿿]{2,}|[a-zA-Z]{2,}/g) ?? [];
    const tokens = [];
    for (const seg of segments) {
        if (/^[a-zA-Z]+$/.test(seg)) {
            if (seg.length <= 8)
                tokens.push(seg);
            continue;
        }
        for (let n = NGRAM_MAX; n >= 2; n--) {
            for (let i = 0; i + n <= seg.length; i++) {
                tokens.push(seg.slice(i, i + n));
            }
        }
    }
    return tokens;
}
let stats = {
    groupTermFreq: new Map(),
    globalTermFreq: new Map(),
    userTermFreq: new Map(),
    termFirstSeen: new Map(),
    termContexts: new Map(),
    dirtyGroups: new Set(),
};
export function resetJargonStats() {
    stats = {
        groupTermFreq: new Map(),
        globalTermFreq: new Map(),
        userTermFreq: new Map(),
        termFirstSeen: new Map(),
        termContexts: new Map(),
        dirtyGroups: new Set(),
    };
}
export function updateJargonFromMessage(content, groupId, senderId) {
    if (!content || !groupId)
        return;
    const tokens = tokenize(content);
    if (tokens.length === 0)
        return;
    const now = Date.now() / 1000;
    const groupFreq = stats.groupTermFreq.get(groupId) ?? new Map();
    stats.groupTermFreq.set(groupId, groupFreq);
    const userFreqMap = stats.userTermFreq.get(groupId) ?? new Map();
    stats.userTermFreq.set(groupId, userFreqMap);
    const firstSeen = stats.termFirstSeen.get(groupId) ?? new Map();
    stats.termFirstSeen.set(groupId, firstSeen);
    const contexts = stats.termContexts.get(groupId) ?? new Map();
    stats.termContexts.set(groupId, contexts);
    for (const token of tokens) {
        groupFreq.set(token, (groupFreq.get(token) ?? 0) + 1);
        stats.globalTermFreq.set(token, (stats.globalTermFreq.get(token) ?? 0) + 1);
        const userFreq = userFreqMap.get(token) ?? new Map();
        userFreq.set(senderId, (userFreq.get(senderId) ?? 0) + 1);
        userFreqMap.set(token, userFreq);
        if (!firstSeen.has(token))
            firstSeen.set(token, now);
        const ctx = contexts.get(token) ?? [];
        if (ctx.length < MAX_CONTEXT_EXAMPLES)
            ctx.push(content);
        contexts.set(token, ctx);
    }
    stats.dirtyGroups.add(groupId);
}
export function getJargonCandidates(groupId, topK = 20, excludeTerms) {
    const groupFreq = stats.groupTermFreq.get(groupId);
    if (!groupFreq)
        return [];
    const numGroups = Math.max(stats.groupTermFreq.size, 1);
    const exclude = excludeTerms ?? new Set();
    const candidates = [];
    for (const [term, freq] of groupFreq) {
        if (freq < MIN_FREQUENCY)
            continue;
        if (exclude.has(term))
            continue;
        let groupsContaining = 0;
        for (const gf of stats.groupTermFreq.values()) {
            if (gf.has(term))
                groupsContaining += 1;
        }
        const idf = Math.log(numGroups / Math.max(groupsContaining, 1));
        const burstScore = calcBurstScore(term, groupId);
        const uniqueUsers = stats.userTermFreq.get(groupId)?.get(term)?.size ?? 0;
        const concentration = 1.0 / Math.max(uniqueUsers, 1);
        const score = idf * WEIGHT_IDF + burstScore * WEIGHT_BURST + concentration * WEIGHT_CONCENTRATION;
        candidates.push({
            term,
            score: Math.round(score * 10000) / 10000,
            frequency: freq,
            idf: Math.round(idf * 10000) / 10000,
            burstScore: Math.round(burstScore * 10000) / 10000,
            uniqueUsers,
            contextExamples: (stats.termContexts.get(groupId)?.get(term) ?? []).slice(0, 5),
        });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, topK);
}
export function calcBurstScore(term, groupId) {
    const firstSeen = stats.termFirstSeen.get(groupId)?.get(term) ?? 0;
    if (firstSeen === 0)
        return 0;
    const ageDays = Math.min(Math.max((Date.now() / 1000 - firstSeen) / 86400, 1), BURST_AGE_CAP_DAYS);
    const freq = stats.groupTermFreq.get(groupId)?.get(term) ?? 0;
    return freq / ageDays;
}
export function getGroupStats(groupId) {
    const groupFreq = stats.groupTermFreq.get(groupId) ?? new Map();
    let total = 0;
    let above = 0;
    for (const f of groupFreq.values()) {
        total += f;
        if (f >= MIN_FREQUENCY)
            above += 1;
    }
    return { totalUniqueTerms: groupFreq.size, totalOccurrences: total, termsAboveThreshold: above };
}
export function resetGroupJargon(groupId) {
    stats.groupTermFreq.delete(groupId);
    stats.userTermFreq.delete(groupId);
    stats.termFirstSeen.delete(groupId);
    stats.termContexts.delete(groupId);
    stats.dirtyGroups.delete(groupId);
}
const HARD_BLOCK_RE = /[@一-鿿]|[\[\]]|https?:\/\/|[\s　]/;
const COMMON_BLOCK = new Set([
    "哈哈", "哈哈哈", "呵呵", "嘻嘻", "啊啊", "嗯嗯", "谢谢", "感谢", "好的", "可以", "不错",
    "收到", "明白", "知道", "看看", "这个", "那个", "什么", "怎么", "真的", "确实", "其实",
]);
export function shouldFilterCandidate(term) {
    if (!term)
        return true;
    if (term.length < 2 || term.length > 8)
        return true;
    if (HARD_BLOCK_RE.test(term))
        return true;
    if (/^[\d]+$/.test(term))
        return true;
    if (/^[a-zA-Z]{7,}$/.test(term))
        return true;
    if (COMMON_BLOCK.has(term))
        return true;
    return false;
}
export function defaultJargonConfig() {
    return {
        enabled: false,
        model: "MiniMax-M2.5",
        timeoutMs: 5000,
        mineIntervalSec: 60,
        minMessages: 10,
        maxCandidatesPerGroup: 50,
        whitelistGroups: [],
    };
}
const msgHistory = new Map();
const MSG_HISTORY_MAX = 200;
const groupMsgCounter = new Map();
export function recordJargonMessage(groupId, senderId, content) {
    if (!content?.trim())
        return;
    let hist = msgHistory.get(groupId) ?? [];
    hist.push(`${senderId}: ${content}`);
    if (hist.length > MSG_HISTORY_MAX)
        hist = hist.slice(-MSG_HISTORY_MAX);
    msgHistory.set(groupId, hist);
    groupMsgCounter.set(groupId, (groupMsgCounter.get(groupId) ?? 0) + 1);
}
export function getGroupMessageCount(groupId) {
    return groupMsgCounter.get(groupId) ?? 0;
}
export function getRecentMessages(groupId, n) {
    const hist = msgHistory.get(groupId) ?? [];
    return hist.slice(-n);
}
export function resetJargonHistory() {
    msgHistory.clear();
    groupMsgCounter.clear();
}
export function buildExtractPrompt(chatText) {
    return `请从下面这段聊天内容中提取"黑话/俚语/网络缩写"候选项。

**必须满足的条件（全部满足才提取）：**
- 是对话中真实出现过的短词或短语（2-8个字符）
- 是特定圈子/群组才会使用的词语，普通人看不懂的
- 脱离上下文后无法理解其含义

**严格排除以下内容（出现即跳过）：**
- @xxx、@某人 等 at 提及
- 人名、昵称、群名、ID
- 日常用语：吃饭、睡觉、上班、回家、好的、可以、谢谢 等
- 常见名词：手机、电脑、学校、公司、时间 等
- 语气词：哈哈、嗯嗯、啊啊、呵呵 等
- 表情描述：[图片]、[表情]、[语音] 等
- 纯数字、纯标点、URL链接
- 含义清晰明确的词语（即使不常见）

**黑话的典型特征：**
- 拼音首字母缩写：yyds、xswl、nbcs、zqsg
- 特定圈子内的暗语、缩写、谐音梗
- 群内独创的表达方式，外人无法理解

以 JSON 数组输出（严格按结构）：
[
  {"content": "词条", "raw_content": "包含该词条的完整对话上下文原文"}
]

如果没有找到符合条件的黑话，输出空数组 []

现在请输出：
${chatText}`;
}
export function buildValidatePrompt(chatText, candidates) {
    return `下面是某群聊的对话片段和从中提取的候选词列表。

对话片段：
${chatText}

候选词列表：
${JSON.stringify(candidates)}

请判断哪些候选词是该群特有的"黑话"（圈内用语/缩写/内部梗，外人看不懂）。
排除：普通日常用语、含义清晰明确的词、明显是常用词的。

只输出确认是黑话的词条数组（JSON），不要任何解释：
["词条1", "词条2", ...]

如果没有，输出 []`;
}
export function buildInferWithContextPrompt(term, context) {
    return `以下是一个群聊中出现的词条和它出现的上下文。

词条：${term}
上下文：
${context}

请推断这个词条在该群中的含义。如果是黑话/缩写/圈内用语，给出可能的解释。

以 JSON 输出：
{"meaning": "含义推断（如果是黑话）；如果不是黑话或无法确定，写空字符串", "no_info": true或false}

"no_info" 为 true 表示无法从上下文推断出是黑话。`;
}
export function buildInferContentOnlyPrompt(term) {
    return `词条：${term}

请仅凭这个词条本身，推断它的字面含义（不依赖任何上下文）。

以 JSON 输出：
{"meaning": "按字面/常规理解的解释"}`;
}
export function buildComparePrompt(term, ctxMeaning, literalMeaning) {
    return `词条：${term}

有两个推断：
推断1（群聊上下文中的含义）：${ctxMeaning || "（无法确定）"}
推断2（字面/常规含义）：${literalMeaning}

如果推断1和推断2含义不同（说明词条在群里被赋予了特殊含义，可能是黑话），返回 {"is_similar": false}
如果两者含义相同或接近（说明是常规用法），返回 {"is_similar": true}

只输出 JSON，不要解释。`;
}
async function jargonLlm(prompt, cfg, opts) {
    if (!opts.apiKey)
        return null;
    const baseUrl = (opts.baseUrl ?? "https://api.minimaxi.com/anthropic").replace(/\/$/, "");
    const model = cfg.model ?? "MiniMax-M2.5";
    const timeoutMs = cfg.timeoutMs ?? 5000;
    try {
        const resp = await safeFetch(`${baseUrl}/v1/messages`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "anthropic-version": "2023-06-01",
                "x-api-key": opts.apiKey,
            },
            body: JSON.stringify({
                model,
                max_tokens: 500,
                temperature: 0.3,
                messages: [{ role: "user", content: prompt }],
            }),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!resp.ok)
            return null;
        const json = (await resp.json());
        const text = json.content?.find((b) => b.type === "text")?.text ?? "";
        return { text };
    }
    catch {
        return null;
    }
}
export function extractStringArray(text) {
    if (!text)
        return [];
    let s = text.trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence)
        s = fence[1].trim();
    try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr))
            return arr.filter((x) => typeof x === "string");
    }
    catch {
        const m = s.match(/\[[\s\S]*\]/);
        if (m) {
            try {
                const arr = JSON.parse(m[0]);
                if (Array.isArray(arr))
                    return arr.filter((x) => typeof x === "string");
            }
            catch {
            }
        }
    }
    return [];
}
export function extractJsonObject(text) {
    if (!text)
        return null;
    const fence = text.trim().match(/```(?:json)?\s*([\s\S]*?)```/);
    const s = (fence ? fence[1] : text).trim();
    try {
        return JSON.parse(s);
    }
    catch {
        const m = s.match(/\{[\s\S]*\}/);
        if (m) {
            try {
                return JSON.parse(m[0]);
            }
            catch {
                return null;
            }
        }
        return null;
    }
}
const mineStates = new Map();
export function resetJargonMineStates() {
    mineStates.clear();
}
export function shouldTriggerMine(groupId, cfg, nowMs, currentMsgCount) {
    const st = mineStates.get(groupId) ?? { lastTriggerTs: 0, lastMsgCount: 0 };
    const intervalMs = (cfg.mineIntervalSec ?? 60) * 1000;
    const minMessages = cfg.minMessages ?? 10;
    if (nowMs - st.lastTriggerTs < intervalMs)
        return false;
    if (currentMsgCount - st.lastMsgCount < minMessages)
        return false;
    st.lastTriggerTs = nowMs;
    st.lastMsgCount = currentMsgCount;
    mineStates.set(groupId, st);
    return true;
}
export async function mineJargonForGroup(groupId, cfg, opts) {
    const exclude = new Set();
    if (cfg.store) {
        try {
            for (const t of cfg.store.listTerms(groupId, 100)) {
                exclude.add(t.content);
            }
        }
        catch {
        }
    }
    const candidates = getJargonCandidates(groupId, cfg.maxCandidatesPerGroup ?? 50, exclude)
        .filter((c) => !shouldFilterCandidate(c.term))
        .slice(0, 15);
    if (candidates.length === 0)
        return { extracted: 0, confirmed: 0 };
    const recent = getRecentMessages(groupId, 30).join("\n");
    const validateRes = await jargonLlm(buildValidatePrompt(recent, candidates.map((c) => c.term)), cfg, opts);
    if (!validateRes)
        return { extracted: 0, confirmed: 0 };
    const confirmed = extractStringArray(validateRes.text);
    let saved = 0;
    for (const term of confirmed.slice(0, 5)) {
        const ctx = candidates.find((c) => c.term === term)?.contextExamples?.[0] ?? "";
        try {
            const meaning = await inferJargonMeaning(term, ctx, cfg, opts);
            if (cfg.store) {
                cfg.store.saveTerm({
                    groupId,
                    content: term,
                    rawContent: ctx.slice(0, 200),
                    meaning,
                    isJargon: true,
                });
                saved += 1;
            }
        }
        catch {
        }
    }
    info(`[WPP JARGON] mined group=${groupId} candidates=${candidates.length} confirmed=${confirmed.length} saved=${saved}`);
    return { extracted: candidates.length, confirmed: saved };
}
async function inferJargonMeaning(term, context, cfg, opts) {
    const r1 = await jargonLlm(buildInferWithContextPrompt(term, context || "（无上下文）"), cfg, opts);
    if (!r1)
        return "";
    const o1 = extractJsonObject(r1.text);
    const ctxMeaning = typeof o1?.meaning === "string" ? o1.meaning : "";
    const noInfo = o1?.no_info === true;
    const r2 = await jargonLlm(buildInferContentOnlyPrompt(term), cfg, opts);
    if (!r2)
        return ctxMeaning;
    const o2 = extractJsonObject(r2.text);
    const literalMeaning = typeof o2?.meaning === "string" ? o2.meaning : "";
    const r3 = await jargonLlm(buildComparePrompt(term, ctxMeaning, literalMeaning), cfg, opts);
    if (!r3)
        return ctxMeaning;
    const o3 = extractJsonObject(r3.text);
    if (o3?.is_similar === false) {
        return ctxMeaning || `${term}（群内特有用法）`;
    }
    if (noInfo)
        return "";
    return ctxMeaning;
}
