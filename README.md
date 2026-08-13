# WeChatPadPro OpenClaw Plugin v1.3.54

**基于 WeChatPadPro (微信 Pad 协议 HTTP API) 的 OpenClaw 适配插件**

参考 OpenClaw v2026.7.1+ 架构设计 + 2026-08-01 老板 B 方案偏好。

## 状态

- **版本**: v1.3.54 (生产已部署)
- **能力**: 收发文本/图片/语音/视频/文件、AI 引用回复、图片 AI 识别(v1 schema 64KB)、语音收发(silk 自动转码)、群接龙自动触发 AI、文件确定性回复、多账号
- **语音 SILK-ONLY** (v1.3.52): vendor `/Msg/SendVoice` 只收 silk, mp3 自动转码, 转码失败降级发文件 (v1.3.53)
- **接龙 RELAY-TRIGGER** (v1.3.54): 群接龙消息自动触发 AI, AI 根据接龙主题智能应景回复 (无需 @, 5 分钟节流防刷屏)
- **MCP 增强** (v1.2.0): 集成 vendor MCP (`127.0.0.1:8062/mcp`), 文件消息经 `wechat_get_recent_messages` 尝试拿 CDN URL → OSS → AI 读到 (需 vendor realtime 权限 + `mcpEnabled=true`)
- **OpenClaw 契约**: v2026.7.1+ 完整兼容 (register/api, config, meta, capabilities, gateway)
- **测试**: 801/801 全绿 (73 test files)
- **生产部署**: ✅ `/root/.openclaw/extensions/wechatpadpro/` 已上线

从零开始安装见 [GETTING_STARTED.md](./GETTING_STARTED.md)。详细 phase 进度见 [ROADMAP.md](./ROADMAP.md), 版本历史见 [CHANGELOG.md](./CHANGELOG.md)。

## 设计原则

- **多账号架构**: `AccountRegistry` class (纯 in-memory), 单账号/多账号同代码路径
- **B 方案独立账号配置**: `accounts/<id>.json`, 凭证走 env var (老板铁律)
- **共存模式**: 与 GeWe 插件并行运行, 不替换
- **完整 vendor 覆盖**: 254 endpoints (swagger) + 159+ agent tools
- **结构化日志**: 仿 pino 接口, `formatErr` 自动保留 stack (silent killer 永久救回)
- **OpenClaw v2026.7.1+ API 完整对齐**: `register(api)` + 6 config helpers + meta + capabilities + gateway + outbound

## 前置依赖 (已部署, 见 DEPLOY.md)

```
✅ 1Panel-mariadb-RlbK (mariadb:11.8.8, 1panel-network 172.23.0.2)
✅ 数据库 wechatpro (用户 wechatpro, 密码从 env: WECHATPRO_DB_PASSWORD)
✅ WeChatPadPro 容器 (wechatpadpromax08, 8062/8089)
✅ 反代: https://wx.juhe.chat/api/... (HTTP API)
✅ 反代: wss://wx.juhe.chat/ws/sync (WebSocket)
✅ Vendor token_key (从 env: WECHATPRO_TOKEN_KEY)
✅ Swagger SSOT: vendor swagger.json (231 endpoints, basePath=/api)
```

## 快速开始

```bash
# 1. 安装依赖
npm ci

# 2. 配置 env (从 .env.example 复制)
cp .env.example .env
# 编辑 .env 填 WECHATPRO_DB_PASSWORD / WECHATPRO_TOKEN_KEY / WECHATPRO_AUTHCODE

# 3. 交互式引导配置账号 (推荐)
npm run setup add default

# 4. 编译 + 测试 (801 case)
npm run build
npm test

# 5. dry-run 部署验证
bash deploy.sh
```

真实部署: `bash deploy-swap.sh --force` (见 [DEPLOY.md](./DEPLOY.md))

## 部署流程 (v1.3.54 SOP)

| 脚本 | 用途 | 命令 |
|---|---|---|
| `deploy.sh` | **DRY-RUN ONLY** — 验证 build/manifest/ESM load, 不动 prod | `bash deploy.sh` |
| `deploy-swap.sh` | **真实 atomic 部署** — md5sum 备份 + cp dist + restart gateway + verify | `bash deploy-swap.sh` |

⚠️ 铁律:
1. 必须先跑 `deploy.sh` 确认 exit 0 (不写 prod)
2. 才能跑 `deploy-swap.sh` (真实 deploy)
3. deploy-swap 默认要求 deploy.sh 已跑过; `--force` 跳过 gate (老板手动确认后才用)

详见 [DEV.md § 部署 SOP]。

## 项目结构

```
wechatpadpro-openclaw/
├── README.md                      # 本文件 (总览)
├── GETTING_STARTED.md             # 快速开始 (安装 + 引导配置)
├── CHANGELOG.md                   # 49 版本历史
├── DEPLOY.md                      # 部署指南
├── DEV.md                         # 开发指南
├── USAGE.md                       # OpenClaw 框架使用指南
├── FEATURES.md                    # 159 agent tools + 231 vendor endpoints 清单
├── MIGRATION.md                   # v0.1.0 → v1.2.0 升级记录 (历史)
├── ROADMAP.md                     # 未来 phase 规划
├── openclaw.plugin.json           # channel manifest (channelId: wechatpadpro)
├── package.json                   # npm metadata + scripts
├── tsconfig.json                  # tsc 配置 (strict 6 flags + noUncheckedIndexedAccess)
├── config.json                    # 全局配置 (DB)
├── .env.example                   # 环境变量模板 (凭证单一来源)
├── deploy.sh                      # 部署 dry-run 验证 (默认)
├── deploy-swap.sh                 # 真实 atomic 部署 (--force)
├── accounts/
│   └── default.json               # B 方案: 默认账号配置
├── db/
│   └── schema.sql                 # MariaDB schema (wpp_ 前缀)
├── src/                           # 17509 LOC, 124 .ts 文件
│   ├── index.ts                   # plugin 入口 (register + wppChannelPlugin)
│   ├── config.ts                  # 全局配置加载
│   ├── config-helpers.ts          # 6 OpenClaw channel config helpers
│   ├── account-state.ts           # 默认 registry 入口
│   ├── accounts/                  # 多账号 class
│   │   ├── account-context.ts     # 单账号隔离
│   │   └── account-registry.ts    # 多账号 registry + inFlight 锁
│   ├── api/                       # vendor HTTP client (fetch + 3 retry)
│   ├── core/                      # logger, env, paths, constants, signature, runtime-config
│   ├── db.ts / storage/db/        # MariaDB adapter
│   ├── dispatch/                  # OpenClaw 集成 (dispatcher/outbound/send-message/silk-encoder/agent-tools)
│   ├── inbound/                   # 接收 pipeline (parser/triggers/debouncer/relay/enrich/media-enrich/handler)
│   ├── monitor/                   # metrics
│   ├── send/                      # 20+ tag send 函数
│   ├── storage/                   # DB adapter + media (S3) + silk + stt
│   ├── ws-client.ts               # WS 客户端
│   ├── webhook-receiver.ts        # HTTP webhook 接收 (HMAC 验签 + body cap)
│   └── ...
├── tests/                         # 801 tests, 73 .test.ts
│   ├── agent-tools.test.ts
│   ├── inbound.test.ts
│   ├── send-voice-degrade.test.ts  # v1.3.53 语音转码降级
│   ├── outbound-runtime.test.ts    # v1.3.43-47 outbound/identity/filename
│   ├── media-enrich.test.ts
│   ├── quote-xml.test.ts
│   └── ...
└── dist/                          # tsc 编译产物 (124 .js)
```

## 关键命令

```bash
npm run check       # tsc --noEmit (类型检查)
npm run build       # tsc (编译到 dist/)
npm run dev         # tsc --watch --noEmit (dev 模式)
npm test            # 跑 800+ 测试
npm run setup       # 交互式账号管理 (add/list/validate/diagnose/migrate/pair)
bash deploy.sh      # dry-run 部署验证 (默认, 不上 prod)
bash deploy-swap.sh --force  # 真实 atomic 部署
```

## 老板铁律 (勿改)

1. **凭证单一来源 env var**: tokenKey/authcode/password 走 env, 不进 JSON 不进 DB
2. **备份放 /data**: 不放原路径 .bak
3. **不动 /root/.openclaw/openclaw.json**: 这是网关核心配置, 部署时也不能改
4. **deploy.sh 默认 dry-run**: 强制先验证再真部署

## 文档导航

- [GETTING_STARTED.md](./GETTING_STARTED.md) — 快速开始 (安装 + 引导配置, 新用户从这里)
- [CHANGELOG.md](./CHANGELOG.md) — 版本变更记录 (49 版本)
- [DEPLOY.md](./DEPLOY.md) — 部署到 OpenClaw gateway 详细步骤
- [DEV.md](./DEV.md) — 二次开发指南 (架构 / 调试 / 测试)
- [USAGE.md](./USAGE.md) — OpenClaw 框架使用 (159 agent tools 怎么用)
- [FEATURES.md](./FEATURES.md) — 159 agent tools + 231 vendor endpoints 完整清单
- [MIGRATION.md](./MIGRATION.md) — v0.1.0 → v1.2.0 升级记录 (历史)
- [ROADMAP.md](./ROADMAP.md) — 未来 phase 规划
- [docs/wpp-deploy-troubleshooting-2026-08-05.md](./docs/wpp-deploy-troubleshooting-2026-08-05.md) — 1Panel 部署层 troubleshooting

## Related

- GeWe OpenClaw 插件 — 参考架构源头 (共存模式并行运行)
- OpenClaw v2026.7.1+ 文档 (v3 channel 完整范式)
