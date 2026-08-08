// src/dispatch/agent-tools/_shared.ts - ToolEntry 公共类型
// 范式仿 本项目/src/dispatch/agent-tools/_shared.ts
// 关键: schema property 顺序必须与 fn 参数顺序一致 (factory 取 args 时按 schema.properties 顺序)

import type { TSchema } from "typebox";

/**
 * ToolEntry shape:
 *   [description, parameters, fn(...args)]
 * 仿 本项目 范式 (避免 object {} 形, 性能 + 强类型)
 * fn 入参顺序 = parameters.properties 顺序 (typebox 键 order 保留)
 *
 * fn 类型用 (...args: any[]) 放宽 TS 变体检查 — runtime 由 factory 包装 schema-property-order 严格.
 */
export type ToolEntry = [
  description: string,
  parameters: TSchema,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (...args: any[]) => Promise<unknown>,
];

export type ToolMeta = Record<string, ToolEntry>;
