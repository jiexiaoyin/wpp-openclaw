// src/dispatch/account-context.ts - v1.3.56 MULTI-ACCOUNT: 当前 dispatch 账号上下文
//
// 用 AsyncLocalStorage 把"当前正在 dispatch 的 accountId"传递到同一异步链上所有调用,
// 包括框架调 agent-tools 的 execute() (execute 拿不到 agent/account 参数, 只能靠上下文)。
// dispatchOne 用 accountContext.run(msg.accountId, ...) 包裹 AI 回复生成,
// agent-tools 的 getXxxApi() 通过 getCurrentAccountId() 取账号 (兜底 "default")。
//
// 为什么 ALS 而不是模块级变量: 多账号可并发 dispatch (不同 session), 模块级变量会串号;
// ALS 按异步上下文隔离, 正确。

import { AsyncLocalStorage } from "node:async_hooks";

export const accountContext = new AsyncLocalStorage<string>();

/** 当前 dispatch 的账号 id (无则 undefined → 调用方兜底 "default") */
export function getCurrentAccountId(): string | undefined {
  return accountContext.getStore();
}
