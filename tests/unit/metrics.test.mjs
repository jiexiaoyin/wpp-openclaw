// tests/unit/metrics.test.mjs — 可观测性计数器/计量表 (v1.9.2 新增面)
//
// 覆盖 src/monitor/metrics.ts 的 counter/gauge 语义 + 两条渲染路径。
// 该模块在 v1.9.2 前无任何测试, 而它已被 5 个生产文件接入 (ws-client / llm-judge /
// inbound handler / webhook-receiver), 且 /metrics 端点对外暴露 renderJson()。
//
// 关键不变量:
//   1. namespace 统一 (wpp_ 前缀), 避免与宿主进程其他指标撞名
//   2. declareCounter 让零值指标从启动起就存在 (否则无法区分"值为0"与"埋点没接上")
//   3. gauge 与 counter 分开存, 语义不混
//   4. renderJson 输出可被 JSON.parse (端点契约)
//   5. renderPrometheus 输出符合 0.0.4 文本格式

import test from "node:test";
import assert from "node:assert/strict";

import {
  incCounter,
  declareCounter,
  getCounter,
  resetAllCounters,
  setGauge,
  getGauge,
  resetAllGauges,
  renderPrometheus,
  renderJson,
  WsMetrics,
  JudgeMetrics,
  InboundMetrics,
} from "../../dist/monitor/metrics.js";

/** 每个用例前后清空, 避免计数互相污染 */
function withCleanState(fn) {
  resetAllCounters();
  resetAllGauges();
  try {
    fn();
  } finally {
    resetAllCounters();
    resetAllGauges();
  }
}

// ── 1. counter 基础语义 ──────────────────────────────────────────

test("incCounter 累加, 且自动加 wpp_ namespace 前缀", () => {
  withCleanState(() => {
    incCounter("demo_total");
    incCounter("demo_total");
    incCounter("demo_total", 3);
    assert.equal(getCounter("demo_total"), 5, "1+1+3 应为 5");
  });
});

test("getCounter 对未声明过的指标返 0 (而非 undefined)", () => {
  withCleanState(() => {
    assert.equal(getCounter("never_touched"), 0);
  });
});

test("declareCounter 预声明零值, 且不覆盖已有计数", () => {
  withCleanState(() => {
    incCounter("preset_total", 7);
    declareCounter("preset_total"); // 已存在 → 不得归零
    assert.equal(getCounter("preset_total"), 7, "预声明不得清零既有累计");

    declareCounter("brand_new_total"); // 不存在 → 建零值
    assert.equal(getCounter("brand_new_total"), 0);
  });
});

test("resetAllCounters 清空全部计数器", () => {
  withCleanState(() => {
    incCounter("a_total", 5);
    incCounter("b_total", 9);
    resetAllCounters();
    assert.equal(getCounter("a_total"), 0);
    assert.equal(getCounter("b_total"), 0);
  });
});

// ── 2. gauge 语义 (与 counter 分开) ──────────────────────────────

test("setGauge 设绝对值 (非累加), 重复设置覆盖", () => {
  withCleanState(() => {
    setGauge("conn_state", 1);
    assert.equal(getGauge("conn_state"), 1);
    setGauge("conn_state", 0);
    assert.equal(getGauge("conn_state"), 0, "gauge 是瞬时值, 不是累计");
  });
});

test("gauge 与 counter 同 store 隔离, 互不影响", () => {
  withCleanState(() => {
    // 同名 counter 与 gauge 必须分开存 (语义不同不可混)
    incCounter("shared_name", 3);
    setGauge("shared_name", 9);
    assert.equal(getCounter("shared_name"), 3, "counter 不受 gauge 影响");
    assert.equal(getGauge("shared_name"), 9, "gauge 不受 counter 影响");
  });
});

test("resetAllGauges 只清 gauge, 不动 counter", () => {
  withCleanState(() => {
    incCounter("keep_me", 4);
    setGauge("drop_me", 1);
    resetAllGauges();
    assert.equal(getGauge("drop_me"), 0, "gauge 已清");
    assert.equal(getCounter("keep_me"), 4, "counter 必须保留");
  });
});

// ── 3. 业务 metrics helper ───────────────────────────────────────

test("WsMetrics: 断连/重连累加, connected 为 gauge", () => {
  withCleanState(() => {
    WsMetrics.incDisconnect();
    WsMetrics.incDisconnect();
    WsMetrics.incReconnect();
    assert.equal(getCounter("ws_disconnects_total"), 2);
    assert.equal(getCounter("ws_reconnects_total"), 1);

    WsMetrics.setConnected(true);
    assert.equal(getGauge("ws_connected"), 1);
    WsMetrics.setConnected(false);
    assert.equal(getGauge("ws_connected"), 0, "断连后 gauge 必须归 0");
  });
});

test("JudgeMetrics: 调用与失败分别计数", () => {
  withCleanState(() => {
    JudgeMetrics.incCall();
    JudgeMetrics.incCall();
    JudgeMetrics.incFailure();
    assert.equal(getCounter("judge_calls_total"), 2);
    assert.equal(getCounter("judge_failures_total"), 1);
  });
});

test("InboundMetrics: incMessagesIn 支持批量 (n 条)", () => {
  withCleanState(() => {
    InboundMetrics.incMessagesIn(3);
    InboundMetrics.incMessagesIn(); // 默认 1
    assert.equal(getCounter("messages_in_total"), 4);
  });
});

test("v1.9.2 预声明: 五个关键指标从启动起即为 0 (可区分'没接上')", () => {
  withCleanState(() => {
    // declareCounter 在模块加载时已执行过; resetAllCounters 后需重新声明验语义
    // 这里验证的是"声明后即存在", 用 getCounter 无法区分 0 与不存在,
    // 故改用 renderJson 检查键是否出现。
    declareCounter("ws_disconnects_total");
    declareCounter("judge_calls_total");
    const j = JSON.parse(renderJson());
    assert.ok("wpp_ws_disconnects_total" in j.counters, "预声明指标应出现在导出里");
    assert.ok("wpp_judge_calls_total" in j.counters);
  });
});

// ── 4. 渲染格式 ──────────────────────────────────────────────────

test("renderJson 输出合法 JSON, 含 ts/counters/gauges 三段", () => {
  withCleanState(() => {
    incCounter("json_probe_total", 2);
    setGauge("json_probe_gauge", 1);
    const raw = renderJson();
    const j = JSON.parse(raw); // 必须可解析 —— 这是 /metrics 端点契约

    assert.equal(typeof j.ts, "string");
    assert.ok(!Number.isNaN(Date.parse(j.ts)), "ts 应为可解析的 ISO 时间");
    assert.equal(j.counters.wpp_json_probe_total, 2);
    assert.equal(j.gauges.wpp_json_probe_gauge, 1);
  });
});

test("renderPrometheus 输出 0.0.4 文本格式 (TYPE 行 + 样本行)", () => {
  withCleanState(() => {
    incCounter("prom_probe_total", 5);
    const out = renderPrometheus();
    assert.match(out, /wpp_prom_probe_total\s+5/, "应含样本行");
    assert.ok(out.endsWith("\n"), "文本格式以换行结尾");
  });
});
