/**
 * tests/unit/docs-version-consistency.test.mjs — 文档里写的版本号必须 = 代码里的版本号 (2026-10-16, v1.16.0)
 *
 * 起因: 五份文档的「当前版本」行**停在 v1.9.2**, 而代码已经走到 v1.16.0 —— 中间 7 次发版, 没有任何一条
 *   断言看过文档一眼。别处的版本门倒是很齐 (p2-cleanup P2-4.x 钉 manifest↔package.json 与 dev↔deploy),
 *   独缺「文档↔代码」这一道; 而文档恰好是**出事时人最先看的东西**:
 *     - DEPLOY.md 的「版本对应」表是排查"插件/服务端版本对不对得上"的入口, 拿一个 7 版之前的值去比,
 *       会把排查方向直接带偏 (本仓最贵的一类成本就是"被推测路线带偏");
 *     - USAGE.md 写了日志格式样例 `[WPP vX.Y.Z]`, 实际日志里印的是**运行中的**版本 ⇒ 照文档 grep
 *       会一条都搜不到;
 *     - README 的「已知风险」清单会随版本腐烂, 故本次是**逐条复核**后才改的落款 (复核结论见下, 不进断言)。
 *
 * 断言的都是不变量, 不是把今天的具体值抄一遍 (抄值 = 下次升版又假红, 而假红的门很快会被无视):
 *   ① 四份文档的「当前版本」声明 = package.json 的 version;
 *      (v1.16.1 发版时 DEV.md 那行由「当前已发布基线」改回「当前版本」—— 本门当场报"没找到版本声明",
 *       正是它该有的反应: 措辞变了要更新 CLAIMS 表, 而不是把断言删掉。)
 *   ② **已发布**的证据: CHANGELOG 里最高的 `## [vX.Y.Z]` 必须正好等于 package.json 的 version ——
 *      包版本比最后一条发布记录还新, 说明有人只在 package.json 里改了号 (或只在 CHANGELOG 里写了号),
 *      两种都让「当前版本」这句话失去依据;
 *   ③ manifest 的 version 与其 description **首句**的版本号 = package.json —— description 首句是
 *      plugin 列表里用户唯一看得见的版本, v1.16.0 当天就漂过一次 (写着 v1.14.0);
 *   ④ DEV.md 的测试计数必须**等于** tests/unit/*.test.mjs 里字面的 `test(` 个数, 且三个分量自洽
 *      (pass+fail+skip = tests)。今天实测两边都是 779, 且本仓用例无循环生成 ⇒ 可以要求**相等**而不是
 *      "不低于" (相等才有牙: "不低于"下把计数忘改小一半也照样绿)。
 *
 * 为什么不门 README.md: 它全文**没有**「当前版本」声明, 唯一带版本号的那句是「清单作于 v1.9.2,
 *   v1.16.0 复核」——那是一条**带日期的历史陈述**, 本来就该保持原样, 给它设门反而会逼着人把历史改新。
 *
 * ⚠️ 本文件同时是 ④ 的被测对象 (它自己也有 `test(`): 计数是**运行时数出来的**, 故新增/删除用例时
 *   DEV.md 那一行要跟着改 —— 这正是本条要的效果 (计数漂了直红), 改动方式是把 DEV.md 的数字改成实跑值。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = new URL("../../", import.meta.url).pathname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf-8");

const VERSION = JSON.parse(read("package.json")).version;

/** 四份文档里的「当前版本」类声明。re 里必须有且只有一个捕获组 = 版本号。 */
const CLAIMS = [
  ["DEV.md", /当前版本: v(\d+\.\d+\.\d+)/, "头部"],
  ["DEV.md", /面向接开发本插件（v(\d+\.\d+\.\d+)）/, "正文首句"],
  ["DEPLOY.md", /Plugin v(\d+\.\d+\.\d+) 部署到 OpenClaw gateway/, "开篇"],
  ["DEPLOY.md", /\| 插件 \| v(\d+\.\d+\.\d+) \(本发布包\) \|/, "版本对应表"],
  ["GETTING_STARTED.md", /当前版本: v(\d+\.\d+\.\d+)/, "头部"],
  ["USAGE.md", /当前版本: v(\d+\.\d+\.\d+)/, "头部"],
  ["USAGE.md", /日志格式: `ISO时间 LEVEL \[WPP v(\d+\.\d+\.\d+)\] /, "日志格式样例"],
];

function walkFiles(dir, filter, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, filter, acc);
    else if (filter(e.name)) acc.push(p);
  }
  return acc;
}

test("① 四份文档的「当前版本」声明 = package.json version", () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/, `package.json version 不是 semver: ${VERSION}`);
  const bad = [];
  for (const [file, re, what] of CLAIMS) {
    const m = read(file).match(re);
    // 声明**不见了**也是红: 结构性改动 (换措辞/搬段落) 会把断言变成空转 —— 那种情况下要更新本表, 不是删断言
    if (!m) {
      bad.push(`${file} (${what}): 没找到版本声明 —— 若确实改了措辞, 请更新本文件的 CLAIMS 表`);
      continue;
    }
    if (m[1] !== VERSION) bad.push(`${file} (${what}): 文档写 v${m[1]}, package.json 是 v${VERSION}`);
  }
  assert.deepEqual(bad, [], `文档版本号没跟上代码 (改 package.json 时一并刷这里):\n${bad.join("\n")}`);
});

test("② CHANGELOG 里最高的发布标题 = package.json version (「当前版本」要有发布记录兜底)", () => {
  const released = [...read("CHANGELOG.md").matchAll(/^## \[v(\d+\.\d+\.\d+)\]/gm)].map((m) => m[1]);
  assert.ok(released.length >= 10, `只解析到 ${released.length} 条发布记录 —— CHANGELOG 结构变了或匹配失配`);
  const cmp = (a, b) => {
    const [x, y, z] = a.split(".").map(Number);
    const [p, q, r] = b.split(".").map(Number);
    return x - p || y - q || z - r;
  };
  const highest = released.reduce((a, b) => (cmp(a, b) >= 0 ? a : b));
  assert.strictEqual(
    highest,
    VERSION,
    `package.json 是 v${VERSION}, 而 CHANGELOG 最高的发布标题是 v${highest} ——\n` +
      `  · 若 v${VERSION} 确实已发布: 少了 \`## [v${VERSION}]\` 那条记录 (Unreleased 段不算);\n` +
      `  · 若还没发布: package.json 的号不该先升 (升号即宣称已发, 且会让 P2-4.2 的 dev↔deploy 比对失去意义)。`,
  );
});

test("③ manifest 的 version 与 description 首句版本号 = package.json", () => {
  const m = JSON.parse(read("openclaw.plugin.json"));
  assert.strictEqual(m.version, VERSION, `openclaw.plugin.json version (${m.version}) ≠ package.json (${VERSION})`);
  const first = String(m.description).match(/v(\d+\.\d+\.\d+)/);
  assert.ok(first, "description 首句应带版本号 (plugin 列表里用户只看得见这里)");
  assert.strictEqual(
    first[1],
    VERSION,
    `description 首句写 v${first[1]}, package.json 是 v${VERSION} —— ` +
      "description 后续还列了很多历史版本号, 本条只认**第一个** (首句那个)。",
  );
});

test("④ DEV.md 的测试计数 = 实数的 test( 个数 (三个分量也要自洽)", () => {
  const files = walkFiles(path.join(ROOT, "tests/unit"), (n) => n.endsWith(".test.mjs"));
  assert.ok(files.length >= 30, `只遍历到 ${files.length} 个测试文件 —— 遍历失配, 本条会假绿`);
  let literal = 0;
  for (const f of files) {
    // 只数字面声明 (`test(` 在行首, 允许缩进)。本仓目前没有 it( / 循环生成用例 —— 若将来引入,
    // 这里会数少, 报错信息里已写明该改哪一行 (把 DEV.md 改成实跑值 或 扩这个正则)。
    literal += (fs.readFileSync(f, "utf-8").match(/^[ \t]*test\(/gm) ?? []).length;
  }
  assert.ok(literal >= 300, `只数到 ${literal} 个 test( —— 正则或遍历失配, 本条会假绿`);

  const doc = read("DEV.md");
  const m = doc.match(/\*\*(\d+) pass \/ (\d+) fail \/ (\d+) skip\*\*（(\d+) tests/);
  assert.ok(m, "DEV.md 里没找到 `**N pass / N fail / N skip**（N tests` 这串计数 —— 措辞变了请更新本文件");
  const [, pass, fail, skip, total] = m.map(Number);
  assert.strictEqual(pass + fail + skip, total, `DEV.md 计数自相矛盾: ${pass}+${fail}+${skip} ≠ ${total}`);
  assert.strictEqual(
    total,
    literal,
    `DEV.md 写 ${total} tests, 实数是 ${literal} —— 加/删用例后请把 DEV.md 那行改成实跑值\n` +
      `(跑 \`npm test\` 看 ℹ tests 那一行; 顺带把 pass/fail/skip 三个数一起刷)。`,
  );
});
