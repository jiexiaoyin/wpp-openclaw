import { AsyncLocalStorage } from "node:async_hooks";
export const accountContext = new AsyncLocalStorage();
export function getCurrentAccountId() {
    return accountContext.getStore();
}
