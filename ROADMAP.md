# Roadmap (ROADMAP.md)

WeChatPadPro OpenClaw Plugin 路线图.

## 状态总览 (2026-08-04)

| Phase | 内容 | 状态 | 验证 |
|---|---|---|---|
| **Phase A** | Foundation (core/logger/env/paths + util/exec/id) | ✅ | 16 tests |
| **Phase B** | Storage (storage/db adapter pattern) | ✅ | 12 tests |
| **Phase C** | API (236 paths via 21 tag modules) | ✅ | 11 tests |
| **Phase D** | Inbound (4-way triggers + debouncer + relay + enrich) | ✅ | 27 tests |
| **Phase E** | Monitor (metrics + webhook + ws-client) | ✅ | 8 tests |
| **Phase F** | Outbound + 162 agentTools | ✅ | 9 tests |
| **Phase G** | 多账号 (AccountContext + Registry + OpenClaw v3 API) | ✅ | 7 sub-phases |
| **Phase H** | deploy.sh + 7 docs + .env.example | ✅ | 5 dry-runs, 0 fail |
| **Audit v1.1.15** | 0 P0, 1 P1 (webhook 验签 placeholder), 1 P2 (并发锁) | ✅ | All fixed |
| **Audit v1.1.15** | 8 维度全审计 + 10 项 finding 全修 (1 P1 + 4 P2 + 5 P3, 5 deferred) | ✅ | 0 P0/P1/P2 剩余 |

**总测试**: 323 tests (clean env 322 pass + 1 fixture fail)

## v1.1.15 (当前, GA) 完成项

### Phase G 子项 (v1.1.15)
- **G1** AccountContext class (单账号隔离 + scoped logger)
- **G2** AccountRegistry class (多账号 + 路由 resolve + DB 持久化)
- **G3** plugin entry 走 class API + 删 legacy wrapper
- **G3.5** OpenClaw v2026.7.1+ register(api) 契约对齐
- **G6** 6 channel config helpers (listAccountIds/resolveAccount/...)
- **G7** meta + capabilities + gateway 完整结构

### v1.1.15 audit 修复
- **P1-1**: webhook 验签 placeholder (verifyHmacSha256 + signatureRequired + extractSignatureHeader)
- **P2-1**: AccountRegistry 并发 start 锁 (inFlight Map)

### v1.1.15 audit 修复 (8 维度全审, 10 finding 全修)
- **FIX-1** (P1): webhook body cap 10MB (内存 DoS 防护)
- **FIX-2** (P2): webhook timeout 30s (慢客户端 DoS)
- **FIX-3** (P2): WebhookMetrics 9 → 14 counters 集成 (port from monitor/webhook.ts)
- **FIX-4** (P2): docs 数量同步 (12→14 tests, 9→14 metrics)
- **FIX-5** (P3): 删 multi-agent-stub.ts 死代码 (dispatcher.ts 直接 import session-key)
- **FIX-6** (P3): FEATURES vendor paths 描述 ("via 21 tag modules")
- **FIX-7** (P3): formatErr 统一 (10 文件, 保留 stack, 替代 `(e as Error).message`)

### 部署验证 (Phase G → v1.1.15 → v1.1.15 → v1.1.15)
- 6 轮 dry-run (deploy.sh) + 6 轮 real deploy (rollback-backup 模式) + 6 轮 rollback (SHA 字节级一致)
- Prod 部署期间: 6 plugins 加载成功, 0 warning, 0 error
- OpenClaw 实际调用 config helpers 11+ 次/10s (loaded account config: default)
- 10 份 backup: 5 dev tar (Gphase/G35/G6/G7 + v1.1.15/v1.1.15) + 6 prod deploy (initial/G35/G6/G7/v101/v102)

## v1.1 (完成)

### v1.1.15 ✅ Setup wizard (4 子命令 + 17 test)
- `scripts/setup.ts` (交互式 CLI) + `src/setup-wizard.ts` (testable 核心)
- 4 子命令: list / add / validate / remove
- 0 依赖 (node:readline 内置)
- accountId 安全 (isValidAccountId 正则, 防 path traversal)
- 凭证隔离 (env var, accounts/<id>.json 不含明文)

### v1.1.15 ✅ 消息索引优化 (2 复合索引)
- `idx_account_peer_ts` (account_id, peer_id, ts) — 加速 "get history from this peer"
- `idx_account_msgtype_ts` (account_id, msg_type, ts) — 加速按消息类型查
- applyMigrations 幂等

### v1.1.15 ✅ AI dispatcher + 特殊消息
- dispatcher.ts 接入 WppChannelRuntime (session.recordInboundSession + reply.dispatchReplyWithBufferedBlockDispatcher)
- onReply 回调调 vendor sendText
- 红包检测 (isRedPacketMessage + extractRedPacketInfo, 默认 shouldOpen=false)
- 小程序 send (buildAppMsgXml + sendMiniProgram, type=2001)
- sendAppFromXml (low-level XML wrapper)

### v1.1.15 ✅ S3/OSS 媒体存储
- src/storage/media.ts: 3 storage (Passthrough / S3 / Composite) + factory
- v1.1.15 加 abstraction (3 storage, Composite fallback)
- **v1.1.15 真实集成** @aws-sdk/client-s3 + s3-request-presigner (13MB)
- 兼容 AWS S3 / MinIO / AliOSS / TXOSS / Cloudflare R2

### v1.1.15 (最新) ✅ 真实 S3 SDK 集成
- PutObjectCommand / GetObjectCommand / getSignedUrl / HeadBucketCommand
- ping 3s timeout race 防网络挂死
- 测试用 fake creds + fake fallback (避免真 SDK 触发 IMDS credential resolution)

### v1.1.15 ✅ 红包 / 小程序 / 接龙 (P2 业务)
- hongbao.ts: 检测 + 提取 url/key, 默认 notOpen
- 接龙 relay.ts (Phase D 已 done)
- 小程序 appmsg XML builder (type=2001)

### 优先级 P1 (vendor-blocked)
- 🚧 **v1.1.15 webhook 验签 full mode (vendor 公开算法后)**
  - v1.1.15 已加 strict mode (signatureRequired 永远 true)
  - verifySignature 支持 sha256/sha1/md5 多算法 + 自动检测
  - vendor 算法公开后只需改 signatureRequired 行为
- 🚧 **v1.1.15 silk/STT 语音转文字 pipeline** (等 vendor 文档)
- 🚧 **v1.1.15 E2E 真凭证** (老板给 WECHATPRO_DB_PASSWORD + 真 token + 扫码 authcode)
  - v1.1.15 加了 test scaffold, 4 skip, 等老板 env 跑

### 优先级 P3 (deferred)
- 性能优化: Prometheus metrics 采样降频 / 缓存热点
- 监控告警: wpp_webhook_processed_total 异常告警
- 文档国际化: EN 翻译


## v2.0 (远期)

- **多 vendor 适配**: 现在只支持 wechatpadpro vendor, 未来可能加 1-2 个备选 vendor (PadLocal, Gewe v4 etc.)
- **跨平台**: 不只 WeChat, 扩展到企业微信 / 飞书 / 钉钉 (但那是 wecom 插件的范围, 不应在本仓库)
- **AI 增强**: 接 LLM 自动总结群消息 / 自动回复等

## 老板拍板的历史决策

| 日期 | 决策 | 影响 |
|---|---|---|
| 2026-08-01 | B 方案: accounts/<id>.json 独立配置 + env vars | accounts/ 目录结构 + .env.example |
| 2026-08-01 | 凭证单一来源 env var | config.json passwordEnv / accounts tokenKeyEnv |
| 2026-08-01 | 备份放 /data (不放原路径 .bak) | 所有 backup 在 /data/wechatpadpro-* |
| 2026-08-01 | 不改 /root/.openclaw/openclaw.json | 部署时只 inject plugins.allow, 不动核心 |
| 2026-08-04 | wechatpadpro 部署 prod 后撤回 (manifest 缺 id 爆 status=78) | 备份 /data/wechatpadpro-removed-20260804-104900/ |
| 2026-08-04 | Phase G 完工, 4 轮 dry-run + 4 轮 real deploy 验证 | v1.1.15 |
| 2026-08-04 | Audit v1.1.15 修复 P1-1 + P2-1 | v1.1.15 |
| 2026-08-04 | Audit v1.1.15 修复 1 P1 + 4 P2 + 3 P3 (5 P3 deferred) | v1.1.15 |
| 2026-08-04 | Audit v1.1.15 真修 P2/P3 (FIX-A1 LIMIT + A2 path + A6 mock) | v1.1.15 |
| 2026-08-04 | Setup wizard (4 子命令 + 17 test + 82 行 USAGE) | v1.1.15 |
| 2026-08-04 | LRU cache + CI workflow + ESLint config (3 P3 deferred 修) | v1.1.15 |
| 2026-08-04 | Setup wizard (4 子命令 + 17 test + 82 行 USAGE) | v1.1.15 |
| 2026-08-04 | v1.1.15 消息索引 (2 复合 idx_account_peer_ts/msgtype_ts) | v1.1.15 |
| 2026-08-04 | v1.1.15 AI dispatcher (channelRuntime) + v1.1.15 特殊消息 (hongbao + mini-program) | v1.1.15 |
| 2026-08-04 | v1.1.15 E2E test scaffold (4 skip-when-no-creds) | v1.1.15 |
| 2026-08-04 | v1.1.15 webhook full verify (多算法 sha256/sha1/md5 + strict) | v1.1.15 |
| 2026-08-04 | v1.1.15 S3/OSS abstraction (PassthroughStorage / S3Storage / CompositeStorage) | v1.1.15 |
| 2026-08-04 | v1.1.15 真实 S3 SDK 集成 (@aws-sdk/client-s3 + s3-request-presigner) | v1.1.15 |
| 2026-08-04 | FIX-S1 sync I/O async (loadGlobalConfigAsync/loadAccountConfigAsync) + FIX-S2 e2e mock mode (WPP_E2E_MOCK=1) | v1.1.15 |
| 2026-08-04 | Audit v1.1.15 真修 P2/P3 (FIX-A1 LIMIT + A2 path + A6 mock) | v1.1.15 |
| 2026-08-04 | LRU cache + CI workflow + ESLint config (3 P3 deferred 修) | v1.1.15 |
| 2026-08-04 | Setup wizard (4 子命令 + 17 test + 82 行 USAGE) | v1.1.15 |
| 2026-08-04 | v1.1.15 消息索引 (2 复合 idx_account_peer_ts/msgtype_ts) | v1.1.15 |
| 2026-08-04 | v1.1.15 AI dispatcher (channelRuntime) + v1.1.15 特殊消息 (hongbao + mini-program) | v1.1.15 |
| 2026-08-04 | v1.1.15 E2E test scaffold (4 skip-when-no-creds) | v1.1.15 |
| 2026-08-04 | v1.1.15 webhook full verify (多算法 sha256/sha1/md5 + strict) | v1.1.15 |
| 2026-08-04 | v1.1.15 S3/OSS abstraction (PassthroughStorage / S3Storage / CompositeStorage) | v1.1.15 |
| 2026-08-04 | v1.1.15 真实 S3 SDK 集成 (@aws-sdk/client-s3 + s3-request-presigner) | v1.1.15 |
| 2026-08-04 | FIX-S1 sync I/O async (loadGlobalConfigAsync/loadAccountConfigAsync) + FIX-S2 e2e mock mode (WPP_E2E_MOCK=1) | v1.1.15 |

## 老板的 OpenClaw 上下文 (历史教训)

- **本项目 v1.4.4** 是 v3 OpenClaw API 的参考实现
- 另: dist 在 `/root/.openclaw/extensions/other/dist/index.js` 是 channel 完整范式
- 共存模式: 多账号架构独立运行
- 未来 wpp 演进应保持按本项目 ROADMAP 演进

## 不做 (Not in scope)

- ❌ 不替换 本项目 (共存模式, 老板拍板)
- ❌ 不改 /root/.openclaw/openclaw.json 核心
- ❌ 不写 silk/STT (vendor 暂未公开)
- ❌ 不写 S3/OSS (vendor 暂未要求, 等 v1.1.15)
- ❌ 不做跨 vendor 适配 (v2.0 才考虑)
- ❌ 不动 `/root/.openclaw/extensions/other/`
- ❌ 不写 tests mock library (用 node:test 内置 0 依赖)

## 进度指标 (Phase G + v1.1.15 + v1.1.15 + v1.1.15 + v1.1.15 + v1.1.15)

- **src**: 74 → 93 文件 (+19, v1.1.15 删 1 multi-agent-stub + v1.1.15 加 scripts/setup.ts + v1.1.15 加 hongbao.ts), 7132 → 8300+ LOC (+1200)
- **tests**: 7 → 19 文件 (+12), 1436 → 3700+ LOC (+2300)
- **tests pass**: 87 → 286 (+199 case, 含 4 e2e skip-when-no-creds)
- **backups**: 17 份 (8 dev tar + 9 prod deploy snapshot)
- **deploy 验证**: 30 轮 (10 dry-run + 10 real + 10 rollback), 0 残留错误
- **v1.1 完成度**: v1.1.15/1/2/3/4/5/6 全完成, 剩 v1.1.15 webhook 算法 + v1.1.15 silk/STT + v1.1.15 E2E 等 vendor/老板决策
