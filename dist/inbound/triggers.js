// src/inbound/triggers.ts - 4-way OR 触发器判定
// 范式: `@mention` | `keyword` | `msgType` | `quoteBot` 任一命中即触发; 带 DM/群白名单门禁
import { isBotMentionedByText } from "./parser/mention.js";
import { checkHeartflowGate } from "./heartflow.js";
import { resolveHfBudget, tightenHfBudget } from "./heartflow-budget.js";
import { getHfProfileBudget } from "./heartflow-profile.js";
import { getHfShareTighten } from "./heartflow-observe.js";
/** 决定 message 是否触发 OpenClaw AI 回复 */
export function shouldTrigger(msg, cfg, ctx) {
    // 自回环过滤: bot 自己发的消息不回 (防 vendor 回推 self → 自问自答)
    if (ctx.botWxid && msg.fromWxid === ctx.botWxid) {
        return { triggered: false, via: "blocked" };
    }
    // black/group debug 短路
    if (msg.peerKind === "group" && cfg.blacklistGroups.includes(msg.chatroomId ?? "")) {
        return { triggered: false, via: "blocked" };
    }
    if (msg.peerKind === "group" && cfg.chatroomDebug) {
        return { triggered: true, via: "at" };
    }
    // DM 白名单: allowFrom 必须显式包含 sender 才放行; 空列表 = 拒绝所有 (fail-closed 防 fan-out)
    if (msg.peerKind === "direct") {
        const allow = ctx.allowFrom ?? [];
        if (allow.length === 0 || !allow.includes(msg.fromWxid)) {
            return { triggered: false, via: "blocked" }; // fail-closed: 空白名单 = 拒绝
        }
        return { triggered: true, via: "at" }; // 视同被 @ (私聊 always, 白名单内)
    }
    // groupPolicy 检查 (live 路径强制执行)
    if (msg.peerKind === "group") {
        const policy = cfg.groupPolicy ?? "open";
        if (policy === "disabled" || policy === "closed") {
            return { triggered: false, via: "blocked" };
        }
        if (policy === "allowlist") {
            const allowGroups = cfg.groupAllowFrom ?? [];
            // P0-2 (2026-08-23): allowlist 空列表 = 拒绝所有群 (fail-closed, 与 DM allowFrom 语义对齐)。
            //   之前 allowGroups.length===0 时放行全部 — 管理员清空群白名单"暂时禁用"反而全放行, 静默隐患。
            if (allowGroups.length === 0 || !allowGroups.includes(msg.chatroomId ?? "")) {
                return { triggered: false, via: "blocked" };
            }
        }
    }
    // GROUP 走 4-way OR
    const botMentioned = isBotMentionedByText(msg.content, ctx.botWxid) ||
        // 群消息 @ 中文昵称 也触发
        (!!ctx.botNickname && msg.content.includes(`@${ctx.botNickname}`));
    if (botMentioned) {
        return { triggered: true, via: "at" };
    }
    if (cfg.msgTypeTrigger.enabled && cfg.msgTypeTrigger.appMsgTypes?.includes(msg.msgType)) {
        if (msg.peerKind === "group" &&
            cfg.msgTypeTrigger.whitelistGroups &&
            cfg.msgTypeTrigger.whitelistGroups.length > 0 &&
            !cfg.msgTypeTrigger.whitelistGroups.includes(msg.chatroomId ?? "")) {
            // 群不在白名单内, 此 msgType 不触发 (但保持 enabled 不影响其他类型)
            // 不直接 return, 继续看后面 keyword/quoteBot
        }
        else {
            return { triggered: true, via: "msgType" };
        }
    }
    if (cfg.quoteBotTrigger.enabled && isQuoteRefToBot(msg.content, ctx.botWxid)) {
        return { triggered: true, via: "quoteBot" };
    }
    if (cfg.keywordTrigger.enabled && cfg.keywordTrigger.keywords.length > 0) {
        if (matchKeyword(msg.content, cfg.keywordTrigger)) {
            return { triggered: true, via: "keyword" };
        }
    }
    // v1.3.75 HEARTFLOW: 未@群消息 → 心流候选 (同步门禁 + 异步 LLM 打分由 handler 完成)
    //   门禁通过 → via:"heartflow" (pending), handler 用 judgeHeartflow 判断是否真触发
    //   门禁不过 (disabled/白名单外/空/冷却/预算) → via:null (不触发)
    if (msg.peerKind === "group" && cfg.heartflow?.enabled) {
        const chatId = msg.chatroomId ?? msg.peerId;
        // v1.7.0 画像收紧预算: 画像建议只能让约束更紧 (间隔更长/上限更小), 不许放宽.
        //   画像文本本身走 handler 注入 prompt; 这里只用它的预算字段 (内存缓存查, 零 DB IO).
        const budgetBase = tightenHfBudget(resolveHfBudget(cfg.heartflow), getHfProfileBudget(msg.accountId, chatId), { applyQuietHours: cfg.heartflow.profile?.applyQuietHours === true });
        // v1.9.0 占比外环**再套一层**: 该群今日 bot 发言占比 > 目标 (默认 5%) ⇒ 收紧当日预算.
        //   两层都走 tightenHfBudget ("只能收紧"), 复合安全 —— 取更严的一侧, 不可能被外环放宽.
        //   占比状态由 sweep 每轮用一条 DB 聚合刷新, 这里是纯内存查 (judge 热路径零 DB IO).
        const shareTighten = getHfShareTighten(msg.accountId, chatId, budgetBase, cfg.heartflow, Math.floor(Date.now() / 1000));
        const effBudget = shareTighten ? tightenHfBudget(budgetBase, shareTighten) : budgetBase;
        const gate = checkHeartflowGate(chatId, msg.content ?? "", cfg.heartflow, Date.now(), 
        // v1.6.9: 预算计数按账号分桶 + 用**消息自己的时刻**判陈旧触发 (msg.ts 是 unix 秒, 见 parser.ts)
        msg.accountId, msg.ts, effBudget);
        if (gate.allowed) {
            return { triggered: true, via: "heartflow" };
        }
    }
    return { triggered: false, via: null };
}
function isQuoteRefToBot(content, botWxid) {
    if (!botWxid)
        return false;
    // 真实引用结构是 <fromusr> (不是 <fromusername>); 老板引用 bot 消息时匹配
    const m = content.match(/<refermsg\b[^>]*>[\s\S]*?<(?:fromusr|fromusername)>([\s\S]*?)<\/(?:fromusr|fromusername)>/);
    return !!(m && m[1] && m[1].trim() === botWxid);
}
function matchKeyword(content, kw) {
    const mode = kw.mode ?? "contains";
    for (const k of kw.keywords) {
        if (!k)
            continue;
        if (mode === "exact" && content.trim() === k)
            return true;
        if (mode === "contains" && content.includes(k))
            return true;
        if (mode === "regex") {
            try {
                const re = new RegExp(k);
                if (re.test(content))
                    return true;
            }
            catch {
                /* bad regex, skip */
            }
        }
    }
    return false;
}
/** 默认 trigger config (新账号用) */
export function defaultTriggerConfig() {
    return {
        requireAtMention: false,
        keywordTrigger: { enabled: false, keywords: [], mode: "contains" },
        msgTypeTrigger: { enabled: false, appMsgTypes: [] },
        quoteBotTrigger: { enabled: false },
        blacklistGroups: [],
        chatroomDebug: false,
        groupPolicy: "open",
        groupAllowFrom: [],
        heartflow: { enabled: false }, // v1.3.75: 默认关闭
    };
}
//# sourceMappingURL=triggers.js.map