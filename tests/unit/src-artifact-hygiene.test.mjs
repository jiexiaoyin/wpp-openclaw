/**
 * tests/unit/src-artifact-hygiene.test.mjs — src/ 只放 .ts + 测试不许 shell 出去 grep (2026-10-16, v1.16.1)
 *
 * 背景 ①(编译残留): src/ 下曾长期躺着 **35 个 .js + 35 个 .js.map**, 全部 2026-09-05 15:26 的 tsc
 *   产物 (rootDir=./src 时代就地编译留下的), 每个都有对应 .ts, 无一处手写。它们已经被 **4 处**配置
 *   各自防着: .gitignore(已 git rm --cached) / sync-github.sh 的 rsync --exclude (2026-09-28) /
 *   eslint ignores (src\*​*​/*.js) / tsconfig include (只收 .ts)。
 *   问题不是"有没有防住", 而是"要 4 处防住才算安全":
 *     - 任何**新**的遍历工具 (测试、脚本、将来的 lint) 只要按扩展名扫 src/, 就会读到这些过期逻辑,
 *       而它们在 git status 里看不见 (被 ignore) ⇒ 改 .ts 忘了 build 时, 读 .js 的一方信的是旧行为;
 *     - 判断"这份源码是不是真源"要靠记忆 4 条规则, 不能靠看一眼目录。
 *   v1.16.1 直接删掉这 70 个文件 (删前复核: 每个都有 .ts 双胞胎; 删后重建 dist 与删前**逐字节相同**,
 *   证明它们确实不参与构建), 于是"src/ 只有 .ts"从"靠 4 处配置保证"变成**可断言的不变量** (本文件第 1 条)。
 *   那 4 处配置保留不动 (防将来又落一个 .js 进来), 本文件是第 5 道 —— 而它是唯一会主动报错的。
 *
 * 背景 ②(测试 shell 出去 grep): 有两处断言用 `execSync('grep -rl ...')` 找候选文件再逐个读
 *   (p2-cleanup P2-2.3 / enrich-single-judge 第 6 条)。同一条命令在**人**手里和在**测试**里跑出的
 *   结果可以不同: 交互 shell 的 `grep` 是 Claude Code 的一个函数 (带 --ignore-files, 会跳过 gitignore
 *   掉的路径 —— 上面那 35 个 src/*.js 正好属于被跳过的), 而 execSync 走 /bin/sh(dash) 用的是真 ugrep。
 *   更要命的是写法本身: `... || true` 会把"grep 失败/没匹配"一律吞成空列表 ⇒ 候选表为空时后面的
 *   断言**空转通过** (假绿)。两处已改成纯 JS 递归遍历 + 控制针 (见那两个文件里的 walkFiles 注释)。
 *   本文件第 2 条防它再长回来。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = new URL("../../", import.meta.url).pathname;
const SRC = path.join(ROOT, "src");
const TESTS = path.join(ROOT, "tests/unit");

function walkFiles(dir, filter = () => true, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, filter, acc);
    else if (filter(e.name)) acc.push(p);
  }
  return acc;
}

test("src/ 下不得有编译残留: 0 个 .js / .js.map (真源只有 .ts)", () => {
  const all = walkFiles(SRC);
  const ts = all.filter((f) => f.endsWith(".ts"));
  assert.ok(ts.length >= 100, `只遍历到 ${ts.length} 个 .ts —— 遍历失配, 本条会假绿`);
  const stray = all.filter((f) => f.endsWith(".js") || f.endsWith(".js.map")).map((f) => path.relative(ROOT, f));
  assert.deepEqual(
    stray,
    [],
    `src/ 下又出现了编译产物 (共 ${stray.length} 个)。tsc 的 outDir 是 dist/ ⇒ src/ 里的 .js 只可能是\n` +
      "就地编译的残留 (2026-09-05 那批已删)。危险不在『多几个文件』, 而在读 src/ 的工具会信过期逻辑。\n" +
      `删法: find src -type f \\( -name '*.js' -o -name '*.js.map' \\) -delete\n${stray.slice(0, 10).join("\n")}`,
  );
  // 反空转: 至少确认遍历器看得到 .ts (上面已断言) —— 同时确认这个目录确实是 src
  assert.ok(fs.existsSync(path.join(SRC, "index.ts")), "src/index.ts 不在 —— SRC 路径失配");
});

/** 去注释 (跨行 /* *​/ + 行内 //): 被删掉的坏写法会写在注释里当"为什么不这么写"的记录, 注释不算代码 */
function stripComments(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => {
      const i = line.indexOf("//");
      return i >= 0 ? line.slice(0, i) : line;
    })
    .join("\n");
}

test("tests/ 不得 shell 出去 grep 找候选 (那条链会产生空转的假绿)", () => {
  // 允许: spawnSync(..., [数组]) 这类不经 shell 的调用 (deploy/sanitize 测试在用)。
  // 禁止: execSync(`... grep ...`) / exec(`... grep ...`) / spawnSync("grep", ...) ——
  //   grep 的输出被当成"候选文件表", 一旦它空转 (没匹配/PATH 没有 grep/路径含空格被拼坏),
  //   依赖这张表的断言就静默变绿。要遍历就 fs.readdirSync 递归 (见本文件 walkFiles)。
  const BAD = [
    /(execSync|exec)\s*\(\s*[`"'][^`"']*\bgrep\b/, // 命令串里出现 grep
    /spawnSync\s*\(\s*[`"']grep[`"']/, // 直接把 grep 当可执行文件
  ];
  // 自检: 规则必须真的能命中"坏写法" (否则规则写错 = 本条永远绿灯)
  assert.ok(
    BAD.some((re) => re.test('execSync(`grep -rl "x" /tmp 2>/dev/null || true`)')),
    "规则自检失败: 连已知的坏写法都匹配不上",
  );
  assert.ok(BAD.some((re) => re.test(`spawnSync('grep', ['-rl', 'x'])`)), "规则自检失败: spawnSync('grep', ...) 未命中");

  const files = walkFiles(TESTS, (n) => n.endsWith(".test.mjs"));
  assert.ok(files.length >= 30, `只遍历到 ${files.length} 个测试文件 —— 遍历失配, 本条会假绿`);
  const hits = [];
  for (const f of files) {
    // 跳过本文件: 扫自己是自指 —— 上面的 BAD 数组与自检串里必然含这些模式的字面量。
    //   (这是唯一豁免, 且本文件不可能"shell 出去 grep": 它一个 child_process 都不 import。)
    if (f.endsWith("src-artifact-hygiene.test.mjs")) continue;
    // 去注释后再判: 被拆掉的那两处会在注释里点名旧写法当"为什么不这么写"的记录, 注释不算代码
    const src = stripComments(fs.readFileSync(f, "utf-8"));
    for (const re of BAD) if (re.test(src)) hits.push(`${path.relative(ROOT, f)} (${re})`);
  }
  assert.deepEqual(hits, [], `这些测试又 shell 出去 grep 了 —— 改成 fs 递归遍历 + 控制针:\n${hits.join("\n")}`);
});

test("发布路径仍显式排除 src/*.js (删文件不等于防再落一个)", () => {
  // 本文件第 1 条只管 dev 工作区; 发布快照是 rsync 出来的, 它**不读 .gitignore** ⇒ 排除项必须显式写在
  //   sync-github.sh 里 (且 rsync 的 '**' 要求中间夹目录, src/ 根层那 6 个要单独一行)。
  const sync = fs.readFileSync(path.join(ROOT, "sync-github.sh"), "utf-8");
  for (const pat of ["src/*.js", "src/**/*.js", "dist/"]) {
    assert.ok(sync.includes(`--exclude='${pat}'`), `sync-github.sh 应显式排除 ${pat} (rsync 不读 .gitignore)`);
  }
});
