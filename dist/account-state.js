import { logObj as log } from "./core/logger.js";
import { AccountRegistry } from "./accounts/account-registry.js";
let defaultRegistry = null;
export function getDefaultAccountRegistry() {
    if (!defaultRegistry) {
        defaultRegistry = new AccountRegistry();
        log.info(`default registry initialized`);
    }
    return defaultRegistry;
}
export function resetDefaultRegistry() {
    defaultRegistry = null;
}
