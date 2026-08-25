// src/inbound/jargon.ts - v1.3.76 JARGON: 群黑话挖掘 (自主学习)
//
// 移植自 AstrBot 插件 astrbot_plugin_self_learning (v3.6.1) 的 jargon 模块
//   (services/jargon/jargon_statistical_filter.py + jargon_miner.py + jargon_query.py)。
// 统计层纯 TS 移植 (jieba → n-gram 降级, 可选 @node-rs/jieba 增强), LLM 层接 MiniMax。
//
// 价值: 让 AI 理解群黑话 (缩写/内部梗/圈内用语), 回复更"像自己人"。
// 与心流互补: 心流=决定"什么时候开口", 黑话=决定"开口听懂黑话"。
//
// 架构 (三层流水线, 降 LLM 成本 70-80%):
//   ① 统计预筛 (零 LLM): 每消息更新词频表 → 跨群IDF + burst score + 用户集中度 → 高分候选
//   ② LLM 批量验证: 一次调用筛掉普通词, 只留真黑话
//   ③ LLM 三步推断: 上下文推断 vs 纯词条推断, 对比判"黑话" → 存含义
//   ④ 查询 tool: AI 可调 query_jargon 查群黑话含义
//
// 统计层 (纯算法, 参考 JargonStatisticalFilter):
//   - 每群词频表: {group_id → {term → count}}
//   - 跨群全局词频: term → 全群 count
//   - 用户词频: {group_id → {term → {sender_id → count}}}
//   - 首见时间: {group_id → {term → ts}}
//   - 上下文样例: {group_id → {term → [最多10条]}}
//   - burst score = freq / max(age_days, 1)
//   - 综合分 = idf*0.4 + burst*0.3 + 集中度*0.3
//   - 标准词过滤: jieba 词典频率 > 100 视为已知词 (降级用停用词+长度启发式)

import { info, debug } from "../core/logger.js";
import { safeFetch } from "../util/safe-fetch.js";

// ===== 常量 (对齐 Python 版) =====
const MIN_TERM_LENGTH = 2;
const MIN_FREQUENCY = 5;
const MAX_CONTEXT_EXAMPLES = 10;
const JIEBA_FREQ_THRESHOLD = 100;
const WEIGHT_IDF = 0.4;
const WEIGHT_BURST = 0.3;
const WEIGHT_CONCENTRATION = 0.3;
/** 中文 n-gram 长度 (降级分词用) */
const NGRAM_MAX = 4;
/** 术语年龄上限 (天数, 超过则视为稳定词降低 burst) */
const BURST_AGE_CAP_DAYS = 14;

// ===== 停用词表 (对齐 Python 版 _is_stopword) =====
const STOPWORDS = new Set<string>([
  // 虚词/助词/语气词
  "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "个", "上", "也", "很",
  "到", "说", "要", "去", "你", "会", "着", "没", "看", "好", "自", "这", "他", "她", "它", "们",
  "吗", "吧", "呢", "啊", "哦", "嗯", "呀", "哈", "那", "么", "什", "啦", "噢", "嘛", "哇",
  "来", "对", "把", "让", "被", "给", "从", "还", "比", "得", "过", "可", "能", "为", "以", "而",
  "但", "或", "如", "与", "等", "及", "其", "之",
  // 代词/指示词
  "这个", "那个", "什么", "怎么", "哪里", "这里", "那里", "自己", "大家", "我们", "你们", "他们", "她们", "谁",
  "哪个", "这些", "那些", "多少", "几个", "某个", "别人",
  // 常见动词
  "知道", "觉得", "感觉", "可以", "应该", "需要", "已经", "开始", "然后", "因为", "所以", "虽然", "如果",
  "不是", "没有", "不会", "不能", "不要", "不用", "不行", "出来", "出去", "进来", "起来", "下去", "回来", "过来",
  "喜欢", "希望", "想要", "能够", "可能", "一定", "必须", "告诉", "问题", "时候", "东西", "事情", "地方", "方面",
  // 时间词
  "今天", "昨天", "明天", "现在", "刚才", "以前", "以后", "时间", "上午", "下午", "晚上", "早上", "中午",
  // 常见形容词/副词
  "真的", "确实", "其实", "当然", "特别", "非常", "一直", "还是", "而且", "只是", "只有", "所有", "一些",
  "比较", "最后", "首先", "接着", "终于", "竟然",
  // 常见名词
  "朋友", "老师", "同学", "学生", "家里", "公司", "学校", "手机", "电脑", "工作", "生活",
  // 网络常用但含义明确的词 (不是黑话)
  "哈哈", "哈哈哈", "呵呵", "嘻嘻", "啊啊", "嗯嗯", "谢谢", "感谢", "抱歉", "不好意思", "没关系",
  "图片", "表情", "语音", "视频", "文件", "链接",
]);

// ===== 标准词过滤: 可选 jieba 增强 =====
let _jieba: { cut: (s: string) => string[]; freq?: (w: string) => number } | null = null;
let _jiebaTried = false;

/**
 * 尝试加载 @node-rs/jieba (预编译, 可选增强).
 * 加载失败 (未安装/平台不支持) → 降级 n-gram, 不影响主流程.
 */
function loadJieba(): void {
  if (_jiebaTried) return;
  _jiebaTried = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@node-rs/jieba");
    const jb = mod.default ?? mod;
    _jieba = {
      cut: (s) => jb.cut(s, false) as string[],
      freq: (w) => {
        try {
          const f = jb.freq?.(w);
          return typeof f === "number" ? f : 0;
        } catch {
          return 0;
        }
      },
    };
    info(`[WPP JARGON] @node-rs/jieba loaded (enhanced segmentation)`);
  } catch {
    debug(`[WPP JARGON] @node-rs/jieba not installed, using n-gram fallback`);
  }
}

/** 是否标准词 (jieba 词典频率 > 阈值) */
function isStandardVocabulary(word: string): boolean {
  if (!_jieba?.freq) return false;
  try {
    return (_jieba.freq(word) ?? 0) > JIEBA_FREQ_THRESHOLD;
  } catch {
    return false;
  }
}

// ===== 分词 (jieba 优先, n-gram 降级) =====

/**
 * 分词: 优先 @node-rs/jieba, 降级为"连续汉字/字母段"的 2-4 gram。
 * 返回过滤后的 token 列表 (长度>=2, 非停用词, 非纯数字/标点, 非标准词)。
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  loadJieba();
  const cleaned = String(text)
    .replace(/@\S+/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\[.*?\]/g, " ");

  const rawTokens = _jieba ? _jieba.cut(cleaned) : ngramTokens(cleaned);
  const out: string[] = [];
  for (const w of rawTokens) {
    const word = w.trim();
    if (word.length < MIN_TERM_LENGTH) continue;
    if (STOPWORDS.has(word)) continue;
    if (/^[\d\s]+$/.test(word)) continue; // 纯数字
    if (/^[^\w一-鿿]+$/.test(word)) continue; // 纯标点
    if (isStandardVocabulary(word)) continue; // 标准词
    out.push(word);
  }
  return out;
}

/** 降级分词: 提取连续汉字/字母段, 生成 2-4 gram */
function ngramTokens(text: string): string[] {
  const segments = text.match(/[一-鿿]{2,}|[a-zA-Z]{2,}/g) ?? [];
  const tokens: string[] = [];
  for (const seg of segments) {
    if (/^[a-zA-Z]+$/.test(seg)) {
      // 英文/拼音缩写: 整体作为候选 (如 "yyds" "nbcs")
      if (seg.length <= 8) tokens.push(seg);
      continue;
    }
    // 中文: 生成 2-4 gram
    for (let n = NGRAM_MAX; n >= 2; n--) {
      for (let i = 0; i + n <= seg.length; i++) {
        tokens.push(seg.slice(i, i + n));
      }
    }
  }
  return tokens;
}

// ===== 统计表 (内存, 对齐 Python defaultdict) =====

interface JargonStats {
  /** group_id → term → count */
  groupTermFreq: Map<string, Map<string, number>>;
  /** term → 全群 count */
  globalTermFreq: Map<string, number>;
  /** group_id → term → sender_id → count */
  userTermFreq: Map<string, Map<string, Map<string, number>>>;
  /** group_id → term → first_seen_ts */
  termFirstSeen: Map<string, Map<string, number>>;
  /** group_id → term → context samples */
  termContexts: Map<string, Map<string, string[]>>;
  /** 活跃群集合 */
  dirtyGroups: Set<string>;
}

let stats: JargonStats = {
  groupTermFreq: new Map(),
  globalTermFreq: new Map(),
  userTermFreq: new Map(),
  termFirstSeen: new Map(),
  termContexts: new Map(),
  dirtyGroups: new Set(),
};

/** 测试/热重载: 清空统计 */
export function resetJargonStats(): void {
  stats = {
    groupTermFreq: new Map(),
    globalTermFreq: new Map(),
    userTermFreq: new Map(),
    termFirstSeen: new Map(),
    termContexts: new Map(),
    dirtyGroups: new Set(),
  };
}

/**
 * 更新词频表 (每条消息调用, < 1ms)。对齐 JargonStatisticalFilter.update_from_message。
 */
export function updateJargonFromMessage(
  content: string,
  groupId: string,
  senderId: string,
): void {
  if (!content || !groupId) return;
  const tokens = tokenize(content);
  if (tokens.length === 0) return;

  const now = Date.now() / 1000;
  const groupFreq = stats.groupTermFreq.get(groupId) ?? new Map<string, number>();
  stats.groupTermFreq.set(groupId, groupFreq);
  const userFreqMap = stats.userTermFreq.get(groupId) ?? new Map<string, Map<string, number>>();
  stats.userTermFreq.set(groupId, userFreqMap);
  const firstSeen = stats.termFirstSeen.get(groupId) ?? new Map<string, number>();
  stats.termFirstSeen.set(groupId, firstSeen);
  const contexts = stats.termContexts.get(groupId) ?? new Map<string, string[]>();
  stats.termContexts.set(groupId, contexts);

  for (const token of tokens) {
    groupFreq.set(token, (groupFreq.get(token) ?? 0) + 1);
    stats.globalTermFreq.set(token, (stats.globalTermFreq.get(token) ?? 0) + 1);
    const userFreq = userFreqMap.get(token) ?? new Map<string, number>();
    userFreq.set(senderId, (userFreq.get(senderId) ?? 0) + 1);
    userFreqMap.set(token, userFreq);
    if (!firstSeen.has(token)) firstSeen.set(token, now);
    const ctx = contexts.get(token) ?? [];
    if (ctx.length < MAX_CONTEXT_EXAMPLES) ctx.push(content);
    contexts.set(token, ctx);
  }
  stats.dirtyGroups.add(groupId);
}

export interface JargonCandidate {
  term: string;
  score: number;
  frequency: number;
  idf: number;
  burstScore: number;
  uniqueUsers: number;
  contextExamples: string[];
}

/**
 * 取群内 top-K 黑话候选 (按综合分排序)。对齐 JargonStatisticalFilter.get_jargon_candidates。
 */
export function getJargonCandidates(
  groupId: string,
  topK = 20,
  excludeTerms?: Set<string>,
): JargonCandidate[] {
  const groupFreq = stats.groupTermFreq.get(groupId);
  if (!groupFreq) return [];

  const numGroups = Math.max(stats.groupTermFreq.size, 1);
  const exclude = excludeTerms ?? new Set<string>();
  const candidates: JargonCandidate[] = [];

  for (const [term, freq] of groupFreq) {
    if (freq < MIN_FREQUENCY) continue;
    if (exclude.has(term)) continue;

    // IDF: 跨群稀有度
    let groupsContaining = 0;
    for (const gf of stats.groupTermFreq.values()) {
      if (gf.has(term)) groupsContaining += 1;
    }
    const idf = Math.log(numGroups / Math.max(groupsContaining, 1));

    // Burst: 近期爆发 (freq / age_days)
    const burstScore = calcBurstScore(term, groupId);

    // 用户集中度: 1/unique_users
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

/** burst score: freq / max(age_days, 1), 年龄上限 14 天 */
export function calcBurstScore(term: string, groupId: string): number {
  const firstSeen = stats.termFirstSeen.get(groupId)?.get(term) ?? 0;
  if (firstSeen === 0) return 0;
  const ageDays = Math.min(Math.max((Date.now() / 1000 - firstSeen) / 86400, 1), BURST_AGE_CAP_DAYS);
  const freq = stats.groupTermFreq.get(groupId)?.get(term) ?? 0;
  return freq / ageDays;
}

/** 群统计摘要 */
export function getGroupStats(groupId: string): { totalUniqueTerms: number; totalOccurrences: number; termsAboveThreshold: number } {
  const groupFreq = stats.groupTermFreq.get(groupId) ?? new Map<string, number>();
  let total = 0;
  let above = 0;
  for (const f of groupFreq.values()) {
    total += f;
    if (f >= MIN_FREQUENCY) above += 1;
  }
  return { totalUniqueTerms: groupFreq.size, totalOccurrences: total, termsAboveThreshold: above };
}

/** 清空某群统计 */
export function resetGroupJargon(groupId: string): void {
  stats.groupTermFreq.delete(groupId);
  stats.userTermFreq.delete(groupId);
  stats.termFirstSeen.delete(groupId);
  stats.termContexts.delete(groupId);
  stats.dirtyGroups.delete(groupId);
}

// ===== 黑话硬编码过滤 (对齐 jargon_miner._should_filter_candidate) =====
const HARD_BLOCK_RE = /[@一-鿿]|[\[\]]|https?:\/\/|[\s　]/;
const COMMON_BLOCK = new Set([
  "哈哈", "哈哈哈", "呵呵", "嘻嘻", "啊啊", "嗯嗯", "谢谢", "感谢", "好的", "可以", "不错",
  "收到", "明白", "知道", "看看", "这个", "那个", "什么", "怎么", "真的", "确实", "其实",
]);

/** 候选是否该过滤 (纯规则, 参考 jargon_miner) */
export function shouldFilterCandidate(term: string): boolean {
  if (!term) return true;
  if (term.length < 2 || term.length > 8) return true;
  if (HARD_BLOCK_RE.test(term)) return true; // 含中文/方括号/URL/空白
  if (/^[\d]+$/.test(term)) return true;
  if (/^[a-zA-Z]{7,}$/.test(term)) return true; // 超长纯英文
  if (COMMON_BLOCK.has(term)) return true;
  return false;
}

// ===== LLM 层 (参考 jargon_miner + jargon_query) =====

export interface JargonConfig {
  /** 总开关 (默认 false) */
  enabled: boolean;
  /** 判断模型 (默认 "MiniMax-M2.5") */
  model?: string;
  /** LLM 超时毫秒 (默认 5000) */
  timeoutMs?: number;
  /** 挖掘触发间隔秒 (默认 60) */
  mineIntervalSec?: number;
  /** 每次挖掘最少新消息数 (默认 10) */
  minMessages?: number;
  /** 每群最多保留候选数 (默认 50) */
  maxCandidatesPerGroup?: number;
  /** 白名单群 (空=全部) */
  whitelistGroups?: string[];
  /** 已确认黑话去重: 存储层回调 */
  store?: {
    hasTerm: (groupId: string, term: string) => boolean;
    saveTerm: (term: { groupId: string; content: string; rawContent: string; meaning: string; isJargon: boolean }) => void;
    listTerms: (groupId: string, limit?: number) => Array<{ content: string; meaning: string; isJargon: boolean }>;
  };
}

export function defaultJargonConfig(): JargonConfig {
  return {
    enabled: false,
    // v1.4.0 12:28 老板拍板 B: 消除 plugin hardcode, model 由 schema default (openclaw.plugin.json) + accounts cfg 链提供
    model: undefined as unknown as string,  // placeholder,运行时由 cfg.model 提供;缺失抛错 (jargon.ts:543)
    timeoutMs: 5000,
    mineIntervalSec: 60,
    minMessages: 10,
    maxCandidatesPerGroup: 50,
    whitelistGroups: [],
  };
}

// ===== 消息历史缓冲 (供 LLM 挖掘看上下文) =====
const msgHistory = new Map<string, string[]>();
const MSG_HISTORY_MAX = 200;

/** P1 (2026-08-23): 每群单调递增消息计数 — shouldTriggerMine 用独立计数器,
 *   不再用有界缓冲长度 (历史满 200 条后长度恒 200 → 新增消息数恒 0 → 挖掘永久停摆) */
const groupMsgCounter = new Map<string, number>();

/** 记录消息 (旁路, 供 LLM 挖掘) */
export function recordJargonMessage(groupId: string, senderId: string, content: string): void {
  if (!content?.trim()) return;
  let hist = msgHistory.get(groupId) ?? [];
  hist.push(`${senderId}: ${content}`);
  if (hist.length > MSG_HISTORY_MAX) hist = hist.slice(-MSG_HISTORY_MAX);
  msgHistory.set(groupId, hist);
  // P1: 单调递增计数 (只增不清, 供 shouldTriggerMine 判断新增消息数)
  groupMsgCounter.set(groupId, (groupMsgCounter.get(groupId) ?? 0) + 1);
}

/** P1: 群累计消息数 (单调递增) */
export function getGroupMessageCount(groupId: string): number {
  return groupMsgCounter.get(groupId) ?? 0;
}

/** 取最近 N 条消息文本 */
export function getRecentMessages(groupId: string, n: number): string[] {
  const hist = msgHistory.get(groupId) ?? [];
  return hist.slice(-n);
}

/** 测试/热重载: 清空历史 */
export function resetJargonHistory(): void {
  msgHistory.clear();
  groupMsgCounter.clear();
}

// ===== LLM Prompt (复刻 jargon_miner) =====

/**
 * 提取候选 prompt (参考 extract_prompt_template)。
 * 输入一段聊天文本, 输出 JSON 数组 [{content, raw_content}]。
 */
export function buildExtractPrompt(chatText: string): string {
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

/**
 * 批量验证 prompt (参考 validate_prompt_template)。
 * 一次 LLM 调用把普通词筛掉, 只留真黑话。
 */
export function buildValidatePrompt(chatText: string, candidates: string[]): string {
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

/**
 * 三步推断 - 第一步: 上下文推断含义 (参考 prompt_infer_with_context)。
 */
export function buildInferWithContextPrompt(term: string, context: string): string {
  return `以下是一个群聊中出现的词条和它出现的上下文。

词条：${term}
上下文：
${context}

请推断这个词条在该群中的含义。如果是黑话/缩写/圈内用语，给出可能的解释。

以 JSON 输出：
{"meaning": "含义推断（如果是黑话）；如果不是黑话或无法确定，写空字符串", "no_info": true或false}

"no_info" 为 true 表示无法从上下文推断出是黑话。`;
}

/**
 * 三步推断 - 第二步: 仅凭词条推断 (参考 prompt_infer_content_only)。
 */
export function buildInferContentOnlyPrompt(term: string): string {
  return `词条：${term}

请仅凭这个词条本身，推断它的字面含义（不依赖任何上下文）。

以 JSON 输出：
{"meaning": "按字面/常规理解的解释"}`;
}

/**
 * 三步推断 - 第三步: 对比两个推断 (参考 prompt_compare_inference)。
 * 上下文推断 vs 纯字面推断差异大 → 是黑话。
 */
export function buildComparePrompt(term: string, ctxMeaning: string, literalMeaning: string): string {
  return `词条：${term}

有两个推断：
推断1（群聊上下文中的含义）：${ctxMeaning || "（无法确定）"}
推断2（字面/常规含义）：${literalMeaning}

如果推断1和推断2含义不同（说明词条在群里被赋予了特殊含义，可能是黑话），返回 {"is_similar": false}
如果两者含义相同或接近（说明是常规用法），返回 {"is_similar": true}

只输出 JSON，不要解释。`;
}

// ===== LLM 调用 =====

export interface JargonLlmOptions {
  apiKey: string;
  baseUrl?: string;
}

interface JargonLlmResult {
  text: string;
}

/** 单次 LLM 调用 (复用 safeFetch + MiniMax anthropic API, 同 intent-llm) */
async function jargonLlm(
  prompt: string,
  cfg: JargonConfig,
  opts: JargonLlmOptions,
): Promise<JargonLlmResult | null> {
  if (!opts.apiKey) return null;
  const baseUrl = (opts.baseUrl ?? "https://api.minimaxi.com/anthropic").replace(/\/$/, "");
  // v1.4.0 12:28 老板拍板 B: 消除 plugin hardcode, model 必须从 cfg 链 (schema default → accounts cfg) 提供, 缺失立即报错
  const model = cfg.model;
  if (!model) {
    throw new Error(
      "[WPP JARGON] cfg.model unresolved. v1.4.0 12:28 老板拍板: 必须从 schema default (openclaw.plugin.json channelConfigs.wechatpadpro.schema.properties.jargon.properties.model.default) 或 accounts/<id>.json:jargon.model 提供. plugin 不再 hardcode fallback"
    );
  }
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
    if (!resp.ok) return null;
    const json = (await resp.json()) as { content?: Array<{ type?: string; text?: string }> };
    const text = json.content?.find((b) => b.type === "text")?.text ?? "";
    return { text };
  } catch {
    return null;
  }
}

/** 从 LLM 文本提取 JSON 数组 (剥围栏) */
export function extractStringArray(text: string): string[] {
  if (!text) return [];
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1]!.trim();
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) return arr.filter((x): x is string => typeof x === "string");
  } catch {
    // 尝试提取 [...]
    const m = s.match(/\[[\s\S]*\]/);
    if (m) {
      try {
        const arr = JSON.parse(m[0]);
        if (Array.isArray(arr)) return arr.filter((x): x is string => typeof x === "string");
      } catch {
        /* ignore */
      }
    }
  }
  return [];
}

/** 从 LLM 文本提取 JSON 对象 */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const fence = text.trim().match(/```(?:json)?\s*([\s\S]*?)```/);
  const s = (fence ? fence[1]! : text).trim();
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ===== 挖掘编排 (每群独立) =====

interface GroupMineState {
  lastTriggerTs: number;
  lastMsgCount: number;
}

const mineStates = new Map<string, GroupMineState>();

/** 测试/热重载: 清空挖掘状态 */
export function resetJargonMineStates(): void {
  mineStates.clear();
}

/**
 * 是否该触发挖掘: 距上次 >= interval 且 新增消息 >= minMessages。
 */
export function shouldTriggerMine(groupId: string, cfg: JargonConfig, nowMs: number, currentMsgCount: number): boolean {
  const st = mineStates.get(groupId) ?? { lastTriggerTs: 0, lastMsgCount: 0 };
  const intervalMs = (cfg.mineIntervalSec ?? 60) * 1000;
  const minMessages = cfg.minMessages ?? 10;
  if (nowMs - st.lastTriggerTs < intervalMs) return false;
  if (currentMsgCount - st.lastMsgCount < minMessages) return false;
  st.lastTriggerTs = nowMs;
  st.lastMsgCount = currentMsgCount;
  mineStates.set(groupId, st);
  return true;
}

/**
 * 执行一次黑话挖掘: 统计候选 → LLM 批量验证 → 三步推断 → 存储。
 * 静默失败 (无 key/超时/坏 JSON) → 不影响主流程。
 */
export async function mineJargonForGroup(
  groupId: string,
  cfg: JargonConfig,
  opts: JargonLlmOptions,
): Promise<{ extracted: number; confirmed: number }> {
  // ① 统计候选 (零 LLM)
  const exclude = new Set<string>();
  if (cfg.store) {
    try {
      for (const t of cfg.store.listTerms(groupId, 100)) {
        exclude.add(t.content);
      }
    } catch {
      /* ignore */
    }
  }
  const candidates = getJargonCandidates(groupId, cfg.maxCandidatesPerGroup ?? 50, exclude)
    .filter((c) => !shouldFilterCandidate(c.term))
    .slice(0, 15); // 每次最多 LLM 验证 15 个 (控成本)

  if (candidates.length === 0) return { extracted: 0, confirmed: 0 };

  const recent = getRecentMessages(groupId, 30).join("\n");

  // ② LLM 批量验证 (一次调用筛普通词)
  const validateRes = await jargonLlm(buildValidatePrompt(recent, candidates.map((c) => c.term)), cfg, opts);
  if (!validateRes) return { extracted: 0, confirmed: 0 };
  const confirmed = extractStringArray(validateRes.text);

  // ③ 对确认的候选做含义推断 (取前 5 个, 控成本)
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
    } catch {
      /* 单个失败不影响其他 */
    }
  }
  info(`[WPP JARGON] mined group=${groupId} candidates=${candidates.length} confirmed=${confirmed.length} saved=${saved}`);
  return { extracted: candidates.length, confirmed: saved };
}

/** 三步推断含义 */
async function inferJargonMeaning(
  term: string,
  context: string,
  cfg: JargonConfig,
  opts: JargonLlmOptions,
): Promise<string> {
  // 第一步: 上下文推断
  const r1 = await jargonLlm(buildInferWithContextPrompt(term, context || "（无上下文）"), cfg, opts);
  if (!r1) return "";
  const o1 = extractJsonObject(r1.text);
  const ctxMeaning = typeof o1?.meaning === "string" ? o1.meaning : "";
  const noInfo = o1?.no_info === true;

  // 第二步: 纯字面推断
  const r2 = await jargonLlm(buildInferContentOnlyPrompt(term), cfg, opts);
  if (!r2) return ctxMeaning;
  const o2 = extractJsonObject(r2.text);
  const literalMeaning = typeof o2?.meaning === "string" ? o2.meaning : "";

  // 第三步: 对比
  const r3 = await jargonLlm(buildComparePrompt(term, ctxMeaning, literalMeaning), cfg, opts);
  if (!r3) return ctxMeaning;
  const o3 = extractJsonObject(r3.text);

  if (o3?.is_similar === false) {
    // 含义不同 → 黑话, 用上下文含义
    return ctxMeaning || `${term}（群内特有用法）`;
  }
  if (noInfo) return ""; // 无法确定
  return ctxMeaning;
}
