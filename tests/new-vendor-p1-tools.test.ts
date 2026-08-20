// tests/new-vendor-p1-tools.test.ts - v1.3.67 新 vendor P1 API 工具测试
// 验证: 公众号文章(3) + 视频号深度(4) 新增工具注册

import { test } from "node:test";
import assert from "node:assert/strict";

import { AGENT_TOOLS_META } from "../src/dispatch/agent-tools/index.js";

test("v1.3.67 P1 — 公众号文章工具注册 (articleList/articleMarkdown/articleRead)", () => {
  for (const name of ["articleList", "articleMarkdown", "articleRead"]) {
    assert.ok(AGENT_TOOLS_META[name], `${name} 应存在`);
    const [desc, schema, fn] = AGENT_TOOLS_META[name];
    assert.equal(typeof desc, "string");
    assert.equal(typeof fn, "function");
    assert.ok(schema, `${name} 应有 schema`);
  }
});

test("v1.3.67 P1 — 视频号工具注册 (channelsDetail/channelsComments/channelsMedia/channelsResolveShare)", () => {
  for (const name of ["channelsDetail", "channelsComments", "channelsMedia", "channelsResolveShare"]) {
    assert.ok(AGENT_TOOLS_META[name], `${name} 应存在`);
    assert.equal(AGENT_TOOLS_META[name].length, 3, `${name} 3 段`);
  }
});

test("v1.3.67 P1 — 视频号 schema 字段 (contentToken/mediaToken/commentToken/url)", () => {
  const detail = AGENT_TOOLS_META.channelsDetail[1];
  const props = detail.properties ?? detail;
  assert.ok(props.contentToken, "channelsDetail 应有 contentToken");

  const comments = AGENT_TOOLS_META.channelsComments[1];
  const cprops = comments.properties ?? comments;
  assert.ok(cprops.commentToken, "channelsComments 应有 commentToken");

  const media = AGENT_TOOLS_META.channelsMedia[1];
  const mprops = media.properties ?? media;
  assert.ok(mprops.mediaToken, "channelsMedia 应有 mediaToken");

  const share = AGENT_TOOLS_META.channelsResolveShare[1];
  const sprops = share.properties ?? share;
  assert.ok(sprops.url, "channelsResolveShare 应有 url");
});

test("v1.3.67 P1 — 新工具已进 AGENT_TOOLS 集合", async () => {
  const { AGENT_TOOLS } = await import("../src/dispatch/agent-tools/index.js");
  const names = AGENT_TOOLS.map((t) => t.name);
  for (const name of [
    "articleList", "articleMarkdown", "articleRead",
    "channelsDetail", "channelsComments", "channelsMedia", "channelsResolveShare",
  ]) {
    assert.ok(names.includes(name), `${name} 应在 AGENT_TOOLS 里`);
  }
});
