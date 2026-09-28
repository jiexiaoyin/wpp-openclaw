// filehelper-features.ts — /heartflow | /affection | /jargon 统一命令处理器
// 2026-09-28 从 index.ts L351 提取 (index.ts 最大单块, 约 490 行)。
//   纯位置迁移: 函数体逐字未改, 只补全跨模块 import。
//   ⚠️ runtimeHeartflow 必须经 getHeartflowRuntime() 取全局唯一实例 ——
//      它同时被 index.ts 的 startAccountById 写入; 复制一份 Map 会让读写分属不同实例。

import { loadAccountConfigAsync, setAccountField, updateHeartflowGroups } from "../config.js";
import {
  listHfGroupStates,
  countHfLedgerByStatus,
  countHfEngageSignals,
  getHfLedgerLast,
  getHfGroupProfile,
  listHfLayerStats,
  listHfSentCountsRecent,
  markHfLedgerVeto,
  listHfClosedSince,
  listHfBotMsgShare,
  listHfOutboundTexts,
  getHfLastSentAtSec,
} from "../db.js";
import { defaultHeartflowConfig, isHfGroupAllowed, resolveHfLearning } from "./heartflow.js";
import {
  forgetHfOpenWindow,
  getLearnedThreshold,
  hfLayerAnchorFor,
  hfLayerStep,
  resolveHfEffectiveThreshold,
  resolveHfThresholdDecision,
} from "./heartflow-learn.js";
import {
  ambientPFromHourCounts,
  HF_LAYER_DB_ROW_CAP,
  hfLayerKeyFor,
  loadHfGroupHourCounts,
  resolveHfLayeredCfg,
} from "./heartflow-layer.js";
import { getHfBudgetState, hfBudgetBlockedSnapshot, hfLocalHour, resolveHfBudget } from "./heartflow-budget.js";
import { resolveHfDedupeCfg } from "./heartflow-dedupe.js";
import {
  buildHfDigest,
  hfBotShare,
  hfEngagementSummary,
  hfRepeatRate,
  hfShareGuardSnapshot,
  resolveHfShareGuardCfg,
} from "./heartflow-observe.js";
import {
  getHfProfilePromptText,
  parseHfGroupProfileRow,
  resolveHfProfileCfg,
} from "./heartflow-profile.js";
import { getHeartflowRuntime } from "./heartflow-runtime.js";
import { resolveHfEffectiveBudget } from "./triggers.js";

/** v1.8.0: /heartflow status / layers 里群列表的显示上限 (超出折叠成 "…其余 N 群") */
const HF_STATUS_MAX_GROUPS = 5;

// v1.9.2: 取全局唯一实例 (勿复制, 见文件头注)
const runtimeHeartflow = getHeartflowRuntime();

/**
 * v1.3.80 FEATURE-UNIFY: 三功能 (heartflow/affection/jargon) 统一命令处理器。
 * 通用: on/off/status; heartflow 特有: threshold + group add|del|list。
 * 返回 handled=true 表示命令已处理 (不分发给其它命令)。
 */
export type FeatureName = "heartflow" | "affection" | "jargon";

export async function handleFeatureCommand(
  feature: FeatureName,
  args: string[],
  send: (text: string) => Promise<void>,
  accountId: string,
): Promise<boolean> {
  const arg = (args[0] ?? "").toLowerCase();
  const cfg = await loadAccountConfigAsync(accountId);
  const fc = cfg?.[feature] as Record<string, unknown> | undefined;
  const current = Boolean(fc?.enabled);
  const label = feature === "heartflow" ? "心流主动回复" : feature === "affection" ? "好感度系统" : "黑话挖掘";

  // status: 显示当前状态 (+ heartflow 额外显示阈值/群白名单)
  if (arg === "status") {
    let extra = "";
    if (feature === "heartflow") {
      const th = typeof fc?.replyThreshold === "number" ? fc.replyThreshold : 0.6;
      const wl = Array.isArray(fc?.whitelistGroups) ? (fc.whitelistGroups as string[]).length : 0;
      const lrEnabled = Boolean((fc?.learning as { enabled?: boolean } | undefined)?.enabled);
      let learnLine = `\n自适应调阈: ${lrEnabled ? "✅ 开启" : "❌ 关闭"}`;
      try {
        const learned = await listHfGroupStates(accountId);
        if (learned.length > 0) {
          // v1.8.0: 上限 HF_STATUS_MAX_GROUPS —— 群多了之后这条消息会长到看不清 (无上限时 20 群 ≈ 20 行)
          const shown = learned.slice(0, HF_STATUS_MAX_GROUPS);
          learnLine += `\n已学阈值群 (${learned.length}):\n` + shown
            .map((s) => {
              const cur = s.learned_threshold == null ? "回落账号级" : Number(s.learned_threshold).toFixed(2);
              const last = s.last_change_new == null ? "" : ` (上次 ${s.last_change_old == null ? "账号级" : Number(s.last_change_old).toFixed(2)}→${Number(s.last_change_new).toFixed(2)})`;
              return `- ${s.group_id} → ${cur}${last}`;
            })
            .join("\n") +
            (learned.length > shown.length ? `\n…其余 ${learned.length - shown.length} 群` : "");
        } else {
          learnLine += " (暂无已学阈值 — 样本收集中, 满 10 条才自动调)";
        }
      } catch {
        learnLine += " (读学习状态失败)";
      }
      // v1.6.1 可观测: 近 24h 台账摘要 —— 「judge 跑了但没回」不再是盲区 (09-11 静默瘫教训)
      let ledgerLine = "";
      try {
        const since = Math.floor(Date.now() / 1000) - 86400;
        const c = await countHfLedgerByStatus(accountId, since);
        if (c.total === 0) {
          ledgerLine = "\n近24h台账: 0 行 (群里无消息 / judge 未跑 / judge 全失败 — 看日志 [WPP HEARTFLOW])";
        } else {
          const replied = (c.byStatus.sent ?? 0) + (c.byStatus.closed ?? 0);
          const silent = c.byStatus.suppressed ?? 0;
          const pending = c.byStatus.judged ?? 0;
          const reasons = Object.entries(c.bySuppressedReason)
            .map(([k, v]) => `${k} ${v}`)
            .join(", ");
          ledgerLine =
            `\n近24h台账: judge ${c.total} 次 → 回复 ${replied} / 沉默 ${silent}` +
            (pending ? ` / 待发送 ${pending}` : "") +
            (reasons ? `\n  沉默原因: ${reasons}` : "");
        }
      } catch {
        ledgerLine = "\n近24h台账: (读台账失败)";
      }
      // v1.6.8 可观测: 近 24h 已收敛样本的**命中信号分布** —— 老板要看的"标签是不是锚在我那条上",
      //   legacy = v1.6.8 之前的旧标签行 (不采信, 见 heartflow-label.ts)
      let sigLine = "";
      try {
        const since = Math.floor(Date.now() / 1000) - 86400;
        const sig = await countHfEngageSignals(accountId, since);
        const entries = Object.entries(sig);
        sigLine = entries.length
          ? `\n信号分布(24h): ${entries.map(([k, v]) => `${k} ${v}`).join(" / ")}\n  (quote/@=强正, negative=强负, short-window=窄窗有人说话, silence=无人接; 强信号恒采信, 弱信号按本底过滤)`
          : "\n信号分布(24h): 0 (还没攒到已收敛样本)";
      } catch {
        sigLine = "\n信号分布(24h): (读取失败)";
      }
      // v1.6.9 可观测: 发言预算档位 + 进程内拦截计数 (计数**重启归零**, 故标注"本次运行")
      let budgetLine = "";
      try {
        const hfCfg = runtimeHeartflow.get(accountId);
        const b = resolveHfBudget(hfCfg);
        const blocked = hfBudgetBlockedSnapshot();
        const blockedStr = Object.keys(blocked).length
          ? Object.entries(blocked).map(([k, v]) => `${k} ${v}`).join(" / ")
          : "无";
        budgetLine =
          `\n发言预算: ${b.enabled ? "开" : "关"} (每群 ≥${b.minGapSec}s / ≤${b.maxPerHour}条·小时 / ≤${b.maxPerDay}条·天` +
          `${b.quietHours.length ? ` / 静默段 ${b.quietHours.map(([s, e]) => `${s}-${e}时`).join(",")}` : " / 静默段 关"})` +
          `\n本次运行拦截: ${blockedStr}`;
      } catch {
        budgetLine = "\n发言预算: (读取失败)";
      }
      // v1.8.0 可观测: 分层模式 + 已达门槛的段 (老板要看"到底有没有在分层学", 否则影子态像"什么都没发生")
      let layerLine = "";
      try {
        const LAY = resolveHfLayeredCfg(runtimeHeartflow.get(accountId));
        const rows = await listHfLayerStats(accountId);
        const qualified = rows.filter((r) => r.n >= LAY.minSamples);
        const detail = qualified
          .slice(0, HF_STATUS_MAX_GROUPS)
          .map((r) => `${r.group_id}[${r.layer_key}] n=${r.n} rate=${r.n > 0 ? (r.engaged / r.n).toFixed(3) : "-"}`)
          .join(" / ");
        layerLine =
          `\n分层(群×时段): ${!LAY.enabled ? "❌ 关闭" : LAY.apply ? "✅ 生效" : "影子 (只记录不生效)"}` +
          ` (门槛 n≥${LAY.minSamples} / 窗口 ${LAY.windowDays} 天 / ${LAY.allowLoosen ? "允许放宽" : "只许收紧"})` +
          `\n  已达标段 ${qualified.length} 个` +
          (detail ? `: ${detail}` : " (样本仍在攒)") +
          (qualified.length > HF_STATUS_MAX_GROUPS ? ` …其余 ${qualified.length - HF_STATUS_MAX_GROUPS} 个` : "");
      } catch {
        layerLine = "\n分层(群×时段): (读取失败)";
      }
      // v1.9.0 可观测: 重复闸 + 占比外环 —— 老板要能一眼看到"重复闸拦了多少"(误杀信号) 与"外环收紧了谁"
      let v19Line = "";
      try {
        const hfCfg = runtimeHeartflow.get(accountId);
        const DED = resolveHfDedupeCfg(hfCfg);
        const SG = resolveHfShareGuardCfg(hfCfg);
        const hits = hfShareGuardSnapshot(accountId, resolveHfBudget(hfCfg), hfCfg, Math.floor(Date.now() / 1000));
        const suppressed = (await countHfLedgerByStatus(accountId, Math.floor(Date.now() / 1000) - 86400)).bySuppressedReason;
        v19Line =
          `\n重复闸: ${DED.enabled ? "✅ 开" : "❌ 关"} (仅心流主动插话 / 同群 ${Math.round(DED.windowSec / 3600)}h / 相似 ≥${DED.simThreshold} / 短句豁免 <${DED.minChars} 字)` +
          `\n  近24h拦下: ${suppressed["repeat"] ?? 0} 条 (异常增多=误杀, 可 heartflow.dedupe.simThreshold 调高)` +
          `\n占比外环: ${SG.enabled ? "✅ 开" : "❌ 关"} (目标 ≤${(SG.targetShare * 100).toFixed(0)}% / 样本 ≥${SG.minMsgs} 条·≥${SG.minBotSends} bot 条)` +
          (hits.length
            ? `\n  今日已收紧 ${hits.length} 群: ` + hits.slice(0, HF_STATUS_MAX_GROUPS)
                .map((h) => `${h.groupId} ${(h.share * 100).toFixed(1)}%`)
                .join(" / ")
            : "\n  今日未收紧 (无群超目标占比)");
      } catch {
        v19Line = "\n重复闸/占比外环: (读取失败)";
      }
      // v1.10.0 可观测 (P0 停摆复盘的直接产物): **逐群生效阈值** + 上一次真发言距今多久。
      //   为什么必须有这一行: 09-26 停摆 3 天, 而旧状态页打印的是账号级 replyThreshold (0.6) ——
      //   看起来一切正常。真正决定"回不回"的是**逐群生效值**(学习值 + 画像抬升 + 可达性天花板),
      //   不把它摊开, "阈值被抬到够不着"这种失效就永远是隐形的 (见 resolveHfEffectiveThreshold)。
      let effLine = "";
      try {
        const hfCfg = runtimeHeartflow.get(accountId) ?? defaultHeartflowConfig();
        const groups = (Array.isArray(fc?.whitelistGroups) ? (fc.whitelistGroups as string[]) : [])
          .filter((g) => isHfGroupAllowed(g, hfCfg));
        const nowSec = Math.floor(Date.now() / 1000);
        const shownGroups = groups.slice(0, HF_STATUS_MAX_GROUPS);
        const effs = shownGroups.map((g) => resolveHfEffectiveThreshold(accountId, g, hfCfg, nowSec));
        // 生效预算与阈值同理: 展示的必须是**实际生效**的三层收紧结果 (账号档 → 画像 → 占比外环),
        //   而不是账号档 —— 否则"这个群为什么一天只回一条"在运维面上没法解释。
        const acctBudget = resolveHfBudget(hfCfg);
        const shownBudgets = shownGroups.map((g) => resolveHfEffectiveBudget(accountId, g, hfCfg, nowSec));
        const rows = shownGroups.map((g, i) => {
          const E = effs[i]!;
          const B = shownBudgets[i]!;
          const src =
            E.override != null ? `群级/分层 ${E.override.toFixed(2)}` : `账号级 ${E.base.toFixed(2)}`;
          const band = E.band != null ? `, 画像建议 ${E.band.toFixed(2)}${E.bandCapped ? " 已截断" : ""}` : "";
          const cap = E.reachInfo
            ? `, 天花板 ${E.reachCap?.toFixed(2)} (最高只 ${E.reachInfo.maxScore.toFixed(2)}/${E.reachInfo.n}条)`
            : "";
          const budget =
            B.minGapSec !== acctBudget.minGapSec ||
            B.maxPerHour !== acctBudget.maxPerHour ||
            B.maxPerDay !== acctBudget.maxPerDay
              ? `; 预算 ${B.minGapSec}s/${B.maxPerHour}条·时/${B.maxPerDay}条·天 (账号档 ${acctBudget.minGapSec}s/${acctBudget.maxPerHour}/${acctBudget.maxPerDay}, 已被收紧)`
              : "";
          return `- ${g}: 阈值 ${E.threshold.toFixed(2)} (${src}${band}${cap})${budget}`;
        });
        const maxEff = Math.max(...effs.map((e) => e.threshold), hfCfg.replyThreshold ?? 0.6);
        effLine = `\n生效阈值(=判据, 与 judge 同源): 账号级 ${th.toFixed(2)} / 最高生效 ${maxEff.toFixed(2)}`;
        effLine += rows.length
          ? `\n${rows.join("\n")}` +
            (groups.length > rows.length ? `\n…其余 ${groups.length - rows.length} 群` : "")
          : "\n(白名单无群 ⇒ 心流不会在任何群发言)";
      } catch {
        effLine = "\n生效阈值: (读取失败)";
      }
      // 停摆金丝雀: 距上次**真**发言多久 (sent_at, 不含被拦下的占位符)。无记录 ⇒ 从未发过。
      let lastSendLine = "";
      try {
        const last = await getHfLastSentAtSec(accountId);
        if (last == null) {
          lastSendLine = "\n上次真发言: 从未 (检查群白名单 / 阈值 / 预算)";
        } else {
          const age = Math.floor(Date.now() / 1000) - last;
          const days = age / 86400;
          lastSendLine =
            `\n上次真发言: ${days >= 1 ? `${days.toFixed(1)} 天前` : `${Math.round(age / 60)} 分钟前`}` +
            ` (${new Date(last * 1000).toLocaleString("zh-CN")})` +
            (days >= 3 ? " ⚠️ 已超 3 天 —— 典型停摆, 查上面的生效阈值/天花板/预算" : "");
        }
      } catch {
        lastSendLine = "";
      }
      // v1.10.0: 删掉单独的 `阈值: 0.6` 一行 —— 它只报账号级值, 而"回不回"由逐群生效值决定。
      //   停摆期间这行正是"看起来正常"的来源; 账号级值现在由 effLine 首行报告。
      extra = `\n心流群白名单: ${wl} 个${effLine}${lastSendLine}${learnLine}${ledgerLine}${sigLine}${budgetLine}${layerLine}${v19Line}`;
    }
    await send(`${label} (account=${accountId}):\n状态: ${current ? "✅ 开启" : "❌ 关闭"}${extra}\n用法: /${feature} on|off|status`);
    return true;
  }

  // on/off: 开关
  if (arg === "on" || arg === "off") {
    const target = arg === "on";
    const r = await setAccountField(accountId, `${feature}.enabled`, target);
    await send(r.ok
      ? `✅ ${label}已${target ? "开启" : "关闭"} (account=${accountId})`
      : `❌ 设置失败: ${r.reason ?? "unknown"}`);
    return true;
  }

  // heartflow 特有: threshold
  if (feature === "heartflow" && arg === "threshold") {
    const v = Number(args[1]);
    if (!Number.isFinite(v) || v < 0 || v > 1) {
      await send("用法: /heartflow threshold <0-1>\n示例: /heartflow threshold 0.5 (0.6=默认, 越低越活跃)");
      return true;
    }
    const r = await setAccountField(accountId, "heartflow.replyThreshold", v);
    await send(r.ok
      ? `✅ 心流阈值已设为 ${v} (account=${accountId})`
      : `❌ 设置失败: ${r.reason ?? "unknown"}`);
    return true;
  }

  // heartflow 特有: group add|del|list (add 联动群聊白名单, del 只删心流)
  if (feature === "heartflow" && arg === "group") {
    const sub = (args[1] ?? "").toLowerCase();
    const targets = args.slice(2).map((s) => s.trim()).filter(Boolean);
    const wl = Array.isArray(fc?.whitelistGroups) ? (fc.whitelistGroups as string[]) : [];
    if (sub === "list" || (sub === "" && targets.length === 0)) {
      await send(`心流群白名单 (${wl.length}):\n` + (wl.length ? wl.map((g) => `- ${g}`).join("\n") : "(空)"));
      return true;
    }
    if ((sub === "add" || sub === "del") && targets.length) {
      for (const t of targets) {
        await updateHeartflowGroups(accountId, sub as "add" | "del", t);
      }
      const cfg2 = await loadAccountConfigAsync(accountId);
      const wl2 = (cfg2?.heartflow?.whitelistGroups as string[] | undefined) ?? [];
      const gal = cfg2?.groupAllowFrom ?? [];
      await send(`✅ 心流群白名单已${sub === "add" ? "添加" : "移除"}: ${targets.join(", ")}\n当前心流群 (${wl2.length}): ${wl2.join(", ") || "(空)"}\n(add 自动补群聊白名单; del 不删群聊白名单, 当前群聊白名单 ${gal.length} 个)`);
      return true;
    }
    await send("用法: /heartflow group add <群ID> [群ID...]\n  或 /heartflow group del <群ID> [群ID...]\n  或 /heartflow group list");
    return true;
  }

  // heartflow 特有: profile <群ID> (v1.7.0: 看该群画像 + 实测统计)
  if (feature === "heartflow" && arg === "profile") {
    const gid = (args[1] ?? "").trim();
    if (!gid) {
      await send("用法: /heartflow profile <群ID>\n(画像由 sweep 每日自动生成; 样本不足的群暂无画像)");
      return true;
    }
    try {
      const row = await getHfGroupProfile(accountId, gid);
      if (!row) {
        await send(`该群暂无画像 (account=${accountId}):\n${gid}\n画像在 sweep 里每日生成; 需近 14 天有足够群消息。`);
        return true;
      }
      const p = parseHfGroupProfileRow(row);
      const profileApplyQuiet = resolveHfProfileCfg(runtimeHeartflow.get(accountId)).applyQuietHours;
      const st = row.stats_json ? (JSON.parse(row.stats_json) as Record<string, unknown>) : {};
      const hist = Array.isArray(st.hourHist) ? (st.hourHist as number[]) : [];
      const derived = Array.isArray(st.derivedActiveHours) ? (st.derivedActiveHours as number[]) : [];
      const genAt = row.generated_at ? new Date(row.generated_at * 1000).toLocaleString("zh-CN") : "?";
      const lines = [
        `群画像 (account=${accountId}, v${row.version ?? 1}, ${genAt}, ${row.model ?? "?"})`,
        `群: ${gid}`,
        p ? `群性质: ${p.nature || "-"}` : "⚠️ 画像解析失败 (只展示统计)",
        p ? `语言风格: ${p.style || "-"}` : "",
        p ? `我在该群的角色: ${p.botRole || "-"}` : "",
        p && p.engage.length ? `宜接话题: ${p.engage.join("、")}` : "",
        p && p.avoid.length ? `忌接话题: ${p.avoid.join("、")}` : "",
        p && p.activeHours.length ? `画像说活跃时段: ${p.activeHours.map((h) => `${h}时`).join(",")}` : "",
        derived.length ? `实测活跃时段: ${derived.map((h) => `${h}时`).join(",")}` : "",
        p && p.quietHours.length
          ? `建议静默段: ${p.quietHours.map(([s, e]) => `${s}-${e}时`).join(",")} (${profileApplyQuiet ? "已生效" : "未生效, 仅建议"})`
          : "",
        p && p.band != null ? `建议阈值下限: ${p.band} (只会抬高阈值, 不会下压)` : "",
        p && p.budget ? `建议预算收紧: ${JSON.stringify(p.budget)}` : "",
        `样本: ${row.sample_msgs ?? 0} 条 / 窗口内共 ${st.total ?? "?"} 条 / 活跃 ${st.activeDays ?? "?"} 天 / 均长 ${st.avgLen ?? "?"} 字`,
        hist.length ? `每小时消息量: ${hist.map((n, h) => (n > 0 ? `${h}时${n}` : null)).filter(Boolean).join(" ")}` : "",
      ].filter(Boolean);
      await send(lines.join("\n"));
    } catch (e) {
      await send(`读取画像失败: ${e instanceof Error ? e.message : String(e)}`);
    }
    return true;
  }

  // heartflow 特有: layers [群ID] (v1.8.0: 看每群各时段的分层统计 + 影子建议 + 每段样本进度)
  if (feature === "heartflow" && arg === "layers") {
    const gid = (args[1] ?? "").trim();
    try {
      const hfCfg = runtimeHeartflow.get(accountId) ?? defaultHeartflowConfig();
      const LAY = resolveHfLayeredCfg(hfCfg);
      const nowSec = Math.floor(Date.now() / 1000);
      const curKey = hfLayerKeyFor(hfLocalHour(nowSec), LAY.buckets);
      const rows = await listHfLayerStats(accountId);
      const all = [...new Set(rows.map((r) => r.group_id))].sort();
      const groups = gid ? all.filter((g) => g === gid) : all;
      if (groups.length === 0) {
        await send(
          gid
            ? `该群暂无分层统计 (account=${accountId}):\n${gid}\n(统计由 sweep 每 5 分钟重算一次; 需先有心流已收敛样本)`
            : `暂无分层统计 (account=${accountId})\n(统计由 sweep 每 5 分钟重算一次; 需先有心流已收敛样本)`,
        );
        return true;
      }
      const shown = groups.slice(0, HF_STATUS_MAX_GROUPS);
      const lines = [
        `分层统计 (群×时段; account=${accountId})`,
        `模式: ${!LAY.enabled ? "❌ 关闭" : LAY.apply ? "✅ 生效" : "影子 (apply=false, 只记录不生效)"}` +
          ` / 每段门槛 n≥${LAY.minSamples} / 窗口 ${LAY.windowDays} 天 / ${LAY.allowLoosen ? "允许放宽" : "只许收紧"}`,
        `段: ${LAY.buckets.map(([s, e]) => `${s}-${e}时`).join(" / ")} · 当前时段 ${curKey ?? "(未被任何段覆盖)"}`,
      ];
      for (const g of shown) {
        const anchor = hfLayerAnchorFor(accountId, g, hfCfg);
        lines.push(`群 ${g}: 群级锚点 ${anchor.toFixed(2)}`);
        for (const [s, e] of LAY.buckets) {
          const key = `${s}-${e}`;
          const r = rows.find((x) => x.group_id === g && x.layer_key === key && x.layer_kind === "daypart");
          const n = r?.n ?? 0;
          const engaged = r?.engaged ?? 0;
          const step = hfLayerStep(anchor, { n, engaged }, hfCfg);
          lines.push(
            `  ${key}时: n=${n}/${LAY.minSamples}${n >= LAY.minSamples ? "" : " (样本不足)"}` +
              ` rate=${n > 0 ? (engaged / n).toFixed(3) : "-"}` +
              (r?.ambient_p != null ? ` 本底=${Number(r.ambient_p).toFixed(3)}` : "") +
              (step.changed
                ? ` ⇒ 建议 ${step.threshold.toFixed(2)}${LAY.apply ? " (生效)" : " (未生效)"}`
                : " ⇒ 无建议 (死区/样本不足)") +
              (key === curKey ? " ← 当前时段" : ""),
          );
        }
      }
      if (groups.length > shown.length) lines.push(`…其余 ${groups.length - shown.length} 群`);
      await send(lines.join("\n"));
    } catch (e) {
      await send(`读取分层统计失败: ${e instanceof Error ? e.message : String(e)}`);
    }
    return true;
  }

  // heartflow 特有: veto [群ID] (v1.8.0: 一键"这条不该回" = 人工强负样本)
  if (feature === "heartflow" && arg === "veto") {
    const nowSec = Math.floor(Date.now() / 1000);
    try {
      let gid = (args[1] ?? "").trim();
      if (!gid) {
        // 多群歧义保护: 最近 15 分钟有几个群发过? 0 → 明确回执; 1 → 就用它; ≥2 → 拒绝并要求显式群 ID
        //   (写错群不可撤销: 错误样本会在 60 天分层窗口里持续污染)
        const recent = await listHfSentCountsRecent(accountId, nowSec - 900, nowSec - 900);
        const active = recent.map((r) => r.group_id);
        if (active.length === 0) {
          await send(`最近 15 分钟没有心流发言可否决 (account=${accountId})\n用法: /heartflow veto [群ID]`);
          return true;
        }
        if (active.length >= 2) {
          await send(
            `最近 15 分钟有 ${active.length} 个群发过言, 无法判断是哪一条 ⇒ 请显式指定群 ID:\n` +
              active.map((g) => `- ${g}`).join("\n") +
              `\n用法: /heartflow veto <群ID>`,
          );
          return true;
        }
        gid = active[0] as string;
      }
      const r = await markHfLedgerVeto(accountId, gid, nowSec);
      if (!r) {
        await send(
          `没找到可否决的发言 (account=${accountId}):\n${gid}\n(只对"已发出/已收敛"的心流发言生效; 已收敛的更早发言不在"最近一条")`,
        );
        return true;
      }
      // ⚠️ 必须删内存开窗: 否则随后有人引用那条 bot 消息会把 veto 覆盖成 engaged=1 (比不点更糟)
      forgetHfOpenWindow(accountId, gid);
      await send(
        `已标记「这条不该回」(account=${accountId}):\n群: ${gid}\n那条: ${(r.content_head ?? "(无内容记录)").slice(0, 40)}\n` +
          `发出: ${r.sent_at ? new Date(r.sent_at * 1000).toLocaleString("zh-CN") : "?"}\n` +
          `已作为强负样本参与分层与调阈 (signal=veto, 不受本底过滤)。`,
      );
    } catch (e) {
      await send(`否决失败: ${e instanceof Error ? e.message : String(e)}`);
    }
    return true;
  }

  // heartflow 特有: why <群ID> (v1.7.0: 解释上一条为什么回/不回)
  if (feature === "heartflow" && arg === "why") {
    const gid = (args[1] ?? "").trim();
    if (!gid) {
      await send("用法: /heartflow why <群ID>\n(显示该群最近一次 judge 的五维打分/有效阈值/命中信号 + 当前预算与画像)");
      return true;
    }
    try {
      const last = await getHfLedgerLast(accountId, gid);
      // 缺省用 defaultHeartflowConfig() (enabled 默认 false): 这里只读字段做展示, 不改变行为
      const hfCfg = runtimeHeartflow.get(accountId) ?? defaultHeartflowConfig();
      const learned = getLearnedThreshold(accountId, gid);
      // v1.8.0: 阈值决策改用统一入口 (与 handler 判定同源) —— 归因行才不会与实际判定脱节
      const d = resolveHfThresholdDecision(accountId, gid, hfCfg);
      // v1.10.0: 生效值也改走**唯一入口**。旧码在这里写第三份算法 (`max(base, 画像下限)`) ⇒
      //   judge 按 0.85 判、这里却显示 0.60, 静默停摆期间状态页看起来完全正常 (见 resolveHfEffectiveThreshold)。
      const E = resolveHfEffectiveThreshold(accountId, gid, hfCfg);
      const anchor = hfLayerAnchorFor(accountId, gid, hfCfg);
      const base = E.override ?? hfCfg.replyThreshold ?? 0.6;
      const eff = E.threshold;
      const srcName =
        d.source === "layer"
          ? `分层[${d.layerKey}]`
          : d.source === "group"
            ? `群级 learned ${learned?.toFixed(2) ?? "-"}`
            : "账号级";
      const attrLine =
        `生效阈值 ${eff.toFixed(2)} = ${srcName} ${base.toFixed(2)}` +
        (d.layerKey ? ` [段 ${d.layerKey} n=${d.layerN} ${d.layerRate == null ? "无样本" : `rate=${d.layerRate.toFixed(3)}`}${d.apply ? " 生效" : " 未生效(影子)"}]` : "") +
        ` ← 群级 ${learned?.toFixed(2) ?? `- (锚点 ${anchor.toFixed(2)})`} / 账号 ${hfCfg.replyThreshold ?? "-"}` +
        (E.band == null
          ? ""
          : ` / 画像建议 ${E.band.toFixed(2)}${E.bandCapped ? ` ⇒ 抬到 ${(base + resolveHfProfileCfg(hfCfg).maxRaise).toFixed(2)} (上限截断)` : " (未抬高)"}`) +
        (E.reachInfo
          ? `\n可达性天花板: 压到 ${E.reachCap?.toFixed(2)} (近 7 天 ${E.reachInfo.n} 条判定最高只 ${E.reachInfo.maxScore.toFixed(2)} —— 阈值够不着 ⇒ 心流等于停摆)`
          : "");
      const shadowLine = d.shadow
        ? `影子建议: 分层[${d.shadow.layerKey}] n=${d.shadow.n} rate=${d.shadow.rate.toFixed(3)} ⇒ ${d.shadow.threshold.toFixed(2)} (layered.apply=false, 未生效)`
        : d.layerKey && d.layerN > 0 && !d.apply
          ? `影子分层: 段 ${d.layerKey} n=${d.layerN} rate=${d.layerRate?.toFixed(3) ?? "-"} ⇒ 死区内/不可动, 无建议`
          : d.layerKey
            ? `影子分层: 段 ${d.layerKey} n=0 ⇒ 样本不足 (门槛 ${resolveHfLayeredCfg(hfCfg).minSamples})`
            : "";
      const b = getHfBudgetState(accountId, gid, Math.floor(Date.now() / 1000));
      const budgetStr =
        `预算(本群): 本小时 ${b.hourCount} 条 / 今日 ${b.dayCount} 条` +
        (b.lastReplyAtSec ? ` / 上次发言 ${Math.round((Date.now() / 1000 - b.lastReplyAtSec) / 60)} 分钟前` : "");
      const prof = getHfProfilePromptText(accountId, gid);
      const head = last
        ? [
            `最近一次 judge: ${new Date(last.judged_at * 1000).toLocaleString("zh-CN")} 状态=${last.status}`,
            last.judge_overall != null
              ? `综合分 ${last.judge_overall} vs 当时阈值 ${last.effective_threshold ?? "?"} ⇒ ${last.judge_overall >= (last.effective_threshold ?? 0.6) ? "过阈" : "未过阈(沉默)"}`
              : "无打分 (judge 未产出结果)",
            `五维: 相关 ${last.dim_r ?? "-"} / 意愿 ${last.dim_w ?? "-"} / 社交 ${last.dim_s ?? "-"} / 时机 ${last.dim_t ?? "-"} / 连贯 ${last.dim_c ?? "-"}`,
            `精力 ${last.energy ?? "-"} / 被接话 ${last.engaged == null ? "(不含在样本内)" : last.engaged ? "是" : "否"} / 信号 ${last.engage_signal ?? "(旧行/无)"}`,
            last.suppressed_reason ? `沉默原因: ${last.suppressed_reason}` : "",
            `消息: ${(last.content_head ?? "").slice(0, 40)}`,
          ]
        : ["最近无 judge 记录 (该群近 7 天没攒到台账行)"];
      await send(
        [
          `为什么 (account=${accountId}):`,
          `群: ${gid}`,
          ...head,
          attrLine,
          shadowLine,
          budgetStr,
          prof ? `画像摘要:\n${prof}` : "画像: 无 (未生成 / 未预热)",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    } catch (e) {
      await send(`读取台账失败: ${e instanceof Error ? e.message : String(e)}`);
    }
    return true;
  }

  // heartflow 特有: report [天数] (v1.9.0 观测复盘: 占比/接话率/被制止率/重复率/分层/预算/外环)
  if (feature === "heartflow" && arg === "report") {
    const raw = Number(args[1] ?? 7);
    const days = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 1), 30) : 7;
    const nowSec = Math.floor(Date.now() / 1000);
    const since = nowSec - days * 86400;
    try {
      const hfCfg = runtimeHeartflow.get(accountId) ?? defaultHeartflowConfig();
      const LRN = resolveHfLearning(hfCfg);
      const LAY = resolveHfLayeredCfg(hfCfg);
      const DED = resolveHfDedupeCfg(hfCfg);
      const baseBudget = resolveHfBudget(hfCfg);

      // ① 发言占比 (wpp_messages: 按群 × 方向计数; adapter 已 COALESCE 归群)
      const shareRows = await listHfBotMsgShare(accountId, since);
      const agg = new Map<string, { inbound: number; outbound: number }>();
      for (const r of shareRows) {
        if (!r.group_id) continue;
        const cur = agg.get(r.group_id) ?? { inbound: 0, outbound: 0 };
        if (r.direction === "outbound") cur.outbound += r.n;
        else cur.inbound += r.n;
        agg.set(r.group_id, cur);
      }
      const shares = [...agg.entries()]
        .map(([groupId, v]) => ({ groupId, inbound: v.inbound, outbound: v.outbound, share: hfBotShare(v.inbound, v.outbound) }))
        .sort((a, b) => b.share - a.share);

      // ② 接话率 (台账已收敛样本; 逐样本用它自己那一小时的本底 ⇒ 与 sweep 的调阈 pass 同源)
      const ambient = ambientPFromHourCounts(await loadHfGroupHourCounts(accountId, nowSec), LRN.labelWindowSec);
      const closed = await listHfClosedSince(accountId, since, HF_LAYER_DB_ROW_CAP);
      const engagement = hfEngagementSummary(closed, ambient, LRN.ambientMax);

      // ③ 被制止率 (judged_at 口径; legacy 旧标签行不计入分母)
      const sig = await countHfEngageSignals(accountId, since);
      const stoppedTotal = Object.entries(sig).reduce((s, [k, v]) => (k === "legacy" ? s : s + v), 0);

      // ④ 重复率 (闸同源)
      const outbound = await listHfOutboundTexts(accountId, since, 2000);
      const repeat = hfRepeatRate(
        outbound.map((r) => ({ groupId: r.group_id, text: r.content, atSec: r.at_sec })),
        DED,
      );

      // ⑤ 分层 (只看**当前时段**; 与 /heartflow layers 同一个 hfLayerStep, 不写第二套判定参数)
      const curKey = hfLayerKeyFor(hfLocalHour(nowSec), LAY.buckets);
      const layerRows = await listHfLayerStats(accountId);
      const layers: Array<{
        groupId: string; layerKey: string; n: number; engaged: number;
        rate: number | null; suggestion: number | null; applied: boolean;
      }> = [];
      if (curKey) {
        for (const g of [...new Set(layerRows.map((r) => r.group_id))]) {
          const r = layerRows.find((x) => x.group_id === g && x.layer_key === curKey && x.layer_kind === "daypart");
          const n = r?.n ?? 0;
          const engaged = r?.engaged ?? 0;
          const step = hfLayerStep(hfLayerAnchorFor(accountId, g, hfCfg), { n, engaged }, hfCfg);
          layers.push({
            groupId: g,
            layerKey: curKey,
            n,
            engaged,
            rate: n > 0 ? engaged / n : null,
            suggestion: step.changed ? step.threshold : null,
            applied: LAY.apply && LAY.enabled && n >= LAY.minSamples && step.changed,
          });
        }
        layers.sort((a, b) => b.n - a.n);
      }

      const text = buildHfDigest({
        nowSec,
        days,
        shares,
        engagement,
        stopped: { negative: sig["negative"] ?? 0, veto: sig["veto"] ?? 0, total: stoppedTotal },
        repeat,
        repeatSampleTotal: outbound.length,
        layers,
        budget: hfBudgetBlockedSnapshot(),
        shareGuard: hfShareGuardSnapshot(accountId, baseBudget, hfCfg, nowSec),
      });
      await send(text);
    } catch (e) {
      await send(`生成复盘失败: ${e instanceof Error ? e.message : String(e)}`);
    }
    return true;
  }

  // 未知 action: 提示用法
  const extra =
    feature === "heartflow"
      ? "\n  或 /heartflow threshold <0-1>\n  或 /heartflow group add|del|list <群ID>\n  或 /heartflow profile <群ID>\n  或 /heartflow why <群ID>\n  或 /heartflow layers [群ID] (v1.8.0 分层统计)\n  或 /heartflow veto [群ID] (v1.8.0 这条不该回)\n  或 /heartflow report [天数] (v1.9.0 复盘: 占比/接话率/重复率/外环)"
      : "";
  await send(`用法: /${feature} on|off|status${extra}\n状态: ${current ? "✅ 开启" : "❌ 关闭"}`);
  return true;
}
