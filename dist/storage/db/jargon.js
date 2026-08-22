import { getAdapter } from "./factory.js";
export async function saveJargonTerm(record) {
    return getAdapter().saveJargonTerm(record);
}
export async function getJargonTerms(accountId, groupId, limit) {
    return getAdapter().getJargonTerms(accountId, groupId, limit);
}
export async function hasJargonTerm(accountId, groupId, term) {
    return getAdapter().hasJargonTerm(accountId, groupId, term);
}
