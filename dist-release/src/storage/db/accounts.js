import { getAdapter } from "./factory.js";
export async function upsertAccount(record) {
    return getAdapter().upsertAccount(record);
}
export async function getAccounts() {
    return getAdapter().getAccounts();
}
export async function getAccount(accountId) {
    return getAdapter().getAccount(accountId);
}
