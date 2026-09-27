// heartflow-runtime.ts - 心流运行时配置单例
// 2026-09-27 从 index.ts L107 提取。
//   动机: 拆分 handleFeatureCommand 时, 该 Map 被 index.ts 与新模块**共用**;
//   若各自复制一份, 状态不同步 (startAccountById 写 A、命令处理器读 B) —— 实测导致 7 个测试失败。
//   因此提取为唯一实例, 双方 import 同一个 getter。

import type { HeartflowConfig } from "./heartflow.js";

const runtimeHeartflow = new Map<string, HeartflowConfig>();

/** 取心流运行时配置表 (全局唯一实例, 勿复制) */
export function getHeartflowRuntime(): Map<string, HeartflowConfig> {
  return runtimeHeartflow;
}
