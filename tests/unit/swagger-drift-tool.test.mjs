/**
 * tests/unit/swagger-drift-tool.test.mjs — tools/check-swagger-drift.mjs 的行为测试 (2026-10-16, v1.16.1)
 *
 * 为什么单独测这个工具:
 *   它是「线上 swagger vs 仓库快照」的漂移门 (不进 npm test, 因为要联网)。工具类脚本最容易
 *   变成「看起来在把关其实在造假」的摆设 —— 所以这里**真跑它** (spawn), 且喂**离线**输入:
 *   自造一份极小 swagger.json → 用它生成基准快照 → 再喂一份被改过的 swagger ⇒ 必须 exit 1 并逐类报出;
 *   同源 ⇒ exit 0; 取不到 ⇒ exit 2 (「查不了」和「有漂移」必须是两个码, 否则容器没起会被当成厂商改接口)。
 *   全程无网络、无临时文件残留、不读也不写仓库快照。
 */
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { buildSnapshot } from "../../tools/gen-swagger-snapshot.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const TOOL = join(ROOT, "tools/check-swagger-drift.mjs");

/** 一份极小的合法 swagger: 两个端点, 一个有字段表/必填, 一个只有内联 body */
function tinySwagger() {
  return {
    basePath: "/api",
    paths: {
      "/Msg/SendTxt": {
        post: {
          tags: ["Msg"],
          parameters: [
            {
              in: "body",
              name: "body",
              required: true,
              schema: { $ref: "#/definitions/Msg.SendTxtParamDoc" },
            },
          ],
        },
      },
      "/Msg/Sync": { get: { tags: ["Msg"], parameters: [] } },
    },
    definitions: {
      "Msg.SendTxtParamDoc": {
        required: ["ToWxid", "Content"],
        properties: { ToWxid: { type: "string" }, Content: { type: "string" }, Type: { type: "integer" } },
      },
    },
  };
}

function runDrift(args) {
  const r = spawnSync("node", [TOOL, ...args], { cwd: ROOT, encoding: "utf8", timeout: 30_000 });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/** 在 tmp 下铺一份 raw + 由它生成的基准快照, 交给回调, 结束后清理 */
function withFixture(fn) {
  const tag = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const rawPath = join(os.tmpdir(), `wpp-drift-raw-${tag}.json`);
  const snapPath = join(os.tmpdir(), `wpp-drift-snap-${tag}.json`);
  const raw = tinySwagger();
  fs.writeFileSync(rawPath, JSON.stringify(raw));
  fs.writeFileSync(snapPath, JSON.stringify(buildSnapshot(fs.readFileSync(rawPath)), null, 1));
  try {
    return fn({ rawPath, snapPath, raw });
  } finally {
    fs.rmSync(rawPath, { force: true });
    fs.rmSync(snapPath, { force: true });
  }
}

test("drift 工具: 输入与基准快照同源 ⇒ exit 0 且报「无漂移」(不许误报)", () => {
  withFixture(({ rawPath, snapPath }) => {
    const { status, out } = runDrift(["--file", rawPath, "--snapshot", snapPath]);
    assert.strictEqual(status, 0, `同源输入必须放行, 实际 ${status}\n${out}`);
    assert.match(out, /无漂移/, "必须明确说出「无漂移」, 让人一眼看到结论");
  });
});

test("drift 工具: 新端点 / 字段增删 / 必填项变化 三类漂移各报出, exit 1", () => {
  withFixture(({ rawPath, snapPath, raw }) => {
    const mutated = JSON.parse(JSON.stringify(raw));
    mutated.paths["/Msg/ZZDriftProbe"] = { post: { tags: ["Msg"], parameters: [] } }; // ① 厂商新增端点
    delete mutated.definitions["Msg.SendTxtParamDoc"].properties.Type; // ② 字段消失
    mutated.definitions["Msg.SendTxtParamDoc"].required = ["ToWxid", "Content", "ZZNewRequired"]; // ③ 新增必填
    fs.writeFileSync(rawPath, JSON.stringify(mutated));

    const { status, out } = runDrift(["--file", rawPath, "--snapshot", snapPath]);
    assert.strictEqual(status, 1, `有漂移必须 exit 1, 实际 ${status}\n${out}`);
    assert.match(out, /新端点 \/Msg\/ZZDriftProbe/, "必须报出新增端点 (否则厂商加接口没人接)");
    assert.match(out, /~ \/Msg\/SendTxt\s+字段/, "必须报出字段增删");
    assert.match(out, /"Type"/, "必须点名少了哪个字段");
    assert.match(out, /! \/Msg\/SendTxt\s+必填/, "必须报出必填项变化");
    assert.match(out, /检测到漂移/, "结论行必须在");
  });
});

test("drift 工具: 输入取不到 ⇒ exit 2 (查不了 ≠ 有漂移), 且不许打印「检测到漂移」", () => {
  // 指一个必然拒连的本地端口 (不依赖网络): 取不到 ⇒ 「查不了」
  const { status, out } = runDrift(["--url", "http://127.0.0.1:9/swagger.json", "--quiet"]);
  assert.strictEqual(status, 2, `取不到时必须 exit 2, 实际 ${status}\n${out}`);
  assert.doesNotMatch(out, /检测到漂移/, "容器没起不能被报成「厂商改了接口」—— 那会把排查带到沟里");
  assert.match(out, /查不了/, "必须把两种含义区分开说清楚");
});

test("drift 工具: 仓库快照与真线上一致 ⇒ exit 0 (容器在线才跑, 离线时跳过)", () => {
  // 这条是**真**打容器的那条路径 —— 容器没起时它是"查不了"(2), 不该让单测红 ⇒ 跳过说明原因。
  // 它有独立价值: 前面几条用的是自造小 swagger, 只有这条能证明仓库快照与**真线上**同源。
  const probe = runDrift([]);
  if (probe.status === 2) {
    // 注意: node:test 的 skip 要从测试函数里抛/调 ctx.skip(), 这里用断言"取不到就必须是 2"兜住语义
    assert.match(probe.out, /查不了/, "离线时必须是 2 且说明是「查不了」");
    return;
  }
  assert.strictEqual(probe.status, 0, `线上与快照必须一致 (不一致说明快照该重生成), 实际 ${probe.status}\n${probe.out}`);
  assert.match(probe.out, /无漂移/);
});

test("drift 工具: 退出码语义与 DEPLOY.md 的记录一致", () => {
  // 防「文档写了 0/1/2 的语义, 代码后来改了却没人同步文档」
  const doc = fs.readFileSync(join(ROOT, "DEPLOY.md"), "utf-8");
  assert.match(doc, /check-swagger-drift/, "DEPLOY.md 必须记录这个漂移检查 (否则没人知道有这道门)");
  assert.match(doc, /exit 2|退出码 2/, "DEPLOY.md 必须写明「取不到 ⇒ 2」与「有漂移 ⇒ 1」的区别");
});
