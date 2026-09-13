/**
 * vendor swagger ↔ 源码对齐门 (v1.6.0 SWAGGER-323, 2026-09-13)
 *
 * 背景: 项目没有仓库内的 swagger 快照, 厂商悄悄改/下线端点时无人发现 —
 *   2026-09-13 一次性比对才捞出:
 *     - A 类: `/Search/Services` `/Search/Service/{name}` 已被厂商**下线**, 项目仍在调 ⇒ 必 404
 *     - B 类: 13 个厂商新增能力未接
 *     - C 类: 29 处 body 字段名与 swagger 不符 (静默失效)
 *   本门把「容器 swagger 的路径表落进仓库」(tests/fixtures/vendor-swagger-endpoints.json),
 *   之后任何一方漂移都会红。
 *
 * 三道断言:
 *   1. 源码里出现的以 swagger tag 开头的端点字符串, 必须都在快照里 (A 类 = 0)
 *   2. WPP_VENDOR_ENDPOINTS 白名单里的每一项必须都在快照里 (防「白名单登记了不存在的端点」)
 *   3. 快照里的每个路径必须要么已登记进 WPP_VENDOR_ENDPOINTS, 要么在**显式排除表**里
 *      (防厂商新增端点后悄悄漏接; 排除表 = 项目 2026-08-10 的有意裁定)
 *
 * 刷新快照 (厂商升版后):
 *   curl -s http://127.0.0.1:28062/swagger.json -o /tmp/wpp-swagger.json
 *   node tools/gen-swagger-snapshot.mjs /tmp/wpp-swagger.json
 */
import assert from "node:assert";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";

const ROOT = new URL("../../", import.meta.url);
const SNAP = JSON.parse(
  fs.readFileSync(new URL("tests/fixtures/vendor-swagger-endpoints.json", ROOT), "utf-8"),
);
const SWAGGER_PATHS = new Set(Object.keys(SNAP.paths));
const TAGS = new Set(SNAP.tags);

/**
 * 有意**不接**的 vendor 端点 — 2026-08-10 裁定「权限过高, 插件运行用不到」
 * (见 docs/wpp-swagger-gap-report-2026-08-10.md)。列在这里 = 明确表态, 不是漏接。
 */
const DELIBERATELY_EXCLUDED = new Set([
  "/Admin/DelayAuthKey",
  "/Admin/DeleteAuthKey",
  "/Admin/GenAuthKey",
  "/Admin/GetAllDevices",
  "/Admin/RedisMemory",
  "/User/GetAllOnline",
]);

/** 把 `{param}` / `${expr}` 归一为 `{_}` — 与生成快照时同规则 */
function normPath(p) {
  return p.replace(/\{\w+\}/g, "{_}");
}

/** 递归收集 src/ 下的 .ts (跳过 legacy 同名 .js 产物与 dist) */
function collectTs(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      collectTs(full, acc);
    } else if (e.name.endsWith(".ts")) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * 去掉注释 (块 + 行), 注释内容换成空格但保留换行 ⇒ 行号不变.
 * ⚠️ 必须做: 注释里大段引用端点路径 (e.g. 「/Search/Services 已下线」) 会被裸正则当成调用,
 *   反过来把注释当代码还会让守卫自己假绿 (2026-09-13 踩过). 用最小词法器避开字符串里的 `//` (URL).
 */
function stripComments(src) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      if (c === "\\") {
        out += c + (n ?? "");
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      out += c;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") {
        out += " ";
        i += 1;
      }
      continue;
    }
    if (c === "/" && n === "*") {
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      out += "  ";
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/**
 * 源码里「看起来是 vendor 端点」的字符串字面量 + 模板字面量.
 * 判据: `/Tag/Seg...` — Tag ∈ swagger tag 集 **且至少两段**
 *   (两段这条排掉 `/Admin/` 这类前缀常量; tag 这条排掉 /api/... /channels/... /root/... 等非 vendor 串).
 * (模板字面量的 `${...}` 先归一, 故 `/Search/Channels/${x}` 也能比中.)
 */
function extractEndpointLiterals(src) {
  const out = [];
  const lines = stripComments(src).split("\n");
  const re = /(["'`])(\/[A-Za-z][\w/{}_.$-]*)\1/g;
  lines.forEach((line, i) => {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(line)) !== null) {
      const raw = m[2];
      const segs = raw.slice(1).split("/").filter(Boolean);
      if (segs.length < 2 || !TAGS.has(segs[0])) continue;
      out.push({ path: normPath(raw), line: i + 1 });
    }
  });
  return out;
}

test("A 类 = 0: 源码调用的每个 vendor 端点都存在于 swagger 快照", () => {
  const offenders = [];
  for (const file of collectTs(new URL("src/", ROOT).pathname)) {
    const src = fs.readFileSync(file, "utf-8");
    // 归一模板字面量里的 ${...} 为 {_} — 与快照同规则
    const flat = src.replace(/\$\{[^}]*\}/g, "{_}");
    for (const { path: ep, line } of extractEndpointLiterals(flat)) {
      if (!SWAGGER_PATHS.has(ep)) {
        offenders.push(`${path.relative(ROOT.pathname, file)}:${line} → ${ep}`);
      }
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `源码调用了厂商 swagger 里不存在的端点 (厂商下线/改名 ⇒ 调用必失败):\n  ${offenders.join("\n  ")}`,
  );
});

test("WPP_VENDOR_ENDPOINTS 白名单无「不存在的端点」(防死登记)", () => {
  const src = fs.readFileSync(new URL("src/send/index.ts", ROOT), "utf-8");
  const listed = [...new Set(extractEndpointLiterals(src).map((x) => x.path))];
  const dead = listed.filter((p) => !SWAGGER_PATHS.has(p));
  assert.deepStrictEqual(
    dead,
    [],
    `WPP_VENDOR_ENDPOINTS 登记了 swagger 里已不存在的端点 (应删除或改指向):\n  ${dead.join("\n  ")}`,
  );
});

test("快照端点已全覆盖登记 (厂商新增端点必须显式接或显式排除)", () => {
  const src = fs.readFileSync(new URL("src/send/index.ts", ROOT), "utf-8");
  const registered = new Set(extractEndpointLiterals(src).map((x) => x.path));
  const missing = [...SWAGGER_PATHS]
    .filter((p) => !registered.has(p) && !DELIBERATELY_EXCLUDED.has(p))
    .sort();
  assert.deepStrictEqual(
    missing,
    [],
    [
      `厂商 swagger 有 ${missing.length} 个端点在 WPP_VENDOR_ENDPOINTS 里既未登记也未排除:`,
      ...missing.map((p) => `  ${p}`),
      "处理: 接进 src/send/*.ts + 登记白名单, 或加进本文件的 DELIBERATELY_EXCLUDED (并写明理由).",
    ].join("\n"),
  );
});

test("快照里带必填字段的端点, 其源码 body 不得缺必填键", () => {
  // 只覆盖「body 是内联对象字面量」的调用点 — body 是变量时本层判不了 (需看调用方), 跳过不误报.
  const problems = [];
  for (const file of collectTs(new URL("src/", ROOT).pathname)) {
    const src = stripComments(fs.readFileSync(file, "utf-8")); // 注释里的示例端点不算调用
    for (const [ep, required] of Object.entries(SNAP.requiredByPath)) {
      // 该文件里是否出现过这个端点
      const bare = ep.replace("{_}", "");
      const idx = src.indexOf(bare);
      if (idx < 0) continue;
      // 端点后紧跟的 `" , { ... }` 内联对象 = body (先跳过字符串的收尾引号)
      const after = src.slice(idx + bare.length, idx + bare.length + 400);
      const m = /^\s*["'`]?\s*,\s*\{([^{}]*)\}/.exec(after);
      if (!m) continue; // body 是变量/多行嵌套 ⇒ 本层判不了
      // 展开 `...p` 之类的传播无法静态判 ⇒ 有 spread 就跳过 (保守: 宁可漏判不误报)
      if (m[1].includes("...")) continue;
      // 先挖空字符串字面量 (里面可能有逗号, 直接 split 会切出假键), 再按逗号取每段的首个标识符 —
      // 这样 `LabelID: labelId` 与简写 `keyword` 都能取到键名.
      const body = m[1].replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""');
      const keys = new Set(
        [...body.matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)/g)].map((x) => x[1].toLowerCase()),
      );
      // 大小写不敏感: vendor 是 Go, encoding/json 对字段名做大小写不敏感匹配
      //   (appId 能填 appid / labelId 能填 LabelID), 故只有**真正不同的名字**才算缺.
      const miss = required.filter((r) => !keys.has(r.toLowerCase()));
      if (miss.length) {
        problems.push(`${path.relative(ROOT.pathname, file)} ${ep} 缺 ${JSON.stringify(miss)}`);
      }
    }
  }
  assert.deepStrictEqual(problems, [], `内联 body 缺 swagger 必填字段:\n  ${problems.join("\n  ")}`);
});
