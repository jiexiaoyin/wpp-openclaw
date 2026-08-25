import { getAdapter } from "./factory.js";
export async function saveMessage(record) {
    return getAdapter().saveMessage(record);
}
export async function getMessages(opts) {
    return getAdapter().getMessages(opts);
}
export async function getMessageById(msgId, accountId) {
    return getAdapter().getMessageById(msgId, accountId);
}
export async function getMessageByMsgIdOrNewId(msgId, newMsgId, accountId, opts) {
    return getAdapter().getMessageByMsgIdOrNewId(msgId, newMsgId, accountId, opts);
}
export async function findMessageByMd5(md5, accountId) {
    return getAdapter().findMessageByMd5(md5, accountId);
}
export async function saveSvridMapping(record) {
    return getAdapter().saveSvridMapping(record);
}
export async function getSvridByMd5(md5, accountId) {
    return getAdapter().getSvridByMd5(md5, accountId);
}
export async function saveSynckey(accountId, synckey) {
    return getAdapter().saveSynckey(accountId, synckey);
}
export async function getSynckey(accountId) {
    return getAdapter().getSynckey(accountId);
}
