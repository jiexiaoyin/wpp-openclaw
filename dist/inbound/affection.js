import { safeFetch } from "../util/safe-fetch.js";
const MOOD_MODIFIERS = {
    happy: 1.2,
    excited: 1.3,
    playful: 1.1,
    calm: 1.0,
    curious: 1.05,
    nostalgic: 0.9,
    serious: 0.8,
    sad: 0.6,
    anxious: 0.7,
    angry: 0.4,
};
export function moodModifier(mood, intensity) {
    const base = MOOD_MODIFIERS[mood] ?? 1.0;
    return base * (0.5 + Math.max(0, Math.min(1, intensity)) * 0.5);
}
export const AFFECTION_RULES = {
    chat: { baseChange: 1, moodSensitive: true, moodEffect: 0.1, description: "普通聊天" },
    compliment: { baseChange: 3, moodSensitive: true, moodEffect: 0.2, description: "称赞鼓励" },
    praise: { baseChange: 5, moodSensitive: true, moodEffect: 0.3, positiveMoodBoost: true, description: "夸赞表扬" },
    encourage: { baseChange: 4, moodSensitive: true, moodEffect: 0.25, positiveMoodBoost: true, description: "鼓励支持" },
    support: { baseChange: 4, moodSensitive: true, moodEffect: 0.2, description: "支持认同" },
    flirt: { baseChange: 5, moodSensitive: true, moodEffect: 0.15, moodRequirements: ["happy", "playful", "excited"], description: "撩拨调情" },
    comfort: { baseChange: 4, moodSensitive: true, moodEffect: 0.3, moodRequirements: ["sad", "anxious"], description: "安慰关怀" },
    help: { baseChange: 2, moodSensitive: false, moodEffect: 0.1, description: "寻求帮助" },
    thanks: { baseChange: 2, moodSensitive: true, moodEffect: 0.15, description: "表达感谢" },
    apology: { baseChange: 1, moodSensitive: true, moodEffect: 0.1, moodRequirements: ["angry", "sad"], description: "道歉认错" },
    tease: { baseChange: 2, moodSensitive: true, moodEffect: 0.1, moodRequirements: ["playful", "happy"], description: "善意调侃" },
    care: { baseChange: 3, moodSensitive: true, moodEffect: 0.2, description: "关心问候" },
    gift: { baseChange: 8, moodSensitive: true, moodEffect: 0.4, positiveMoodBoost: true, description: "赠送礼物" },
    insult: { baseChange: -8, moodSensitive: true, moodEffect: -0.5, negativeMoodTrigger: true, description: "侮辱攻击" },
    harassment: { baseChange: -6, moodSensitive: true, moodEffect: -0.4, negativeMoodTrigger: true, description: "骚扰行为" },
    abuse: { baseChange: -10, moodSensitive: true, moodEffect: -0.6, negativeMoodTrigger: true, description: "恶意谩骂" },
    threat: { baseChange: -12, moodSensitive: true, moodEffect: -0.7, negativeMoodTrigger: true, triggerFear: true, description: "威胁恐吓" },
};
export function defaultAffectionConfig() {
    return {
        enabled: false,
        maxUserAffection: 100,
        maxTotalAffection: 500,
        affectionDecayRate: 0.3,
        model: "MiniMax-M2.5",
        timeoutMs: 5000,
        llmClassify: false,
    };
}
const COMPLIMENT_KEYWORDS = [
    "好美", "漂亮", "可爱", "美丽", "好看", "厉害", "优秀", "聪明", "温柔", "体贴", "贴心", "善良",
    "完美", "很棒", "真好", "不错", "赞", "给力", "牛逼", "好啊", "好呀", "棒棒", "太棒了", "真棒",
    "真厉害", "哇塞", "厉害了", "太好了", "好厉害", "好强", "好棒", "赞赞", "牛牛", "牛b", "nb",
    "牛批", "牛皮", "好牛", "超棒", "超好", "很好", "很棒", "很厉害", "太厉害了", "好喜欢", "喜欢你",
    "爱了", "太可爱了", "好可爱", "可爱爆了", "萌萌", "好萌",
];
const THANKS_KEYWORDS = ["谢谢", "感谢", "多谢", "thank", "谢", "thx", "谢啦", "谢了"];
const CARE_KEYWORDS = [
    "你好", "早上好", "晚上好", "怎么样", "最近好吗", "hello", "hi", "嗨", "哈喽",
    "哈罗", "安", "早", "晚安", "午安", "下午好", "你在吗", "在吗", "你在不在",
    "在不在", "你好呀", "你好啊",
];
const NEGATIVE_KEYWORDS = [
    "傻逼", "蠢货", "白痴", "垃圾", "废物", "去死", "妈的", "他妈", "畜生", "王八蛋", "神经病",
    "滚蛋", "混蛋", "欠揍", "找打", "白痴啊",
];
const THREAT_KEYWORDS = ["威胁", "杀", "打死", "弄死", "干掉", "揍", "打你"];
export function classifyInteractionByRules(message) {
    const lower = (message ?? "").toLowerCase().trim();
    for (const kw of COMPLIMENT_KEYWORDS) {
        if (lower.includes(kw))
            return "compliment";
    }
    for (const kw of THANKS_KEYWORDS) {
        if (lower.includes(kw))
            return "thanks";
    }
    for (const kw of CARE_KEYWORDS) {
        if (lower.includes(kw))
            return "care";
    }
    for (const kw of THREAT_KEYWORDS) {
        if (lower.includes(kw))
            return "threat";
    }
    for (const kw of NEGATIVE_KEYWORDS) {
        if (lower.includes(kw))
            return "insult";
    }
    return undefined;
}
export function buildClassifyPrompt(message, senderName) {
    return `你是微信机器人${senderName ? ` ${senderName}` : ""}的社交关系分析器。请判断用户消息的交互类型。

消息: "${message}"

从以下类型中选择一个 (返回 JSON: {"type": "xxx"}):
- chat: 普通聊天/闲聊
- compliment: 称赞/夸外貌/夸表现
- praise: 夸赞表扬 (比 compliment 更强烈)
- encourage: 鼓励支持
- support: 支持认同
- flirt: 撩拨调情
- comfort: 安慰关怀
- help: 寻求帮助
- thanks: 表达感谢
- apology: 道歉认错
- tease: 善意调侃
- care: 关心问候
- gift: 赠送礼物
- insult: 侮辱攻击
- harassment: 骚扰行为
- abuse: 恶意谩骂
- threat: 威胁恐吓

不确定时优先 "chat"。只输出 JSON。`;
}
export function parseClassifyResponse(text) {
    if (!text)
        return undefined;
    const fence = text.trim().match(/```(?:json)?\s*([\s\S]*?)```/);
    const s = (fence ? fence[1] : text).trim();
    try {
        const obj = JSON.parse(s);
        const t = obj.type;
        if (t && t in AFFECTION_RULES)
            return t;
        return undefined;
    }
    catch {
        const m = s.match(/\{[\s\S]*\}/);
        if (m) {
            try {
                const obj = JSON.parse(m[0]);
                const t = obj.type;
                if (t && t in AFFECTION_RULES)
                    return t;
            }
            catch {
            }
        }
        return undefined;
    }
}
export async function classifyInteractionWithLlm(message, senderName, cfg, opts) {
    if (!opts.apiKey || !cfg.llmClassify)
        return undefined;
    const baseUrl = (opts.baseUrl ?? "https://api.minimaxi.com/anthropic").replace(/\/$/, "");
    try {
        const resp = await safeFetch(`${baseUrl}/v1/messages`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "anthropic-version": "2023-06-01",
                "x-api-key": opts.apiKey,
            },
            body: JSON.stringify({
                model: cfg.model ?? "MiniMax-M2.5",
                max_tokens: 50,
                temperature: 0,
                messages: [{ role: "user", content: buildClassifyPrompt(message, senderName) }],
            }),
            signal: AbortSignal.timeout(cfg.timeoutMs ?? 5000),
        });
        if (!resp.ok)
            return undefined;
        const json = (await resp.json());
        const text = json.content?.find((b) => b.type === "text")?.text ?? "";
        return parseClassifyResponse(text);
    }
    catch {
        return undefined;
    }
}
export function calculateAffectionChange(input) {
    const rule = AFFECTION_RULES[input.interactionType] ?? AFFECTION_RULES.chat;
    if (rule.moodRequirements && input.currentMood) {
        if (!rule.moodRequirements.includes(input.currentMood.moodType)) {
            return {
                interactionType: input.interactionType,
                canChange: false,
                change: 0,
                reason: `当前心情(${input.currentMood.moodType})不适合${rule.description}`,
            };
        }
    }
    let actualChange = rule.baseChange;
    if (rule.moodSensitive && input.currentMood) {
        const mod = moodModifier(input.currentMood.moodType, input.currentMood.intensity);
        actualChange = Math.trunc(rule.baseChange * mod);
    }
    if (input.currentLevel >= input.maxUserAffection && actualChange > 0) {
        return {
            interactionType: input.interactionType,
            canChange: false,
            change: 0,
            reason: "好感度已达到上限",
        };
    }
    return {
        interactionType: input.interactionType,
        canChange: true,
        change: actualChange,
        reason: rule.description,
    };
}
export function planRedistribution(allAffections, targetUserId, increaseAmount, decayRate) {
    const result = new Map();
    let totalToDecrease = Math.max(0, increaseAmount);
    const others = allAffections
        .filter((a) => a.userId !== targetUserId)
        .sort((a, b) => b.level - a.level);
    const totalOthersLevel = others.reduce((sum, a) => sum + Math.max(0, a.level), 0);
    if (totalOthersLevel <= 0)
        return result;
    for (const user of others) {
        if (totalToDecrease <= 0)
            break;
        if (user.level <= 0)
            continue;
        const decreaseRatio = Math.min(1.0, totalToDecrease / totalOthersLevel);
        let decreaseAmount = Math.max(1, Math.trunc(user.level * decreaseRatio * decayRate));
        decreaseAmount = Math.min(decreaseAmount, user.level, totalToDecrease);
        result.set(user.userId, decreaseAmount);
        totalToDecrease -= decreaseAmount;
    }
    return result;
}
const MOOD_PROMPTS = {
    happy: "你现在心情很好，说话比较活泼开朗，容易表达正面情感。",
    sad: "你现在心情有些低落，说话比较温和，需要更多的理解和安慰。",
    excited: "你现在很兴奋，说话比较有活力，对很多事情都很感兴趣。",
    calm: "你现在心情平静，说话比较稳重，给人安全感。",
    angry: "你现在心情不太好，说话可能比较直接，不太有耐心。",
    anxious: "你现在有些紧张不安，说话可能比较谨慎，需要更多确认。",
    playful: "你现在心情很调皮，喜欢开玩笑，说话比较幽默风趣。",
    serious: "你现在比较严肃认真，说话简洁直接，专注于重要的事情。",
    nostalgic: "你现在有些怀旧情绪，说话带有回忆色彩，比较感性。",
    curious: "你现在对很多事情都很好奇，喜欢提问和探索新事物。",
};
const MOOD_DESCRIPTIONS = {
    happy: "心情愉快",
    sad: "心情低落",
    excited: "兴奋激动",
    calm: "平静",
    angry: "愤怒",
    anxious: "紧张不安",
    playful: "调皮",
    serious: "严肃",
    nostalgic: "怀旧",
    curious: "好奇",
};
export function defaultMood(nowMs) {
    return { moodType: "calm", intensity: 0.5, description: MOOD_DESCRIPTIONS.calm, expiresAt: nowMs };
}
export function applyMoodResponse(currentMood, interactionType, nowMs) {
    const rule = AFFECTION_RULES[interactionType];
    if (!rule)
        return null;
    const moodEffect = rule.moodEffect ?? 0;
    if (Math.abs(moodEffect) < 0.1)
        return null;
    if (rule.negativeMoodTrigger) {
        let newMood;
        if (interactionType === "threat")
            newMood = "anxious";
        else if (interactionType === "abuse")
            newMood = "angry";
        else if (interactionType === "insult")
            newMood = "sad";
        else
            newMood = "anxious";
        const intensity = Math.min(0.9, Math.abs(moodEffect));
        return {
            moodType: newMood,
            intensity,
            description: MOOD_DESCRIPTIONS[newMood],
            expiresAt: nowMs + 2 * 3600 * 1000,
        };
    }
    if (rule.positiveMoodBoost) {
        const newMood = interactionType === "gift" ? "excited" : "happy";
        const intensity = Math.min(0.8, moodEffect);
        return {
            moodType: newMood,
            intensity,
            description: MOOD_DESCRIPTIONS[newMood],
            expiresAt: nowMs + 4 * 3600 * 1000,
        };
    }
    let intensity = currentMood.intensity + moodEffect;
    intensity = Math.max(0.1, Math.min(0.9, intensity));
    if (Math.abs(intensity - currentMood.intensity) <= 0.1)
        return null;
    return { ...currentMood, intensity };
}
export function buildMoodSystemPrompt(basePrompt, mood) {
    const moodPrompt = MOOD_PROMPTS[mood.moodType] ?? "";
    if (!moodPrompt)
        return basePrompt;
    const intensityModifier = mood.intensity > 0.7 ? "非常" : mood.intensity > 0.4 ? "有些" : "轻微";
    const finalMoodPrompt = moodPrompt.replace("现在", `现在${intensityModifier}`);
    const moodKeywords = ["当前情绪状态", "心情", "情绪", "【当前情绪状态", "【增量更新"];
    if (moodKeywords.some((kw) => basePrompt.includes(kw)))
        return basePrompt;
    return `${basePrompt}\n\n当前情绪状态：${mood.description} ${finalMoodPrompt}\n\n请根据以上情绪状态调整你的回复风格和语气。`;
}
const groupStates = new Map();
export function resetAffectionStates() {
    groupStates.clear();
}
export function resetGroupAffection(groupId) {
    groupStates.delete(groupId);
}
function getGroupState(groupId) {
    let st = groupStates.get(groupId);
    if (!st) {
        st = { users: new Map(), mood: defaultMood(Date.now()) };
        groupStates.set(groupId, st);
    }
    return st;
}
export function getGroupMood(groupId, nowMs) {
    const st = getGroupState(groupId);
    if (nowMs > st.mood.expiresAt) {
        st.mood = defaultMood(nowMs);
    }
    return st.mood;
}
export function getUserAffection(groupId, userId) {
    return getGroupState(groupId).users.get(userId) ?? 0;
}
export function getAllUserAffections(groupId) {
    const st = getGroupState(groupId);
    return [...st.users.entries()].map(([userId, level]) => ({ userId, level }));
}
export function getGroupTotalAffection(groupId) {
    const st = getGroupState(groupId);
    let total = 0;
    for (const l of st.users.values())
        total += Math.max(0, l);
    return total;
}
export async function processAffectionMessage(groupId, userId, message, senderName, cfg, opts, nowMs) {
    if (!cfg.enabled)
        return null;
    let interactionType = classifyInteractionByRules(message);
    if (!interactionType) {
        interactionType = await classifyInteractionWithLlm(message, senderName, cfg, opts);
    }
    if (!interactionType)
        interactionType = "chat";
    const st = getGroupState(groupId);
    const currentMood = getGroupMood(groupId, nowMs);
    const currentLevel = st.users.get(userId) ?? 0;
    const calc = calculateAffectionChange({
        interactionType,
        currentLevel,
        currentMood,
        maxUserAffection: cfg.maxUserAffection ?? 100,
    });
    if (calc.canChange) {
        const newLevel = Math.max(0, currentLevel + calc.change);
        st.users.set(userId, newLevel);
    }
    const newMood = applyMoodResponse(st.mood, interactionType, nowMs);
    if (newMood)
        st.mood = newMood;
    const total = getGroupTotalAffection(groupId);
    if (total > (cfg.maxTotalAffection ?? 500)) {
        const excess = total - (cfg.maxTotalAffection ?? 500);
        if (calc.canChange && calc.change > 0) {
            const plan = planRedistribution(getAllUserAffections(groupId), userId, excess, cfg.affectionDecayRate ?? 0.3);
            for (const [uid, amount] of plan) {
                const cur = st.users.get(uid) ?? 0;
                st.users.set(uid, Math.max(0, cur - amount));
            }
        }
    }
    return {
        interactionType,
        change: calc.canChange ? calc.change : 0,
        canChange: calc.canChange,
        reason: calc.reason,
    };
}
export function getAffectionSummary(groupId) {
    const st = getGroupState(groupId);
    const mood = st.mood;
    const users = [...st.users.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const lines = users.map(([uid, level]) => `- ${uid}: ${level}`);
    return [
        `情绪: ${mood.description} (强度 ${mood.intensity.toFixed(1)}, ${MOOD_PROMPTS[mood.moodType] ?? ""})`,
        `用户数: ${st.users.size}`,
        ...lines,
    ].join("\n");
}
