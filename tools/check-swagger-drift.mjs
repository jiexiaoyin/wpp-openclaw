#!/usr/bin/env node
/**
 * tools/check-swagger-drift.mjs — 线上 vendor swagger ↔ 仓库快照的漂移检查 (2026-10-16, v1.16.1)
 *
 * 为什么单独一个脚本, 不塞进 `npm test`:
 *   它要**联网**(打容器 swagger 接口), 而单测必须离线/可复现 —— 把网络依赖塞进测试会让
 *   "测试红了"分不清是代码错了还是容器没起。所以: 快照对齐那几条断言留在
 *   tests/unit/wpp-swagger-alignment.test.mjs (离线), 这里只做"线上 vs 快照"的比对,
 *   在部署后/厂商升版后手动跑, 或由 DEPLOY.md 的流程带着跑。
 *
 * 判据与退出码:
 *   0 = 无漂移 (md5 与快照一致)
 *   1 = 有漂移 —— 逐条列出**新增/消失的路径**、**每个端点的字段增删**、**必填项变化**,
 *       并给出下一步 (接端点 / 登白名单 / 重生成快照)
 *   2 = 取不到线上 swagger (容器没起/端口不对/超时) —— 这是"查不了", 不是"有漂移", 别混为一谈
 *
 * 用法:
 *   node tools/check-swagger-drift.mjs                    # 默认 http://127.0.0.1:28062/swagger.json
 *   node tools/check-swagger-drift.mjs --url http://...   # 指定地址
 *   node tools/check-swagger-drift.mjs --file /tmp/x.json # 用本地 swagger.json (离线; 也是自检漂移分支的入口)
 *   node tools/check-swagger-drift.mjs --snapshot <path>  # 改比对基准 (默认仓库快照; 用于归档快照/离线自检)
 *   node tools/check-swagger-drift.mjs --quiet            # 只打印结论行 (给脚本用)
 */
import fs from "node:fs";
import { buildSnapshot, SNAPSHOT_PATH } from "./gen-swagger-snapshot.mjs";

const DEFAULT_URL = "http://127.0.0.1:28062/swagger.json";
const args = process.argv.slice(2);
const argOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};
const url = argOf("--url") ?? DEFAULT_URL;
const file = argOf("--file");
const snapPath = argOf("--snapshot") ?? SNAPSHOT_PATH;
const quiet = args.includes("--quiet");

const say = (...a) => {
  if (!quiet) console.log(...a);
};
/** 结论行必须始终打 —— 它就是给人和脚本看的判据 */
const verdict = (s) => console.log(s);

const snapshot = JSON.parse(fs.readFileSync(snapPath, "utf-8"));

let raw;
if (file) {
  try {
    raw = fs.readFileSync(file);
  } catch (e) {
    verdict(`✗ 读不到 swagger 文件 (${file}): ${e.message}`);
    process.exit(2);
  }
} else {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    verdict(`✗ 取不到线上 swagger (${url}): ${e.message}`);
    verdict("  这是『查不了』, 不是『有漂移』: 确认 wechatpadpro 容器在跑且端口对 (默认 28062)。");
    process.exit(2);
  }
}

const live = buildSnapshot(raw);

// ===== 1. md5 =====
const sameMd5 = live._meta.swagger_md5 === snapshot._meta.swagger_md5;
say(`线上 md5 ${live._meta.swagger_md5}`);
say(`快照 md5 ${snapshot._meta.swagger_md5}`);

const drift = [];
if (!sameMd5) drift.push("swagger 文件本身变了 (md5 不同)");

// ===== 2. 路径增删 =====
const livePaths = new Set(Object.keys(live.paths));
const snapPaths = new Set(Object.keys(snapshot.paths));
const added = [...livePaths].filter((p) => !snapPaths.has(p)).sort();
const removed = [...snapPaths].filter((p) => !livePaths.has(p)).sort();
if (added.length) drift.push(`厂商新增 ${added.length} 个端点`);
if (removed.length) drift.push(`厂商下线/改名 ${removed.length} 个端点`);

// ===== 3. 字段级 =====
const propChanged = [];
for (const p of [...livePaths].filter((x) => snapPaths.has(x)).sort()) {
  const a = new Set(live.propsByPath[p] ?? []);
  const b = new Set(snapshot.propsByPath[p] ?? []);
  const plus = [...a].filter((x) => !b.has(x));
  const minus = [...b].filter((x) => !a.has(x));
  if (plus.length || minus.length) propChanged.push({ p, plus, minus });
}
if (propChanged.length) drift.push(`${propChanged.length} 个端点的 body 字段有增删`);

const reqChanged = [];
for (const p of [...livePaths].filter((x) => snapPaths.has(x)).sort()) {
  const a = new Set(live.requiredByPath[p] ?? []);
  const b = new Set(snapshot.requiredByPath[p] ?? []);
  const plus = [...a].filter((x) => !b.has(x));
  const minus = [...b].filter((x) => !a.has(x));
  if (plus.length || minus.length) reqChanged.push({ p, plus, minus });
}
if (reqChanged.length) drift.push(`${reqChanged.length} 个端点的**必填项**有变化`);

// ===== 报告 =====
if (drift.length === 0) {
  verdict(`✓ 无漂移: 线上 ${livePaths.size} 条路径与仓库快照逐条一致 (md5 相同)`);
  process.exit(0);
}

say("");
for (const a of added) say(`  + 新端点 ${a}`);
for (const r of removed) say(`  - 下线端点 ${r}`);
for (const { p, plus, minus } of propChanged) {
  say(`  ~ ${p}  字段: ${plus.length ? `+${JSON.stringify(plus)} ` : ""}${minus.length ? `-${JSON.stringify(minus)}` : ""}`);
}
for (const { p, plus, minus } of reqChanged) {
  say(`  ! ${p}  必填: ${plus.length ? `+${JSON.stringify(plus)} ` : ""}${minus.length ? `-${JSON.stringify(minus)}` : ""}`);
}

verdict(`✗ 检测到漂移: ${drift.join("; ")}`);
say("");
say("下一步 (按序):");
say("  1. 重生成快照:  node tools/gen-swagger-snapshot.mjs <刚拉下来的 swagger.json>");
say("  2. 跑对齐门:    node --test tests/unit/wpp-swagger-alignment.test.mjs");
say("     ⇒ 新端点会被要求『登记进 src/send/index.ts 或写进 DELIBERATELY_EXCLUDED』;");
say("     ⇒ 字段改名会让『未知字段』那条断言红 —— 那就是厂商改了字段名, 源码跟着改 (别加白名单糊过去)。");
say("  3. 必填项新增/改名的端点要**逐个**看调用方是否真发得出这些键 (静态检查只看键名, 不看值)。");
process.exit(1);
