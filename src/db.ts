// src/db.ts - 顶层 barrel (兼容老 `import ... from "../db.js"`)
// 所有 db API 都在 src/storage/db/, 此文件仅 re-export

export * from "./storage/db/index.js";
