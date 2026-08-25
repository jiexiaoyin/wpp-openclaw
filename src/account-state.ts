// account-state.ts - AccountRegistry 默认实例入口 (Phase G3 完工)
// G3 后只导出 2 个函数:
//   - getDefaultAccountRegistry(): 默认 registry (plugin 单例)
//   - resetDefaultRegistry(): 测试用, 清空
//
// 旧 facade (startAccount / getAccountState / attachWsClient / listAccountStates 等) 已全部删除
//   内部代码 (index.ts / dispatch/ / inbound/) 改用 AccountRegistry class API
//   多账号隔离由 class 封装保证 (Map 在 class 内部, 不可外部访问)

import { logObj as log } from "./core/logger.js";
import { AccountRegistry } from "./accounts/account-registry.js";

// 默认 registry — plugin entry 通过 getDefaultAccountRegistry() 拿
// 故意 lazy init: 单测 resetAdapter / resetDefaultRegistry 后首次访问会重建
let defaultRegistry: AccountRegistry | null = null;

export function getDefaultAccountRegistry(): AccountRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new AccountRegistry();
    log.info(`default registry initialized`);
  }
  return defaultRegistry;
}

/** 测试/重置用: 清空默认 registry (不调 stop, 直接 GC) */
export function resetDefaultRegistry(): void {
  defaultRegistry = null;
}
