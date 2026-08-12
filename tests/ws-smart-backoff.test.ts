// tests/ws-smart-backoff.test.ts - v1.1.47 WS-A+B
// 验证 ws-client.ts 智能退避逻辑
// v1.2.1 P1-fix (测试 CI): 仓库外绝对路径 → 相对路径 + existsSync skip (CI 不挂)

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const WS_SRC = join(here, "..", "src", "ws-client.ts");
const WATCHER = join(here, "..", "scripts", "wpp-ws-watcher.mjs");

function readSrc(): string {
  assert.ok(existsSync(WS_SRC), `missing ${WS_SRC} (CI 环境缺文件应 skip 而非 fail)`);
  return readFileSync(WS_SRC, "utf8");
}

describe("v1.1.47 WS-A+B 智能退避 (5 次 502 → 5 min 长退避)", () => {
  test("source 验证: ws-client.ts 含 5 字段 + 关键逻辑", () => {
    const src = readSrc();
    // 字段
    assert.ok(src.includes("consecutive502"), "应有 consecutive502 计数字段");
    assert.ok(src.includes("CONSECUTIVE_502_THRESHOLD"), "应有阈值常量");
    assert.ok(src.includes("LONG_BACKOFF_MS"), "应有长退避常量");
    assert.ok(src.includes("lastBackoffReason"), "应有 backoff reason 字段");
    // 逻辑
    assert.ok(src.includes("/502|503|504/"), "onError 应检测 5xx");
    assert.ok(src.includes("consecutive502 >= WechatpadproWsClient.CONSECUTIVE_502_THRESHOLD"), "阈值判断");
    assert.ok(src.includes("reset 502 counter"), "onOpen 应重置计数");
  });

  test("阈值常量正确 (5 次 5min)", () => {
    const src = readSrc();
    assert.ok(src.match(/CONSECUTIVE_502_THRESHOLD\s*=\s*5\b/), "阈值 = 5");
    assert.ok(src.match(/LONG_BACKOFF_MS\s*=\s*300_000\b/), "长退避 = 300000ms (5min)");
  });

  test("log 包含 smart backoff 字样", () => {
    const src = readSrc();
    assert.ok(src.includes("ws smart backoff triggered"), "onError 应有 smart backoff 警告 log");
    assert.ok(src.includes("smart backoff: ${this.lastBackoffReason}"), "scheduleRetry 应有 reason log");
    assert.ok(src.includes("vendor recovered"), "onOpen 重置时应有 recovered log");
  });
});

describe("v1.1.47 WS-A+B 监控告警 watcher 脚本", () => {
  // v1.2.1 P1-fix: watcher 脚本在 scripts/ (仓库内), 不在仓库外绝对路径; 缺失时 skip
  test("wpp-ws-watcher.mjs 存在且关键字段齐", (t) => {
    if (!existsSync(WATCHER)) {
      t.skip(`watcher 脚本不在 ${WATCHER}, 跳过`);
      return;
    }
    const src = readFileSync(WATCHER, "utf8");
    assert.ok(src.includes("countWs502"), "应有 countWs502 函数");
    assert.ok(src.includes("sendWecomAlert"), "应有 sendWecomAlert 函数");
    assert.ok(src.includes("ALERT_COOLDOWN_MS"), "应有 cooldown 防重复告警");
    assert.ok(src.includes("THRESHOLD"), "应有阈值常量");
  });

  test("阈值 = 30/30min (按老板 25 次实测定)", (t) => {
    if (!existsSync(WATCHER)) {
      t.skip(`watcher 脚本不在 ${WATCHER}, 跳过`);
      return;
    }
    const src = readFileSync(WATCHER, "utf8");
    assert.ok(src.match(/THRESHOLD\s*=\s*30\b/), "阈值 = 30");
    assert.ok(src.match(/WINDOW_MIN\s*=\s*30\b/), "窗口 = 30 min");
    assert.ok(src.match(/ALERT_COOLDOWN_MS\s*=\s*30\s*\*\s*60\s*\*\s*1000/), "cooldown = 30min");
  });

  test("wecom 通知有完整内容 (老板透明化)", (t) => {
    if (!existsSync(WATCHER)) {
      t.skip(`watcher 脚本不在 ${WATCHER}, 跳过`);
      return;
    }
    const src = readFileSync(WATCHER, "utf8");
    assert.ok(src.includes("🔴 [WPP WS 502 老问题告警]"), "应有醒目标题");
    assert.ok(src.includes("智能退避"), "应说明 v1.1.47 智能退避");
    assert.ok(src.includes("business callback 不受影响"), "应说明主路径 OK");
    assert.ok(src.includes("enableWsClient=false"), "应给老板禁用 WS 步骤");
  });
});
