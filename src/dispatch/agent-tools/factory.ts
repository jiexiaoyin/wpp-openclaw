// src/dispatch/agent-tools/factory.ts - buildAgentTools()
// 范式仿 本项目/src/dispatch/agent-tools/factory.ts
// 关键:
//  - 取 ordered args from schema.properties keys (不靠 Object.values 避免 missing optional 移位)
//  - 错误转 {content:[{type:"text",text:"Error: ..."}]} 不 throw (防 LLM context 雪崩)
//  - meta 元组顺序 = fn 参数顺序 (1-1 验证由 typebox schema 推)

import type { TSchema } from "typebox";
import { error as logErr, debug, formatErr } from "../../core/logger.js";
import type { ToolEntry, ToolMeta } from "./_shared.js";

/**
 * openclaw ChannelAgentTool = AgentTool<TSchema, unknown>, 其 execute 精确签名为:
 *   (toolCallId: string, params: Static<TSchema>, signal?: AbortSignal,
 *    onUpdate?: AgentToolUpdateCallback<TDetails>) => Promise<AgentToolResult<TDetails>>
 * 其中 `Static<TSchema>` 实测 = `unknown`, 且 `AgentToolResult<T>.details` 为**必填**
 * (见 openclaw/dist/types-CSfW07HF.d.ts:476-518)。
 * openclaw/plugin-sdk/core 未导出 AgentTool/AgentToolResult, 故此处按其结构等价面声明。
 */
interface ChannelAgentToolResult {
  content: Array<{ type: "text"; text: string }>;
  /** 契约必填; 本插件工具无结构化 details → 恒为 undefined */
  details: unknown;
}

export interface ChannelAgentTool {
  name: string;
  description: string;
  label: string;
  parameters: TSchema;
  /**
   * 只声明前两个参数: 契约的 signal?/onUpdate? 均为可选, 而**参数更少**的函数天然
   * 可赋给参数更多的函数类型。本实现不消费这两者 (无流式 partial result), 因此
   * 不声明 —— 这比声明一个类型不精确的占位参数更诚实 (声明了反而因嵌套函数参数的
   * 严格逆变检查而不可赋给 AgentToolUpdateCallback)。
   */
  execute(
    toolCallId: string,
    params: unknown,
  ): Promise<ChannelAgentToolResult>;
}

/**
 * 运行时窄化: 契约把 tool 入参声明为 `unknown` (Static<TSchema> 实测 = unknown)。
 * 实现需要按键取值 → 用**类型谓词**把 unknown 收敛为可索引对象 (非 as any 抑制)。
 * 非对象入参 (null/字符串/数字) 收敛为 {} → 与旧实现 `k in params` 对原始字符串会
 * 命中字符索引的行为相比, 语义更严且不会崩 (旧实现传字符串时行为未定义)。
 */
function isParamRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asParamRecord(v: unknown): Record<string, unknown> {
  return isParamRecord(v) ? v : {};
}

function makeTool(name: string, entry: ToolEntry, label: string = name): ChannelAgentTool {
  const [description, parameters, fn] = entry;
  void fn;
  return {
    name,
    description,
    label,
    parameters,
    async execute(_toolCallId, params): Promise<ChannelAgentToolResult> {
      try {
        // 取 ordered args 按 schema.properties 顺序 (关键: 防 optional 缺省导致位置错)
        const props = (parameters as { properties?: Record<string, unknown> }).properties ?? {};
        const paramsObj = asParamRecord(params);
        const orderedArgs: unknown[] = [];
        for (const k of Object.keys(props)) {
          orderedArgs.push(k in paramsObj ? paramsObj[k] : undefined);
        }
        const r = await (fn as (...args: unknown[]) => Promise<unknown>)(...orderedArgs);
        return {
          content: [{ type: "text", text: typeof r === "string" ? r : JSON.stringify(r) }],
          details: undefined,
        };
      } catch (e) {
        logErr(`tool ${name} failed: ${formatErr(e)}`);
        return {
          content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
          details: undefined,
        };
      }
    },
  };
}

/**
 * 整个 TOOL_META 走 buildAgentTools 输出 ChannelAgentTool[]
 */
export function buildAgentTools(meta: ToolMeta): ChannelAgentTool[] {
  const out: ChannelAgentTool[] = [];
  for (const [name, entry] of Object.entries(meta)) {
    out.push(makeTool(name, entry));
    // 工具注册枚举是启动噪音 (200+ 行/load), 排查时开 WPP_DEBUG 再看
    debug(`agent-tools: + ${name}`);
  }
  return out;
}
