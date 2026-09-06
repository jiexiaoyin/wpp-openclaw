// src/inbound/heartflow-trigger.ts - v1.5.0 P2-fix 20:41
// 
// 设计目的: 让 enrich.ts 只 import 这个 trigger 桥接 (而不是整个 heartflow.ts)
//   避免 esbuild --bundle 把整个 heartflow.ts 全部 bundled 进 enrich.js (1.3MB 警告)
//   trigger 桥接内部还是 import heartflow, 但 esbuild 不 bundled 子模块的 cross-file imports
//
// 注: v1.5.0 优化版本, 改用 cross-file imports (enrich.js → heartflow.js)
//   OpenClaw plugin loader 应该支持 dist/inbound/ 文件间的 ES module imports
export { tryIndependentTrigger, defaultHeartflowConfig, } from "./heartflow.js";
//# sourceMappingURL=heartflow-trigger.js.map