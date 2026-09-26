// src/storage/db/index.ts - 子 barrel
// 外部: `import { ... } from "../storage/db/index.js"` 或 `from "../storage/db.js"`
// 内部各模块均 import 自此 file

export * from "./types.js";
export {
  setBackend,
  getAdapter,
  currentBackendName,
  currentConfig,
  resetAdapter,
  setAdapterForTest,
  resolveDbConfig,
} from "./factory.js";
export {
  saveMessage,
  getMessages,
  getMessageById,
  getMessageByMsgIdOrNewId,
  findMessageByMd5,
  saveSvridMapping,
  getSvridByMd5,
  saveSynckey,
  getSynckey,
} from "./messages.js";
export { initDbPool, pingDb, initSchema, closeDb } from "./connection.js";
export { saveJargonTerm, getJargonTerms, hasJargonTerm } from "./jargon.js";
export {
  recordHfJudged,
  countHfLedgerByStatus,
  countHfEngageSignals,
  setHfLedgerSent,
  setHfLedgerSuppressed,
  markHfEngaged,
  closeHfExpiredWindows,
  expireHfStaleJudged,
  getHfClosedRecent,
  listHfGroupMsgHourBuckets,
  listHfSentCountsRecent,
  upsertHfGroupState,
  getHfGroupState,
  listHfGroupStates,
  logHfThresholdChange,
  getHfLedgerDistinctClosedGroups,
  getHfLedgerLast,
  upsertHfGroupProfile,
  getHfGroupProfile,
  listHfGroupProfiles,
  getHfGroupMessageStats,
} from "./heartflow.js";
export { upsertAccount, getAccounts, getAccount } from "./accounts.js";
export {
  createMysqlAdapter,
  queryWithTimeout,
  closeMysqlForTest,
  _internal as mysqlInternal,
} from "./mysql.js";
