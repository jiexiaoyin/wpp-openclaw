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
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const src = process.argv[2];
if (!src) {
  console.error("用法: node tools/gen-swagger-snapshot.mjs <swagger.json 路径>");
  process.exit(2);
}
const raw = fs.readFileSync(src);
const S = JSON.parse(raw.toString("utf-8"));
const DEFS = S.definitions ?? {};
const METHODS = new Set(["get", "post", "put", "delete"]);

/** `{param}` → `{_}` (项目里这些位置是模板字面量或变量) */
const norm = (p) => p.replace(/\{\w+\}/g, "{_}");

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
    }
  }
}

const out = {
  _meta: {
    // 刻意不写本地路径/日期: 快照要可复现 (内容由 swagger_md5 钉死), 否则每次重生成都产生无意义 diff
    source: "wechatpadpro 容器 swagger.json (默认 http://127.0.0.1:28062/swagger.json, basePath /api)",
    swagger_md5: crypto.createHash("md5").update(raw).digest("hex"),
    basePath: S.basePath ?? "",
    note: "路径已把 {param} 归一为 {_} (项目里是模板字面量/变量); required 只收端点专属 body definition, 被 >=2 端点赞的通用占位已剔除 (其 required 不可信)。",
  },
  tags: [...tags].sort(),
  paths,
  requiredByPath,
};

const dst = path.join(new URL("..", import.meta.url).pathname, "tests/fixtures/vendor-swagger-endpoints.json");
fs.writeFileSync(dst, JSON.stringify(out, null, 1) + "\n");
console.log(
  `wrote ${dst}\n  ${Object.keys(paths).length} paths · ${Object.keys(requiredByPath).length} with required · ${out.tags.length} tags · md5 ${out._meta.swagger_md5}`,
);
