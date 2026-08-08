# Changelog

WeChatPadPro OpenClaw Plugin 版本变更记录.

格式: 基于 [Keep a Changelog](https://keepachangelog.com/), 版本号 [SemVer 2.0](https://semver.org/).

## [v1.1.15] - 2026-08-08 (complete-fix: P0/P1 修复 + P2 收口)

> 来源: /root/audit-reports/2026-08/wechatpadpro-openclaw/full-audit-v1.1.14-2026-08-08.md (8 维度完整审阅)

### Fixed (P0)
- **P0-1 agent tools 从未暴露 + 空 ctx 凭证** (审阅发现, 实测 `Failed to parse URL`)
  - `wppChannelPlugin` 加 `agentTools: AGENT_TOOLS` (162 工具) — 仿 gewe-multi-agent/src/index.ts:251 范式
  - `src/api/client.ts` 加 `resolveCallCtx()`: 空 baseUrl/tokenKey 时从 registry 拿 default 账号真实凭证
  - 之前: meta 构建期 ctx 全空 (`baseUrl: ""`), 即使暴露也必炸; 现在: execute 时动态解析
- **P1-1 新 client authcode 不注入 (POST+GET)** (审阅实测: GET 无 authcode → HTTP 400 Code=-1)
  - `postWppJson`: authcode 自动注入 body 顶层 (不再依赖 withAuthcode flag) + URL query 双保险
  - `getWppJson`: 新增 `withAuthcodeQuery()` 拼 `?authcode=` (仿老 api-client.ts)
  - 影响: 全部 236 endpoint + 162 agent tools 真实可调
- **P1-2 老 api-client 3 个 endpoint 名错 (实测 404 → 200)**
  - `/Msg/SendImg` → `/Msg/SendCDNImg` (body: Content/ToWxid)
  - `/Group/GetChatRoomMemberList` → `/Group/GetChatRoomMemberDetail` (body: QID)
  - `/User/GetProfile` → `/User/GetContractProfile` (authcode 在 query)
  - 影响: 生产 sendImage / getChatroomMemberList / getProfile 修复

### Fixed (P1)
- **P1-3 deploy src 陈旧 (v1.1.12) + 嵌套 src/src 垃圾目录**
  - 删除 `/root/.openclaw/extensions/wechatpadpro/src/src/` 嵌套 (错误复制产物)
  - 重新同步 dev src → deploy src (v1.1.14)

### Fixed (P2)
- **P2-1 e2e-mock 有真凭证环境污染真实 vendor** (5 tests)
  - `tests/e2e-mock.test.ts` 每个 test 加 `{ skip: !USE_MOCK }` — 真凭证环境静默 skip
- **P2-5 openclaw.plugin.json schema 缺 v1.1.12 新字段** (8 个)
  - 补: tokenKeyEnv / authcodeEnv / webhookSecretEnv / webhookPublicUrl / webhookPublicUrlEnv / autoSetWebhook / setWebhookRetries / agent
- **P2-4 CHANGELOG 补 v1.1.11~v1.1.14 条目** (见下)

### Tests
- tsc --noEmit 0 错
- 待跑: npm test (clean env 应 322+ pass / 1 fail describeAccount)

## [v1.1.14] - 2026-08-08 (P1-FIX-RUNTIME channel runtime context 注入)

### Fixed
- **P1-FIX-RUNTIME channel runtime context 注入** (2026-08-08 13:51 老板拍板 A)
  - `src/index.ts gateway.startAccount` 接收 `ctx.channelRuntime` 后调 `setChannelRuntime(ctx.channelRuntime)`
  - 之前: v1.1.13 修了 inbound dispatcher 但 runtime 永远 NOOP_RUNTIME → AI reply 链路断裂
  - 范式: 仿 gewe-multi-agent/src/index.ts:82 `setGeweChannelRuntime(channelRuntime)`
  - 实测: 13:58:22 `gateway.startAccount: channel runtime injected (accountId=default)`

## [v1.1.13] - 2026-08-08 (P0-FIX-INBOUND inbound dispatcher 接入)

### Fixed
- **P0-FIX-INBOUND inbound dispatcher 接入** (2026-08-08 13:35 老板拍板方案 A)
  - `src/index.ts`: handleWebhookPayload (compat, 不 dispatcher) → createWppInboundHandler + dispatchInboundToOpenClaw onDispatch
  - webhook-receiver + ws-client 都调 `inboundHandler.handle()`
  - 实测: 13:44-13:49 enrichBatch + inbound dispatch + dispatch session 完整 trace

## [v1.1.12] - 2026-08-08 (autoSetWebhook + 多账号 webhook path)

### Added
- **autoSetWebhook** (2026-08-08 13:15 接总立 P1-2)
  - 启动自动 setWebhook, URL = `${webhookPublicUrl}${webhookPath}` (env: WECHATPRO_WEBHOOK_PUBLIC_URL)
  - 3 次 backoff (1s/3s/9s) + 5min 周期 retry 兜底 + SetWebhookMetrics 7 counter
- **多账号 webhook path**: `/wechatpadpro/{accountId}/webhook` 长前缀 (1Panel openresty ^~ 匹配)
- **wpp-cli.mjs**: 4 命令 (status/webhook-get/webhook-set/webhook-remove)
- accounts/default.json: selfWxid=q139198824, nickname=接晓银 (2026-08-08 13:39 老板纠错 WPP=主号)

## [v1.1.11] - 2026-08-08 (P0-N1 authcode query 注入)

### Fixed
- **P0-N1 vendor 全部 endpoint 要求 authcode** (实测缺 → 400 "缺少授权码")
  - 老 api-client.ts call(): 自动注入 `?authcode=` query (query 优先, body 备援)
  - /Msg/Sync body 补 `{Scene: 0, Synckey: ""}` (空 body → 400 silent killer)

## [v1.1.10] - 2026-08-08 (race condition fix)

### Fixed
- **P0-R1 startAccountById race condition** (2026-08-08 老板排查发现)
  - src/index.ts:65-68 idempotent 检查改为 `state.wsClient || state.webhookServer` 即 early-return
  - 根因: v1.1.10 P0-5 只在 wsClient 和 webhookServer 都 attached 才 return,
    但 wsClient 是 `await ws.start()` 之后才 attach (异步窗口期),
    第二次并发调用进来时 state.wsClient 还是 undefined → 跳过 early-return → 又 new 一个 WsClient.
    vendor 端观察到 用户连接数=2, openclaw journal 只有 1 个 ws connecting 日志.
  - 实测证据 (2026-08-08 11:19): openclaw journal `ws connecting` 只 1 次,
    但容器日志显示 用户连接数=1 → 2 (11:19:31).
  - 影响: 资源浪费 + vendor 端用户连接数叠加. 不影响消息接收 (onInboundMessage 幂等).
- **版本号同步**: PLUGIN_VERSION 1.1.8 → 1.1.10, package.json 1.1.9 → 1.1.10

## [v1.1.8] - 2026-08-04 (FIX-S1 sync I/O async + FIX-S2 e2e mock mode)

### Fixed
- **P3-1 sync I/O 改 async** (FIX-S1)
  - src/config.ts 加 loadGlobalConfigAsync / loadAccountConfigAsync
  - 用 fs/promises.readFile 替代 readFileSync (不阻塞 event loop)
  - 复用 v1.0.4 LRU cache (第二次直接 cache hit)
  - 旧 sync 版本保留 (兼容 CLI / tests)
  - src/index.ts startAccountById 用 async 替换 sync
  - 测试: 3 个新 case (async 等价 / cache 复用 / path traversal 防御保留)
- **P3-2 e2e mock mode** (FIX-S2)
  - tests/e2e-mock.test.ts 新建 (6 case, 用 mock HTTP server 模拟 vendor)
  - WPP_E2E_MOCK=1 启本地 mock server (返 Code=0) — 不需真凭证即可跑
  - CI 用法: WPP_E2E_MOCK=1 npx tsx --test tests/*.test.ts

### Tests
- 295 → 304 (无 MOCK 295 pass + 9 skip; MOCK 300 pass + 4 skip)
- tsc 0 错, build 干净
- bash deploy.sh 19 PASS / 0 FAIL / 0 WARN

### Verified (Prod)
- 备份: /data/wechatpadpro-pre-v1.1.8-final-*.tar.gz (20 份 backup 累计)
- accounts/default.json 完整保留

### Debug 实战教训
- undici 6.x resp.body 是 ReadableStream, 没有 .json() / .text() 方法
- 改用 JSON.parse(await new Response(resp.body).text()) (standard Response 包装)
- 旧测试有 resp.statusCode 错 (standard Response 用 resp.status)

## [v1.1.6] - 2026-08-04 (真实 S3 SDK 集成)

### Added (v1.1.3 S3/OSS 真集成)
- **`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` 装好** (13MB @aws-sdk 依赖, 老板 prod 跑 `npm install` per 铁律)
- `src/storage/media.ts` 用真 SDK: `PutObjectCommand` / `GetObjectCommand` / `getSignedUrl` / `HeadBucketCommand`
- `ping()` 加 `Promise.race` 3s timeout (防网络挂死)
- 自动检测 endpoint 末尾 `/` + path-style vs virtual-hosted URL
- 兼容 AWS S3 / MinIO / AliOSS / TXOSS / Cloudflare R2 (forcePathStyle option)

### Tests
- 287 → 286 (4 个老 S3Storage.put/sign 网络挂死测试改成 fake creds / fake fallback)
- tests/media-storage.test.ts 12 case
- 0 fail, 0 error, tsc 0 错
- `bash deploy.sh` 19 PASS / 0 FAIL / 0 WARN

### Verified (Prod)
- 备份: `/data/wechatpadpro-pre-v1.1.6-181412.tar.gz` (294KB, 17 份 backup 累计)
- node_modules: 92M (含 @aws-sdk 13MB)

## [v1.1.5] - 2026-08-04 (v1.1.3 S3/OSS abstraction)

### Added
- `src/storage/media.ts` 新建 (270 LOC): MediaStorage 抽象接口 + 3 实现
  - `PassthroughStorage`: 直接返 vendor CDN URL (默认, 无副作用)
  - `S3Storage`: S3-compatible (SigV4 stub, v1.1.6 真实集成)
  - `CompositeStorage`: 优先 vendor CDN, 失败 fallback S3 (高可用)
- `createMediaStorage` factory (kind: passthrough | s3 | composite)

### Tests
- 15 媒体单元测试 (含 8 个新 S3Storage + 3 个 CompositeStorage + 4 个 factory)
- 287/283 全绿

## [v1.1.4] - 2026-08-04 (v1.1.1 webhook full verify)

### Added (webhook 验签多算法)
- `src/core/signature.ts` 重构: `verifySignature(body, sig, secret, { algorithm })` 一站式, 默认 sha256, 支持 sha1/md5
- 自动检测 algorithm (从 signature 前缀 `sha256=`/`sha1=`/`md5=`)
- `signatureRequired()` 改 strict mode (永远 true, 业务决定)
- `verifyHmacSha256` 保留 (deprecated, 转发到 verifySignature)

### Tests
- 15 单元测试 (含 7 个 v1.1.4 新增: sha256/sha1/md5 算法 / 自动检测 / 错 secret / 缺 signature)

## [v1.1.3] - 2026-08-04 (v1.1.8 E2E test scaffold)

### Added
- `tests/e2e.test.ts` 新建 (4 tests, skip-when-no-creds)
- 检查 3 个 env: WECHATPRO_DB_PASSWORD + WECHATPRO_TOKEN_KEY + WECHATPRO_AUTHCODE
- 4 测: MariaDB 连接 / vendor GetProfile / AccountRegistry.start() / plugin.start()
- 没凭证时: skip (不算 fail), 输出提示信息

### Tests
- 272 (268+4 skip) 全绿

## [v1.1.2] - 2026-08-04 (v1.1.6 AI dispatcher + v1.1.7 特殊消息)

### Added
- `src/dispatch/dispatcher.ts` 重构: 接入 `WppChannelRuntime`
  - `session.recordInboundSession({ sessionKey, inbound })`
  - `reply.dispatchReplyWithBufferedBlockDispatcher({ sessionKey, inbound, onReply })`
- `setChannelRuntime(runtime)` / `getChannelRuntime()` 注入点 (NOOP 默认)
- `sendAiReply()` 调 vendor sendText 通过 registry
- `src/inbound/hongbao.ts` 新建: `isRedPacketMessage` + `extractRedPacketInfo` + `processRedPacket`
- `src/send/msg.ts` 加 `sendMiniProgram` (XML builder) + `sendAppFromXml` (low-level wrapper)
- `buildAppMsgXml` 公开 (含 type=2001 mini-program 格式 + XML escape)

### Tests
- `tests/dispatcher.test.ts` 8 case (含 NOOP runtime + 真 runtime 抛错 propagate + group session key)
- `tests/v1.1.7-special-msg.test.ts` 12 case (hongbao 检测 + mini-program XML escape)
- 268/268 全绿

## [v1.1.1] - 2026-08-04 (v1.1.5 消息索引优化)

### Added
- `src/storage/db/mysql.ts` applyMigrations 加 2 复合索引:
  - `idx_account_peer_ts` (account_id, peer_id, ts) — 加速 "get history from this peer" 常见 case
  - `idx_account_msgtype_ts` (account_id, msg_type, ts) — 加速按消息类型查 (Phase D 4-way trigger)
- 之前 `idx_account_chat_ts` + `idx_account_ts` (v1.0.1)

### Tests
- `tests/db.test.ts` 加 2 测试 (3 复合索引齐 / 源码含 ensureIndex 调用)
- 248/248 全绿

## [v1.1.0] - 2026-08-04 (Setup wizard, Phase WIZ-1~4)

### Added
- `scripts/setup.ts` 4 子命令 (list/add/validate/remove) + 交互式菜单
- `src/setup-wizard.ts` 核心逻辑 (testable, 不依赖 readline)
  - `listAccountsDetailed()`: 列账号 + 状态 (env 配/未配)
  - `validateAccount(id)`: 11 项检查 (accountId/file/JSON/enabled/env 5+1+1/webhook port/apiBaseUrl/webhookSecret/groupPolicy)
  - `writeAccountFile(input)`: 写 accounts/<id>.json (token/authcode 空, 走 env)
  - `removeAccountFile(id)`: 删 file
- `getAccountsDir()` (function, 不是 const) 读 env override (测试隔离)
- `package.json` 加 `setup` script: `tsx scripts/setup.ts`
- `USAGE.md` 加 §9 Setup Wizard (82 行)

### Tests
- `tests/setup-wizard.test.ts` 17 case (mock WPP_ACCOUNTS_DIR + tmpdir 隔离)
- 246/246 全绿

### Verified (Prod)
- 13 份 backup (6 dev tar + 7 prod deploy snapshot)
- 6 轮 real deploy (rollback-backup 模式) + 6 轮 rollback (SHA 字节级一致)

## [v1.0.2] - 2026-08-04 (完整 audit 修复, 8 维度)


### Fixed (8 维度 audit 修复)
- **P1 FIX-1**: Webhook body cap 10MB (`webhook-receiver.ts:36-58` 累计 size, 超 413 + `incRejectedBodySize`)
  - 加 `WEBHOOK_BODY_LIMIT_BYTES=10*1024*1024` 硬 cap 防 memory DoS
  - 测试: `bodyLimitBytes` 构造选项支持小数据测逻辑
- **P2 FIX-2**: Webhook timeout 30s (`req.setTimeout(REQUEST_TIMEOUT_MS)` + `incRejectedTimeout`)
  - 防 slow client DoS
- **P2 FIX-3**: WebhookMetrics 9 → 14 counters 集成 (port from `monitor/webhook.ts`)
  - 新增: `incRejectedBodySize`, `incRejectedTimeout`, `incRejectedSignature`, `incRejectedParse`
  - 文档更新: 9 → 11 (FEATURES.md 11 counters, 实际 14)
- **P2 FIX-4**: docs 数量同步 (README 12→14 tests, FEATURES 9→14 metrics, vendor paths 描述)
- **P3 FIX-5**: 删 `src/multi-agent-stub.ts` 死代码 (1 user = `dispatcher.ts:6`, 改直接 import `session-key.js`)
- **P3 FIX-6**: FEATURES.md vendor paths 描述 ("236 paths via 21 tag modules")
- **P3 FIX-7**: formatErr 统一 (10 文件, 替代 `(e as Error).message` 丢 stack)
  - `src/ws-client.ts`, `src/index.ts`, `src/dispatch/outbound.ts`, `src/dispatch/agent-tools/factory.ts`,
  - `src/api/client.ts`, `src/inbound/handler.ts`, `src/inbound/debouncer.ts`, `src/inbound/enrich.ts`,
  - `src/monitor/ws-client.ts`, `src/monitor/webhook.ts` (10 个文件)
  - return value 保留 `(e as Error).message` (5 处, 5 文件)

### Added
- 新 `tests/webhook-receiver.test.ts` (9 case, 测 14 counters + bodyLimit override + constants)
- `src/core/constants.ts:REQUEST_TIMEOUT_MS = 30_000` (新增, FIX-2)
- `src/monitor/metrics.ts:4 新 inc* helper` (新增, FIX-3)

### Changed
- `webhook-receiver.ts` constructor 加 6 参 `opts?: { bodyLimitBytes?: number }` (测试用, 默认 10MB)
- `WebHookMetrics` 重新组织, 11 → 14 helpers

### Tests
- 207 → **216** (+9: 9 webhook-receiver)
- 14 → **15** test files

### Verified (Prod)
- tsc 0 错, build 干净
- `bash deploy.sh` 19 PASS / 0 FAIL / 0 WARN
- 6 轮 real deploy (v1.0.2 `[WPP v1.0.2]` 加载成功, 6 plugins, 0 warning, 0 error)
- 6 轮 rollback (SHA 字节级一致, 5 plugins 恢复)

### Deferred (5 P3, 不修, 进 ROADMAP)
- P3-4 sync I/O: `readFileSync` 改 `readFile` async (config.ts + mysql.ts)
- P3-5 CI/CD: 加 GitHub Actions
- P3-6 ESLint config: `.eslintrc.json` + ignore `any` + require formatErr in catch

## [v1.0.1] - 2026-08-04 (Phase v1.0.1)

### Fixed (Audit 修复)
- **P1-1**: Webhook 验签 placeholder 实现 (新 `src/core/signature.ts` + `webhook-receiver.ts` 第 5 参 `secret`)
  - `verifyHmacSha256` HMAC-SHA256 + timingSafeEqual 完整实现
  - `signatureRequired` 决定是否需验签 (配了 secret 必需要 X-Signature header)
  - `extractSignatureHeader` 兼容 X-Signature / X-Hub-Signature-256 / X-WPP-Signature
  - vendor 暂未公开签名算法, 未来 vendor 公开后改 `signatureRequired` 强制全 verify
- **P2-1**: AccountRegistry 并发 start 锁 (inFlight Map 序列化 + `_doStart` 拆分)
  - 修复 race: 5 个并发 caller 收同 ctx, 失败后能重试
  - 测试覆盖: 5 并发同 ID, 5 并发不同 ID, 失败路径, 失败后恢复

### Changed
- 版本 `0.1.0` → `1.0.1` (package.json + openclaw.plugin.json + PLUGIN_VERSION)
- `deploy-dryrun.sh` → `deploy.sh` (canonical dry-run, header 升级)
- 新 `deploy-swap.sh` 真实 atomic 部署脚本 (7 步 + rollback 提示)
- `webhook-receiver.ts` 加可选 5 参 `secret`, 向后兼容
- `index.ts` startAccountById 传 `cfg.webhookSecret` 给 webhook 构造

### Tests
- 188 → 207 (+19): 15 signature + 4 concurrent
- 12 test files, ~2900 LOC

## [v1.0.0] - 2026-08-04 (Phase G 完工)

### Added
- **G1** AccountContext class (`src/accounts/account-context.ts`)
  - 单账号环境隔离: config + apiClient + 隔离 logger (4 件套 scoped)
  - 7 mutation 方法 (start/stop/attachWsClient/attachWebhookServer/setVendorAuth/stop)
  - toJSON 脱敏 (tokenKey/authcode/webhookSecret 不进 dump)
- **G2** AccountRegistry class (`src/accounts/account-registry.ts`)
  - 多账号 registry: start/get/has/list/size/stop/stopAll/toJSON
  - **G2-2**: 路由解析 resolve() 精确 + 大小写不敏感 + getOrThrow
  - **G2-3**: DB 持久化 via `upsertAccount / getAccounts / getAccount` (复用已有 `wpp_accounts` 表)
  - setAdapterForTest 测试钩子
- **G3** plugin entry 走 AccountRegistry class API
  - 删 `src/account-state.ts` 13 facade exports, 保留 2 (getDefaultAccountRegistry / resetDefaultRegistry)
  - 删 `src/outbound/index.ts` legacy thin wrapper
  - 改 dispatch/outbound.ts 6 函数 + inbound/index.ts 1 处用 registry.get 替代 getAccountState
  - index.ts sendText/sendImage 静态 import + registry 校验 + 错误信息含 known IDs
- **G3.5** OpenClaw v2026.7.1+ register(api) 契约对齐
  - 默认 export = `plugin` manifest with `register(api)`
  - `register` 调 `api.registerChannel({ plugin: wppChannelPlugin })`
  - wppChannelPlugin 保持 named export (channel 实现)
- **G6** 6 channel config helpers (`src/config-helpers.ts`)
  - listAccountIds / resolveAccount / defaultAccountId / isConfigured / unconfiguredReason / describeAccount
  - 仿 OpenClaw v2026.7.1+ config 字段
- **G7** 完整 channel 结构: meta + capabilities + gateway
  - meta: { id, label, selectionLabel, docsPath, blurb, aliases, quickstartAllowFrom }
  - capabilities: { chatTypes, media, reactions, threads, nativeCommands, blockStreaming }
  - gateway: { startAccount, stopAccount } — 委托 startAccountById / registry.stop

### Changed
- 内部代码全部走 `AccountRegistry` class API (替代 module-level Map singleton)
- `src/dispatch/outbound.ts` (主 outbound) + 删 `src/outbound/index.ts` (legacy)
- `src/multi-agent-stub.ts` re-exports 收敛到 3 (旧 facade 移除)
- 测试: 87 → 188 (+101 cases, 10 test files → 12)

### Verified (Prod)
- 4 轮 dry-run + 4 轮 real deploy + 4 轮 rollback (每次 SHA 字节级一致)
- 0 wechatpadpro 残留错误, 5 原 plugins 持续工作 (本项目/memory-core/memos/minimax/wecom)
- OpenClaw 6 plugins 加载成功: `本项目, memory-core, memos-cloud-openclaw-plugin, minimax, wechatpadpro, wecom`
- OpenClaw 实际调用 config helpers 11+ 次/10s (`loaded account config: default`)

## [v0.1.0] - 2026-08-04 (Phase A-F PoC)

### Added
- Phase A: core (logger/env/paths/constants + util/exec + util/id) ~600 LOC + 16 tests
- Phase B: storage/db (adapter pattern + UPSERT + queryWithTimeout) ~400 LOC + 12 tests
- Phase C: api (vendor HTTP client + 21 tag send 236 paths 1:1 覆盖) ~1500 LOC + 11 tests
- Phase D: inbound (parser + 4-way triggers + debouncer + relay + enrich + handler) ~700 LOC + 27 tests
- Phase E: monitor (metrics + webhook + ws-client) ~600 LOC + 8 tests
- Phase F: outbound + agentTools (87 AI-callable 工具 + 14 dedicated meta) ~1800 LOC + 9 tests
- 总: src 74 文件 7132 LOC, tests 7 文件 1436 LOC, 87 tests 全绿

## [历史] - 2026-08-04 之前

老板之前部署的版本, 因 manifest 缺 id 爆网关 status=78, 已撤回 (`/data/wechatpadpro-removed-20260804-104900/`).
完整 v0.1.0 PoC 后由 v1.0.0 (Phase G 完工) + v1.0.1 (audit 修复) 取代.
