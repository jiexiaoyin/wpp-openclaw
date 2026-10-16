#!/usr/bin/env node
/**
 * 从容器 swagger.json 生成 tests/fixtures/vendor-swagger-endpoints.json
 * (tests/unit/wpp-swagger-alignment.test.mjs 的对齐基准)
 *
 * 用法:
 *   curl -s http://127.0.0.1:28062/swagger.json -o /tmp/wpp-swagger.json
 *   node tools/gen-swagger-snapshot.mjs /tmp/wpp-swagger.json
 *
 * 快照只保留判定对齐所需的最小信息:
 *   - paths:          形如 { "/Msg/SendTxt": ["post"], ... } (路径里 {param} 归一为 {_})
 *   - tags:           全部 tag 名 (源码扫描据此认出「这是 vendor 端点」)
 *   - requiredByPath: 端点 → body 必填字段, **只收端点专属 definition**
 *                     (被 ≥2 个端点赞的 definition 是自动生成的通用占位, 其 required 不可信)
 *   - propsByPath:    端点 → body **声明的字段名全集** (2026-10-16 加)
 *                     只收 required 那层判不了的病: 字段名写错时若该字段恰好**非必填**, required
 *                     断言不会红 (v1.16.1 的 openHongBao/collectMoney 就是这么静默失效的:
 *                     发出去的键线上 model 里根本没有, 而 Go 对未知字段静默忽略 ⇒ 不报错、不生效)。
 *                     同一"端点专属"规则: 跳过通用占位 def 与无 properties 的自由格式 def。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

export const METHODS = new Set(["get", "post", "put", "delete"]);

/** `{param}` → `{_}` (项目里这些位置是模板字面量或变量) */
export const norm = (p) => p.replace(/\{\w+\}/g, "{_}");

/**
 * 由 swagger 原始字节算出快照对象 (纯函数 — 生成与漂移比对共用同一份逻辑,
 * 避免"检查器"和"生成器"两套实现各说各话, 见 tools/check-swagger-drift.mjs)。
 * @param {Buffer|string} rawBytes swagger.json 的**原始字节** (md5 就是对它取的)
 */
export function buildSnapshot(rawBytes) {
  const raw = Buffer.isBuffer(rawBytes) ? rawBytes : Buffer.from(rawBytes);

  return buildSnapshotInner(raw);
}

function buildSnapshotInner(raw) {
  const S = JSON.parse(raw.toString("utf-8"));
  const DEFS = S.definitions ?? {};

// 统计每个 definition 被哪些「方法 + 路径」引用
const refs = new Map();
for (const [p, ops] of Object.entries(S.paths ?? {})) {
  for (const [m, o] of Object.entries(ops)) {
    if (!METHODS.has(m)) continue;
    for (const prm of o.parameters ?? []) {
      if (prm.in !== "body") continue;
      const name = prm.schema?.$ref?.split("/").pop();
      if (!name) continue;
      if (!refs.has(name)) refs.set(name, []);
      refs.get(name).push(`${m.toUpperCase()} ${p}`);
    }
  }
}

const paths = {};
const requiredByPath = {};
const propsByPath = {};
const tags = new Set();

for (const [p, ops] of Object.entries(S.paths ?? {})) {
  const methods = Object.keys(ops).filter((m) => METHODS.has(m)).sort();
  if (methods.length === 0) continue;
  const np = norm(p);
  paths[np] = methods;
  for (const m of methods) {
    const o = ops[m];
    for (const t of o.tags ?? []) tags.add(t);
    for (const prm of o.parameters ?? []) {
      if (prm.in !== "body") continue;
      const name = prm.schema?.$ref?.split("/").pop();
      // 无 $ref = 内联 schema (本就端点专属, 可用); 有 $ref 但被多端点共用 = 通用占位, 不可信
      if (name && (refs.get(name)?.length ?? 0) > 1) continue;
      const def = name ? DEFS[name] : prm.schema;
      const req = (def?.required ?? []).filter(Boolean);
      if (req.length) requiredByPath[np] = [...req].sort();
      // 自由格式 def (无 properties) 什么键都收 ⇒ 不能拿来判"未知字段", 跳过
      const props = Object.keys(def?.properties ?? {});
      if (props.length) propsByPath[np] = props.sort();
    }
  }
}

const out = {
  _meta: {
    // 刻意不写本地路径/日期: 快照要可复现 (内容由 swagger_md5 钉死), 否则每次重生成都产生无意义 diff
    source: "wechatpadpro 容器 swagger.json (默认 http://127.0.0.1:28062/swagger.json, basePath /api)",
    swagger_md5: crypto.createHash("md5").update(raw).digest("hex"),
    basePath: S.basePath ?? "",
    note: "路径已把 {param} 归一为 {_} (项目里是模板字面量/变量); required/props 只收端点专属 body definition, 被 >=2 端点赞的通用占位与无 properties 的自由格式 def 已剔除 (其字段表不可信)。",
  },
  tags: [...tags].sort(),
  paths,
  requiredByPath,
  propsByPath,
};
  return out;
}

export const SNAPSHOT_PATH = path.join(new URL("..", import.meta.url).pathname, "tests/fixtures/vendor-swagger-endpoints.json");

// ===== CLI (只有被直接执行时才跑; 被 import 时只导出函数) =====
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  const src = process.argv[2];
  if (!src) {
    console.error("用法: node tools/gen-swagger-snapshot.mjs <swagger.json 路径>");
    process.exit(2);
  }
  const out = buildSnapshot(fs.readFileSync(src));
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(out, null, 1) + "\n");
  console.log(
    `wrote ${SNAPSHOT_PATH}\n  ${Object.keys(out.paths).length} paths · ${Object.keys(out.requiredByPath).length} with required · ${Object.keys(out.propsByPath).length} with props · ${out.tags.length} tags · md5 ${out._meta.swagger_md5}`,
  );
}
