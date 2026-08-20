#!/usr/bin/env node
// wpp-test-zombie-watcher.mjs - v1.3.74 (2026-08-20 老板 C-防僵尸)
//
// 背景: 8/11 一次全量测试卡死 → tsx 测试进程残留 9 天 (PID 11974/11989 等), 干扰后续测试。
// 功能:
//   1. 扫描 tsx --test / node --test 进程
//   2. 运行 > ZOMBIE_MIN_MIN (默认 15 min) 的 = 疑似卡死 (正常全量 85s)
//   3. 发现 → 打印 PID/时长/命令 (提示清理), 可选 --kill 自动杀
//
// 用法:
//   node wpp-test-zombie-watcher.mjs           # 只报告
//   node wpp-test-zombie-watcher.mjs --kill    # 自动杀僵尸测试进程
//
// Cron 建议: */10 * * * * node .../wpp-test-zombie-watcher.mjs

import { execSync } from "node:child_process";

const ZOMBIE_MIN_MIN = 15; // > 15 min 视为卡死 (正常全量 85s)

const ps = execSync("ps -eo pid,etime,cmd --no-headers", { encoding: "utf8" });

const zombies = [];
for (const line of ps.split("\n")) {
  if (!/tsx --test|node --test/.test(line)) continue;
  const m = line.match(/^\s*(\d+)\s+(\S+)\s+(.*)$/);
  if (!m) continue;
  const [, pid, etime, cmd] = m;
  // 解析 etime ([[dd-]hh:]mm:ss 或 mm:ss)
  let minutes = 0;
  const parts = etime.split("-");
  let time = parts[parts.length - 1];
  if (parts.length > 1) minutes += parseInt(parts[0], 10) * 24 * 60;
  const t = time.split(":");
  if (t.length === 3) minutes += parseInt(t[0], 10) * 60 + parseInt(t[1], 10);
  else if (t.length === 2) minutes += parseInt(t[0], 10);
  if (minutes > ZOMBIE_MIN_MIN) {
    zombies.push({ pid, etime, cmd: cmd.slice(0, 120) });
  }
}

if (zombies.length === 0) {
  console.log(`✓ 无僵尸测试进程 (运行时长 > ${ZOMBIE_MIN_MIN}min 的 tsx/node --test)`);
  process.exit(0);
}

console.log(`⚠ 发现 ${zombies.length} 个疑似卡死测试进程 (> ${ZOMBIE_MIN_MIN}min):`);
for (const z of zombies) {
  console.log(`  PID ${z.pid}  运行 ${z.etime}  ${z.cmd}`);
}

if (process.argv.includes("--kill")) {
  console.log("正在清理...");
  for (const z of zombies) {
    try {
      execSync(`kill ${z.pid}`, { stdio: "ignore" });
      console.log(`  ✓ 已杀 ${z.pid}`);
    } catch {
      console.log(`  ✗ 杀 ${z.pid} 失败 (可能已退出)`);
    }
  }
}
