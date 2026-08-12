#!/usr/bin/env node
// wpp-ws-watcher.mjs - v1.1.47 WS-A+B (2026-08-09 老板拍板 A+B 组合)
//
// 功能:
//   1. 检测 openclaw-gateway journal 最近 30 min WS 502 频率
//   2. 频率 > THRESHOLD (默认 30次/30min) → wecom 通知老板
//   3. 状态写到 /tmp/wpp-ws-watcher.state (防重复告警)
//
// 用法:
//   node wpp-ws-watcher.mjs          # 检测一次
//   node wpp-ws-watcher.mjs --reset  # 清状态 (force notify)
//
// Cron (per 老板 [2026-06-07 14:14] 分步可逆 SOP):
//   每 5 min 跑一次, vendor 持续异常时 30 min 内仅 1 次告警

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

// ============ 阈值（按 30 min WS 502 频率）============
const WINDOW_MIN = 30;
const THRESHOLD = 30; // 30 次/30min 触发告警 (实测老板 case: 25次/30min)
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 同 30 min 仅告警 1 次

// ============ 状态文件（防重复告警）============
const STATE_PATH = "/tmp/wpp-ws-watcher.state";

interface State {
  lastAlertAt: number;
  lastAlertCount: number;
  lastCheckAt: number;
}

function loadState(): State {
  if (!existsSync(STATE_PATH)) return { lastAlertAt: 0, lastAlertCount: 0, lastCheckAt: 0 };
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8")) as State;
  } catch {
    return { lastAlertAt: 0, lastAlertCount: 0, lastCheckAt: 0 };
  }
}

function saveState(s: State): void {
  writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

// ============ 检测 WS 502 频率 ============
function countWs502(): number {
  try {
    const cmd = `journalctl --user -u openclaw-gateway --since "${WINDOW_MIN} min ago" --no-pager 2>&1 | grep -c "ws error: Unexpected server response: 502"`;
    const out = execSync(cmd, { encoding: "utf8" }).trim();
    return parseInt(out, 10) || 0;
  } catch {
    return 0;
  }
}

function countMsgSync502(): number {
  try {
    const cmd = `journalctl --user -u openclaw-gateway --since "${WINDOW_MIN} min ago" --no-pager 2>&1 | grep -c "postWppJson /Msg/Sync.*502"`;
    const out = execSync(cmd, { encoding: "utf8" }).trim();
    return parseInt(out, 10) || 0;
  } catch {
    return 0;
  }
}

// ============ wecom 通知（用 OpenClaw message 工具的 SSH 等价）============
// 走 wecom webhook (按 老板 wecom 通道)
// 注: OpenClaw 框架 message 工具是 internal routing, shell 调用用 send-card.sh
// 这里直接用 wecom 凭证发群机器人 (老板的 wecom 企业 webhook)
const WECOM_WEBHOOK = process.env.WECOM_WEBHOOK || ""; // 老板从 wecom 后台拿

async function sendWecomAlert(count: number, msgSyncCount: number): Promise<boolean> {
  if (!WECOM_WEBHOOK) {
    console.warn("WECOM_WEBHOOK env var not set, skip notification");
    return false;
  }
  const text = `🔴 [WPP WS 502 老问题告警]

⏰ 检测时间: ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
📊 最近 ${WINDOW_MIN} 分钟:
   - WS 502: ${count} 次 (阈值 ${THRESHOLD})
   - /Msg/Sync 502: ${msgSyncCount} 次
🛡️ v1.1.47 智能退避: 已自动切 5min 长退避, 保护 vendor
📌 主路径: business callback 不受影响 (老板主号推送仍正常)

建议操作:
1. 群发消息验证 business callback 是否正常
2. 如果持续 1h+, 联系 vendor (wx.juhe.chat) 客服
3. 如需禁 WS: 编辑 accounts/default.json sync.enableWsClient=false`;
  try {
    const res = execSync(
      `curl -sS -X POST -H "Content-Type: application/json" -d ${JSON.stringify(JSON.stringify({ msgtype: "text", text: { content: text } }))} ${WECOM_WEBHOOK}`,
      { encoding: "utf8" },
    );
    return res.includes('"errcode":0') || res.includes("ok");
  } catch (e) {
    console.error("wecom send failed:", (e as Error).message);
    return false;
  }
}

// ============ main ============
async function main(): Promise<void> {
  const state = loadState();
  const ws502 = countWs502();
  const msgSync502 = countMsgSync502();
  const now = Date.now();

  state.lastCheckAt = now;
  saveState(state);

  const isOverThreshold = ws502 >= THRESHOLD;
  const isInCooldown = now - state.lastAlertAt < ALERT_COOLDOWN_MS;
  const shouldAlert = isOverThreshold && !isInCooldown;

  console.log(`[wpp-ws-watcher] ws502=${ws502}/msgSync502=${msgSync502} threshold=${THRESHOLD} cooldown=${isInCooldown} alert=${shouldAlert ? "🔥 YES" : "no"}`);

  if (shouldAlert) {
    const sent = await sendWecomAlert(ws502, msgSync502);
    if (sent) {
      state.lastAlertAt = now;
      state.lastAlertCount = ws502;
      saveState(state);
      console.log("🔥 wecom alert sent");
    }
  }

  if (process.argv.includes("--reset")) {
    state.lastAlertAt = 0;
    saveState(state);
    console.log("state reset");
  }
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});