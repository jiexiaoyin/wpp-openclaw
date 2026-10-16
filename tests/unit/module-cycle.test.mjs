/**
 * tests/unit/module-cycle.test.mjs — 值导入环的静态门 (2026-10-16, v1.16.1)
 *
 * 为什么需要它:
 *   ESM 允许 import 环, 它不会像 CJS 那样直接拿到半截 exports —— 但"允许"不等于"安全": 只要有人
 *   在**模块求值期**读到一个还没初始化的环上绑定, 就是 ReferenceError (TDZ)。于是"环是否致命"
 *   变成了取决于文件求值顺序 / jiti 缓存状态 —— 一件改天换个写法就炸、而单测很可能仍然全绿的事。
 *   v1.16.1 之前 src 里就有一个 **9 模块**的值环:
 *     api-client → send/{msg,group,friend,webhook} → api/client → account-state
 *                → accounts/account-registry → accounts/account-context → api-client
 *   摘法见 src/api-client.ts 顶部注释 (4 个 send 工厂改动态 import —— 它们只在 async 方法里用,
 *   返回值当次就用掉 ⇒ 多一个 await 无语义差别)。摘完 send/* 与 dispatch/* 全部退出环。
 *
 * 本文件钉住四件事 (全是**静态**断言, 不需要跑起来):
 *   ① 分层: send/ 与 dispatch/ 不得出现在任何环里 (发送层必须是 DAG)。
 *   ② 现状: 多方环的成员集合就是文档里那一组 (5 个 identity/registry 模块); 出现新的环 = 红门
 *      (要么照 √ 的先例摘掉, 要么把"为什么摘不动"写进 EXPECTED_CYCLES 再更新断言 —— 别默默删断言)。
 *   ③ 环边必须是**惰性**的: 环上每条边的被导入绑定, 只能在函数体内被引用, 不能在模块顶层语句里
 *      (顶层读 = 求值期读 = TDZ 的唯一入口)。这是"剩下的环为什么不致命"的**证明**, 不是口号。
 *   ④ 动态 import 的路径必须真的存在 (v1.16.1 把 4 个静态导入换成动态 —— 代价就是路径写错
 *      不再在启动时炸, 而推迟到第一次调用 ⇒ 由这条静态 resolve 兜底)。
 *
 * 实现要点 (别改成 regex):
 *   "值导入 vs 类型导入" 必须用 TS AST 判 —— regex 分不清 `import type {A}` / `import {type A, B}`,
 *   也会把 `export {x} from`, `import "x"` (副作用), `import * as ns` 漏掉或误判。
 *   ⚠️ 遍历用 `node.forEachChild((c) => { visit(c) })`: **回调不许返回值** ——
 *   ts.forEachChild 是 visitNode(cb,n) || visitNode(cb,n2) 短路链, 返回真值 (哪怕是 [] ) 会跳过兄弟节点。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const ROOT = new URL("../../", import.meta.url).pathname;
const SRC = path.join(ROOT, "src");
const rel = (p) => path.relative(SRC, p).replace(/\\/g, "/");

/**
 * 今天唯一的多方环 —— identity/registry 管道 (为什么摘不动见文件头 ②)。
 * 谁要动这张表, 必须同时更新上面的注释与 src/api-client.ts 的先例说明。
 */
const EXPECTED_CYCLES = [
  ["account-state.ts", "accounts/account-context.ts", "accounts/account-registry.ts", "api-client.ts", "api/client.ts"],
];

/** 发送/分发层: 允许被谁引用都行, 但不许出现在任何环里 (分层不变量) */
const MUST_BE_ACYCLIC = [/^send\//, /^dispatch\//];

// ============================================================
// 源文件收集 + 依赖抽取 (AST)
// ============================================================

function collectFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectFiles(p, acc);
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) acc.push(p);
  }
  return acc;
}

/**
 * 从一个 TS 源文件抽出: 静态值导入的边 + 动态 import 的 specifier。
 * 值边 = `import x from` / `import {a, type B}` (只要有非 type 绑定) / `import * as ns from` /
 *        `import "x"` (副作用, 也强制求值) / `export {a} from` / `export * from`;
 * 不算边 = `import type ...` / 命名绑定全是 `type X` 的 import/export。
 * 每条边带 names (值绑定名) —— 后面判断"环边是否惰性"要用。
 */
function analyzeFile(file) {
  const src = fs.readFileSync(file, "utf-8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ESNext, true);
  const edges = []; // {spec, names}
  const dynamic = []; // {spec, line}

  const valueNames = (clause) => {
    const names = [];
    if (clause.name) names.push(clause.name.text); // import X / import * as X
    for (const el of clause.namedBindings?.elements ?? []) {
      if (el.isTypeOnly) continue;
      if (el.propertyName) continue; // {a as b} 里 b 是本地名, a 是对方的导出名
      names.push(el.name.text);
    }
    return names;
  };

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) {
      const spec = st.moduleSpecifier.text;
      if (!spec.startsWith(".")) continue;
      if (!st.importClause) {
        edges.push({ spec, names: [] }); // import "x" —— 纯副作用边
        continue;
      }
      if (st.importClause.isTypeOnly) continue;
      const names = valueNames(st.importClause);
      const nsImport = st.importClause.namedBindings && ts.isNamespaceImport(st.importClause.namedBindings);
      if (!names.length && !nsImport) continue; // 全是 type 绑定
      edges.push({ spec, names });
    } else if (ts.isExportDeclaration(st) && st.moduleSpecifier) {
      const spec = st.moduleSpecifier.text;
      if (!spec.startsWith(".")) continue;
      if (st.isTypeOnly) continue;
      if (!st.exportClause) {
        edges.push({ spec, names: [] }); // export * from
        continue;
      }
      const names = [];
      for (const el of st.exportClause.elements ?? []) {
        if (el.isTypeOnly) continue;
        names.push((el.propertyName ?? el.name).text); // 取的是**对方模块**的导出名
      }
      if (names.length) edges.push({ spec, names });
    } else if (ts.isExpressionStatement(st)) {
      // 顶层动态 import() (少见, 也算不上静态边 —— 只是要 resolve)
    }
  }

  // 动态 import: 任何位置出现都要能 resolve (v1.16.1 的 4 个 send 工厂就是这类)
  const walkForDynamic = (node) => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        dynamic.push({ spec: arg.text, line: line + 1 });
      }
    }
    node.forEachChild((c) => {
      walkForDynamic(c); // ⚠️ 不返回值
    });
  };
  walkForDynamic(sf);

  return { edges, dynamic, sf };
}

const files = collectFiles(SRC);
const graph = new Map(); // rel → [{target, names}]
const dynamicImports = []; // {file, spec, line}
let edgeCount = 0;

for (const f of files) {
  const r = rel(f);
  const { edges, dynamic } = analyzeFile(f);
  const out = [];
  for (const e of edges) {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(r), e.spec.replace(/\.js$/, ".ts")));
    out.push({ target, names: e.names, spec: e.spec });
    edgeCount++;
  }
  graph.set(r, out);
  for (const d of dynamic) dynamicImports.push({ file: r, ...d });
}

// ============================================================
// 抽取器自检 (先证明这把尺子量得准, 再看它量出什么)
// ============================================================

test("抽取器自检: 值导入 / 类型导入 / 副作用 / 再导出 分得清", async () => {
  const os = await import("node:os");
  const tag = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const probe = path.join(os.tmpdir(), `wpp-cycle-probe-${tag}.ts`);
  fs.writeFileSync(
    probe,
    [
      'import type { A } from "./a.js";',
      'import { type B, C } from "./b.js";',
      'import { type D } from "./d.js";',
      'import E from "./e.js";',
      'import * as F from "./f.js";',
      'import "./g.js";',
      'export { H } from "./h.js";',
      'export type { I } from "./i.js";',
      'export * from "./j.js";',
      'const dyn = () => import("./k.js");',
      "void dyn; void A; void B; void C; void D; void E; void F;",
    ].join("\n"),
  );
  try {
    const { edges, dynamic } = analyzeFile(probe);
    const bySpec = Object.fromEntries(edges.map((e) => [e.spec, e.names]));
    assert.deepEqual(Object.keys(bySpec).sort(), ["./b.js", "./e.js", "./f.js", "./g.js", "./h.js", "./j.js"]);
    assert.deepEqual(bySpec["./b.js"], ["C"], "`{type B, C}` 里只有 C 是值绑定");
    assert.deepEqual(bySpec["./h.js"], ["H"], "`export {H} from` 是值再导出 (真边)");
    assert.deepEqual(dynamic.map((d) => d.spec), ["./k.js"], "动态 import 不进环, 但要单独收出来 resolve");
  } finally {
    fs.rmSync(probe, { force: true });
  }
});

test("抽取器自检: 在真实源码上量出的边与已知事实一致", () => {
  assert.ok(files.length >= 100, `只解析到 ${files.length} 个 .ts —— 目录遍历失配, 整道门会空转`);
  assert.ok(edgeCount >= 100, `只抽出 ${edgeCount} 条值边 —— 抽取器失配`);
  const depsOf = (r) => graph.get(r).map((e) => e.target);
  // 已知值边 (v1.16.1 之后 api-client 对 send/* 只剩动态 import ⇒ 这里必须是 api/client.ts)
  assert.ok(depsOf("api-client.ts").includes("api/client.ts"), "api-client.ts 应静态依赖 api/client.ts");
  assert.ok(
    !depsOf("api-client.ts").includes("send/msg.ts"),
    "api-client.ts 不该再静态依赖 send/msg.ts (v1.16.1 已改动态 import —— 改回静态就是把 9 模块环放回来)",
  );
  // 类型导入必须被排除: api-client.ts 对 types.js 只有 `import type`
  assert.ok(!depsOf("api-client.ts").includes("types.ts"), "`import type` 被算成了值边");
  // 副作用导入/再导出也别漏
  assert.ok(depsOf("index.ts").includes("core/redact.ts"), "index.ts 应静态依赖 core/redact.ts");
});

test("动态 import 的路径必须真实存在 (v1.16.1 换了动态导入的代价由这条兜底)", () => {
  assert.ok(dynamicImports.length >= 4, `只找到 ${dynamicImports.length} 处动态 import —— 抽取器失配或改动没生效`);
  const bad = [];
  for (const d of dynamicImports) {
    if (!d.spec.startsWith(".")) continue; // node:fs / node:crypto 这类内置模块不归 src 管
    const target = path.join(SRC, path.posix.join(path.posix.dirname(d.file), d.spec.replace(/\.js$/, ".ts")));
    if (!fs.existsSync(target)) bad.push(`${d.file}:${d.line} → ${d.spec}`);
  }
  assert.deepEqual(bad, [], `动态 import 指向不存在的模块 (静态 import 会在启动时报错, 动态只会在第一次调用时炸):\n${bad.join("\n")}`);
  // 4 个 send 工厂必须都在动态列表里 (漏一个 = 环又回来了)
  const dynSend = new Set(dynamicImports.filter((d) => d.file === "api-client.ts").map((d) => d.spec));
  for (const s of ["./send/msg.js", "./send/group.js", "./send/friend.js", "./send/webhook.js"]) {
    assert.ok(dynSend.has(s), `api-client.ts 应动态 import ${s} (值环摘除点)`);
  }
});

// ============================================================
// SCC
// ============================================================

/** Tarjan: 返回所有 size > 1 的强连通分量 (即环) */
function findCycles(g) {
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const sccs = [];
  let counter = 0;

  const strongconnect = (v) => {
    index.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    for (const { target } of g.get(v) ?? []) {
      if (!g.has(target)) continue;
      if (!index.has(target)) {
        strongconnect(target);
        low.set(v, Math.min(low.get(v), low.get(target)));
      } else if (onStack.has(target)) {
        low.set(v, Math.min(low.get(v), index.get(target)));
      }
    }
    if (low.get(v) === index.get(v)) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) sccs.push(comp.sort());
    }
  };
  for (const v of g.keys()) if (!index.has(v)) strongconnect(v);
  return sccs.sort((a, b) => a[0].localeCompare(b[0]));
}

const cycles = findCycles(graph);

test("分层不变量: send/ 与 dispatch/ 不得出现在任何环里", () => {
  // 发送层是热路径 + 最常改的地方 —— 它一旦回到环里, 排查顺序问题就从"看堆栈"退化成"猜求值顺序"。
  const offenders = [];
  for (const c of cycles) for (const m of c) if (MUST_BE_ACYCLIC.some((re) => re.test(m))) offenders.push(`${m} (在环里: ${c.join(", ")})`);
  assert.deepEqual(offenders, [], `这些分层模块被卷进了环:\n${offenders.join("\n")}`);
});

test("现状: 多方环只有文档记录的那一组 (新环 = 红门, 要么摘掉要么补理由)", () => {
  assert.deepEqual(
    cycles,
    EXPECTED_CYCLES.map((c) => [...c].sort()),
    "多方环集合变了。若是**新增**环: 先按 src/api-client.ts 的先例 (动态 import) 试着摘掉 —— " +
      "摘不动就把『为什么摘不动』写进 EXPECTED_CYCLES 上方注释再更新本断言, 不要默默删掉这条断言。",
  );
});

test("环边必须是惰性的: 环上绑定只许在函数体内被引用 (顶层引用 = 求值期读 = TDZ 的唯一入口)", () => {
  // 这是"剩下的环为什么不致命"的证明。逐个环边、逐个值绑定名, 在**导入方**源文件里找引用,
  // 任何一处落在函数体/类方法之外就是红门。
  const insideCycle = new Set(cycles.flat());
  const violations = [];
  let checkedEdges = 0;

  for (const owner of insideCycle) {
    const { sf } = analyzeFile(path.join(SRC, owner));
    for (const edge of graph.get(owner)) {
      if (!insideCycle.has(edge.target)) continue; // 只查环边
      checkedEdges++;
      const names = new Set(edge.names);
      if (!names.size) continue; // 副作用/`export *` 边: 无本地绑定可读, 天然惰性
      // 走整棵树, 记录"非函数体内"的标识符引用
      // ⚠️ 类型位置不是"读": `let r: AccountRegistry | null` / `new Map<string, AccountContext>()`
      //    里那个名字只是类型标注 (擦除后运行时不存在), 落到 isTypeNode 下面的整棵子树直接跳过。
      //    注: 类字段初始化器 (含非 static) 一律按顶层算 —— 严格说非 static 字段是构造时才跑,
      //    但构造也可能发生在某个模块的顶层 (`const x = new X()`), 保守起见一律要求挪进方法/构造函数。
      const visit = (node, inFn) => {
        const fnScope = inFn || ts.isFunctionLike(node);
        if (ts.isTypeNode(node)) return;
        if (ts.isIdentifier(node) && names.has(node.text) && !inFn) {
          const parent = node.parent;
          const isPropertyName = parent && (
            (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
            (ts.isQualifiedName(parent) && parent.right === node)
          );
          // `export {x}` / `import {x}` 是绑定转发 (不是求值期读), 不算
          const isSpecifier = parent && (ts.isExportSpecifier(parent) || ts.isImportSpecifier(parent));
          if (!isPropertyName && !isSpecifier) {
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
            violations.push(`${owner}:${line + 1} 顶层引用了环上绑定 \`${node.text}\` (→ ${edge.target})`);
          }
        }
        node.forEachChild((c) => {
          visit(c, fnScope); // ⚠️ 不返回值: 返回真值会短路掉兄弟节点
        });
      };
      visit(sf, false);
    }
  }

  assert.ok(checkedEdges >= 5, `只查到 ${checkedEdges} 条环边 —— 图或 SCC 变了, 本门已失配`);
  assert.deepEqual(
    violations,
    [],
    `环上的绑定在模块顶层被读了 (求值顺序一变就是 ReferenceError):\n${violations.join("\n")}\n` +
      "修法: 挪进函数/构造函数内, 或按 api-client 的先例把这条边改成动态 import。",
  );
});
