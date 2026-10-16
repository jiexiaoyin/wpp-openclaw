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
 * 四道断言:
 *   1. 源码里出现的以 swagger tag 开头的端点字符串, 必须都在快照里 (A 类 = 0)
 *   2. WPP_VENDOR_ENDPOINTS 白名单里的每一项必须都在快照里 (防「白名单登记了不存在的端点」)
 *   3. 快照里的每个路径必须要么已登记进 WPP_VENDOR_ENDPOINTS, 要么在**显式排除表**里
 *      (防厂商新增端点后悄悄漏接; 排除表 = 项目 2026-08-10 的有意裁定)
 *   4. 4a 内联 body 不得缺必填键 / 4b 内联 body **不得出现线上未声明的字段名** (2026-10-16 加)
 *      —— 4b 是 v1.16.1 修完 openHongBao/collectMoney 后补的: 那两条的**全部**键都不在线上 model 里,
 *      而必填层看不见这种病 (键名整错时"必填"恰好没满足, 但那几个键压根不在必填表里)。
 *
 * 刷新快照 (厂商升版后):
 *   curl -s http://127.0.0.1:28062/swagger.json -o /tmp/wpp-swagger.json
 *   node tools/gen-swagger-snapshot.mjs /tmp/wpp-swagger.json
 * 线上/快照漂移的**独立**检查 (不跑整套测试, 需要容器在线):
 *   node tools/check-swagger-drift.mjs        # 见 DEPLOY.md
 */
import assert from "node:assert";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript"; // devDependency; 只为把 body 对象**真解析**成键名 (见 collectBodyCalls)

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

// ===== 4/5. body 字段级检查 (必填 + 未知键) =====
//
// 为什么从"正则猜对象边界"升级成真解析 (2026-10-16): 老正则只敢吃 `{...}` 一层的字面量, 且把
// `Foo: bar(a, b)` 里的 `b` 当成键 —— 对"缺必填"是保守的漏判, 但换成"未知键"就成了**误报源**
// (门自己变噪声 = 迟早被 --force 绕过的下一个摆设)。这里用 TS 解析器取 AST, 键名/值类型都是真值。

/**
 * 取出「<端点字面量>, { ... }」形态的调用体键名 (真解析)。
 * 支持两种既有写法: `f(ep, body)` 与 `f(baseUrl, ep, body)`。
 *
 * 每条调用点给两组键, 因为两层检查要的严格程度不同:
 *   - keysStrong: 只取**最外层直接写下的**属性名; 一旦出现 spread/三元/计算键就 null ⇒ 判不了。
 *     给「缺必填」用: 必填必须**无条件**发出, 条件分支里的键不能算数 ⇒ 宁漏勿误。
 *   - keysAll:    把该实参表达式里**所有**对象字面量的键并起来 (递归进三元/spread)。
 *     给「未知键」用: 只要某条路径会发出这个键, 它就是一个会被厂商静默忽略的未知键 —— 条件与否无关,
 *     所以这里合并不产生误报。这两种形状正是 v1.16.1 修的那两条 (opts 对象 + 三元/spread)。
 */
function collectBodyCalls(file) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf-8"), ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const out = [];
  const endpointOf = (n) => {
    if (ts.isStringLiteralLike(n)) return n.text;
    if (ts.isTemplateExpression(n)) return n.head.text + n.templateSpans.map((s) => "{_}" + s.literal.text).join("");
    return null;
  };
  /** 对象字面量的直接键名; 含 spread/计算键 ⇒ null */
  const strongKeys = (obj) => {
    if (obj.properties.some((pr) => ts.isSpreadAssignment(pr))) return null;
    const keys = [];
    for (const pr of obj.properties) {
      let nm = null;
      if (ts.isPropertyAssignment(pr) || ts.isShorthandPropertyAssignment(pr) || ts.isMethodDeclaration(pr)) {
        const n = pr.name;
        if (n && (ts.isIdentifier(n) || ts.isStringLiteralLike(n) || ts.isNumericLiteral(n))) nm = n.text;
      }
      if (nm === null) return null; // 计算键/未知形态 ⇒ 判不了
      keys.push(nm);
    }
    return keys;
  };
  /**
   * 收集**body 这一层**的键: 顺着 三元/括号/spread 走, 但**绝不进属性值里的嵌套对象**
   *   —— 嵌套对象是字段的内部结构, 不是 body 的键 (踩过: `/Tools/DownloadFile` 发
   *   `{section: {start_pos, data_len}}`, 线上 model 里 `section` 只写了 type=None 没展开,
   *   递归进去就会把 `start_pos` 误报成顶层未知字段 —— 而厂商示例里它本来就在 section 里面)。
   * ⚠️ 另外:**不许**在 `ts.forEachChild` 的回调里返回值 —— 它是 `visitNode(...) || visitNode(...)`
   *   短路链, 回调返回真值 (数组 `[]` 也是真值) 就会跳过其余子节点。我第一版写成 `(c) => allKeys(c, acc)`,
   *   三元分支一个键都收不到; 反向注入自检当场抓出来了 (注入未知键却是绿的)。
   */
  const allKeys = (node, acc) => {
    if (ts.isObjectLiteralExpression(node)) {
      const k = strongKeys(node);
      if (k) {
        acc.push(...k);
        return acc;
      }
      for (const pr of node.properties) {
        if (ts.isSpreadAssignment(pr)) allKeys(pr.expression, acc);
        else {
          const n = pr.name;
          if (n && (ts.isIdentifier(n) || ts.isStringLiteralLike(n) || ts.isNumericLiteral(n))) acc.push(n.text);
        }
      }
      return acc;
    }
    if (ts.isConditionalExpression(node)) {
      allKeys(node.whenTrue, acc);
      allKeys(node.whenFalse, acc);
      return acc;
    }
    if (ts.isParenthesizedExpression(node)) return allKeys(node.expression, acc);
    return acc;
  };
  const walk = (node) => {
    if (ts.isCallExpression(node)) {
      const args = node.arguments;
      for (let i = 0; i < args.length - 1; i++) {
        const raw = endpointOf(args[i]);
        if (raw === null) continue;
        const body = args[i + 1];
        const isObjish =
          ts.isObjectLiteralExpression(body) ||
          ts.isConditionalExpression(body) ||
          ts.isParenthesizedExpression(body);
        if (!isObjish) continue;
        const uniq = (a) => [...new Set(a)];
        out.push({
          ep: normPath(raw),
          keysStrong: ts.isObjectLiteralExpression(body) ? strongKeys(body) : null,
          keysAll: uniq(allKeys(body, [])),
          line: sf.getLineAndCharacterOfPosition(body.getStart(sf)).line + 1,
        });
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return out;
}

/**
 * **已知且经裁定保留**的"线上未声明的键" — 形式 `"<端点>:<键小写>"` → 理由。
 * 与 DELIBERATELY_EXCLUDED 同规: 此处登记 = 明确表态, 不是漏改; 且**登记项必须真的出现**
 * (出现不了的条目会让下面那条断言红 —— 防止白名单腐烂成垃圾桶)。
 */
const KNOWN_EXTRA_KEYS = new Map([
  [
    "/FriendCircle/Upload:key",
    "线上 SnsUploadParamDoc 只声明 base64, key 是我们 v1.3.23 按上传失败现象加的参数, 而朋友圈上传链路正在用。 " +
      "「线上 model 未声明」≠「厂商一定忽略」(厂商可能读别的结构体) ⇒ 删它的收益是少一个死键, 代价是可能弄坏发朋友圈, 不值得赌。" +
      "待有测试账号做一次真机上传验证后再决定去留 (见 src/send/friendcircle.ts 的注释)。",
  ],
  [
    "/FriendCircle/Messages:totalsize",
    "发布朋友圈 body 里的 totalSize(0): 线上 SnsPostItemDoc 声明的是 title/private/blackList/withUserList/images/video/link/location 等, 没有 totalSize" +
      " —— 像是更早一版 model 的遗留。保留理由: ① 发朋友圈被 assertFriendCirclePublishAllowed 默认**禁用**, 现在删它收益为零;" +
      "② 若厂商真读这个未声明字段, 删掉就会在将来启用开关时踩坑 ⇒ 需要一次真机发布验证才能定。见 src/send/friendcircle.ts publish 的注释。",
  ],
]);

/** 把 src/ 下所有「端点 + 字面量 body」的调用点摊平 (注释天然不进 AST, 无需 stripComments) */
function allBodyCalls() {
  const out = [];
  for (const file of collectTs(new URL("src/", ROOT).pathname)) {
    const rel = path.relative(ROOT.pathname, file);
    for (const c of collectBodyCalls(file)) out.push({ ...c, rel });
  }
  return out;
}

test("快照里带必填字段的端点, 其源码 body 不得缺必填键", () => {
  // 只覆盖「body 是内联对象字面量」的调用点 — body 是变量/三元/含 spread 时本层判不了, 跳过不误报.
  const problems = [];
  for (const { ep, keysStrong, rel, line } of allBodyCalls()) {
    const required = SNAP.requiredByPath[ep];
    if (!required || !keysStrong) continue;
    // 大小写不敏感: vendor 是 Go, encoding/json 对字段名做大小写不敏感匹配
    //   (appId 能填 appid / labelId 能填 LabelID), 故只有**真正不同的名字**才算缺.
    const have = new Set(keysStrong.map((k) => k.toLowerCase()));
    const miss = required.filter((r) => !have.has(r.toLowerCase()));
    if (miss.length) problems.push(`${rel}:${line} ${ep} 缺 ${JSON.stringify(miss)}`);
  }
  assert.deepStrictEqual(problems, [], `内联 body 缺 swagger 必填字段:\n  ${problems.join("\n  ")}`);
});

test("内联 body 里不许出现线上未声明的字段名 (错名 = 静默失效, 必填那层判不了)", () => {
  // 这一层是 v1.16.1 加的, 起因: `openHongBao`/`collectMoney` 的**全部**键都是线上 model 里没有的
  //   (SendId/Wxid / wxid), 而 Go 对未知字段静默忽略 ⇒ 不报错、不生效、多年无人发现。
  //   必填层永远看不见这种病 (键名整个错掉时, "必填" 恰恰没被满足, 但那几个键又不在必填表里)。
  const problems = [];
  const seen = new Set();
  for (const { ep, keysAll, rel, line } of allBodyCalls()) {
    const props = SNAP.propsByPath[ep];
    if (!props || !keysAll) continue;
    const declared = new Set(props.map((p) => p.toLowerCase()));
    for (const k of keysAll) {
      if (declared.has(k.toLowerCase())) continue;
      seen.add(`${ep}:${k.toLowerCase()}`);
      if (KNOWN_EXTRA_KEYS.has(`${ep}:${k.toLowerCase()}`)) continue;
      problems.push(
        `${rel}:${line} ${ep} 的字段 "${k}" 不在线上声明里 (声明: ${JSON.stringify(props)})` +
          ` —— 厂商 Go **静默忽略**未知字段: 这个名字等于没发。要么改成声明里的名字, 要么登记进 KNOWN_EXTRA_KEYS 写明理由。`,
      );
    }
  }
  assert.deepStrictEqual(problems, [], `内联 body 出现线上未声明的字段名:\n  ${problems.join("\n  ")}`);

  // 白名单不许腐烂: 登记了却再也没出现的条目 (代码已改) 必须清掉, 否则这张表迟早变垃圾桶.
  const dead = [...KNOWN_EXTRA_KEYS.keys()].filter((k) => !seen.has(k));
  assert.deepStrictEqual(dead, [], `KNOWN_EXTRA_KEYS 里有已不存在的条目 (源码已改), 请删除:\n  ${dead.join("\n  ")}`);
});

/**
 * 反向注入自检记录 (2026-10-16 实测, 三注三还原):
 *   A 把 `openHongBao` 的 body 改回历史形状 `{SendId, SendUserName, Wxid, Xml}` (v1.16.1 修掉的那个病)
 *     ⇒ ✖ RED, 报出 SendId/Wxid 两个未知字段。证明这条断言真能拦住它要拦的病。
 *   B 在 `collectMoney` 的**三元 + spread 分支里**塞一个未知键 `wxid`
 *     ⇒ 第一版**绿**(漏判!) —— 查出是 `ts.forEachChild` 回调返回真值导致子节点被短路, 修好后 ✖ RED。
 *     这条自检是必须做的: 没有它, 我会以为"能进三元分支"是我写对了, 其实一个键都没收到。
 *   C 把 `/FriendCircle/Upload` 的 `key` 删掉 (白名单条目从此不会再被命中)
 *     ⇒ ✖ RED, 报 "KNOWN_EXTRA_KEYS 里有已不存在的条目"。证明白名单会自己报腐烂, 不会变成垃圾桶。
 * 另外两处"看起来该报却没报"的核对 (防止误报, 同样重要):
 *   - `/Tools/DownloadFile` 的 `{section: {start_pos, data_len}}`: `start_pos` 是 **section 内部**的键
 *     (厂商示例 `"section":{"data_len":65536,"start_pos":0}` 逐字如此), 线上只是没展开 section 的 schema。
 *     所以遍历**不进属性值里的嵌套对象** —— 第一版递归进去 ⇒ 假报 2 处, 已修。
 *   - `/TenPay/ConfirmPreTransferApi` 那 4 个必填: 旧工具只能拿默认空串发出去, 属"必填层"看不见的病
 *     (键名对、值不对), 静态检查判不了 ⇒ 已改成工具显式暴露四个必填 (见 tenpay-meta.ts), 这里只能管键名。
 */
