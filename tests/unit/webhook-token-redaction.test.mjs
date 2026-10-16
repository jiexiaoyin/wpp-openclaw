/**
 * tests/unit/webhook-token-redaction.test.mjs — webhook token 日志脱敏 (2026-10-16, v1.16.1)
 *
 * 背景 (为什么值得一份专门的测试):
 *   webhookPathToken (config.ts ensureWebhookPathToken: 新生成 32 hex / 128-bit, 已有值原样复用) 是 webhook 路径的
 *   **唯一鉴权** —— 路径匹配对了就进 handler, 没有第二道门。它嵌在 URL 里, 而插件有 12 处日志
 *   天天在打完整 URL / path: index.ts 的 setWebhook OK / failed / periodic / setBusinessWebhook /
 *   startAutoSync / STARTUP banner, webhook-receiver.ts 的 addPath / removePath / listening /
 *   signature failed|ok。明文 token 会长期落在 journald 和日志文件里 —— authcode 早就走 maskSecret 了,
 *   token 一直没有, 这是本次补的洞。
 *
 * 四层断言 (逐层加强, 后面两层是"会自己腐烂"的那类):
 *   1. 纯函数: redactWebhookPath/redactWebhookPathAny 的正确性 (含**不该动**的边界: 无 token 的
 *      老配置、token 为空、token 短于 mask 门槛) —— 脱敏函数最容易的错法是"顺手把正常路径也改了"。
 *   2. 与 deriveWebhookPaths 的**真实组合**: 生产里 path 就是它派生的, 组合后原文不得含 token。
 *   3. 行为级: 真起 WechatpadproWebhookServer (dist 产物), 接管 console 抓它自己打的日志 ——
 *      这是唯一能证明"receiver 那 5 处真的脱敏了"的办法 (源码里插值写对了 ≠ 运行时用的是脱敏值)。
 *   4. 静态门: 扫 **整个 src/**, 断言没有任何 log 调用 (log.x + this.info/warn/error/debug) 直接打
 *      带 token 的标识符, 且 index.ts 的 server 构造点必须传 redactPath。第 4 层是唯一能防
 *      "以后新加一条日志又漏"的手段 (第 1~3 层只管今天存在的这些点)。附防腐烂两连: ① 扫描器必须
 *      真的扫到了至少 200 处 log 调用; ② 拿**生产里真实漏过的那一行**做反向自检 —— 扫描器认不出来
 *      它就是空转绿灯。
 *
 * ⚠️ 本文件头上原本写着"只扫 index.ts 与 webhook-receiver.ts, 全仓扫会误报" —— **生产把这个假设打掉了**:
 *   v1.16.1 部署+重启后的验收 (journalctl --user -u openclaw-gateway --since …) 里抓到第 13 处漏点
 *   src/accounts/account-context.ts `attachWebhookServer` 的 `paths` 数组原文 (前 12 处是我人工审的
 *   那两个文件里的点)。教训有两层:
 *     ① "我知道的那几个文件"不是扫描范围 —— 门要扫**全库**, 人工清单漏一个就等于没有门;
 *     ② 那一行连**插值都不是** (`paths,` 对象简写), 只匹配 `${...}` 的规则天然看不见它。
 *   故现在的第 4 层改为: 抠出每个 log 调用的**完整实参文本** → 去掉字符串字面量的文字内容 (保留
 *   `${…}` 里的表达式) → 看剩下的**代码**里有没有 path/token 类标识符。这一版能认出 `paths,` 简写。
 *   ("短别名"层见下一个 test: `${url}` / `${path}` 这类名字太泛, 全库扫会把媒体 URL 打成红,
 *     所以那一层仍按文件列规则 —— 两层各管一类, 不是重复。)
 *
 * 未覆盖 (诚实标注): index.ts 那 7 处日志**没有**行为级测试 —— 进 startAccountById 要走
 *   DB 池 + registry + apiClient + ws 全套, 单测里起不来。那 7 处靠第 1 层 (纯函数) + 第 4 层
 *   (静态门) + 线上首启日志核对 (journalctl --user -u openclaw-gateway | grep setWebhook)。
 *   account-context.ts 那一处**有**行为级测试 (它的依赖只有 logger + apiClient 构造, 都能裸 new)。
 *
 * 两层反向注入的实测结果 (写下来是因为它们**各抓各的**, 不能互相替代):
 *   · 把 account-context 那行改回 `paths,` (源码级漏): 「全库层」静态门**红** (行为级仍绿 —— 因为
 *     它跑的是 dist 产物, 没重 build 就还是旧的; 顺带发现该文件漏掉 redactWebhookPath 以后
 *     那个 import 会变成未使用 ⇒ tsc noUnusedLocals 直接编译失败, 漏也漏不出去)。
 *   · 把脱敏调用的 token 换成 `undefined` (调了但脱不掉 = 假脱敏): 「全库层」静态门**绿**
 *     (代码里确实有 redact), 「行为级」**红**。这类错只有真跑一遍才看得见。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { maskSecret, redactWebhookPath, redactWebhookPathAny } from "../../dist/core/redact.js";
import { deriveWebhookPaths } from "../../dist/index.js";
import { WechatpadproWebhookServer } from "../../dist/webhook-receiver.js";
import { AccountContext } from "../../dist/accounts/account-context.js";

const ROOT = new URL("../../", import.meta.url).pathname;
/**
 * 生产 token 的最常见形态 = 32 hex (randomBytes(16).toString("hex"))。
 * ⚠️ 但**已存在**的值原样复用 (config.ts ensureWebhookPathToken), 老账号可能更短 ——
 *   本机 default 在用的那把实测是 24 hex / 96-bit。故本文件的断言只依赖"长度 > 4 走 maskSecret
 *   的 留头4尾2 分支", 不依赖 32 这个数 (短 token 另有专门一条用例覆盖)。
 */
const TOKEN = "9f3c1a7e5b2d80463ca1e5f7b9d02468";
const TOKEN_B = "00112233445566778899aabbccddeeff"; // 第二个账号 (多账号共享 server 用)

// ============================================================
// 1. 纯函数
// ============================================================

test("redactWebhookPath: URL 里的 token 被换成 maskSecret 形式, 原文不再出现", () => {
  const url = `https://wx.example.com/wechatpadpro/${TOKEN}/webhook`;
  const out = redactWebhookPath(url, TOKEN);
  assert.ok(!out.includes(TOKEN), `脱敏后不得再含 token 原文: ${out}`);
  assert.equal(out, "https://wx.example.com/wechatpadpro/9f3c...68/webhook");
  // 和 authcode 的 mask 同一套 (留头 4 尾 2), 便于人工核对"是不是同一条"
  assert.equal(redactWebhookPath(TOKEN, TOKEN), maskSecret(TOKEN));
});

test("redactWebhookPath: 同一串里出现多次时全部替换 (webhook + business 两段都带 token)", () => {
  const s = `https://h/wechatpadpro/${TOKEN}/webhook https://h/wechatpadpro/${TOKEN}/business`;
  const out = redactWebhookPath(s, TOKEN);
  assert.ok(!out.includes(TOKEN), "两段必须都替换 —— 只换第一处等于没脱");
  assert.equal(out.split("...").length - 1, 2, `应出现 2 个 mask: ${out}`);
});

test("redactWebhookPath: 无 token 的配置原样返回 (不许把字面量段当 token 打码)", () => {
  // 这是最容易犯的错: 按 `/wechatpadpro/<段>/` 结构脱敏 ⇒ 老配置 (未配 token, 路径就是
  // 字面量 /wechatpadpro/webhook) 会被打成 /wechatpadpro/webh...ok/ —— 排障时把人往沟里带。
  const legacy = ["https://h/wechatpadpro/webhook", "/wechatpadpro/webhook/business"];
  for (const p of legacy) {
    assert.equal(redactWebhookPath(p, undefined), p);
    assert.equal(redactWebhookPath(p, ""), p);
  }
});

test("redactWebhookPath: 短 token (<=4) 走 **** 分支, 同样不漏原文", () => {
  assert.equal(redactWebhookPath("https://h/wechatpadpro/abc/webhook", "abc"), "https://h/wechatpadpro/****/webhook");
  assert.equal(redactWebhookPath("https://h/wechatpadpro/abcd/webhook", "abcd"), "https://h/wechatpadpro/****/webhook");
  // 5 字符起才是"留头4尾2" (maskSecret 的既有语义, 与 authcode 一致)
  assert.equal(redactWebhookPath("x/abcde/y", "abcde"), "x/abcd...de/y");
});

test("redactWebhookPathAny: 多账号 (共享 server) 的 token 全部覆盖, 空项跳过", () => {
  const s = `https://h/wechatpadpro/${TOKEN}/webhook https://h/wechatpadpro/${TOKEN_B}/webhook`;
  const out = redactWebhookPathAny(s, [TOKEN, undefined, null, TOKEN_B]);
  assert.ok(!out.includes(TOKEN), "账号 A 的 token 必须被脱敏");
  assert.ok(!out.includes(TOKEN_B), "账号 B 的 token 必须被脱敏 —— 只脱首个账号是这套多 token API 存在的理由");
  // 列表里还没出现的账号 (未启动) 不影响 A 的脱敏
  assert.ok(!redactWebhookPathAny(s, [TOKEN]).includes(TOKEN));
});

test("与 deriveWebhookPaths 的真实组合: 派生 → 脱敏, 原文不含 token, 结构仍可读", () => {
  const cfg = { webhookPath: "/wechatpadpro/webhook", webhookPathToken: TOKEN };
  const { webhookPath, businessPath } = deriveWebhookPaths(cfg);
  assert.ok(webhookPath.includes(TOKEN), "前提: 派生结果里本来就带 token (否则本条测试空转)");
  for (const p of [webhookPath, businessPath]) {
    const out = redactWebhookPath(p, cfg.webhookPathToken);
    assert.ok(!out.includes(TOKEN), `${p} 脱敏后仍含 token: ${out}`);
    assert.ok(out.startsWith("/wechatpadpro/") && out.includes("/webhook"), `路径骨架应保持不变: ${out}`);
  }
});

// ============================================================
// 2. 行为级: 真起 server, 抓它自己打的日志
// ============================================================

/** 临时接管 console.log/warn (logger 的两个出口; console.error 本路径不产生) 跑 fn, 返回抓到的行 */
async function captureConsole(fn) {
  const prev = { log: console.log, warn: console.warn };
  const lines = [];
  const push = (...a) => lines.push(a.map((x) => (typeof x === "string" ? x : String(x))).join(" "));
  console.log = push;
  console.warn = push;
  try {
    await fn();
  } finally {
    console.log = prev.log;
    console.warn = prev.warn;
  }
  return lines;
}

test("行为级: receiver 的 addPath/removePath/listening 日志里没有 token 原文 (有脱敏值)", async () => {
  const paths = [
    `/wechatpadpro/${TOKEN}/webhook`,
    `/wechatpadpro/${TOKEN}/webhook/business`,
  ];
  // redactPath 用生产的同一份 policy (index.ts 传给 server 的就是它 + registry 全量 token)
  const redactPath = (p) => redactWebhookPathAny(p, [TOKEN, TOKEN_B]);
  const srv = new WechatpadproWebhookServer("127.0.0.1", 0, [], undefined, { redactPath });

  // 注: 捕获必须 await 到底再还原 console (start/stop 的日志在 promise 里 —— 提前还原就抓不到 listening 那条)
  const lines = await captureConsole(async () => {
    srv.addPath(paths[0], () => {});
    srv.addPath(paths[1], () => {});
    srv.removePath(paths[1]);
    await srv.start();
    await srv.stop();
  });

  const text = lines.join("\n");
  assert.ok(text.includes("addPath"), `必须真的抓到 receiver 自己的日志 (否则本条空转): ${text}`);
  assert.ok(text.includes("removePath"), "removePath 日志也要抓到");
  assert.ok(text.includes("listening"), "listening 日志也要抓到 (它把全部 path 一次性打出来)");
  assert.ok(!text.includes(TOKEN), `receiver 日志泄漏 token 原文:\n${text}`);
  assert.ok(text.includes("9f3c...68"), `应看到 mask 后的形式 (便于确认打的是同一条):\n${text}`);
});

test("行为级: AccountContext.attachWebhookServer 的日志里没有 token 原文 (生产漏点复现)", async () => {
  // 这一条是**从生产事故反推**出来的用例。2026-10-16 v1.16.1 部署重启后验收, 日志里抓到:
  //   [WPP:default] webhook server attached accountId=default port=4398 paths=["/wechatpadpro/035a…/default/webhook", …]
  // 来源 src/accounts/account-context.ts 的 attachWebhookServer。它就是"前端过滤 vs 后端不过滤"的
  // 老故事: 首轮 12 处人工审计止步于 index.ts + webhook-receiver.ts, 而这处属于第三个文件。
  const config = {
    enabled: true,
    apiBaseUrl: "http://127.0.0.1:18062",
    tokenKey: "stub-token-key",
    authcode: "stub-authcode",
    selfWxid: "wxid_stub",
    webhookPort: 4398,
    webhookPath: "/wechatpadpro/webhook",
    webhookPathToken: TOKEN,
  };
  // 依赖只有 logger 与 apiClient 的构造 (纯赋值, 无 I/O) ⇒ 能裸 new, 不需要 DB/registry
  const ctx = new AccountContext({ accountId: "default", config });
  const stubServer = { addPath() {}, removePath() {}, start() {}, stop() {} };
  const paths = [`/wechatpadpro/${TOKEN}/webhook`, `/wechatpadpro/${TOKEN}/webhook/business`];

  const lines = await captureConsole(async () => {
    ctx.attachWebhookServer(stubServer, paths);
  });

  const text = lines.join("\n");
  assert.ok(text.includes("webhook server attached"), `必须真抓到那条日志 (否则本条空转): ${text}`);
  assert.ok(!text.includes(TOKEN), `attachWebhookServer 日志泄漏 token 原文:\n${text}`);
  assert.ok(text.includes("9f3c...68"), `应看到 mask 后的形式:\n${text}`);
  // 脱敏只该动 token 段, 路径骨架要留着 (排障时靠它认路由) —— 否则"脱敏"变成"把日志打成废纸"
  assert.ok(text.includes("/wechatpadpro/") && text.includes("/webhook"), `路径骨架应保留: ${text}`);
  // 存进 webhookPaths 的必须是**原文** —— stop() 要拿它去 removePath, 脱敏值摘不掉路由
  assert.deepEqual(ctx.webhookPaths, paths, "成员里存的必须是可用的原文 (脱敏只作用于日志)");
});

// ============================================================
// 3. 静态门: 以后新加的日志也不许漏
// ============================================================

/** 抠出 re 命中的所有调用的实参文本 (括号配平; 够用即可 —— 只用来找插值/标识符) */
function callArgs(src, re) {
  const out = [];
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length - 1; // 指向 "("
    let depth = 0;
    const start = i + 1;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push({ args: src.slice(start, i), at: m.index });
    re.lastIndex = i; // 跳过已消费部分
  }
  return out;
}

/** 取 log.<level>( ... ) 的实参文本 (短别名层用) */
function logCallArgs(src) {
  return callArgs(src, /log\.(?:info|warn|error|debug)\(/g).map((c) => c.args);
}

/** 遍历 src 下所有 .ts */
function srcFiles(dir = join(ROOT, "src"), acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) srcFiles(p, acc);
    else if (e.name.endsWith(".ts")) acc.push(p);
  }
  return acc;
}

/**
 * 去掉字符串字面量的**文字内容**, 保留模板 `${…}` 里的表达式 ⇒ 返回的才是"代码里真实出现的标识符"。
 * 这一步是全库扫描不误报的关键: config.ts 里 `webhookPathToken (128-bit)` 只是**名字出现在文案里**,
 * 去字面量后不会命中; 而 `paths` / `${paths.join(",")}` / `paths,` 简写都会留下。
 */
function codeOnly(args) {
  let out = "";
  let i = 0;
  while (i < args.length) {
    const c = args[i];
    if (c === '"' || c === "'") {
      i++;
      while (i < args.length && args[i] !== c) {
        if (args[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    if (c === "`") {
      i++;
      while (i < args.length && args[i] !== "`") {
        if (args[i] === "\\") {
          i += 2;
          continue;
        }
        if (args[i] === "$" && args[i + 1] === "{") {
          let depth = 1;
          i += 2;
          const start = i;
          while (i < args.length && depth > 0) {
            if (args[i] === "{") depth++;
            else if (args[i] === "}") depth--;
            if (depth > 0) i++;
          }
          out += ` ${args.slice(start, i)} `; // 插值里的表达式保留
          i++;
          continue;
        }
        i++;
      }
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** 生产里含 token 的标识符名。短别名 (url/path) 不在此列 —— 见短别名层。 */
const PATHY_IDENT = /\b(?:webhookPathToken|webhookPath|webhookPaths|businessPath|syncMessageUrl|logoutUrl|matchPath|paths)\b/g;

/** 扫一批源码, 返回违规点 (脱敏/打码过的调用不算违规) */
function scanLeaks(files) {
  const violations = [];
  let calls = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, "utf-8");
    for (const { args, at } of callArgs(src, /(?:log\.(?:info|warn|error|debug)|this\.(?:info|warn|error|debug))\(/g)) {
      calls++;
      const code = codeOnly(args);
      if (!PATHY_IDENT.test(code)) continue;
      PATHY_IDENT.lastIndex = 0; // test 带 g 会推进 lastIndex, 必须复位
      // 脱敏过的调用 (redactWebhookPath / maskSecret) 是目标形态, 不是违规
      if (/redact|mask/i.test(code)) continue;
      const ident = [...new Set([...code.matchAll(PATHY_IDENT)].map((x) => x[0]))].join(",");
      violations.push(`${f.slice(ROOT.length)}:${src.slice(0, at).split("\n").length} ${ident}`);
    }
    PATHY_IDENT.lastIndex = 0;
  }
  return { violations, calls };
}

test("静态门 (全库层): src 下**任何**文件的日志都不许直接打 path/token 类标识符", () => {
  // 反向自检 —— 扫描器必须认得**生产真实漏过的那一行** (account-context.ts 修好前的原文):
  //   this.info(`webhook server attached`, { port: …, paths });
  // 它连插值都不是 (对象简写), 认不出它 = 这道门在空转。
  const leakDir = fs.mkdtempSync(join(tmpdir(), "wpp-redact-selfcheck-"));
  const leakFile = join(leakDir, "leaky.ts");
  fs.writeFileSync(
    leakFile,
    "const objs = 0;\n" + // 行号对齐用: 让泄漏落在第 2 行, 便于自检断言
      "function f(paths) { this.info(`webhook server attached`, { port: 4398, paths }); }\n",
  );
  const selfCheck = scanLeaks([leakFile]);
  fs.rmSync(leakDir, { recursive: true, force: true });
  assert.strictEqual(selfCheck.calls, 1, "自检样例没被扫到 ⇒ 扫描器失配, 门在空转");
  assert.deepEqual(
    selfCheck.violations.map((v) => v.replace(/^.*?(?=leaky\.ts)/, "")),
    ["leaky.ts:2 paths"],
    "扫描器认不出「对象简写平铺一个含 token 的数组」这种写法 —— 正是 2026-10-16 生产漏的那种",
  );
  // 反向自检 ②: 脱敏过的同一写法必须**不**算违规, 否则门会逼着人把脱敏代码删掉
  fs.mkdirSync(leakDir, { recursive: false });
  fs.writeFileSync(leakFile, "function f(paths) { this.info(`attached`, { paths: paths.map((p) => redactWebhookPath(p, this.config.webhookPathToken)) }); }\n");
  assert.deepEqual(scanLeaks([leakFile]).violations, [], "脱敏过的调用被误判成违规 ⇒ 门会把人逼向删掉脱敏");
  fs.rmSync(leakDir, { recursive: true, force: true });

  const files = srcFiles();
  assert.ok(files.length >= 80, `只遍历到 ${files.length} 个 src/*.ts —— 遍历失配, 本条会假绿`);
  const { violations, calls } = scanLeaks(files);
  assert.ok(calls >= 200, `全库只扫到 ${calls} 处 log 调用 —— 提取器失配 (改名/换写法), 门在空转`);
  assert.deepEqual(
    violations,
    [],
    `这些日志把含 token 的变量直接打出去了 (应改用 redactWebhookPath / redactWebhookPathAny):\n${violations.join("\n")}`,
  );
});

test("静态门 (短别名层): index.ts / webhook-receiver.ts 的日志不直接插值 `${url}` `${path}`", () => {
  // 这些变量在生产里就是"含 token 的 URL / path"。脱敏后必须改用 *Log / this.redactPath(...)。
  // 注: 这一层**故意**只扫这两个文件, 且按文件列规则 —— `url` / `path` 这种短别名太泛
  //     (config.ts 的 `${path}` 是文件路径, inbound 的 `${url}` 是媒体 URL), 全库扫必误报。
  //     全库那一层扫的是 **path/token 类的具名标识符** (下一个 test), 两层各管一类。
  const RULES = {
    "src/index.ts": /\$\{(url|syncMessageUrl|logoutUrl|webhookPath|businessPath)\}/g,
    "src/webhook-receiver.ts": /\$\{(path|matchPath)\}/g,
  };
  const violations = [];
  let scannedLogCalls = 0;
  for (const [file, re] of Object.entries(RULES)) {
    const src = fs.readFileSync(join(ROOT, file), "utf-8");
    const calls = logCallArgs(src);
    scannedLogCalls += calls.length;
    for (const args of calls) {
      for (const hit of args.matchAll(re)) violations.push(`${file}: \${${hit[1]}} in log(...)`);
    }
  }
  assert.ok(scannedLogCalls >= 20, `扫描器只找到 ${scannedLogCalls} 处 log 调用 —— 说明它已失配 (改名/换写法), 门在空转`);
  assert.deepEqual(
    violations,
    [],
    `这些日志把带 token 的裸变量插进去了, 必须改成脱敏值:\n${violations.join("\n")}`,
  );
});

test("静态门: index.ts 建 webhook server 时必须传 redactPath (漏传 = receiver 5 处全裸)", () => {
  const src = fs.readFileSync(join(ROOT, "src/index.ts"), "utf-8");
  const ctorCount = (src.match(/new WechatpadproWebhookServer\(/g) ?? []).length;
  assert.ok(ctorCount >= 1, "找不到 server 构造点 —— 门已失配 (改名?), 会变成空转绿灯");
  for (const m of src.matchAll(/new WechatpadproWebhookServer\([\s\S]{0,400}?\);/g)) {
    assert.match(m[0], /redactPath/, `构造点没传 redactPath ⇒ receiver 日志会打明文 token:\n${m[0]}`);
  }
  assert.match(
    src,
    /redactWebhookPathAny\(/,
    "index.ts 必须用 core/redact.js 的多 token 版 (共享 server 上每个账号的 token 都要覆盖)",
  );
});

test("静态门: 脱敏实现只有一份 (core/redact.ts), receiver 走注入的 policy", () => {
  // 同一条规则被两个文件用 —— 各写一份必然漂移 (改了 A 忘 B 就是一条还在泄密的日志)。
  // 所以: 实现只在 core/redact.ts; receiver 拿不到 token, 只接受构造方注入的 policy。
  const files = ["src/index.ts", "src/webhook-receiver.ts", "src/core/redact.ts"];
  const sources = Object.fromEntries(files.map((f) => [f, fs.readFileSync(join(ROOT, f), "utf-8")]));
  assert.match(sources["src/core/redact.ts"], /export function maskSecret/, "maskSecret 应在 core/redact.ts 定义");
  for (const f of ["src/index.ts", "src/webhook-receiver.ts"]) {
    assert.doesNotMatch(
      sources[f],
      /function maskSecret/,
      `${f} 又自己定义了一份 maskSecret —— 两份实现必然漂移, 应从 core/redact.js 取`,
    );
  }
  assert.match(sources["src/index.ts"], /core\/redact\.js/, "index.ts 应从 core/redact.js 取脱敏实现");

  // receiver 侧只拿到 path, 拿不到 token ⇒ 靠构造方注入 policy
  const recv = sources["src/webhook-receiver.ts"];
  assert.match(recv, /opts\?\.redactPath/, "receiver 必须接受注入的脱敏 policy");
  const receivers = (recv.match(/this\.redactPath\(/g) ?? []).length;
  assert.ok(
    receivers >= 5,
    `receiver 只有 ${receivers} 处走脱敏 (应有 5: addPath/removePath/signature failed/signature ok/listening) —— ` +
      "少一处就是少一条脱敏的日志",
  );
});
