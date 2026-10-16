// src/inbound/heartflow-caption.ts - v1.16.0 图片配文 (caption): 让群画像样本"看得见图"
//
// 老板 2026-10-16 的问题: "喂给画像 LLM 的样本能否加入图片识别后的数据?" —— 能, 且这是画像失真的
//   结构根: 全员群 14 天 44/78 条是图片, 而 buildHfProfilePrompt 的样本只有
//   `sender: 收到一张图片 [图片] https://…` ⇒ 归纳模型**永远看不见晒单图长什么样**, 只能从剩余
//   28 条文本归纳出"冷静通报群" ⇒ engage 清单缺晒单口径 ⇒ judge 给晒单图 0.635 (对照已含晒单口径的群 0.775)。
//
// 机制 (只在画像生成前跑, 每群每日最多一次; judge 热路径零新增开销):
//   listHfImageMsgs(近 lookbackDays 图片入站) → extractHfImageUrls 抠 URL → sha1 幂等键
//   → 批量查 wpp_hf_image_caption 已试集合 → 未配文且 fail_count<上限 的送 callJudge(images=[url])
//   → 成功存配文; 失败 fail_count+1 **止损不重试到死** (同图跨群共享 hash, 只配一次)。
//   loadSampleLines 再把 `收到一张图片 [图片] URL` 换成 `[图] <配文>` (顺带把 URL 噪声从样本里清掉)。
//
// 三条边界 (如实声明):
//   1. 配文是**有损投影** —— 40 字进不了成交截图的全部细节; 它服务于"这群日常在发什么"的归纳, 不服务于像素级复核。
//   2. vision 端点与 judge 同凭据 (JUDGE_*); 端点坏了 caption 静默失败 ⇒ 样本退回旧形态 (无配文=占位),
//      画像生成**不受阻塞** —— 这是红线: 增强件不许变成依赖件。
//   3. perGroupMax 截的是"单次生成补做额度", 不是"群里只配这么多图" —— 老图随 14 天窗口轮换排队补。
//      ⚠️ 2026-10-16 上线首日实测修正 (原注释写"一两天爬坡期", 实测差约 7 倍):
//        全员群画像样本窗 (最新 80 条入站) 跨 **13.9 天**、含 **44 张图 (占 55%)**; 而配额 6 张/次、
//        画像约每 22h 重生成一次 ⇒ 净排空 = 6 - 到达 3.1 = **2.9 张/天** ⇒ 存量排完要 **~15 天**,
//        期间 55% 的样本行仍是 `收到一张图片` = 画像照样看不见晒单图 (正是本模块要解决的问题)。
//      稳态本身没问题 (到达 3.1 < 配额 6, 追得上); 慢的只有**首轮存量** ⇒ 上线/新加群后应手动跑一次排空:
//        captionPendingHfImages(accountId, groupId, nowSec-14*86400, resolveHfCaptionCfg({perGroupMax: 60}), model, creds)
//      2026-10-16 已对 5 个白名单群执行: 50 张 / 0 失败, 样本窗覆盖 3 群 100% (另 2 群窗内无图)。
import crypto from "node:crypto";
import { warn, formatErr } from "../core/logger.js";
import { callJudge } from "../llm-judge.js";
import { getHfCaptionsByHashes, listHfImageMsgs, upsertHfImageCaption, } from "../storage/db/index.js";
import { extractHfImageUrls } from "./heartflow.js";
export const HF_CAPTION_DEFAULTS = {
    enabled: true,
    perGroupMax: 6,
    maxFails: 2,
    scanLimit: 150,
    timeoutMs: 8000,
};
export function resolveHfCaptionCfg(cfg) {
    const D = HF_CAPTION_DEFAULTS;
    return {
        enabled: cfg?.enabled ?? D.enabled,
        perGroupMax: Math.max(0, Math.floor(cfg?.perGroupMax ?? D.perGroupMax)),
        maxFails: Math.max(1, Math.floor(cfg?.maxFails ?? D.maxFails)),
        scanLimit: Math.min(500, Math.max(1, Math.floor(cfg?.scanLimit ?? D.scanLimit))),
        timeoutMs: Math.max(1000, Math.floor(cfg?.timeoutMs ?? D.timeoutMs)),
    };
}
// ===== 纯函数 (单测直接盯) =====
/** 幂等键: sha1(图片 URL) 十六进制 (URL 是 OSS 直链, 内容 hash 已在文件名里, 但 URL 字符串本身是稳定标识) */
export function hfCaptionHash(url) {
    return crypto.createHash("sha1").update(url).digest("hex");
}
/**
 * 从图片消息行挑出"还没配文且没试死"的 URL (纯函数, 可单测)。
 * 去重规则: 同 URL 只出一个任务; 已有 caption 跳过; 无行=首次; caption=null 且 fail_count<maxFails=重试。
 */
export function selectHfCaptionTasks(msgs, existing, opts) {
    const rows = new Map(existing.map((r) => [r.url_hash, r]));
    const seen = new Set();
    const out = [];
    for (const m of msgs) {
        if (!m.content)
            continue;
        for (const url of extractHfImageUrls(m.content, 4)) {
            const h = hfCaptionHash(url);
            if (seen.has(h))
                continue;
            seen.add(h);
            const row = rows.get(h);
            if (row && (row.caption !== null || row.fail_count >= opts.maxFails))
                continue;
            out.push({ url, url_hash: h, group_id: m.group_id });
            if (out.length >= opts.maxTasks)
                return out;
        }
    }
    return out;
}
/** 配文清洗: 压空白 + 限长 (画像样本行本身限 80 字, 配文占大头会挤掉 sender) */
export function cleanHfCaption(text) {
    return (text ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
}
/**
 * 画像样本行装配 (纯函数): 图片占位体换配文。
 * - 有配文: `[图] <配文>` (URL 噪声一并清掉 —— 它对归纳毫无价值还吃截断预算)
 * - 无配文: `收到一张图片` (退回旧信息量, 但比留 60 字符 URL 好)
 * - 非图片体: 原样返回
 */
export function hfCaptionSampleLine(body, captionsByHash) {
    if (!body.includes("[图片]"))
        return body;
    const urls = extractHfImageUrls(body, 1);
    const first = urls[0];
    const cap = first ? captionsByHash.get(hfCaptionHash(first)) : undefined;
    return cap ? `[图] ${cap}` : "收到一张图片";
}
/**
 * 一图的补配文 pass (在 maybeGenerateHfGroupProfiles 逐群生成前调用)。
 * 全部失败吞掉返回计数 —— 调用方再包一层 try/catch; 任何 DB/网络抖动都不许阻断画像生成。
 */
export async function captionPendingHfImages(accountId, groupId, sinceSec, cfg, model, creds) {
    const out = { tasks: 0, ok: 0, fail: 0 };
    if (!cfg.enabled || cfg.perGroupMax === 0)
        return out;
    // 与 judge 看图同规: images 仅 openai 格式端点生效; anthropic 分支会丢弃图片,
    //   模型对着"描述这张图片"凭空胡说 ⇒ 必须挡在调用前 (v1.11.0 images 边界同款)
    if (!creds || creds.format !== "openai")
        return out;
    const msgs = await listHfImageMsgs(accountId, [groupId], sinceSec, cfg.scanLimit);
    if (msgs.length === 0)
        return out;
    // 先抠出本批全部 URL, 一次批量查已试集合 (不逐条查库)
    const hashes = [];
    const seen = new Set();
    for (const m of msgs) {
        if (!m.content)
            continue;
        for (const url of extractHfImageUrls(m.content, 4)) {
            const h = hfCaptionHash(url);
            if (seen.has(h))
                continue;
            seen.add(h);
            hashes.push(h);
        }
    }
    if (hashes.length === 0)
        return out;
    const existing = await getHfCaptionsByHashes(accountId, hashes);
    const tasks = selectHfCaptionTasks(msgs, existing, {
        maxTasks: cfg.perGroupMax,
        maxFails: cfg.maxFails,
    });
    out.tasks = tasks.length;
    for (const t of tasks) {
        try {
            const text = await callJudge({
                model,
                userPrompt: "用一句话(40字内)描述这张微信群图片的内容要点。若是截图, 读出关键文字/数字/商品/金额/结果。只回描述本身, 不要前缀或解释。",
                systemPrompt: "你是图片内容记录员, 只输出一句中文描述。",
                maxTokens: 120,
                timeoutMs: cfg.timeoutMs,
                creds,
                images: [t.url],
            });
            const clean = cleanHfCaption(text);
            if (!clean)
                throw new Error("empty caption");
            await upsertHfImageCaption({
                account_id: accountId,
                url_hash: t.url_hash,
                group_id: t.group_id,
                url_sample: t.url.slice(0, 255),
                caption: clean,
                model,
                fail_delta: 0,
            });
            out.ok += 1;
        }
        catch (e) {
            out.fail += 1;
            // v1.16.0: 失败原因必须出声 —— 只落 fail_count 会有"图一直没配文却查不出为什么"的静默盲区
            //   (端点不支持 vision / OSS 403 / 超时 在库里长得一模一样)。单图最多 maxFails 次, 不担心刷屏。
            warn(`[WPP HF] caption failed (${t.url_hash.slice(0, 8)}): ${formatErr(e)}`);
            // 失败也要落行: caption NULL + fail_count+1 ⇒ 下次按 maxFails 止损
            try {
                await upsertHfImageCaption({
                    account_id: accountId,
                    url_hash: t.url_hash,
                    group_id: t.group_id,
                    url_sample: t.url.slice(0, 255),
                    caption: null,
                    model,
                    fail_delta: 1,
                });
            }
            catch (dbErr) {
                warn(`[WPP HF] caption fail-log error: ${formatErr(dbErr)}`);
            }
        }
    }
    return out;
}
/**
 * 样本装配用的批量配文查取 (loadSampleLines 图片行换字面)。
 * 失败返回空 Map ⇒ 样本退回旧形态 (增强件永不变成依赖件)。
 */
export async function loadHfCaptionsForBodies(accountId, bodies) {
    const map = new Map();
    try {
        const hashes = [];
        const seen = new Set();
        for (const b of bodies) {
            if (!b.includes("[图片]"))
                continue;
            for (const url of extractHfImageUrls(b, 4)) {
                const h = hfCaptionHash(url);
                if (seen.has(h))
                    continue;
                seen.add(h);
                hashes.push(h);
            }
        }
        if (hashes.length === 0)
            return map;
        const rows = await getHfCaptionsByHashes(accountId, hashes);
        for (const r of rows) {
            if (r.caption)
                map.set(r.url_hash, r.caption);
        }
    }
    catch (e) {
        warn(`[WPP HF] caption lookup failed (样本退回旧形态): ${formatErr(e)}`);
    }
    return map;
}
//# sourceMappingURL=heartflow-caption.js.map